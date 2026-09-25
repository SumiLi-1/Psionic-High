import OpenAI from 'openai'

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['board_type', 'game_result', 'players'],
  properties: {
    board_type: { type: ['string', 'null'] },
    game_result: { type: ['string', 'null'] },
    players: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['seat_number', 'player_name', 'role', 'camp', 'result', 'votes_detail', 'vote_wolf_count', 'vote_score', 'behavior_score', 'mvp_score', 'svp_score', 'scapegoat_score', 'remarks'],
        properties: {
          seat_number: { type: ['integer', 'null'] },
          player_name: { type: ['string', 'null'] },
          role: { type: ['string', 'null'] },
          camp: { type: ['string', 'null'] },
          result: { type: ['string', 'null'] },
          votes_detail: { type: 'object', 'additionalProperties': true },
          vote_wolf_count: { type: ['number', 'null'] },
          vote_score: { type: ['number', 'null'] },
          behavior_score: { type: ['number', 'null'] },
          mvp_score: { type: ['number', 'null'] },
          svp_score: { type: ['number', 'null'] },
          scapegoat_score: { type: ['number', 'null'] },
          remarks: { type: ['string', 'null'] },
        },
      },
    },
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body ?? {}
    if (!imageBase64) return res.status(400).json({ error: '缺少成绩单图片。' })
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: '服务端尚未配置 OPENAI_API_KEY。' })

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const response = await client.responses.create({
      model: 'gpt-4o',
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: `你是狼人杀官方成绩单录入助手。读取图片中的一场比赛成绩单，严格转成 JSON。
规则：只抄录清晰可见的内容；看不清就返回 null，绝不猜测。玩家名称保留原文。camp 只填“好人”或“狼队”；result 填“胜利”或“失败”（由整局游戏结果推断）。votes_detail 使用对象保存 DAY1、DAY2 等每轮票型及可见细节。投狼次数、投票分、行为分、MVP、SVP、背锅分必须从对应列读取；备注保留完整文字。` },
          { type: 'input_image', image_url: `data:${mimeType};base64,${imageBase64}` },
        ],
      }],
      text: { format: { type: 'json_schema', name: 'wolf_score_sheet', strict: true, schema } },
    })
    return res.status(200).json(JSON.parse(response.output_text))
  } catch (error) {
    console.error('parse-score-image failed', error)
    return res.status(500).json({ error: '成绩单识别失败，请检查图片后重试。' })
  }
}
