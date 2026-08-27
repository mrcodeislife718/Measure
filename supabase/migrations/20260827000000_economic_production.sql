create table if not exists public.economic_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null check (event_type in ('paid_customer','paid_evaluation','independent_reproduction','decision_value','revenue','delivery_cost','retained_customer')),
  value_usd numeric(14,2),
  external_ref text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists economic_events_external_ref_unique
  on public.economic_events(organization_id, event_type, external_ref)
  where external_ref is not null;
create index if not exists economic_events_org_time_idx on public.economic_events(organization_id, occurred_at desc);

alter table public.economic_events enable row level security;

-- Service-role writes are used by the server-side API. Organization members may read their own economics.
drop policy if exists economic_events_member_read on public.economic_events;
create policy economic_events_member_read on public.economic_events
for select using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = economic_events.organization_id
      and om.user_id = auth.uid()
  )
);
