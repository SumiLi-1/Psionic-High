create or replace view public.season_camp_stats
with (security_invoker = true)
as
select
  season_id,
  case when camp in ('狼人', '狼队') then '狼人' else camp end as camp,
  count(*)::integer as player_record_count,
  count(*) filter (where result = '胜利')::integer as win_count,
  case when count(*) = 0 then 0 else round(count(*) filter (where result = '胜利')::numeric / count(*) * 100, 1) end as win_rate
from public.match_records
where camp in ('好人', '狼人', '狼队')
group by season_id, case when camp in ('狼人', '狼队') then '狼人' else camp end;

create or replace view public.season_score_trend
with (security_invoker = true)
as
with daily_scores as (
  select season_id, match_date, coalesce(sum(score), 0) as daily_score
  from public.match_records
  where match_date is not null
  group by season_id, match_date
)
select
  season_id,
  match_date,
  daily_score,
  sum(daily_score) over (partition by season_id order by match_date) as cumulative_score
from daily_scores;

grant select on public.season_camp_stats, public.season_score_trend to anon, authenticated;
