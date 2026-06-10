import { createClient } from 'jsr:@supabase/supabase-js@2';
import { callAI } from '../shared/ai-client.ts';
import { corsJson, handleCorsPreflight } from '../shared/cors.ts';

interface RequestBody {
  topic: string;
  count?: number;
  difficulty?: 1 | 2 | 3;
  type?: 'choice' | 'fill';
  category_id?: string;
}

interface GeneratedQuestion {
  question: string;
  options?: Record<string, string>;
  answer: string;
  explanation?: string;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const startTime = Date.now();
  try {
    const body: RequestBody = await req.json();
    const { topic, count = 3, difficulty = 2, type = 'choice', category_id } = body;

    console.log(`[ai-generate] 请求开始 - topic: ${topic}, count: ${count}, type: ${type}`);

    if (!topic) {
      return corsJson({ error: '请提供题目主题' }, { status: 400 }, req);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('[ai-generate] 环境变量未配置');
      return corsJson({ error: '服务配置错误' }, { status: 500 }, req);
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseKey,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError) {
      console.error('[ai-generate] 用户认证失败:', authError.message);
      return corsJson({ error: '用户认证失败: ' + authError.message }, { status: 401 }, req);
    }

    if (!userData.user) {
      return corsJson({ error: '请先登录' }, { status: 401 }, req);
    }

    const { data: configData, error: configError } = await supabase
      .from('user_ai_configs')
      .select('api_base_url, api_key, model')
      .eq('user_id', userData.user.id)
      .single();

    if (configError) {
      console.error('[ai-generate] 配置查询失败:', configError.message);
      return corsJson({ error: '获取 AI 配置失败: ' + configError.message }, { status: 500 }, req);
    }

    if (!configData) {
      return corsJson({ error: '请先在个人中心配置 AI API' }, { status: 400 }, req);
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

    console.log(`[ai-generate] 调用 AI - model: ${configData.model}, baseUrl: ${configData.api_base_url}`);
    const raw = await callAI(configData, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: schemaPrompt },
    ]);

    const cleaned = raw
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    let parsed: { questions: GeneratedQuestion[] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('[ai-generate] JSON 解析失败:', raw);
      return corsJson(
        { error: 'AI 返回的 JSON 无法解析，请重试', raw },
        { status: 502 },
        req,
      );
    }

    if (!Array.isArray(parsed.questions)) {
      console.error('[ai-generate] AI 未返回题目数组:', raw);
      return corsJson(
        { error: 'AI 未返回题目数组，请调整提示词并重试', raw },
        { status: 502 },
        req,
      );
    }

    const questions = parsed.questions.map((q) => ({
      ...q,
      type,
      difficulty,
      category_id,
    }));

    const duration = Date.now() - startTime;
    console.log(`[ai-generate] 请求完成 - 耗时: ${duration}ms, 生成题目数: ${questions.length}`);

    return corsJson({ questions }, { status: 200 }, req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const duration = Date.now() - startTime;
    console.error(`[ai-generate] 请求失败 - 耗时: ${duration}ms, 错误: ${message}`);

    return corsJson({ error: message }, { status: 500 }, req);
  }
});
