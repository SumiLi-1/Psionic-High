import { supabase } from './supabase'

export async function saveMatchRecords({ rows, seasonId, matchDate, videoUrl, code }) {
  if (!supabase) throw new Error('请先配置 Supabase 环境变量。')
  const { data, error } = await supabase.functions.invoke('match-import', { body: { action: 'write', code, rows, seasonId, matchDate, videoUrl } })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}
