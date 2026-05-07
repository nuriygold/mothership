create table if not exists public.wellness_logs (
  date text primary key,
  water integer not null default 0,
  steps integer not null default 0,
  workout boolean not null default false,
  prayer boolean not null default false,
  journal boolean not null default false,
  vitamins boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.wellness_logs enable row level security;

drop policy if exists wellness_logs_service_role_all on public.wellness_logs;
create policy wellness_logs_service_role_all
  on public.wellness_logs
  for all
  to service_role
  using (true)
  with check (true);
