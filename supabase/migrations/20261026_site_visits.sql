-- LOCAL PROPOSAL ONLY. Requires approval and local PostgreSQL validation before production.
begin;
create table public.visit_sites(site text primary key check(site in ('haru','cardpilot')), started_at timestamptz);
insert into public.visit_sites(site) values ('haru'),('cardpilot');
create table public.visit_browsers(site text references public.visit_sites, visitor text check(visitor ~ '^[0-9a-f]{64}$'), primary key(site,visitor));
create table public.visit_days(site text references public.visit_sites, day date, visitors bigint not null default 0, primary key(site,day));
create table public.visit_pages(site text references public.visit_sites, day date, page text, viewers bigint not null default 0, primary key(site,day,page));
create table public.visit_seen(site text references public.visit_sites, day date, visitor text, page text, primary key(site,day,visitor,page));
-- Empty page is the per-day visitor marker. No IP, UA, referrer, full URL, query or content.
alter table public.visit_sites enable row level security;
alter table public.visit_browsers enable row level security;
alter table public.visit_days enable row level security;
alter table public.visit_pages enable row level security;
alter table public.visit_seen enable row level security;
revoke all on public.visit_sites,public.visit_browsers,public.visit_days,public.visit_pages,public.visit_seen from public,anon,authenticated;

create function public.visit_summary(p_site text) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('today',coalesce((select visitors from public.visit_days where site=p_site and day=(statement_timestamp() at time zone 'Asia/Seoul')::date),0),
 'total',(select count(*) from public.visit_browsers where site=p_site), 'day',(statement_timestamp() at time zone 'Asia/Seoul')::date,
 'started_at',(select started_at from public.visit_sites where site=p_site));
$$;

create function public.visit_record(p_site text,p_visitor text,p_page text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d date := (statement_timestamp() at time zone 'Asia/Seoul')::date; added integer;
begin
 if p_site is null or p_site not in ('haru','cardpilot') or p_visitor is null or p_visitor !~ '^[0-9a-f]{64}$' or p_page is null then raise exception 'invalid'; end if;
 if (p_site='haru' and p_page not in ('/','/landing-page-service.html','/logo-design-service.html','/logo-samples.html','/landing-sample.html','/landing-sample-2.html','/landing-sample-3.html','/cardpilot-landing.html','/system-development.html','/system-consultation.html','/privacy.html','/terms.html'))
 or (p_site='cardpilot' and p_page not in ('/','/download-guide.html')) then raise exception 'invalid page'; end if;
 -- Site lock serializes concurrent tabs/retries, including the first visitor of a day.
 perform pg_advisory_xact_lock(hashtext('site-visits:'||p_site));
 update public.visit_sites set started_at=statement_timestamp() where site=p_site and started_at is null;
 insert into public.visit_browsers values(p_site,p_visitor) on conflict do nothing;
 insert into public.visit_seen values(p_site,d,p_visitor,'') on conflict do nothing;
 get diagnostics added = row_count;
 if added=1 then
   insert into public.visit_days values(p_site,d,1) on conflict(site,day) do update set visitors=public.visit_days.visitors+1;
 end if;
 insert into public.visit_seen values(p_site,d,p_visitor,p_page) on conflict do nothing;
 get diagnostics added = row_count;
 if added=1 then
   insert into public.visit_pages values(p_site,d,p_page,1) on conflict(site,day,page) do update set viewers=public.visit_pages.viewers+1;
 end if;
 -- Bound daily pseudonymous records to 90 days; aggregate history remains.
 delete from public.visit_seen where site=p_site and day<d-90;
 return public.visit_summary(p_site);
end; $$;

create function public.visit_admin(p_site text) returns jsonb language sql security definer set search_path='' as $$
 select public.visit_summary(p_site)||jsonb_build_object(
 'days',coalesce((select jsonb_agg(jsonb_build_object('day',d.day,'visitors',coalesce(v.visitors,0)) order by d.day)
 from (select generate_series((statement_timestamp() at time zone 'Asia/Seoul')::date-29,(statement_timestamp() at time zone 'Asia/Seoul')::date,'1 day'::interval)::date day) d
 left join public.visit_days v on v.site=p_site and v.day=d.day
 where d.day>=(select (started_at at time zone 'Asia/Seoul')::date from public.visit_sites where site=p_site)), '[]'::jsonb),
 'pages',coalesce((select jsonb_agg(x order by x.viewers desc,x.page) from (select page,sum(viewers) viewers from public.visit_pages where site=p_site and day>=(statement_timestamp() at time zone 'Asia/Seoul')::date-29 group by page) x),'[]'::jsonb));
$$;
revoke all on function public.visit_summary(text),public.visit_record(text,text,text),public.visit_admin(text) from public,anon,authenticated;
grant execute on function public.visit_summary(text),public.visit_record(text,text,text),public.visit_admin(text) to service_role;
commit;
