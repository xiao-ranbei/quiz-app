// ============================================================
// Edge Function: extract-audio
// 从已上传的 .apkg 中按需提取单个音频文件，缓存到 audio-cache 桶
//
// 流程：
//   1. 接收 { deckId, filename }
//   2. 验证用户登录，并确认该 deck 属于当前用户（或公开）
//   3. 从 deck.metadata 读取 apkg_path 和 media_map
//   4. 由 filename 反查 mediaKey（zip 中的索引名）
//   5. 检查 audio-cache/{userId}/{filename} 是否已存在 → 直接返回 URL
//   6. 否则下载原始 .apkg，解压取对应 entry，上传到 audio-cache
//   7. 返回公开 URL
//
// 设计理由：音频懒加载，不在导入时提取全部音频，
//           仅在用户首次播放时提取并缓存，后续直接走缓存。
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import AdmZip from 'npm:adm-zip@0.5.16';
import { corsJson, handleCorsPreflight } from '../shared/cors.ts';

interface RequestBody {
  deckId: string;     // 数据库中的 deck ID
  filename: string;   // 音频文件名，如 "eggrolls_JLPT10k_v3-0001.mp3"
}

interface DeckRow {
  id: string;
  creator_id: string | null;
  visibility: string;
  metadata: {
    apkg_path?: string;
    media_map?: Record<string, string>;
  };
}

/** 根据文件扩展名推断 MIME 类型 */
function inferMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'mp3': return 'audio/mpeg';
    case 'm4a': return 'audio/m4a';
    case 'aac': return 'audio/aac';
    case 'ogg': return 'audio/ogg';
    case 'wav': return 'audio/wav';
    default:    return 'application/octet-stream';
  }
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const body: RequestBody = await req.json();
    const { deckId, filename } = body;

    if (!deckId || !filename) {
      return corsJson({ error: '缺少 deckId 或 filename 参数' }, { status: 400 }, req);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return corsJson({ error: '服务配置错误' }, { status: 500 }, req);
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

    // 2. 查询 deck 元数据（用 service role 读取 metadata）
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: deckRow, error: deckErr } = await serviceClient
      .from('decks')
      .select('id, creator_id, visibility, metadata')
      .eq('id', deckId)
      .maybeSingle() as { data: DeckRow | null; error: unknown };

    if (deckErr || !deckRow) {
      return corsJson({ error: '牌组不存在' }, { status: 404 }, req);
    }

    // 权限校验：私有牌组仅本人可提取音频；公开牌组任何人可提取
    if (deckRow.visibility !== 'public' && deckRow.creator_id !== userId) {
      return corsJson({ error: '无权访问该牌组的音频' }, { status: 403 }, req);
    }

    const metadata = deckRow.metadata ?? {};
    const apkgPath = metadata.apkg_path;
    const mediaMap = metadata.media_map ?? {};

    if (!apkgPath) {
      return corsJson({ error: '该牌组未关联 apkg 文件' }, { status: 400 }, req);
    }

    // 3. 由 filename 反查 mediaKey
    const mediaKey = mediaMap[filename];
    if (mediaKey === undefined) {
      return corsJson({ error: `media_map 中未找到文件: ${filename}` }, { status: 404 }, req);
    }

    // 4. 检查 audio-cache 是否已缓存（按本人目录）
    //    缓存路径：audio-cache/{userId}/{filename}
    //    若原始牌组创建者非本人，使用 deck.creator_id 作为缓存目录（避免重复提取）
    const cacheOwnerId = deckRow.creator_id ?? userId;
    const cachePath = `${cacheOwnerId}/${filename}`;

    const { data: existingFile } = await serviceClient
      .storage
      .from('audio-cache')
      .createSignedUrl(cachePath, 60, { download: false });

    // createSignedUrl 不论文件是否存在都返回 URL，需要用 list 验证存在性
    const { data: existingList } = await serviceClient
      .storage
      .from('audio-cache')
      .list(cacheOwnerId, { search: filename, limit: 1 });

    const alreadyCached = (existingList?.length ?? 0) > 0;

    if (alreadyCached) {
      // 已缓存：直接返回公开 URL
      const { data: pub } = serviceClient
        .storage
        .from('audio-cache')
        .getPublicUrl(cachePath);
      console.log(`[extract-audio] 缓存命中: ${cachePath}`);
      return corsJson({ url: pub.publicUrl, cached: true }, { status: 200 }, req);
    }

    // 5. 未缓存：下载原始 .apkg
    //    apkg_path 形如 "apkg-uploads/{user_id}/{filename}.apkg"
    const apkgObjectPath = apkgPath.replace('apkg-uploads/', '');
    const { data: fileData, error: downloadErr } = await serviceClient
      .storage
      .from('apkg-uploads')
      .download(apkgObjectPath);

    if (downloadErr || !fileData) {
      return corsJson(
        { error: '下载原始 apkg 失败: ' + (downloadErr?.message ?? '未知错误') },
        { status: 500 },
        req,
      );
    }

    const apkgBuffer = new Uint8Array(await fileData.arrayBuffer());

    // 6. 解压提取对应 entry（entry 名为 mediaKey，如 "0"、"1"）
    const zip = new AdmZip(apkgBuffer);
    const entry = zip.getEntry(mediaKey);
    if (!entry) {
      return corsJson(
        { error: `apkg 中未找到媒体条目: ${mediaKey}` },
        { status: 404 },
        req,
      );
    }

    const audioBytes = entry.getData();

    // 7. 上传到 audio-cache（公开桶）
    const mimeType = inferMimeType(filename);
    const { error: uploadErr } = await serviceClient
      .storage
      .from('audio-cache')
      .upload(cachePath, audioBytes, {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: false,  // 不覆盖，避免重复上传
      });

    if (uploadErr) {
      // 若是已存在的错误（并发情况），尝试获取 URL
      if (!uploadErr.message.includes('already exists')) {
        return corsJson(
          { error: '上传音频到缓存失败: ' + uploadErr.message },
          { status: 500 },
          req,
        );
      }
    }

    // 8. 返回公开 URL
    const { data: pubUrl } = serviceClient
      .storage
      .from('audio-cache')
      .getPublicUrl(cachePath);

    console.log(`[extract-audio] 提取并缓存成功: ${cachePath}`);
    return corsJson({ url: pubUrl.publicUrl, cached: false }, { status: 200 }, req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[extract-audio] 失败:', message);
    return corsJson({ error: message }, { status: 500 }, req);
  }
});
