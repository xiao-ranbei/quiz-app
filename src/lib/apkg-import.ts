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

// 字段映射：Anki 字段名 → 目标字段
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

/** sql.js 单例（避免重复加载 wasm） */
let sqlJsPromise: Promise<SqlJsStatic> | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({
      // 从 CDN 加载 wasm 文件
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/sql.js@1.10.0/dist/${file}`,
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
 * 4. 查找 Vocab 模型，按字段名映射
 * 5. 反转 media 索引：{ filename: mediaKey }
 */
async function parseApkg(
  file: File,
  onProgress?: (stage: ImportStage, message?: string) => void,
): Promise<{
  decks: ParsedDeck[];
  mediaMap: Record<string, string>;
}> {
  onProgress?.('unpacking', '正在解压 .apkg 文件...');

  // 1. 用 JSZip 解压
  const zip = await JSZip.loadAsync(file);

  // 2. 读取 media 文件
  const mediaFile = zip.file('media');
  let mediaMap: Record<string, string> = {};
  if (mediaFile) {
    try {
      const mediaText = await mediaFile.async('text');
      const mediaObj = JSON.parse(mediaText) as Record<string, string>;
      // 反转：{ filename: mediaKey }
      mediaMap = Object.fromEntries(
        Object.entries(mediaObj).map(([idx, name]) => [name, idx]),
      );
    } catch (e) {
      console.warn('[apkg-import] media 文件解析失败:', e);
    }
  }

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

    // 5. 查找 Vocab 模型（含 VocabKanji 字段）
    let vocabModelId: string | null = null;
    for (const [mid, model] of Object.entries(modelsJson)) {
      if (model.flds?.some((f) => f.name === 'VocabKanji')) {
        vocabModelId = mid;
        break;
      }
    }

    // 构建字段名 → ord 索引映射
    let fieldIndexMap: Record<string, number> = {};
    if (vocabModelId && modelsJson[vocabModelId]) {
      fieldIndexMap = Object.fromEntries(
        modelsJson[vocabModelId].flds.map((f) => [f.name, f.ord]),
      );
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

    return { decks: parsedDecks, mediaMap };
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
  const { decks: parsedDecks, mediaMap } = await parseApkg(file, onProgress);

  if (parsedDecks.length === 0) {
    throw new Error('未找到任何可导入的牌组');
  }

  // 2. 上传原始 .apkg 到 Storage（供 extract-audio 按需提取音频）
  onProgress?.('uploading', `正在上传原始文件 ${file.name}...`);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const objectPath = `${userId}/${Date.now()}-${safeName}`;

  const { error: uploadErr } = await supabase.storage
    .from('apkg-uploads')
    .upload(objectPath, file, {
      contentType: 'application/octet-stream',
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadErr) {
    throw new Error('上传文件失败: ' + uploadErr.message);
  }

  const apkgPath = `apkg-uploads/${objectPath}`;

  // 3. 调用 Edge Function 写入数据库
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

  const { data, error } = await supabase.functions.invoke('extract-audio', {
    body: { deckId, filename },
  });

  if (error) {
    throw new Error('提取音频失败: ' + error.message);
  }
  if (!data?.url) {
    throw new Error('未返回音频 URL');
  }

  const url = data.url as string;
  audioUrlCache.set(cacheKey, url);
  return url;
}

/**
 * 清除音频 URL 缓存（可选，用于登出或牌组删除时）
 */
export function clearAudioCache(): void {
  audioUrlCache.clear();
}
