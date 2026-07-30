// ============================================================
// Apkg 导入与音频懒加载工具
//
// 包含：
//   - importApkg: 上传 .apkg 到 Storage 并调用 Edge Function 解析导入
//   - getDeckMediaMap: 获取牌组的 media_map（filename → index）
//   - extractAudio: 懒加载提取单个音频，返回缓存 URL
// ============================================================

import { supabase } from './supabase';
import { useAuthStore } from '../store/authStore';

export interface ApkgImportResult {
  success: boolean;
  decks: Array<{ id: string; name: string; cardCount: number }>;
  totalCards: number;
  mediaCount: number;
  duration: number;
}

export type ImportStage = 'idle' | 'uploading' | 'parsing' | 'done' | 'error';

export interface ImportOptions {
  deckName?: string;
  lang?: 'ja' | 'en';
  cardType?: 'word' | 'grammar' | 'sentence';
}

/**
 * 导入 .apkg 文件
 *
 * 流程：
 *   1. 上传 .apkg 到 apkg-uploads/{userId}/{timestamp}-{filename}
 *   2. 调用 import-apkg Edge Function，由后端解压、解析 SQLite、写入 decks + cards
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

  // 1. 上传 .apkg 到 Storage
  onProgress?.('uploading', `正在上传 ${file.name}...`);
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

  // 2. 调用 Edge Function 解析并导入
  onProgress?.('parsing', '正在解析 SQLite 并导入卡片...');
  const { data, error } = await supabase.functions.invoke('import-apkg', {
    body: {
      uploadPath: `apkg-uploads/${objectPath}`,
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
