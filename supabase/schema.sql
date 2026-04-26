create table if not exists design_scenarios (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  optimization_priority text not null,
  profile jsonb not null,
  recommendation jsonb not null,
  financials jsonb not null,
  rationale jsonb not null,
  assumptions jsonb not null
);
