import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const wolfRoles = new Set(['狼人', '狼王', '白狼王', '石像鬼', '狼美人', '隐狼', '恶灵骑士'])
const asNumber = (value: unknown) => Number(value ?? 0)

function assertCode(code: unknown) {
  const expected = Deno.env.get('RECORDING_ACCESS_CODE')
  if (!expected || typeof code !== 'string' || code !== expected) throw new Error('录入码无效。')
}

function normalizeRow(row: Record<string, unknown>) {
  const role = String(row.role ?? '').trim()
  const winScore = asNumber(row.win_score)
  const title = String(row.title ?? '').trim()
  const result = row.result === '胜利' || row.result === '失败'
    ? row.result
    : winScore === 5 ? '胜利' : '失败'
  return {
    player: String(row.player ?? row.player_name ?? '').trim(),
    role,
    camp: wolfRoles.has(role) ? '狼队' : '好人',
    result,
    score: asNumber(row.score),
    board_type: row.board_type ? String(row.board_type) : null,
    seat_number: row.seat_number ? Math.trunc(asNumber(row.seat_number)) : null,
    vote_wolf_count: Math.trunc(asNumber(row.vote_wolf_count)),
    vote_score: asNumber(row.vote_score),
    behavior_score: asNumber(row.behavior_score),
    mvp_score: title === 'MVP' ? 2 : asNumber(row.mvp_score),
    svp_score: title === 'SVP' ? 1.5 : asNumber(row.svp_score),
    scapegoat_score: title === '背锅' ? -1 : asNumber(row.scapegoat_score),
    remarks: row.remarks ? String(row.remarks) : null,
  }
}

async function recognizeScoreSheet(imageBase64: string, mimeType: string, playerNames: string[]) {
  // 优先获取 ZHIPU_API_KEY，如果没有则读取 GEMINI_API_KEY 兼容
  const key = Deno.env.get('ZHIPU_API_KEY') || Deno.env.get('GEMINI_API_KEY')
  if (!key) throw new Error('尚未配置智谱 AI 识别密钥（ZHIPU_API_KEY）。')
  
  const prompt = `你是狼人杀计分表识别器。图片通常有三局（第一局、第二局、第三局）和多位选手。只提取选手姓名严格属于此名单的行：${JSON.stringify(playerNames)}。
返回纯 JSON，不要 Markdown，格式：{"rows":[{"player":"","board_type":"第一局","seat_number":1,"role":"","win_score":0,"score":0,"vote_score":0,"behavior_score":0,"mvp_score":0,"svp_score":0,"scapegoat_score":0,"vote_wolf_count":0,"remarks":""}]}。
把表格中的“胜负分”写入 win_score；胜负分为 5 时代表胜利，为 0 时代表失败。把“单局积分”写入 score。阵营不要输出；网页会按身份自动识别。投狼数通常无法从这张计分表可靠得出，填 0，等待人工编辑。无法确认的数字填 0，绝不编造选手。`

  const imageUrl = `data:${mimeType};base64,${imageBase64}`

  // 调用智谱 AI OpenAI 兼容接口（使用免费的 glm-4v-flash 识图模型）
  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model: 'glm-4v-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ],
      temperature: 0.1
    })
  })

  const result = await response.json()
  if (!response.ok) throw new Error(result.error?.message || result.message || '智谱 AI 识别服务暂时不可用。')

  const text = result.choices?.[0]?.message?.content || '{}'
  const cleanedText = text.replace(/^```json\s*|\s*```$/g, '').trim()

  let parsed: { rows?: unknown[] } = {}
  try {
    parsed = JSON.parse(cleanedText)
  } catch (_e) {
    // 容错处理：如果模型输出带了多余的说明文字，截取出 JSON 部分
    const match = cleanedText.match(/\{[\s\S]*\}/)
    if (match) {
      parsed = JSON.parse(match[0])
    } else {
      throw new Error('无法解析智谱 AI 返回的数据格式。')
    }
  }

  return Array.isArray(parsed.rows) ? parsed.rows.map(normalizeRow) : []
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders })
  try {
    const body = await request.json()
    assertCode(body.code)
    if (body.action === 'authorize') return Response.json({ authorized: true }, { headers: corsHeaders })
    if (body.action === 'recognize') {
      const rows = await recognizeScoreSheet(body.imageBase64, body.mimeType || 'image/jpeg', Array.isArray(body.playerNames) ? body.playerNames : [])
      return Response.json({ rows }, { headers: corsHeaders })
    }
    if (body.action === 'write') {
      const database = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
      const { data: players, error: playersError } = await database.from('players').select('id,name')
      if (playersError) throw playersError
      const byName = new Map((players || []).map(player => [String(player.name).trim().toLowerCase(), player.id]))
      const rows = (Array.isArray(body.rows) ? body.rows : []).map(normalizeRow)
      const unknown = rows.filter(row => !byName.has(row.player.toLowerCase()))
      if (unknown.length) throw new Error('无法匹配队员：' + unknown.map(row => row.player).join('、'))
      const payload = rows.map(({ player, ...row }) => ({ ...row, player_id: byName.get(player.toLowerCase()), season_id: body.seasonId, match_date: body.matchDate, video_url: body.videoUrl || null }))
      if (!payload.length) throw new Error('没有可写入的对局记录。')
      const { error } = await database.from('match_records').insert(payload)
      if (error) throw error
      return Response.json({ inserted: payload.length }, { headers: corsHeaders })
    }
    throw new Error('未知操作。')
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '录入处理失败。' }, { status: 400, headers: corsHeaders })
  }
})
