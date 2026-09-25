import { supabase } from './supabase'

export async function captureVideoMetadata(videoUrl) {
  if (!videoUrl?.trim() || !supabase) return null
  const { data, error } = await supabase.functions.invoke('bilibili-metadata', { body: { videoUrl: videoUrl.trim() } })
  if (error) throw error
  return data
}
