create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'trial',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  subscription_status text not null default 'inactive',
  entitlement jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','member','viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists api_keys_org_idx on public.api_keys(organization_id);

create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  metric text not null,
  quantity numeric not null check (quantity >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_org_time_idx on public.usage_events(organization_id, created_at desc);

create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  participant_id text not null,
  status text not null default 'queued' check (status in ('queued','running','verified','qualified','inconclusive','invalid','failed')),
  request jsonb not null default '{}'::jsonb,
  result jsonb,
  evidence_root text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists evaluations_org_time_idx on public.evaluations(organization_id, created_at desc);

create table if not exists public.trust_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  contact_email text not null,
  system_name text not null,
  scope text not null,
  status text not null default 'requested' check (status in ('requested','paid','scheduled','running','delivered','cancelled')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  price_cents integer not null default 500000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_events (
  id bigint generated always as identity primary key,
  stripe_event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create table if not exists public.proof_metrics (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  evaluation_id uuid references public.evaluations(id) on delete cascade,
  environment_authoring_minutes numeric,
  expert_review_minutes numeric,
  scenarios_generated integer,
  scenarios_validated integer,
  failures_discovered integer,
  false_positive_findings integer,
  simulation_reality_agreement numeric,
  compute_cost_usd numeric,
  trustworthy_evidence_units numeric,
  customer_outcome text,
  created_at timestamptz not null default now()
);

create table if not exists public.competitor_comparisons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  preregistration jsonb not null,
  locked_digest text not null,
  status text not null default 'preregistered' check (status in ('preregistered','running','complete','invalidated')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.api_keys enable row level security;
alter table public.usage_events enable row level security;
alter table public.evaluations enable row level security;
alter table public.trust_audits enable row level security;
alter table public.proof_metrics enable row level security;
alter table public.competitor_comparisons enable row level security;

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.organization_members
    where organization_id = org_id and user_id = auth.uid()
  );
$$;

create policy "members read organizations" on public.organizations
for select using (public.is_org_member(id));

create policy "members read membership" on public.organization_members
for select using (public.is_org_member(organization_id));

create policy "members read api keys" on public.api_keys
for select using (public.is_org_member(organization_id));

create policy "members read usage" on public.usage_events
for select using (public.is_org_member(organization_id));

create policy "members read evaluations" on public.evaluations
for select using (public.is_org_member(organization_id));

create policy "members insert evaluations" on public.evaluations
for insert with check (public.is_org_member(organization_id));

create policy "members read trust audits" on public.trust_audits
for select using (organization_id is null or public.is_org_member(organization_id));

create policy "members read proof metrics" on public.proof_metrics
for select using (organization_id is null or public.is_org_member(organization_id));

create or replace function public.handle_new_measure_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
begin
  insert into public.organizations(name)
  values (coalesce(new.raw_user_meta_data->>'organization_name', split_part(new.email, '@', 1) || ' workspace'))
  returning id into org_id;

  insert into public.organization_members(organization_id, user_id, role)
  values (org_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_measure_user_created on auth.users;
create trigger on_measure_user_created
after insert on auth.users
for each row execute procedure public.handle_new_measure_user();
