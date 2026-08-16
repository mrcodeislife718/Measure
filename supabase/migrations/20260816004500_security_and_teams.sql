create table if not exists public.rate_limits (
  key_hash text primary key,
  scope text not null,
  count integer not null default 0,
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.rate_limits enable row level security;

create or replace function public.measure_consume_rate_limit(
  p_key_hash text,
  p_scope text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
  expiry timestamptz;
begin
  insert into public.rate_limits(key_hash, scope, count, reset_at, updated_at)
  values (p_key_hash, p_scope, 1, now() + make_interval(secs => greatest(1, p_window_seconds)), now())
  on conflict (key_hash) do update
  set count = case when public.rate_limits.reset_at <= now() then 1 else public.rate_limits.count + 1 end,
      reset_at = case when public.rate_limits.reset_at <= now() then now() + make_interval(secs => greatest(1, p_window_seconds)) else public.rate_limits.reset_at end,
      scope = excluded.scope,
      updated_at = now()
  returning count, public.rate_limits.reset_at into current_count, expiry;

  return query select current_count <= greatest(1, p_limit), greatest(0, p_limit - current_count), expiry;
end;
$$;

create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin','member','viewer')),
  token_hash text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists organization_invites_org_idx on public.organization_invites(organization_id, created_at desc);
create index if not exists organization_invites_email_idx on public.organization_invites(lower(email));
alter table public.organization_invites enable row level security;

create policy "members read invites" on public.organization_invites
for select using (public.is_org_member(organization_id));

create or replace function public.handle_new_measure_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  invite_token text;
  invite_hash text;
  invite_record public.organization_invites%rowtype;
begin
  invite_token := new.raw_user_meta_data->>'invite_token';

  if invite_token is not null and length(invite_token) > 0 then
    invite_hash := encode(digest(invite_token, 'sha256'), 'hex');
    select * into invite_record
      from public.organization_invites
      where token_hash = invite_hash
        and accepted_at is null
        and expires_at > now()
        and lower(email) = lower(new.email)
      limit 1;

    if found then
      insert into public.organization_members(organization_id, user_id, role)
      values (invite_record.organization_id, new.id, invite_record.role)
      on conflict do nothing;
      update public.organization_invites set accepted_at = now() where id = invite_record.id;
      return new;
    end if;
  end if;

  insert into public.organizations(name)
  values (coalesce(new.raw_user_meta_data->>'organization_name', split_part(new.email, '@', 1) || ' workspace'))
  returning id into org_id;

  insert into public.organization_members(organization_id, user_id, role)
  values (org_id, new.id, 'owner');

  return new;
end;
$$;
