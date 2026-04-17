import { mastra } from '../../mastra/index'
import { logger } from '../../logger'

export async function handleWebChat(req: Request): Promise<Response> {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  try {
    const body = await req.json()
    const message: string = body.message ?? ''

    if (!message.trim()) {
      return new Response(JSON.stringify({ reply: 'Pesan tidak boleh kosong.' }), { status: 400, headers: cors })
    }

    const sessionId = body.sessionId ?? 'web-session'

    const agent = mastra.getAgent('recruiterAgent')
    const result = await agent.generate(message, {
      memory: { thread: `web-${sessionId}`, resource: `web-${sessionId}` },
    })

    logger.info({ event: 'web_chat', sessionId, message, reply: result.text })

    return new Response(JSON.stringify({ reply: result.text }), { status: 200, headers: cors })
  } catch (error: any) {
    logger.error({ event: 'web_chat_error', error: error.message })
    return new Response(JSON.stringify({ reply: 'Maaf, terjadi kesalahan. Silakan coba lagi.' }), { status: 500, headers: cors })
  }
}
