// ============================================================
// Edge Function: import-apkg
// 接收前端解析后的 Anki 数据，写入 decks 和 cards 表
//
// 架构变更说明：
//   原计划在 Edge Function 中用 AdmZip + sql.js 解析 .apkg，
//   但 Supabase 的 bundler 无法在构建时访问 npm/esm.sh 上的 sql.js 包。
//   改为前端用 jszip + sql.js 解析后发送 JSON 数据到本函数。
//   本函数只负责数据库写入，无外部依赖。
//
// 流程：
//   1. 接收 { decks, mediaMap, apkgPath, lang, cardType, deckName? }
//   2. 验证用户登录，校验 apkgPath 在本人目录下
//   3. 遍历 decks，创建 deck 记录（metadata 存 media_map + apkg_path）
//   4. 批量 INSERT cards
//   5. 返回导入结果
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsJson, handleCorsPreflight } from '../shared/cors.ts';

/** 前端解析后的单个牌组数据 */
interface ParsedDeck {
  ankiDeckId: number;
  ankiDeckName: string;
  cards: Array<{
    front: string;
    back: string;
    metadata: Record<string, unknown>;
  }>;
}

interface RequestBody {
  decks: ParsedDeck[];
  mediaMap: Record<string, string>;  // { filename: mediaKey }
  apkgPath: string;                   // "apkg-uploads/{user_id}/{filename}.apkg"
  lang?: 'ja' | 'en';
  cardType?: 'word' | 'grammar' | 'sentence';
  deckName?: string;                  // 可选，单牌组时覆盖默认牌组名
}

interface ImportedDeck {
  id: string;
  name: string;
  cardCount: number;
}

const BATCH_SIZE = 500;  // 批量插入 cards 的批次大小

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const startTime = Date.now();
  const log = (msg: string) => console.log(`[import-apkg] ${msg} (+${Date.now() - startTime}ms)`);

  try {
    const body: RequestBody = await req.json();
    const {
      decks: parsedDecks,
      mediaMap,
      apkgPath,
      lang = 'ja',
      cardType = 'word',
      deckName,
    } = body;

    if (!parsedDecks || !Array.isArray(parsedDecks) || parsedDecks.length === 0) {
      return corsJson({ error: '缺少 decks 数据' }, { status: 400 }, req);
    }
    if (!apkgPath) {
      return corsJson({ error: '缺少 apkgPath 参数' }, { status: 400 }, req);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return corsJson({ error: '服务配置错误：缺少环境变量' }, { status: 500 }, req);
    }

    // 1. 用户认证
    const authClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: userData, error: authError } = await authClient.auth.getUser();
    if (authError || !userData.user) {
      return corsJson({ error: '请先登录' }, { status: 401 }, req);
    }
    const userId = userData.user.id;
    log(`用户认证成功: ${userId}`);

    // 2. 校验 apkgPath 在用户目录下（防止篡改）
    const expectedPrefix = `apkg-uploads/${userId}/`;
    if (!apkgPath.startsWith(expectedPrefix)) {
      return corsJson({ error: '无权访问该文件' }, { status: 403 }, req);
    }

    // 3. 用 service role 写入数据库（绕过 RLS，确保批量插入成功）
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // 4. 遍历解析后的 decks，写入数据库
    const importResults: ImportedDeck[] = [];
    const isSingleDeck = parsedDecks.length === 1;

    for (const parsed of parsedDecks) {
      // 单牌组且用户指定了名称时，使用用户名称
      const finalDeckName = deckName && isSingleDeck ? deckName : parsed.ankiDeckName;

      // 创建 deck
      const { data: deckRow, error: deckErr } = await serviceClient
        .from('decks')
        .insert({
          name: finalDeckName,
          description: `从 Anki .apkg 导入（原牌组：${parsed.ankiDeckName}）`,
          lang,
          card_type: cardType,
          visibility: 'private',
          creator_id: userId,
          metadata: {
            source: 'apkg',
            apkg_path: apkgPath,
            anki_deck_id: parsed.ankiDeckId,
            media_map: mediaMap,
          },
        })
        .select()
        .single();

      if (deckErr || !deckRow) {
        console.error(`[import-apkg] 创建 deck "${finalDeckName}" 失败:`, deckErr?.message);
        continue;
      }

      // 批量插入 cards
      const cardRows = parsed.cards.map((c) => ({
        deck_id: deckRow.id,
        front: c.front,
        back: c.back,
        metadata: c.metadata,
        tags: [],
        creator_id: userId,
      }));

      for (let i = 0; i < cardRows.length; i += BATCH_SIZE) {
        const batch = cardRows.slice(i, i + BATCH_SIZE);
        const { error: cardsErr } = await serviceClient
          .from('cards')
          .insert(batch);
        if (cardsErr) {
          console.error(`[import-apkg] 批量插入 cards 失败 (batch ${i}):`, cardsErr.message);
        }
      }

      log(`Deck "${finalDeckName}" 导入完成: ${cardRows.length} 张卡片`);
      importResults.push({
        id: deckRow.id,
        name: finalDeckName,
        cardCount: cardRows.length,
      });
    }

    const duration = Date.now() - startTime;
    const totalCards = importResults.reduce((s, d) => s + d.cardCount, 0);
    log(`全部完成: ${importResults.length} 个牌组, ${totalCards} 张卡片, 总耗时 ${duration}ms`);

    return corsJson(
      {
        success: true,
        decks: importResults,
        totalCards,
        mediaCount: Object.keys(mediaMap).length,
        duration,
      },
      { status: 200 },
      req,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const duration = Date.now() - startTime;
    console.error(`[import-apkg] 失败 - 耗时: ${duration}ms, 错误: ${message}`);
    return corsJson({ error: message }, { status: 500 }, req);
  }
});
