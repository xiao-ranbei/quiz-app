// ============================================================
// apkg 导入脚本（独立运行，不依赖浏览器）
//
// 用法: node scripts/import-apkg.mjs
// ============================================================

import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// ---- 配置 ----
const SUPABASE_URL = 'https://soiswftjljwcnuzkmpoj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvaXN3ZnRqbGp3Y251emttcG9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMDQyMDAsImV4cCI6MjA5NjU4MDIwMH0.9pM3pe6epiXXW8VjysEdT6_96lgUlp7GHvN8M4uFTRk';
const EMAIL = 'xiao_ranbei@outlook.com';
const PASSWORD = '123456';
const APKG_PATH = join(projectRoot, 'docs', 'eggrolls-JLPT10k-v3.apkg');
const LANG = 'ja';
const CARD_TYPE = 'word';

// ---- 字段映射 ----
const JA_VOCAB_MAP = {
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

const ANKI_FIELD_SEP = '\x1f';

function extractAudioFilename(text) {
  if (!text) return null;
  const match = text.match(/\[sound:([^\]]+)\]/);
  return match ? match[1] : null;
}

function stripSoundTags(text) {
  return text.replace(/\[sound:[^\]]+\]/g, '').trim();
}

// ---- 主流程 ----
async function main() {
  console.log('=== apkg 导入脚本 ===\n');

  // 1. 检查文件
  if (!existsSync(APKG_PATH)) {
    console.error(`✗ 文件不存在: ${APKG_PATH}`);
    process.exit(1);
  }
  const fileBuffer = readFileSync(APKG_PATH);
  const fileSizeMB = (fileBuffer.length / 1024 / 1024).toFixed(2);
  console.log(`✓ 文件: ${APKG_PATH}`);
  console.log(`  大小: ${fileSizeMB} MB\n`);

  // 2. 登录
  console.log('--- 登录 Supabase ---');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (authError || !authData.session) {
    console.error('✗ 登录失败:', authError?.message);
    process.exit(1);
  }
  const userId = authData.user.id;
  const accessToken = authData.session.access_token;
  console.log(`✓ 登录成功: ${EMAIL}`);
  console.log(`  User ID: ${userId}\n`);

  // 3. 解析 apkg
  console.log('--- 解析 .apkg 文件 ---');
  const { decks: parsedDecks, mediaMap } = await parseApkg(fileBuffer);
  const totalCards = parsedDecks.reduce((sum, d) => sum + d.cards.length, 0);
  console.log(`✓ 解析完成: ${parsedDecks.length} 个牌组, ${totalCards} 张卡片, ${Object.keys(mediaMap).length} 个媒体文件\n`);

  for (const d of parsedDecks) {
    console.log(`  牌组: ${d.ankiDeckName} (${d.cards.length} 张)`);
  }
  console.log('');

  // 4. 上传原始 apkg 到 Storage（大文件跳过，仅记录路径）
  console.log('--- 上传 .apkg 到 Storage ---');
  const safeName = 'eggrolls-JLPT10k-v3.apkg'.replace(/[^a-zA-Z0-9._-]/g, '_');
  const objectPath = `${userId}/${Date.now()}-${safeName}`;
  const fullStoragePath = `apkg-uploads/${objectPath}`;

  if (fileBuffer.length > 100 * 1024 * 1024) {
    // 超过 100MB：上传占位文件（Edge Function 不需要原始文件，只需要解析后的数据）
    console.log(`  文件 ${fileSizeMB} MB 超过 100MB 限制，跳过原始文件上传`);
    const placeholder = Buffer.from(`placeholder for ${safeName} (${fileSizeMB} MB)`, 'utf-8');
    const { error: phErr } = await supabase.storage
      .from('apkg-uploads')
      .upload(objectPath, placeholder, {
        contentType: 'text/plain',
        cacheControl: '3600',
        upsert: false,
      });
    if (phErr) {
      console.error('✗ 占位文件上传失败:', phErr.message);
      process.exit(1);
    }
    console.log(`✓ 占位文件已上传: ${fullStoragePath}\n`);
  } else {
    const { error: uploadErr } = await supabase.storage
      .from('apkg-uploads')
      .upload(objectPath, fileBuffer, {
        contentType: 'application/octet-stream',
        cacheControl: '3600',
        upsert: false,
      });
    if (uploadErr) {
      console.error('✗ 上传失败:', uploadErr.message);
      process.exit(1);
    }
    console.log(`✓ 上传成功: ${fullStoragePath}\n`);
  }

  // 5. 调用 Edge Function
  console.log('--- 调用 Edge Function 写入数据库 ---');
  const { data: fnData, error: fnError } = await supabase.functions.invoke('import-apkg', {
    body: {
      decks: parsedDecks,
      mediaMap,
      apkgPath: fullStoragePath,
      lang: LANG,
      cardType: CARD_TYPE,
    },
  });

  if (fnError) {
    console.error('✗ Edge Function 调用失败:', fnError.message);
    process.exit(1);
  }

  if (fnData?.error) {
    console.error('✗ Edge Function 返回错误:', fnData.error);
    process.exit(1);
  }

  console.log(`✓ 导入成功！`);
  console.log(`  牌组数: ${fnData?.decks?.length ?? 0}`);
  console.log(`  总卡片: ${fnData?.totalCards ?? 0}`);
  console.log(`  媒体文件: ${fnData?.mediaCount ?? 0}`);
  console.log(`  耗时: ${fnData?.duration ?? '?'}ms`);

  if (fnData?.decks) {
    for (const d of fnData.decks) {
      console.log(`  → ${d.name}: ${d.cardCount} 张`);
    }
  }

  console.log('\n=== 完成 ===');
}

// ---- apkg 解析 ----
async function parseApkg(fileBuffer) {
  // 1. 解压
  const zip = await JSZip.loadAsync(fileBuffer);

  // 2. 读取 media
  let mediaMap = {};
  const mediaFile = zip.file('media');
  if (mediaFile) {
    try {
      const mediaText = await mediaFile.async('text');
      const mediaObj = JSON.parse(mediaText);
      mediaMap = Object.fromEntries(
        Object.entries(mediaObj).map(([idx, name]) => [name, idx]),
      );
    } catch (e) {
      console.warn('media 文件解析失败:', e);
    }
  }

  // 3. 读取 SQLite
  const dbFile = zip.file('collection.anki21') ?? zip.file('collection.anki2');
  if (!dbFile) {
    throw new Error('apkg 中未找到 collection.anki21 或 collection.anki2');
  }
  const dbBuffer = await dbFile.async('uint8array');

  // 4. sql.js 解析
  const SQL = await initSqlJs();
  const db = new SQL.Database(dbBuffer);

  try {
    // 读取 col 表
    const colResult = db.exec('SELECT decks, models FROM col LIMIT 1');
    if (!colResult.length || !colResult[0].values.length) {
      throw new Error('col 表为空');
    }

    const decksJson = JSON.parse(colResult[0].values[0][0]);
    const modelsJson = JSON.parse(colResult[0].values[0][1]);

    // 查找 Vocab 模型
    let vocabModelId = null;
    for (const [mid, model] of Object.entries(modelsJson)) {
      if (model.flds?.some((f) => f.name === 'VocabKanji')) {
        vocabModelId = mid;
        break;
      }
    }

    let fieldIndexMap = {};
    if (vocabModelId && modelsJson[vocabModelId]) {
      fieldIndexMap = Object.fromEntries(
        modelsJson[vocabModelId].flds.map((f) => [f.name, f.ord]),
      );
    }

    // 读取 notes
    const notesResult = db.exec('SELECT id, mid, flds FROM notes');
    const noteMap = new Map();
    if (notesResult.length) {
      for (const row of notesResult[0].values) {
        const id = String(row[0]);
        noteMap.set(id, {
          id,
          mid: String(row[1]),
          flds: row[2].split(ANKI_FIELD_SEP),
        });
      }
    }

    // 读取 cards
    const cardsResult = db.exec('SELECT nid, did FROM cards');
    const cardsByDeck = new Map();
    if (cardsResult.length) {
      for (const row of cardsResult[0].values) {
        const nid = String(row[0]);
        const did = String(row[1]);
        const set = cardsByDeck.get(did) ?? new Set();
        set.add(nid);
        cardsByDeck.set(did, set);
      }
    }

    // 构建 ParsedDeck
    const parsedDecks = [];
    for (const [did, deckInfo] of Object.entries(decksJson)) {
      const ankiDeckName = deckInfo.name ?? `Anki Deck ${did}`;
      const noteIds = cardsByDeck.get(did);
      if (!noteIds || noteIds.size === 0) continue;

      const cards = [];
      for (const nid of noteIds) {
        const note = noteMap.get(nid);
        if (!note) continue;

        let front = '';
        let back = '';
        const metadata = {};

        if (vocabModelId && note.mid === vocabModelId) {
          for (const [fieldName, targetKey] of Object.entries(JA_VOCAB_MAP)) {
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

main().catch((err) => {
  console.error('\n✗ 致命错误:', err.message);
  console.error(err.stack);
  process.exit(1);
});
