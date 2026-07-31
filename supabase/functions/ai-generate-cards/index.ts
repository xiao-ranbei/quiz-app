import { createClient } from 'jsr:@supabase/supabase-js@2';
import { callAI } from '../shared/ai-client.ts';
import { corsJson, handleCorsPreflight } from '../shared/cors.ts';

interface RequestBody {
  topic: string;
  lang: 'ja' | 'en';
  card_type: 'word' | 'grammar' | 'sentence';
  count?: number;
  deck_id?: string;
}

interface GeneratedCard {
  front: string;
  back: string;
  metadata: Record<string, unknown>;
  tags?: string[];
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const startTime = Date.now();
  try {
    const body: RequestBody = await req.json();
    const { topic, lang, card_type, count = 10, deck_id } = body;

    console.log(
      `[ai-generate-cards] 请求开始 - topic: ${topic}, lang: ${lang}, card_type: ${card_type}, count: ${count}`,
    );

    if (!topic) {
      return corsJson({ error: '请提供卡片主题' }, { status: 400 }, req);
    }

    if (!lang || !card_type) {
      return corsJson({ error: '缺少必要参数（lang 或 card_type）' }, { status: 400 }, req);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('[ai-generate-cards] 环境变量未配置');
      return corsJson({ error: '服务配置错误' }, { status: 500 }, req);
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseKey,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError) {
      console.error('[ai-generate-cards] 用户认证失败:', authError.message);
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
      console.error('[ai-generate-cards] 配置查询失败:', configError.message);
      return corsJson({ error: '获取 AI 配置失败: ' + configError.message }, { status: 500 }, req);
    }

    if (!configData) {
      return corsJson({ error: '请先在个人中心配置 AI API' }, { status: 400 }, req);
    }

    // 语言与类型标签映射
    const langLabel = lang === 'ja' ? '日语' : '英语';
    const cardTypeLabel =
      card_type === 'word' ? '单词' : card_type === 'grammar' ? '语法' : '短句';

    // 构造 system prompt
    const systemPrompt = `你是一个语言学习卡片生成助手。请根据用户给出的主题，生成 ${count} 张${langLabel}${cardTypeLabel}学习卡片。

要求：
1. 严格返回 JSON 格式：{"cards": [{front, back, metadata, tags?}]}
2. front 是${langLabel}原文（单词/语法点/短句）
3. back 是中文释义或解释
4. metadata 字段按卡片类型填充（日语/英语统一结构）：
   - 单词：{pos, reading(日语假名注音)或 phonetic(英语音标), example, example_zh}
   - 语法：{example, example_zh, notes}
   - 短句：{translation, notes}
5. tags 是字符串数组，可包含难度等级（如 JLPT-N3、CET-6）等
6. 不要包含任何 markdown 代码块标记，直接返回纯 JSON`;

    // 构造 user prompt
    const userPrompt = `主题：${topic}
数量：${count}
语言：${langLabel}
类型：${cardTypeLabel}`;

    console.log(
      `[ai-generate-cards] 调用 AI - model: ${configData.model}, baseUrl: ${configData.api_base_url}`,
    );
    const raw = await callAI(
      configData,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      0.7,
    );

    // 清理可能的 markdown 代码块围栏
    const cleaned = raw
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    let parsed: { cards: GeneratedCard[] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('[ai-generate-cards] JSON 解析失败:', raw);
      return corsJson(
        { error: 'AI 返回的 JSON 无法解析，请重试', raw },
        { status: 502 },
        req,
      );
    }

    if (!Array.isArray(parsed.cards)) {
      console.error('[ai-generate-cards] AI 未返回卡片数组:', raw);
      return corsJson(
        { error: 'AI 未返回卡片数组，请调整提示词并重试', raw },
        { status: 502 },
        req,
      );
    }

    // 附加 lang、card_type、deck_id（如果传了）字段，便于前端直接使用
    const cards = parsed.cards.map((card) => ({
      ...card,
      lang,
      card_type,
      ...(deck_id ? { deck_id } : {}),
    }));

    const duration = Date.now() - startTime;
    console.log(
      `[ai-generate-cards] 请求完成 - 耗时: ${duration}ms, 生成卡片数: ${cards.length}`,
    );

    return corsJson({ cards }, { status: 200 }, req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const duration = Date.now() - startTime;
    console.error(`[ai-generate-cards] 请求失败 - 耗时: ${duration}ms, 错误: ${message}`);

    return corsJson({ error: message }, { status: 500 }, req);
  }
});
