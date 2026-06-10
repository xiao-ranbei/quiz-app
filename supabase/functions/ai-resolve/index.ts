import { createClient } from 'jsr:@supabase/supabase-js@2';
import { callAI } from '../shared/ai-client.ts';
import { corsJson, handleCorsPreflight } from '../shared/cors.ts';

interface RequestBody {
  question_id?: string;
  question: string;
  type: 'choice' | 'fill' | 'multiple';
  options?: Record<string, string> | null;
  answer: string;
  explanation?: string | null;
  user_answer?: string;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const startTime = Date.now();
  try {
    const body: RequestBody = await req.json();
    const { question_id, question, type, options, answer, explanation, user_answer } = body;

    console.log(`[ai-resolve] 请求开始 - question_id: ${question_id}, type: ${type}`);

    if (!question || !answer) {
      return corsJson({ error: '缺少必要参数（question 或 answer）' }, { status: 400 }, req);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('[ai-resolve] 环境变量未配置');
      return corsJson({ error: '服务配置错误' }, { status: 500 }, req);
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseKey,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError) {
      console.error('[ai-resolve] 用户认证失败:', authError.message);
      return corsJson({ error: '用户认证失败: ' + authError.message }, { status: 401 }, req);
    }

    if (!userData.user) {
      return corsJson({ error: '请先登录' }, { status: 401 }, req);
    }

    if (question_id) {
      const { data: cached, error: cacheError } = await supabase
        .from('questions')
        .select('ai_resolution')
        .eq('id', question_id)
        .single();

      if (cacheError) {
        console.warn('[ai-resolve] 缓存查询失败:', cacheError.message);
      } else if (cached?.ai_resolution) {
        console.log(`[ai-resolve] 返回缓存结果 - question_id: ${question_id}`);
        return corsJson({ resolution: cached.ai_resolution, cached: true }, { status: 200 }, req);
      }
    }

    const { data: configData, error: configError } = await supabase
      .from('user_ai_configs')
      .select('api_base_url, api_key, model')
      .eq('user_id', userData.user.id)
      .single();

    if (configError) {
      console.error('[ai-resolve] 配置查询失败:', configError.message);
      return corsJson({ error: '获取 AI 配置失败: ' + configError.message }, { status: 500 }, req);
    }

    if (!configData) {
      return corsJson({ error: '请先在个人中心配置 AI API' }, { status: 400 }, req);
    }

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
    if ((type === 'choice' || type === 'multiple') && optionsText) {
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

    console.log(`[ai-resolve] 调用 AI - model: ${configData.model}, baseUrl: ${configData.api_base_url}`);
    const resolution = await callAI(configData, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    if (question_id) {
      const { error: updateError } = await supabase
        .from('questions')
        .update({ ai_resolution: resolution })
        .eq('id', question_id);

      if (updateError) {
        console.warn('[ai-resolve] 缓存写入失败:', updateError.message);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[ai-resolve] 请求完成 - 耗时: ${duration}ms`);

    return corsJson({ resolution, cached: false }, { status: 200 }, req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const duration = Date.now() - startTime;
    console.error(`[ai-resolve] 请求失败 - 耗时: ${duration}ms, 错误: ${message}`);

    return corsJson({ error: message }, { status: 500 }, req);
  }
});
