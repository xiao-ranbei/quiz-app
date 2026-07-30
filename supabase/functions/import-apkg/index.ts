// ============================================================
// Edge Function: import-apkg
// 解析 Anki .apkg 文件，导入 decks 和 cards 到数据库
//
// 流程：
//   1. 接收 { uploadPath, deckName?, lang?, cardType? }
//   2. 验证用户登录，校验 uploadPath 在本人目录下
//   3. 用 service role 下载 .apkg 文件
//   4. AdmZip 解压提取 media（JSON）和 collection.anki21 / collection.anki2（SQLite）
//   5. sql.js 解析 SQLite：读取 col.decks / col.models / notes / cards
//   6. 查找 Vocab 模型（含 VocabKanji 字段），按字段名映射
//      VocabKanji→front, VocabDefSC→back, VocabFurigana→reading, ...
//   7. 反转 media 索引：{ filename: index } 存入 deck.metadata.media_map
//   8. 每个 Anki deck 创建一条 decks 记录，批量 INSERT cards
//   9. 返回导入结果
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import AdmZip from 'npm:adm-zip@0.5.16';
import initSqlJs from 'npm:sql.js@1.10.0';
import { corsJson, handleCorsPreflight } from '../shared/cors.ts';

interface RequestBody {
  uploadPath: string;  // e.g. "apkg-uploads/{user_id}/{filename}.apkg"
  deckName?: string;   // 可选，单牌组时覆盖默认牌组名
  lang?: 'ja' | 'en';  // 默认 'ja'
  cardType?: 'word' | 'grammar' | 'sentence';  // 默认 'word'
}

interface ImportedDeck {
  id: string;
  name: string;
  cardCount: number;
}

// 字段映射：Anki 字段名 → 目标字段
// front/back 为卡片正反面；其余写入 metadata
const FIELD_MAP: Record<string, string> = {
  VocabKanji: 'front',
  VocabDefSC: 'back',
  VocabFurigana: 'reading',
  VocabPitch: 'pitch',
  VocabPoS: 'pos',
  VocabAudio: 'audio',
  SentKanji1: 'example',
  SentFurigana1: 'example_reading',
  SentDefSC1: 'example_zh',
  SentAudio1: 'example_audio',
};

const SEP = '\x1f';  // Anki flds 字段分隔符
const BATCH_SIZE = 500;  // 批量插入 cards 的批次大小

/** 从 [sound:filename.mp3] 中提取文件名 */
function extractAudioFilename(text: string): string | null {
  if (!text) return null;
  const match = text.match(/\[sound:([^\]]+)\]/);
  return match ? match[1] : null;
}

/** 移除 [sound:...] 标签，清理文本 */
function stripSoundTags(text: string): string {
  return text.replace(/\[sound:[^\]]+\]/g, '').trim();
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const startTime = Date.now();
  const log = (msg: string) => console.log(`[import-apkg] ${msg} (+${Date.now() - startTime}ms)`);

  try {
    const body: RequestBody = await req.json();
    const { uploadPath, deckName, lang = 'ja', cardType = 'word' } = body;

    if (!uploadPath) {
      return corsJson({ error: '缺少 uploadPath 参数' }, { status: 400 }, req);
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

    // 2. 校验 uploadPath 在用户目录下
    const expectedPrefix = `apkg-uploads/${userId}/`;
    if (!uploadPath.startsWith(expectedPrefix)) {
      return corsJson({ error: '无权访问该文件' }, { status: 403 }, req);
    }

    // 3. 用 service role 下载 .apkg 文件
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const objectPath = uploadPath.replace('apkg-uploads/', '');
    const { data: fileData, error: downloadErr } = await serviceClient
      .storage
      .from('apkg-uploads')
      .download(objectPath);

    if (downloadErr || !fileData) {
      return corsJson(
        { error: '下载 apkg 文件失败: ' + (downloadErr?.message ?? '未知错误') },
        { status: 500 },
        req,
      );
    }

    const apkgBuffer = new Uint8Array(await fileData.arrayBuffer());
    log(`下载 apkg 完成: ${apkgBuffer.length} bytes`);

    // 4. 解压 .apkg
    const zip = new AdmZip(apkgBuffer);
    const mediaEntry = zip.getEntry('media');
    const colEntry = zip.getEntry('collection.anki21') ?? zip.getEntry('collection.anki2');

    if (!colEntry) {
      return corsJson(
        { error: 'apkg 中未找到 collection.anki21 或 collection.anki2' },
        { status: 400 },
        req,
      );
    }

    // 5. 解析 media 文件：{ "0": "audio1.mp3", "1": "audio2.mp3" }
    // 反转为 { filename: index }，存入 deck.metadata.media_map
    let mediaMap: Record<string, string> = {};
    if (mediaEntry) {
      try {
        const mediaText = new TextDecoder().decode(mediaEntry.getData());
        const mediaObj = JSON.parse(mediaText) as Record<string, string>;
        mediaMap = Object.fromEntries(
          Object.entries(mediaObj).map(([idx, name]) => [name, idx]),
        );
        log(`解析 media 完成: ${Object.keys(mediaMap).length} 个文件`);
      } catch (e) {
        console.warn('[import-apkg] media 文件解析失败:', e);
      }
    }

    // 6. 解析 SQLite
    const SQL = await initSqlJs({
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/sql.js@1.10.0/dist/${file}`,
    });
    const db = new SQL.Database(colEntry.getData());
    log('SQLite 解析完成');

    // 读取 col 表：decks 和 models JSON
    const colResult = db.exec('SELECT decks, models FROM col LIMIT 1');
    if (!colResult.length || !colResult[0].values.length) {
      db.close();
      return corsJson({ error: 'col 表为空' }, { status: 400 }, req);
    }
    const decksJson = JSON.parse(colResult[0].values[0][0] as string) as Record<
      string,
      { id: number; name: string }
    >;
    const modelsJson = JSON.parse(colResult[0].values[0][1] as string) as Record<
      string,
      { id: number; name: string; flds: Array<{ name: string; ord: number }> }
    >;

    // 7. 查找 Vocab 模型（含 VocabKanji 字段）
    let vocabModelId: string | null = null;
    for (const [mid, model] of Object.entries(modelsJson)) {
      if (model.flds?.some((f) => f.name === 'VocabKanji')) {
        vocabModelId = mid;
        break;
      }
    }
    log(`Vocab 模型: ${vocabModelId ?? '未找到（将使用通用映射）'}`);

    // 构建字段名 → ord 索引映射
    let fieldIndexMap: Record<string, number> = {};
    if (vocabModelId && modelsJson[vocabModelId]) {
      fieldIndexMap = Object.fromEntries(
        modelsJson[vocabModelId].flds.map((f) => [f.name, f.ord]),
      );
    }

    // 8. 读取所有 notes
    const notesResult = db.exec('SELECT id, mid, flds FROM notes');
    const noteMap = new Map<string, { id: string; mid: string; flds: string[] }>();
    if (notesResult.length) {
      for (const row of notesResult[0].values) {
        const id = String(row[0]);
        noteMap.set(id, {
          id,
          mid: String(row[1]),
          flds: (row[2] as string).split(SEP),
        });
      }
    }
    log(`读取 notes: ${noteMap.size} 条`);

    // 9. 读取所有 cards，按 did 分组
    const cardsResult = db.exec('SELECT nid, did FROM cards');
    const cardsByDeck = new Map<string, Set<string>>();  // did → Set<nid>
    if (cardsResult.length) {
      for (const row of cardsResult[0].values) {
        const nid = String(row[0]);
        const did = String(row[1]);
        const set = cardsByDeck.get(did) ?? new Set<string>();
        set.add(nid);
        cardsByDeck.set(did, set);
      }
    }
    db.close();
    log(`读取 cards 并按 deck 分组: ${cardsByDeck.size} 个牌组`);

    // 10. 遍历 Anki decks，写入数据库
    const importResults: ImportedDeck[] = [];
    const deckEntries = Object.entries(decksJson);
    const isSingleDeck = deckEntries.filter(([did]) => (cardsByDeck.get(did)?.size ?? 0) > 0).length === 1;

    for (const [did, deckInfo] of deckEntries) {
      const ankiDeckName = deckInfo.name ?? `Anki Deck ${did}`;
      const noteIds = cardsByDeck.get(did);
      if (!noteIds || noteIds.size === 0) continue;  // 跳过空牌组

      // 单牌组且用户指定了名称时，使用用户名称
      const finalDeckName = deckName && isSingleDeck ? deckName : ankiDeckName;

      // 创建 deck
      const { data: deckRow, error: deckErr } = await serviceClient
        .from('decks')
        .insert({
          name: finalDeckName,
          description: `从 Anki .apkg 导入（原牌组：${ankiDeckName}）`,
          lang,
          card_type: cardType,
          visibility: 'private',
          creator_id: userId,
          metadata: {
            source: 'apkg',
            apkg_path: uploadPath,
            anki_deck_id: parseInt(did, 10),
            media_map: mediaMap,
          },
        })
        .select()
        .single();

      if (deckErr || !deckRow) {
        console.error(`[import-apkg] 创建 deck "${finalDeckName}" 失败:`, deckErr?.message);
        continue;
      }

      // 构建卡片行
      const cardRows: Array<{
        deck_id: string;
        front: string;
        back: string;
        metadata: Record<string, unknown>;
        tags: string[];
        creator_id: string;
      }> = [];

      for (const nid of noteIds) {
        const note = noteMap.get(nid);
        if (!note) continue;

        let front = '';
        let back = '';
        const metadata: Record<string, unknown> = {};

        if (vocabModelId && note.mid === vocabModelId) {
          // Vocab 模型：按字段名映射
          for (const [fieldName, targetKey] of Object.entries(FIELD_MAP)) {
            const idx = fieldIndexMap[fieldName];
            if (idx === undefined || idx >= note.flds.length) continue;
            const value = note.flds[idx];
            if (!value) continue;

            if (targetKey === 'front') {
              front = stripSoundTags(value);
            } else if (targetKey === 'back') {
              back = stripSoundTags(value);
            } else if (targetKey === 'audio' || targetKey === 'example_audio') {
              const filename = extractAudioFilename(value);
              if (filename) metadata[targetKey] = filename;
            } else {
              metadata[targetKey] = value;
            }
          }
        } else {
          // 其他模型：通用映射，前两个字段作 front/back
          front = stripSoundTags(note.flds[0] ?? '');
          back = stripSoundTags(note.flds[1] ?? '');
          for (let i = 2; i < note.flds.length; i++) {
            if (note.flds[i]) metadata[`field_${i}`] = note.flds[i];
          }
        }

        if (!front && !back) continue;

        cardRows.push({
          deck_id: deckRow.id,
          front: front || back,
          back: back || front,
          metadata,
          tags: [],
          creator_id: userId,
        });
      }

      // 批量插入 cards
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
