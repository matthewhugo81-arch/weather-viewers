create table public.fax_drawings (
 id uuid primary key default gen_random_uuid(),
 chart text not null check (chart ~ '^archive/objects/[a-z0-9_-]+/[a-f0-9]{64}\.png$'),
 author text not null check (char_length(author) between 1 and 40),
 owner_hash text not null, network_hash text not null,
 strokes jsonb not null check (jsonb_typeof(strokes)='array' and octet_length(strokes::text)<=150000),
 created_at timestamptz not null default now()
);
create index fax_drawings_chart_date on public.fax_drawings(chart,created_at desc);
create index fax_drawings_owner_date on public.fax_drawings(owner_hash,created_at desc);
create index fax_drawings_network_date on public.fax_drawings(network_hash,created_at desc);
alter table public.fax_drawings enable row level security;
revoke all on public.fax_drawings from anon,authenticated;
grant all on public.fax_drawings to service_role;
create function public.publish_fax_drawing(p_chart text,p_author text,p_owner text,p_network text,p_strokes jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
 perform pg_advisory_xact_lock(871420033);
 if (select count(*) from public.fax_drawings where created_at>now()-interval '1 hour' and (owner_hash=p_owner or network_hash=p_network))>=20 then
 raise exception 'Publishing limit reached. Please try again in an hour.'; end if;
 if (select count(*) from public.fax_drawings where created_at>now()-interval '1 day')>=500 or (select count(*) from public.fax_drawings)>=5000 then
 raise exception 'Shared storage limit reached. Please contact the site owner.'; end if;
 if (select count(*) from public.fax_drawings where chart=p_chart)>=50 then
 raise exception 'This chart has reached 50 published versions.'; end if;
 insert into public.fax_drawings(chart,author,owner_hash,network_hash,strokes) values(p_chart,p_author,p_owner,p_network,p_strokes) returning id into result;
 return result;
end $$;
revoke all on function public.publish_fax_drawing(text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.publish_fax_drawing(text,text,text,text,jsonb) to service_role;
