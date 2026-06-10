-- === 新增多选题支持 + 分类管理权限 ===
-- 执行方式：在 Supabase SQL Editor 中执行

-- 放宽 questions.type 的 type 检查约束（如果表已存在
do $$
begin
  -- 删除旧的检查约束（如果存在）
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'questions' and constraint_type = 'CHECK'
  ) then
    -- PostgreSQL 会自动创建名为 questions_type_check 这类名字，尝试删除
    begin
      alter table questions drop constraint if exists questions_type_check;
    exception when others then null;
    end;
  end if;
end $$;

-- 重新添加包含 multiple 的检查约束
alter table questions add constraint questions_type_check
  check (type in ('choice', 'multiple', 'fill'));

-- 放宽 user_history.mode 的检查约束（如有需要也一起修一下
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'user_history' and constraint_name = 'user_history_mode_check'
  ) then
    alter table user_history drop constraint user_history_mode_check;
  end if;
end $$;

alter table user_history add constraint user_history_mode_check
  check (mode in ('practice', 'exam'));

-- ===== 分类管理权限（管理员可增删）=====
drop policy if exists "admin users can insert categories" on categories;
create policy "admin users can insert categories" on categories for insert to authenticated
  with check (auth.jwt() ->> 'email' = 'xiao_ranbei@outlook.com');

drop policy if exists "admin users can delete categories" on categories;
create policy "admin users can delete categories" on categories for delete to authenticated
  using (auth.jwt() ->> 'email' = 'xiao_ranbei@outlook.com');
