import { createClient } from 'jsr:@supabase/supabase-js@2';
import { callAI } from '../shared/ai-client.ts';

interface RequestBody {
  topic: string;
  count?: number;
  difficulty?: 1 | 2 | 3;
  type?: 'choice' | 'fill';
}

interface GeneratedQuestion {
  question: string;
  options?: Record<string, string>;
  answer: string;
  explanation?: string;
}

Deno.serve(async (req) => {
  try {
    const body: RequestBody = await req.json();
    const { topic, count = 3, difficulty = 2, type = 'choice' } = body;

    if (!topic) {
      return new Response(JSON.stringify({ error: '请提供题目主题' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return new Response(JSON.stringify({ error: '请先登录' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: configData } = await supabase
      .from('user_ai_configs')
      .select('api_base_url, api_key, model')
      .eq('user_id', userData.user.id)
      .single();

    if (!configData) {
      return new Response(JSON.stringify({ error: '请先在个人中心配置 AI API' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const diffText = difficulty === 1 ? '简单' : difficulty === 2 ? '中等' : '困难';
    const typeText = type === 'choice' ? '选择题' : '填空题';

    const systemPrompt =
      '你是一位题库出题专家。请根据用户提供的主题，生成高质量的中文题目。必须严格以合法 JSON 格式返回，不要包含额外文字。';

    let schemaPrompt: string;
    if (type === 'choice') {
      schemaPrompt = `请以 JSON 格式返回 ${count} 道关于 "${topic}" 的${diffText}${typeText}，结构如下：
{
  "questions": [
    {
      "question": "题干内容",
      "options": {
        "A": "选项 A",
        "B": "选项 B",
        "C": "选项 C",
        "D": "选项 D"
      },
      "answer": "A",
      "explanation": "简要解析"
    }
  ]
}`;
    } else {
      schemaPrompt = `请以 JSON 格式返回 ${count} 道关于 "${topic}" 的${diffText}${typeText}，结构如下：
{
  "questions": [
    {
      "question": "题干内容（含下划线或空格留给填写）",
      "answer": "正确答案文本",
      "explanation": "简要解析"
    }
  ]
}`;
    }

    const raw = await callAI(configData, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: schemaPrompt },
    ]);

    // 处理 AI 可能返回的 markdown 代码块
    const cleaned = raw
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    let parsed: { questions: GeneratedQuestion[] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: 'AI 返回的 JSON 无法解析，请重试', raw }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (!Array.isArray(parsed.questions)) {
      return new Response(
        JSON.stringify({ error: 'AI 未返回题目数组，请调整提示词并重试', raw }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // 标准化类型字段，方便前端直接入库
    const questions = parsed.questions.map((q) => ({
      ...q,
      type,
      difficulty,
    }));

    return new Response(JSON.stringify({ questions }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
