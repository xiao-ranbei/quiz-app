import { callAI } from '../shared/ai-client.ts';

interface RequestBody {
  api_base_url: string;
  api_key: string;
  model: string;
}

Deno.serve(async (req) => {
  try {
    const body: RequestBody = await req.json();
    const { api_base_url, api_key, model } = body;

    if (!api_base_url || !api_key || !model) {
      return new Response(JSON.stringify({ ok: false, error: '请提供完整的 API 配置' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await callAI(
      { api_base_url, api_key, model },
      [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: '请只回复一个单词：OK' },
      ],
      0.1,
    );

    return new Response(JSON.stringify({ ok: true, message: '连接成功', sample: result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
