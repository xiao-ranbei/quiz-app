-- === 修复 questions 表缺少 UPDATE RLS 策略的 Bug ===
-- 执行方式：在 Supabase SQL Editor 中执行
--
-- 问题：之前只定义了 SELECT / INSERT / DELETE 策略，
--      登录用户编辑题目分类时会因 RLS 拒绝而保存失败（表现为"保存失败"）。
-- 修复：添加 UPDATE 策略，允许所有已登录用户编辑 questions。

-- questions: 已登录用户可更新
drop policy if exists "authenticated users can update questions" on questions;
create policy "authenticated users can update questions" on questions
  for update to authenticated
  using (true)
  with check (true);
