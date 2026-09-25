create or replace view public.season_stats
with (security_invoker = true)
as
select
  s.id as season_id,
  s.name as season_name,
  s.start_date,
  s.end_date,
  s.is_active,
  count(m.id)::integer as player_record_count,
  coalesce(sum(m.score), 0) as total_score,
  count(m.id) filter (where m.result = '胜利')::integer as win_count,
  count(m.id) filter (where m.result = '失败')::integer as loss_count,
  case
    when count(m.id) = 0 then 0
    else round(count(m.id) filter (where m.result = '胜利')::numeric / count(m.id) * 100, 1)
  end as win_rate,
  count(m.id) filter (where coalesce(m.mvp_score, 0) > 0)::integer as mvp_count,
  count(distinct m.player_id)::integer as player_count,
  count(distinct nullif(m.video_url, ''))::integer as video_count,
  coalesce(max(m.score), 0) as highest_single_score
from public.seasons s
left join public.match_records m on m.season_id = s.id
group by s.id, s.name, s.start_date, s.end_date, s.is_active;

grant select on public.season_stats to anon, authenticated;
