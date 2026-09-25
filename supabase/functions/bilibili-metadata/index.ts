import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function extractBvid(value: string) {
  return value.match(/BV[0-9A-Za-z]+/i)?.[0]
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders })
  try {
    const { videoUrl } = await request.json()
    if (typeof videoUrl !== 'string' || !videoUrl.trim()) return Response.json({ error: '缺少 B 站视频链接。' }, { status: 400, headers: corsHeaders })
    let resolvedUrl = videoUrl.trim()
    if (!extractBvid(resolvedUrl)) resolvedUrl = (await fetch(resolvedUrl, { redirect: 'follow' })).url
    const bvid = extractBvid(resolvedUrl)
    if (!bvid) return Response.json({ error: '未能从链接中识别 BV 号。' }, { status: 422, headers: corsHeaders })
    const response = await fetch('https://api.bilibili.com/x/web-interface/view?bvid=' + encodeURIComponent(bvid), {
      headers: { Referer: 'https://www.bilibili.com/', 'User-Agent': 'Mozilla/5.0' },
    })
    const result = await response.json()
    if (!response.ok || result.code !== 0 || !result.data) return Response.json({ error: result.message || 'B 站暂时无法返回视频信息。' }, { status: 502, headers: corsHeaders })
    const metadata = { bvid, source_url: videoUrl.trim(), title: result.data.title || '未命名视频', cover_url: result.data.pic || null, owner_name: result.data.owner?.name || null, duration_seconds: result.data.duration || null, updated_at: new Date().toISOString() }
    const database = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const { error } = await database.from('video_metadata').upsert(metadata, { onConflict: 'bvid' })
    if (error) throw error
    return Response.json(metadata, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '视频信息抓取失败。' }, { status: 500, headers: corsHeaders })
  }
})
