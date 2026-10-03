create table public.fax_lines (
 id uuid primary key,
 chart text not null check (chart ~ '^archive/objects/[a-z0-9_-]+/[a-f0-9]{64}\.png$'),
 owner_hash text not null, network_hash text not null,
 stroke jsonb not null check (jsonb_typeof(stroke)='object' and octet_length(stroke::text)<=150000),
 created_at timestamptz not null default now()
);
create index fax_lines_chart_date on public.fax_lines(chart,created_at);
create index fax_lines_owner_date on public.fax_lines(owner_hash,created_at);
create index fax_lines_network_date on public.fax_lines(network_hash,created_at);
alter table public.fax_lines enable row level security;
revoke all on public.fax_lines from anon,authenticated;
grant all on public.fax_lines to service_role;
create function public.save_fax_line(p_id uuid,p_chart text,p_owner text,p_network text,p_stroke jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(871420034);
 if exists(select 1 from public.fax_lines where id=p_id) then
  if exists(select 1 from public.fax_lines where id=p_id and chart=p_chart and owner_hash=p_owner and stroke=p_stroke) then return p_id; end if;
  raise exception 'Line identifier conflict';
 end if;
 if (select count(*) from public.fax_lines where created_at>now()-interval '1 hour' and (owner_hash=p_owner or network_hash=p_network))>=600 then
 raise exception 'Drawing limit reached. Please try again later.'; end if;
 if (select count(*) from public.fax_lines)>=20000 then raise exception 'Shared storage limit reached.'; end if;
 if (select count(*) from public.fax_lines where chart=p_chart)>=400 then raise exception 'Chart drawing limit reached.'; end if;
 insert into public.fax_lines(id,chart,owner_hash,network_hash,stroke) values(p_id,p_chart,p_owner,p_network,p_stroke);
 return p_id;
end $$;
revoke all on function public.save_fax_line(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_fax_line(uuid,text,text,text,jsonb) to service_role;

