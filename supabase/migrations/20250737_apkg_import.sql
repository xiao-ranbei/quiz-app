-- ============================================================
-- Apkg 导入功能：表结构扩展 + Storage bucket + 辅助 RPC
--
-- 内容：
--   0. decks 表新增 metadata 字段（存 apkg 的 media_map 等导入元信息）
--   1. 创建两个 Storage bucket：
--      - apkg-uploads：保存原始 .apkg 文件（供 extract-audio 按需提取）
--      - audio-cache：保存从 .apkg 提取出的单个音频文件（懒加载缓存）
--   2. RPC：get_deck_media_map(p_deck_id)
--      返回某 deck.metadata.media_map，供前端音频懒加载使用
--
-- 约定：
--   - Storage bucket 使用 public 桶（音频公开可读，apkg 私有）
--   - media_map 结构：{ "音频文件名": 数字key, ... }
--     例：{ "eggrolls_JLPT10k_v3-0001.mp3": 0, ... }
-- ============================================================


-- ============================================================
-- 0. decks 表新增 metadata 字段
-- ============================================================
-- 存放 apkg 导入产生的元信息：
--   - media_map: { "filename.mp3": "0", ... }  供 extract-audio 反查 zip 中的索引
--   - apkg_path: "apkg-uploads/{user_id}/{filename}.apkg"  原始文件路径
--   - anki_deck_id: number  对应 Anki 内部 deck id
--   - source: "apkg"  来源标记
alter table public.decks
  add column if not exists metadata jsonb default '{}';

comment on column public.decks.metadata is
  '扩展元信息：apkg 导入时存放 media_map、apkg_path、anki_deck_id、source 等';


-- ============================================================
-- 1. Storage buckets
-- ============================================================

-- apkg-uploads：私有桶（仅本人可读，Edge Function 用 service role 访问）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'apkg-uploads',
  'apkg-uploads',
  false,
  100 * 1024 * 1024,  -- 100 MB
  null                 -- apkg 是 zip，无标准 MIME，不限制
)
on conflict (id) do nothing;

-- audio-cache：公开桶（音频 URL 直接可播放）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio-cache',
  'audio-cache',
  true,
  20 * 1024 * 1024,   -- 20 MB
  array['audio/mpeg', 'audio/mp3', 'audio/m4a', 'audio/aac', 'audio/ogg', 'audio/wav']
)
on conflict (id) do nothing;


-- ============================================================
-- 2. Storage RLS 策略
-- ============================================================

-- ---------- apkg-uploads（私有）----------
-- 仅登录用户可上传到自己的目录：apkg/{user_id}/{filename}
drop policy if exists "apkg-uploads insert by owner" on storage.objects;
create policy "apkg-uploads insert by owner" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'apkg-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 仅本人可读取自己的原始 apkg（前端通常不需要，但便于调试）
drop policy if exists "apkg-uploads select by owner" on storage.objects;
create policy "apkg-uploads select by owner" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'apkg-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 仅本人可删除自己的 apkg 文件
drop policy if exists "apkg-uploads delete by owner" on storage.objects;
create policy "apkg-uploads delete by owner" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'apkg-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------- audio-cache（公开读，登录用户写）----------
-- 公开读取（无需登录即可播放已缓存的音频）
drop policy if exists "audio-cache public select" on storage.objects;
create policy "audio-cache public select" on storage.objects
  for select to public
  using (bucket_id = 'audio-cache');

-- 登录用户可上传到自己的目录：audio/{user_id}/{filename}
drop policy if exists "audio-cache insert by owner" on storage.objects;
create policy "audio-cache insert by owner" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'audio-cache'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 仅本人可删除自己上传的缓存音频
drop policy if exists "audio-cache delete by owner" on storage.objects;
create policy "audio-cache delete by owner" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'audio-cache'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ============================================================
-- 3. RPC：get_deck_media_map(p_deck_id)
-- 返回某 deck.metadata->'media_map'，供前端懒加载音频时查找数字 key
--
-- 返回结构：jsonb，如 { "eggrolls_JLPT10k_v3-0001.mp3": "0", ... }
-- 若 deck 不存在或无 media_map，返回空 jsonb {}。
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_deck_media_map(p_deck_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT metadata->'media_map' FROM public.decks WHERE id = p_deck_id),
    '{}'::jsonb
  );
$$;

-- 授予已认证用户调用权限
GRANT EXECUTE ON FUNCTION public.get_deck_media_map(p_deck_id uuid) TO authenticated;
