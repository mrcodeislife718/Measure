create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  category text not null default 'general' check (category in ('general','sales','support','privacy','security','billing')),
  subject text not null,
  message text not null,
  status text not null default 'new' check (status in ('new','reviewing','resolved','spam')),
  created_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;
