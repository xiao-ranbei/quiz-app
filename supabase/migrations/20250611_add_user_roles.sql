-- === 增加用户角色系统 + 完善 questions/categories 的管理 RLS ===
-- 执行方式：在 Supabase SQL Editor 中执行
--
-- 功能：
--  1. 新增 roles 表（普通用户 / 管理员）
--  2. 新增 user_profiles 表，关联 auth.users 与 roles
--  3. 将 xiao_ranbei@outlook.com 设为初始管理员
--  4. 重新定义 questions / categories 的 INSERT/UPDATE/DELETE 策略（管理员可操作）

-- 角色表
create table if not exists public.roles (
  key text primary key,
  name text not null unique
);

insert into public.roles (key, name)
values
  ('user', '普通用户'),
  ('admin', '管理员')
on conflict (key) do nothing;

-- 用户档案表（关联 auth.users 与 role）
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role_key text not null default 'user' references public.roles(key),
  created_at timestamptz not null default now()
);

-- 自动同步 auth.users 到 user_profiles
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, role_key)
  values (
    new.id,
    new.email,
    case when lower(new.email) = 'xiao_ranbei@outlook.com' then 'admin' else 'user' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 把已存在的 admin 邮箱同步过来
insert into public.user_profiles (id, email, role_key)
select id, email, 'admin'
from auth.users
where lower(email) = 'xiao_ranbei@outlook.com'
on conflict (id) do update set role_key = 'admin';

-- 让已登录用户可以读取自己的档案
drop policy if exists "users can read own profile" on public.user_profiles;
create policy "users can read own profile" on public.user_profiles
  for select to authenticated
  using (auth.uid() = id);

drop policy if exists "admins can read all profiles" on public.user_profiles;
create policy "admins can read all profiles" on public.user_profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.id = auth.uid() and up.role_key = 'admin'
    )
  );

-- 帮助函数：判断当前登录用户是否为管理员
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and role_key = 'admin'
  ) or (auth.jwt() ->> 'email') = 'xiao_ranbei@outlook.com';
$$;

grant execute on function public.is_admin() to authenticated;

-- ============ categories 的 RLS 策略（统一使用管理员判定） ============
drop policy if exists "authenticated users can read categories" on categories;
create policy "authenticated users can read categories" on categories
  for select to authenticated using (true);

drop policy if exists "admin users can insert categories" on categories;
create policy "admin users can insert categories" on categories
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "admin users can update categories" on categories;
create policy "admin users can update categories" on categories
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admin users can delete categories" on categories;
create policy "admin users can delete categories" on categories
  for delete to authenticated
  using (public.is_admin());

-- ============ questions 的 RLS 策略 ============
drop policy if exists "authenticated users can read questions" on questions;
create policy "authenticated users can read questions" on questions
  for select to authenticated using (true);

drop policy if exists "authenticated users can insert questions" on questions;
create policy "authenticated users can insert questions" on questions
  for insert to authenticated
  with check (true);

drop policy if exists "admin users can update questions" on questions;
create policy "admin users can update questions" on questions
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admin users can delete questions" on questions;
create policy "admin users can delete questions" on questions
  for delete to authenticated
  using (public.is_admin());
