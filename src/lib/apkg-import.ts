// ============================================================
// Apkg 导入与音频懒加载工具
//
// 架构：
//   - 解析 .apkg（解压 + SQLite 读取）在前端浏览器中完成（jszip + sql.js）
//   - Edge Function 只负责接收解析后的 JSON 并写入数据库
//   - 原始 .apkg 上传到 Storage 供 extract-audio 按需提取音频
//
// 包含：
//   - importApkg: 解析 .apkg + 上传 + 调用 Edge Function 写入数据库
//   - getDeckMediaMap: 获取牌组的 media_map（filename → index）
//   - extractAudio: 懒加载提取单个音频，返回缓存 URL
// ============================================================

import JSZip from 'jszip';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { supabase } from './supabase';
import { useAuthStore } from '../store/authStore';
import { getDeck } from './memory/decks';

export interface ApkgImportResult {
  success: boolean;
  decks: Array<{ id: string; name: string; cardCount: number }>;
  totalCards: number;
  mediaCount: number;
  duration: number;
}

export type ImportStage = 'idle' | 'unpacking' | 'uploading' | 'parsing' | 'importing' | 'done' | 'error';

export interface ImportOptions {
  deckName?: string;
  lang?: 'ja' | 'en';
  cardType?: 'word' | 'grammar' | 'sentence';
}

// ---- 预设字段映射：Anki 字段名 → 目标 key ----

// 日语 Vocab 模型（大厂日语句典）
const JA_VOCAB_MAP: Record<string, string> = {
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

// 英语常见模型（Word/Phonetic/PoS/Definition/Example 系列）
const EN_VOCAB_MAP: Record<string, string> = {
  Word: 'front',
  Term: 'front',
  Phonetic: 'phonetic',
  IPA: 'phonetic',
  PoS: 'pos',
  PartOfSpeech: 'pos',
  'Part of Speech': 'pos',
  Definition: 'back',
  Meaning: 'back',
  Def: 'back',
  Example: 'example',
  Sentence: 'example',
  Translation: 'example_zh',
  ExampleZh: 'example_zh',
  Synonyms: 'synonyms',
  Audio: 'audio',
};

// 语义关键词规则：用于通用模型的字段名 → 目标 key 识别
const SEMANTIC_RULES: Array<{ match: RegExp; target: string }> = [
  // 发音
  { match: /(furigana|kana|reading|yomi|よみ)/i,            target: 'reading' },
  { match: /(romaji|roman|ローマ字)/i,                       target: 'romaji' },
  { match: /(phonetic|pronunciation|ipa|音标?)/i,           target: 'phonetic' },
  { match: /(pitch|accent|intonation|音调?|ピッチ)/i,       target: 'pitch' },
  // 词性
  { match: /^(pos|partofspeech|part of speech|词性|品詞)$/i, target: 'pos' },
  // 释义
  { match: /(meaning|definition|def|translation|释义|意味|翻訳|訳)/i, target: 'meaning' },
  // 例句
  { match: /^(example|sentence|例文)$/i,                     target: 'example' },
  { match: /(example_reading|sentence_reading)/i,            target: 'example_reading' },
  { match: /(example.*?zh|example.*?cn|中文.*?例|例文.*?訳)/i, target: 'example_zh' },
  // 音频
  { match: /^(audio|sound|mp3|voice|音声)$/i,                target: 'audio' },
  { match: /(example.?audio|sentence.?audio|例文.*?音声)/i,  target: 'example_audio' },
  // 其他
  { match: /(synonym|同義語|類義語)/i,                        target: 'synonyms' },
  { match: /(note|comment|remark|usage|メモ|備考|注記)/i,    target: 'notes' },
];

interface AnkiModel {
  id: number;
  name: string;
  flds: Array<{ name: string; ord: number }>;
}

interface ModelMapping {
  fieldMap: Record<string, string>;    // Anki 字段名 → target key
  fieldIndexMap: Record<string, number>; // Anki 字段名 → ord 索引
  genericMode: boolean;
}

/** 根据模型字段名自动选择映射策略 */
function resolveModelMapping(model: AnkiModel): ModelMapping {
  const fieldNames = model.flds.map((f) => f.name);
  const fieldIndexMap = Object.fromEntries(model.flds.map((f) => [f.name, f.ord]));

  // 检测：日语 Vocab 模型（优先）
  if (fieldNames.some((n) => n === 'VocabKanji')) {
    return { fieldMap: JA_VOCAB_MAP, fieldIndexMap, genericMode: false };
  }

  // 检测：英语 Vocab 模型（含 Word/Phonetic/PoS/Definition 中至少 2 个）
  const enKeys = ['Word', 'Phonetic', 'PoS', 'PartOfSpeech', 'Definition'];
  const enHits = enKeys.filter((k) => fieldNames.includes(k)).length;
  if (enHits >= 2) {
    return { fieldMap: EN_VOCAB_MAP, fieldIndexMap, genericMode: false };
  }

  // 通用模型：走语义关键词识别
  return { fieldMap: buildSemanticMap(fieldNames), fieldIndexMap, genericMode: true };
}

/** 通用映射：通过关键词语义识别字段名 → target key */
function buildSemanticMap(fieldNames: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  let frontSet = false;
  let backSet = false;

  for (let i = 0; i < fieldNames.length; i++) {
    const raw = fieldNames[i];

    // 前两字段默认 front/back（如果未被语义规则抢先匹配）
    if (!frontSet && i === 0) { result[raw] = 'front'; frontSet = true; continue; }
    if (!backSet && i === 1)  { result[raw] = 'back';  backSet  = true; continue; }

    // 语义规则匹配
    let matched = false;
    for (const rule of SEMANTIC_RULES) {
      if (rule.match.test(raw)) {
        result[raw] = rule.target;
        matched = true;
        break;
      }
    }

    // 兜底：保留清洗后的原字段名做 key
    if (!matched) {
      const cleanKey = raw
        .replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .toLowerCase();
      result[raw] = cleanKey || `field_${i}`;
    }
  }

  return result;
}

const ANKI_FIELD_SEP = '\x1f';  // Anki flds 字段分隔符

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

/**
 * 读取 apkg 内的 media 文件并反转为 { filename: mediaKey }
 */
async function readMediaMap(zip: JSZip): Promise<Record<string, string>> {
  const mediaFile = zip.file('media');
  if (!mediaFile) return {};
  try {
    const mediaText = await mediaFile.async('text');
    const mediaObj = JSON.parse(mediaText) as Record<string, string>;
    return Object.fromEntries(
      Object.entries(mediaObj).map(([idx, name]) => [name, idx]),
    );
  } catch (e) {
    console.warn('[apkg-import] media 文件解析失败:', e);
    return {};
  }
}

/**
 * 仅加载 apkg 的 zip 与 media_map（修复音频用，不做 SQLite 解析）
 */
export async function loadApkgMedia(
  file: File | Blob,
): Promise<{ zip: JSZip; mediaMap: Record<string, string> }> {
  const zip = await JSZip.loadAsync(file);
  const mediaMap = await readMediaMap(zip);
  return { zip, mediaMap };
}

/** sql.js 单例（避免重复加载 wasm） */
let sqlJsPromise: Promise<SqlJsStatic> | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({
      // 从 CDN 加载 wasm 文件
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/${file}`,
    });
  }
  return sqlJsPromise;
}

/** 前端解析后的单个牌组数据（发送给 Edge Function） */
interface ParsedDeck {
  ankiDeckId: number;
  ankiDeckName: string;
  cards: Array<{
    front: string;
    back: string;
    metadata: Record<string, unknown>;
  }>;
}

/**
 * 在浏览器中解析 .apkg 文件
 *
 * 1. 用 JSZip 解压 .apkg
 * 2. 读取 media（JSON）和 collection.anki21 / collection.anki2（SQLite）
 * 3. 用 sql.js 解析 SQLite：读取 col.decks / col.models / notes / cards
 * 4. 为每个模型自动选择映射策略（日语 Vocab / 英语 Vocab / 通用语义识别）
 * 5. 反转 media 索引：{ filename: mediaKey }
 */
async function parseApkg(
  file: File,
  onProgress?: (stage: ImportStage, message?: string) => void,
): Promise<{
  decks: ParsedDeck[];
  mediaMap: Record<string, string>;
  zip: JSZip;
}> {
  onProgress?.('unpacking', '正在解压 .apkg 文件...');

  // 1. 用 JSZip 解压
  const zip = await JSZip.loadAsync(file);

  // 2. 读取 media 文件（反转：{ filename: mediaKey }）
  const mediaMap = await readMediaMap(zip);

  // 3. 读取 SQLite 数据库文件
  const dbFile = zip.file('collection.anki21') ?? zip.file('collection.anki2');
  if (!dbFile) {
    throw new Error('apkg 中未找到 collection.anki21 或 collection.anki2');
  }

  onProgress?.('parsing', '正在解析 SQLite 数据库...');
  const dbBuffer = await dbFile.async('uint8array');

  // 4. 用 sql.js 解析 SQLite
  const SQL = await getSqlJs();
  const db = new SQL.Database(dbBuffer);

  try {
    // 读取 col 表：decks 和 models JSON
    const colResult = db.exec('SELECT decks, models FROM col LIMIT 1');
    if (!colResult.length || !colResult[0].values.length) {
      throw new Error('col 表为空');
    }

    const decksJson = JSON.parse(colResult[0].values[0][0] as string) as Record<
      string,
      { id: number; name: string }
    >;
    const modelsJson = JSON.parse(colResult[0].values[0][1] as string) as Record<
      string,
      { id: number; name: string; flds: Array<{ name: string; ord: number }> }
    >;

    // 5. 为每个模型构建映射（支持一个 apkg 内多种模型混合）
    const modelMaps = new Map<string, ModelMapping>();
    for (const [mid, model] of Object.entries(modelsJson)) {
      if (model.flds?.length) {
        modelMaps.set(mid, resolveModelMapping(model as AnkiModel));
      }
    }

    // 6. 读取所有 notes
    const notesResult = db.exec('SELECT id, mid, flds FROM notes');
    const noteMap = new Map<string, { id: string; mid: string; flds: string[] }>();
    if (notesResult.length) {
      for (const row of notesResult[0].values) {
        const id = String(row[0]);
        noteMap.set(id, {
          id,
          mid: String(row[1]),
          flds: (row[2] as string).split(ANKI_FIELD_SEP),
        });
      }
    }

    // 7. 读取所有 cards，按 did 分组
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

    // 8. 遍历 Anki decks，构建解析后的数据
    const parsedDecks: ParsedDeck[] = [];
    for (const [did, deckInfo] of Object.entries(decksJson)) {
      const ankiDeckName = deckInfo.name ?? `Anki Deck ${did}`;
      const noteIds = cardsByDeck.get(did);
      if (!noteIds || noteIds.size === 0) continue;  // 跳过空牌组

      const cards: ParsedDeck['cards'] = [];

      for (const nid of noteIds) {
        const note = noteMap.get(nid);
        if (!note) continue;

        const mapping = modelMaps.get(note.mid);
        if (!mapping) continue;

        let front = '';
        let back = '';
        const metadata: Record<string, unknown> = {};

        // 按映射处理每个字段
        for (const [ankiField, targetKey] of Object.entries(mapping.fieldMap)) {
          const idx = mapping.fieldIndexMap[ankiField];
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
            metadata[targetKey] = stripSoundTags(value);
          }
        }

        // 通用模式下：补充未被 fieldMap 覆盖的 Anki 字段
        if (mapping.genericMode) {
          const mappedFields = new Set(Object.keys(mapping.fieldMap));
          for (let i = 0; i < note.flds.length; i++) {
            const fieldName = mapping.fieldIndexMap
              ? Object.entries(mapping.fieldIndexMap).find(([, ord]) => ord === i)?.[0]
              : null;
            if (fieldName && mappedFields.has(fieldName)) continue;
            if (note.flds[i] && !metadata[`field_${i}`]) {
              // 已被语义映射覆盖的跳过
              const targetKey = mapping.fieldMap[fieldName ?? ''];
              if (targetKey) continue;
              metadata[`field_${i}`] = stripSoundTags(note.flds[i]);
            }
          }
        }

        if (!front && !back) continue;

        cards.push({
          front: front || back,
          back: back || front,
          metadata,
        });
      }

      if (cards.length > 0) {
        parsedDecks.push({
          ankiDeckId: parseInt(did, 10),
          ankiDeckName,
          cards,
        });
      }
    }

    return { decks: parsedDecks, mediaMap, zip };
  } finally {
    db.close();
  }
}

/**
 * 导入 .apkg 文件
 *
 * 流程：
 *   1. 前端用 jszip + sql.js 解析 .apkg（解压 + SQLite 读取 + 字段映射）
 *   2. 上传原始 .apkg 到 apkg-uploads/{userId}/{timestamp}-{filename}
 *   3. 调用 import-apkg Edge Function，发送解析后的 JSON 数据写入数据库
 *
 * @param file 用户选择的 .apkg 文件
 * @param options 可选：deckName（覆盖牌组名）、lang、cardType
 * @param onProgress 进度回调
 */
export async function importApkg(
  file: File,
  options?: ImportOptions,
  onProgress?: (stage: ImportStage, message?: string) => void,
): Promise<ApkgImportResult> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) throw new Error('未登录，无法导入');

  // 1. 前端解析 .apkg
  const { decks: parsedDecks, mediaMap, zip } = await parseApkg(file, onProgress);

  if (parsedDecks.length === 0) {
    throw new Error('未找到任何可导入的牌组');
  }

  // 2. 提取实际用到的音频并上传到 audio-cache（播放不再依赖原始 apkg）
  const usedAudio = collectUsedAudio(parsedDecks);
  if (usedAudio.length > 0) {
    onProgress?.('uploading', `正在上传音频（0/${usedAudio.length}）...`);
    const audioResult = await extractAndUploadAudio(
      zip,
      mediaMap,
      usedAudio,
      userId,
      (done, total, current) => {
        onProgress?.(
          'uploading',
          `正在上传音频 ${done}/${total}${current ? `：${current}` : ''}`,
        );
      },
    );
    if (audioResult.failed.length > 0) {
      throw new Error(
        `音频上传失败（${audioResult.failed.length} 个）：` +
          audioResult.failed.slice(0, 3).join('、') +
          (audioResult.failed.length > 3 ? ' 等' : ''),
      );
    }
  }

  // 3. 上传原始 .apkg 到 Storage（供 extract-audio 按需提取音频）
  onProgress?.('uploading', `正在上传原始文件 ${file.name}...`);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const objectPath = `${userId}/${Date.now()}-${safeName}`;
  const apkgPath = `apkg-uploads/${objectPath}`;

  const MAX_UPLOAD_SIZE = 100 * 1024 * 1024; // 100MB（bucket 限制）
  if (file.size > MAX_UPLOAD_SIZE) {
    // 大文件：上传占位文件（Edge Function 只需要解析后的 JSON，不需要原始 .apkg）
    const placeholder = new Blob(
      [`placeholder for ${safeName} (${(file.size / 1024 / 1024).toFixed(1)} MB)`],
      { type: 'text/plain' },
    );
    const { error: phErr } = await supabase.storage
      .from('apkg-uploads')
      .upload(objectPath, placeholder, {
        contentType: 'text/plain',
        cacheControl: '3600',
        upsert: false,
      });
    if (phErr) throw new Error('上传占位文件失败: ' + phErr.message);
  } else {
    const { error: uploadErr } = await supabase.storage
      .from('apkg-uploads')
      .upload(objectPath, file, {
        contentType: 'application/octet-stream',
        cacheControl: '3600',
        upsert: false,
      });
    if (uploadErr) throw new Error('上传文件失败: ' + uploadErr.message);
  }

  // 4. 调用 Edge Function 写入数据库
  onProgress?.('importing', `正在写入 ${parsedDecks.length} 个牌组到数据库...`);
  const { data, error } = await supabase.functions.invoke('import-apkg', {
    body: {
      decks: parsedDecks,
      mediaMap,
      apkgPath,
      deckName: options?.deckName,
      lang: options?.lang ?? 'ja',
      cardType: options?.cardType ?? 'word',
    },
  });

  if (error) {
    throw new Error('Edge Function 调用失败: ' + error.message);
  }
  if (!data?.success) {
    throw new Error(data?.error ?? '导入失败');
  }

  onProgress?.('done', '导入完成');
  return data as ApkgImportResult;
}

// ============================================================
// 音频懒加载
// ============================================================

// 模块级缓存：deckId:filename → URL，避免同一会话内重复请求
const audioUrlCache = new Map<string, string>();

// 支持上传到 audio-cache 的音频扩展名 → MIME（与 bucket allowed_mime_types 一致）
const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/m4a',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
};

function inferAudioMime(filename: string): string | null {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  return AUDIO_MIME[ext] ?? null;
}

/**
 * 收集卡片 metadata 中实际用到的音频文件名（去重，保持顺序）
 */
export function collectUsedAudio(
  decks: Array<{ cards: Array<{ metadata: Record<string, unknown> }> }>,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const deck of decks) {
    for (const card of deck.cards) {
      for (const key of ['audio', 'example_audio']) {
        const v = card.metadata[key];
        if (typeof v === 'string' && v && !seen.has(v)) {
          seen.add(v);
          result.push(v);
        }
      }
    }
  }
  return result;
}

export interface AudioUploadResult {
  uploaded: number;
  skipped: number;
  failed: string[];
}

/**
 * 按 media_map 从 zip 中提取音频并上传到 audio-cache/{userId}/{filename}
 * - 已存在（"already exists"）跳过
 * - 其余失败记入 failed，由调用方决定中止或提示
 */
export async function extractAndUploadAudio(
  zip: JSZip,
  mediaMap: Record<string, string>,
  filenames: string[],
  userId: string,
  onProgress?: (done: number, total: number, current: string) => void,
): Promise<AudioUploadResult> {
  const total = filenames.length;
  let uploaded = 0;
  let skipped = 0;
  const failed: string[] = [];

  for (let i = 0; i < total; i++) {
    const filename = filenames[i];
    onProgress?.(i, total, filename);

    const mediaKey = mediaMap[filename];
    if (mediaKey === undefined) {
      failed.push(filename);
      continue;
    }
    const entry = zip.file(mediaKey);
    if (!entry) {
      failed.push(filename);
      continue;
    }
    const mime = inferAudioMime(filename);
    if (!mime) {
      failed.push(filename);
      continue;
    }

    const bytes = await entry.async('uint8array');
    const { error } = await supabase.storage
      .from('audio-cache')
      .upload(`${userId}/${filename}`, bytes, {
        contentType: mime,
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      if (error.message.includes('already exists')) {
        skipped += 1;
      } else {
        failed.push(filename);
      }
    } else {
      uploaded += 1;
    }
  }

  onProgress?.(total, total, '');
  return { uploaded, skipped, failed };
}

/**
 * 分页读取牌组所有卡片 metadata 中的音频文件名（修复音频用）
 */
async function fetchDeckUsedAudio(deckId: string): Promise<string[]> {
  const filenames = new Set<string>();
  let from = 0;
  const pageSize = 1000;

  for (;;) {
    const { data, error } = await supabase
      .from('cards')
      .select('metadata')
      .eq('deck_id', deckId)
      .range(from, from + pageSize - 1);
    if (error) throw error;

    const rows = (data ?? []) as Array<{
      metadata: Record<string, unknown> | null;
    }>;
    for (const row of rows) {
      for (const key of ['audio', 'example_audio']) {
        const v = row.metadata?.[key];
        if (typeof v === 'string' && v) filenames.add(v);
      }
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return Array.from(filenames);
}

/**
 * 为已导入的牌组修复音频缓存（选择同一个 apkg 文件，不新建牌组）
 * 音频会补齐到 audio-cache/{userId}/{filename}，数据库与牌组结构不变。
 */
export async function repairDeckAudio(
  deckId: string,
  file: File,
  onProgress?: (done: number, total: number, current: string) => void,
): Promise<AudioUploadResult> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) throw new Error('未登录，无法修复音频');

  const { zip, mediaMap } = await loadApkgMedia(file);
  const usedAudio = await fetchDeckUsedAudio(deckId);
  return extractAndUploadAudio(zip, mediaMap, usedAudio, userId, onProgress);
}

/**
 * 获取牌组的 media_map
 * @returns { filename: mediaKey } 映射
 */
export async function getDeckMediaMap(
  deckId: string,
): Promise<Record<string, string>> {
  const { data, error } = await supabase.rpc('get_deck_media_map', {
    p_deck_id: deckId,
  });
  if (error) throw error;
  return (data ?? {}) as Record<string, string>;
}

/**
 * 懒加载提取单个音频
 *
 * 调用 extract-audio Edge Function，由后端检查缓存或从原始 apkg 提取。
 * 返回的 URL 是 audio-cache 公开桶的 URL，可直接用于 <audio> 播放。
 *
 * @param deckId 牌组 ID
 * @param filename 音频文件名，如 "eggrolls_JLPT10k_v3-0001.mp3"
 * @returns 公开可访问的音频 URL
 */
export async function extractAudio(
  deckId: string,
  filename: string,
): Promise<string> {
  const cacheKey = `${deckId}:${filename}`;
  const cached = audioUrlCache.get(cacheKey);
  if (cached) return cached;

  // 音频在导入时已上传到 audio-cache/{creator_id}/{filename}
  const deck = await getDeck(deckId);
  const ownerId = deck?.creator_id ?? useAuthStore.getState().user?.id;
  if (!ownerId) throw new Error('无法确定音频缓存目录');

  const { data } = supabase.storage
    .from('audio-cache')
    .getPublicUrl(`${ownerId}/${filename}`);
  const url = data.publicUrl;
  audioUrlCache.set(cacheKey, url);
  return url;
}

/**
 * 清除音频 URL 缓存（可选，用于登出或牌组删除时）
 */
export function clearAudioCache(): void {
  audioUrlCache.clear();
}
