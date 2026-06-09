-- === 刷题应用数据库迁移 ===
-- 首次部署：在 Supabase SQL Editor 中完整执行一次

-- --- categories: 题目分类 ---
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz default now()
);

-- --- questions: 题目表 ---
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id) on delete set null,
  difficulty smallint not null check (difficulty in (1, 2, 3)),
  type text not null check (type in ('choice', 'fill')),
  question text not null,
  options jsonb,
  answer text not null,
  explanation text,
  reference_url text,
  ai_resolution text,
  creator_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists questions_category_id_idx on questions(category_id);
create index if not exists questions_difficulty_idx on questions(difficulty);
create index if not exists questions_type_idx on questions(type);

-- --- profiles: 用户资料表（与 auth.users 同步）---
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '匿名用户',
  created_at timestamptz default now()
);

-- 注册时自动创建 profile
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1)))
  on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --- user_history: 做题历史 ---
create table if not exists user_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  user_answer text not null,
  is_correct boolean not null,
  mode text not null check (mode in ('practice', 'exam')),
  session_id uuid,
  created_at timestamptz default now()
);

create index if not exists user_history_user_id_created_at_idx on user_history(user_id, created_at desc);
create index if not exists user_history_question_id_idx on user_history(question_id);

-- --- wrong_book: 错题本 ---
create table if not exists wrong_book (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  wrong_count int not null default 1,
  last_wrong_at timestamptz default now(),
  mastered boolean default false,
  created_at timestamptz default now(),
  unique (user_id, question_id)
);

create index if not exists wrong_book_user_id_mastered_idx on wrong_book(user_id, mastered);

-- --- exam_sessions: 考试会话 ---
create table if not exists exam_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  title text not null,
  total_questions int not null,
  time_limit_sec int not null,
  started_at timestamptz default now(),
  submitted_at timestamptz,
  score int
);

create index if not exists exam_sessions_user_id_started_at_idx on exam_sessions(user_id, started_at desc);

-- --- user_ai_configs: 用户 AI 配置 ---
create table if not exists user_ai_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  api_base_url text not null,
  api_key text not null,
  model text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ===== RLS 行级安全 =====
alter table categories enable row level security;
alter table questions enable row level security;
alter table profiles enable row level security;
alter table user_history enable row level security;
alter table wrong_book enable row level security;
alter table exam_sessions enable row level security;
alter table user_ai_configs enable row level security;

-- categories: 所有人可读
drop policy if exists "categories are viewable by everyone" on categories;
create policy "categories are viewable by everyone" on categories for select using (true);

-- questions: 所有人可读；登录用户可插入；管理员邮箱可删除
drop policy if exists "questions are viewable by everyone" on questions;
create policy "questions are viewable by everyone" on questions for select using (true);
drop policy if exists "authenticated users can insert questions" on questions;
create policy "authenticated users can insert questions" on questions for insert to authenticated with check (true);
drop policy if exists "admin users can delete questions" on questions;
create policy "admin users can delete questions" on questions for delete to authenticated
  using (auth.jwt() ->> 'email' = 'xiao_ranbei@outlook.com');

-- profiles: 本人可读写
drop policy if exists "user can view own profile" on profiles;
create policy "user can view own profile" on profiles for select using (auth.uid() = id);
drop policy if exists "user can update own profile" on profiles;
create policy "user can update own profile" on profiles for update to authenticated using (auth.uid() = id);

-- user_history: 本人可读写
drop policy if exists "user can manage own history" on user_history;
create policy "user can manage own history" on user_history for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- wrong_book: 本人可读写
drop policy if exists "user can manage own wrong book" on wrong_book;
create policy "user can manage own wrong book" on wrong_book for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- exam_sessions: 本人可读写
drop policy if exists "user can manage own exam sessions" on exam_sessions;
create policy "user can manage own exam sessions" on exam_sessions for all
  using (user_id = auth.uid() or user_id is null)
  with check (user_id = auth.uid() or user_id is null);

-- user_ai_configs: 仅本人可读写
drop policy if exists "user can manage own ai config" on user_ai_configs;
create policy "user can manage own ai config" on user_ai_configs for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ===== 辅助函数：错题本 upsert =====
create or replace function public.upsert_wrong_book(p_user_id uuid, p_question_id uuid)
returns void as $$
begin
  insert into public.wrong_book (user_id, question_id, wrong_count, last_wrong_at, mastered)
  values (p_user_id, p_question_id, 1, now(), false)
  on conflict (user_id, question_id) do update
  set
    wrong_count = public.wrong_book.wrong_count + 1,
    last_wrong_at = now(),
    mastered = false;
end;
$$ language plpgsql security definer;

-- ===== 预置数据（可选示例数据，可删除）=====
insert into categories (id, name, description)
values
  ('00000000-0000-0000-0000-000000000001', '基础概念', '基本知识与概念题')
on conflict do nothing;

insert into categories (id, name, description)
values
  ('00000000-0000-0000-0000-000000000002', '代码补全', 'GitHub Copilot 相关')
on conflict do nothing;

insert into questions (category_id, difficulty, type, question, options, answer, explanation)
values (
  '00000000-0000-0000-0000-000000000002',
  1,
  'choice',
  'GitHub Copilot 主要提供什么功能？',
  '{"A":"代码补全和生成","B":"代码部署","C":"数据库管理","D":"UI 设计"}',
  'A',
  'Copilot 是一款基于 AI 的编程助手，核心能力是根据上下文提示代码补全与生成。'
)
on conflict do nothing;

insert into questions (category_id, difficulty, type, question, options, answer, explanation)
values (
  '00000000-0000-0000-0000-000000000001',
  1,
  'fill',
  'Supabase 的底层数据库是 ___（填一个数据库产品名）。',
  null,
  'PostgreSQL',
  'Supabase 在 PostgreSQL 之上构建了完整的 BaaS 能力。'
)
on conflict do nothing;
