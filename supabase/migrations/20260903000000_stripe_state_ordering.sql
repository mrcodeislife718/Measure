alter table public.organizations
  add column if not exists stripe_state_event_created_at bigint not null default 0;

create index if not exists organizations_stripe_state_event_idx
  on public.organizations(stripe_state_event_created_at);
