import { createClient } from 'jsr:@supabase/supabase-js@2';
import { callAI } from '../shared/ai-client.ts';

interface RequestBody {
  question_id?: string;
  question: string;
  type: 'choice' | 'fill';
  options?: Record<string, string> | null;
  answer: string;
  explanation?: string | null;
  user_answer?: string;
}

Deno.serve(async (req) => {
  try {
    const body: RequestBody = await req.json();
    const { question_id, question, type, options, answer, explanation, user_answer } = body;

    if (!question || !answer) {
      return new Response(JSON.stringify({ error: '缺少必要参数' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );

    // 1. 取当前用户
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return new Response(JSON.stringify({ error: '请先登录' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. 若已缓存 AI 解析，直接返回
    if (question_id) {
      const { data: cached } = await supabase
        .from('questions')
        .select('ai_resolution')
        .eq('id', question_id)
        .single();

      if (cached?.ai_resolution) {
        return new Response(JSON.stringify({ resolution: cached.ai_resolution, cached: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // 3. 读取用户 AI 配置
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

    // 4. 构造提示词
    const optionsText = options
      ? Object.entries(options)
          .map(([k, v]) => `${k}. ${v}`)
          .join('\n')
      : '';

    const systemPrompt =
      '你是一位耐心且专业的题库解析老师。请用清晰的中文分析题目，解释正确答案为何正确、常见错误的误区所在，并给出学习建议。';

    let userPrompt = `题目内容：
${question}

`;
    if (type === 'choice' && optionsText) {
      userPrompt += `选项：
${optionsText}

`;
    }
    userPrompt += `正确答案：${answer}
`;
    if (user_answer) {
      userPrompt += `用户作答：${user_answer}
`;
    }
    if (explanation) {
      userPrompt += `题目自带解析：${explanation}
`;
    }
    userPrompt += `请给出你的深入解析（中文，300 字以内）。`;

    // 5. 调用 AI
    const resolution = await callAI(configData, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    // 6. 写入缓存
    if (question_id) {
      await supabase
        .from('questions')
        .update({ ai_resolution: resolution })
        .eq('id', question_id);
    }

    return new Response(JSON.stringify({ resolution, cached: false }), {
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
