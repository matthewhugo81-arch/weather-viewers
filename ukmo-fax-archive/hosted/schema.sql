-- Applied through Supabase migration independent_fax_collection on 2026-10-03.
-- Service-only tables: public clients use the authenticated fax-collector API.
create table if not exists public.fax_chart_archive (
 id text primary key, valid_time timestamptz not null, issue_time timestamptz not null,
 chart jsonb not null, saved_at timestamptz not null default now()
);
create index if not exists fax_chart_archive_valid on public.fax_chart_archive(valid_time desc);
create table if not exists public.fax_source_status (
 product text primary key,last_attempt timestamptz,checked_at timestamptz,sha text,error text,header text
);
alter table public.fax_chart_archive enable row level security;
alter table public.fax_source_status enable row level security;
revoke all on public.fax_chart_archive,public.fax_source_status from anon,authenticated;
grant all on public.fax_chart_archive,public.fax_source_status to service_role;
create or replace function public.claim_fax_check(p_product text) returns boolean
language sql security invoker set search_path = '' as $$
 with claimed as (
 update public.fax_source_status set last_attempt=now()
 where product=p_product and (last_attempt is null or last_attempt<now()-interval '2 minutes')
 returning product)
 select exists(select 1 from claimed);
$$;
revoke all on function public.claim_fax_check(text) from public,anon,authenticated;
grant execute on function public.claim_fax_check(text) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('fax-archive','fax-archive',true,5000000,array['image/png']) on conflict (id) do nothing;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- Populate fax_source_status from products.json plus __cleanup.
-- Active jobs: fax-source-check-every-five-minutes (*/5 * * * *),
-- fax-expired-original-cleanup (41 3 * * *). Both call the deployed function
-- with the existing public anon JWT from config.json in Authorization.
-- Each source gets its own request, capped at 60 seconds. Check HTTP outcomes
-- through fax_source_status, not merely cron.job_run_details.
