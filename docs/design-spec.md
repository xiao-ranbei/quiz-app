# 刷题 Web 应用 — 设计规范 (Design Spec)

> 版本：v1.0  
> 技术栈：React + Vite + TypeScript + Tailwind CSS + Supabase (PostgreSQL + Auth + Edge Functions)  
> 部署：GitHub Pages（静态前端） + Supabase（后端）

---

## 1. 项目概述

### 1.1 目标
一个在线刷题学习平台，支持选择题/填空题练习、模拟考试、错题本、AI 智能解析与辅助出题。

### 1.2 核心功能
- 题库浏览与筛选（按分类 + 难度）
- 练习模式（一题一答，即时反馈）
- 考试模式（限时作答，完成后出成绩）
- 错题本（自动收集错题，支持标记"已掌握"）
- 手动提交新题 + JSON 批量导入
- AI 做题后解析（调用自定义 API）
- AI 辅助出题
- 个人统计（做题历史、正确率）

### 1.3 用户权限模型
| 角色 | 可执行操作 |
|---|---|
| 游客 | 浏览题库、练习、考试 |
| 登录用户 | 上述 + 提交新题、错题本、做题历史保存、配置 AI API |

---

## 2. 技术架构总览

```
┌───────────────────────────── GitHub Pages ─────────────────────────────┐
│                          React + Vite (dist/)                          │
│                                                                        │
│  Navbar ─ Home ─ Questions ─ Practice ─ Exam ─ WrongBook ─ Submit ─ Me │
│                                                                        │
│  Zustand 状态管理  ──  React Router 路由  ──  Tailwind 样式             │
└────────────────────────┬──────────────────┬────────────────────────────┘
                         │                  │
                    HTTPS 请求          HTTPS 请求
                         │                  │
         ┌───────────────▼────────┐   ┌────▼──────────────────────────┐
         │    Supabase Platform    │   │   Supabase Edge Functions     │
         │                          │   │    (Deno runtime)              │
         │  · PostgreSQL (RLS)      │   │   · ai-resolve  (AI 解析)     │
         │  · Auth (Email/Password) │   │   · ai-generate (AI 出题)     │
         │  · Realtime (可选)        │   │   · ai-test-connection       │
         └──────────────────────────┘   └──────────────┬─────────────────┘
                                                        │ HTTPS
                                                        ▼
                                         ┌────────────────────────────┐
                                         │  用户自定义 AI API         │
                                         │  (OpenAI 兼容 chat格式)   │
                                         └────────────────────────────┘
```

---

## 3. 数据库设计

### 3.1 表结构

#### `categories` — 分类表
```sql
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz default now()
);
```

#### `questions` — 题目表
```sql
create table questions (
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

create index on questions(category_id);
create index on questions(difficulty);
create index on questions(type);
```

#### `profiles` — 用户资料表
```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '匿名用户',
  created_at timestamptz default now()
);

-- 注册时自动创建 profile
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

#### `user_history` — 做题历史表
```sql
create table user_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  user_answer text not null,
  is_correct boolean not null,
  mode text not null check (mode in ('practice', 'exam')),
  session_id uuid,
  created_at timestamptz default now()
);

create index on user_history(user_id, created_at desc);
create index on user_history(question_id);
```

#### `wrong_book` — 错题本表
```sql
create table wrong_book (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  wrong_count int not null default 1,
  last_wrong_at timestamptz default now(),
  mastered boolean default false,
  created_at timestamptz default now(),
  unique (user_id, question_id)
);

create index on wrong_book(user_id, mastered);
```

#### `exam_sessions` — 考试会话表
```sql
create table exam_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  title text not null,
  total_questions int not null,
  time_limit_sec int not null,
  started_at timestamptz default now(),
  submitted_at timestamptz,
  score int
);

create index on exam_sessions(user_id, started_at desc);
```

#### `user_ai_configs` — 用户 AI 配置表
```sql
create table user_ai_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  api_base_url text not null,
  api_key text not null,
  model text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 3.2 RLS 行级安全策略

```sql
-- 全局启用 RLS
alter table categories enable row level security;
alter table questions enable row level security;
alter table profiles enable row level security;
alter table user_history enable row level security;
alter table wrong_book enable row level security;
alter table exam_sessions enable row level security;
alter table user_ai_configs enable row level security;

-- categories: 所有人可读
create policy "categories are viewable by everyone"
  on categories for select using (true);

-- questions: 所有人可读；登录用户可插入
create policy "questions are viewable by everyone"
  on questions for select using (true);
create policy "authenticated users can insert questions"
  on questions for insert to authenticated with check (true);

-- profiles: 本人可读
create policy "user can view own profile"
  on profiles for select using (auth.uid() = id);
create policy "user can update own profile"
  on profiles for update to authenticated using (auth.uid() = id);

-- user_history: 本人可读可写
create policy "user can manage own history"
  on user_history for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- wrong_book: 本人可读可写
create policy "user can manage own wrong book"
  on wrong_book for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- exam_sessions: 本人可读可写
create policy "user can manage own exam sessions"
  on exam_sessions for all
  using (user_id = auth.uid() or user_id is null)
  with check (user_id = auth.uid() or user_id is null);

-- user_ai_configs: 仅本人可读写
create policy "user can manage own ai config"
  on user_ai_configs for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

---

## 4. Edge Functions 设计

### 4.1 目录结构
```
supabase/
  functions/
    ai-resolve/index.ts        -- 做题后 AI 解析
    ai-generate/index.ts       -- AI 辅助出题
    ai-test-connection/index.ts -- 测试 API 配置
    shared/ai-client.ts        -- 通用 AI API 调用
    shared/types.ts            -- 类型定义
```

### 4.2 统一 AI API 调用封装（shared/ai-client.ts）

所有 Edge Functions 共用一套调用逻辑，兼容 OpenAI chat completions 格式：

```
POST {api_base_url}/chat/completions
Headers:
  Authorization: Bearer {api_key}
  Content-Type: application/json
Body:
  { "model": "...", "messages": [...], "temperature": 0.7 }
```

### 4.3 ai-resolve — AI 解析流程

1. 接收前端传入：question_id, question, type, options, answer, explanation, user_answer
2. 查数据库：若 questions.ai_resolution 已有值 → 直接返回缓存
3. 查数据库：取当前用户的 user_ai_configs（api_base_url, api_key, model）
4. 构造系统提示词 + 用户提示词
5. 调用 AI API
6. 成功 → 将解析文本写入 questions.ai_resolution（缓存）→ 返回给前端
7. 失败 → 返回错误信息

### 4.4 ai-generate — AI 出题流程

1. 接收前端传入：topic, count, difficulty, type
2. 读取用户 AI 配置
3. 构造 prompt，要求 AI 输出严格 JSON 格式：
   ```
   { questions: [{question, options?, answer, explanation?}] }
   ```
4. 调用 AI API → 解析 JSON → 返回题目数组给前端
5. 前端展示给用户确认/编辑 → 用户手动点击入库

### 4.5 ai-test-connection — 配置测试

1. 接收 api_base_url, api_key, model
2. 发送一次简单消息（"Say: OK"）
3. 成功返回 `{ok: true}`，失败返回 `{ok: false, error: string}`

---

## 5. 前端架构

### 5.1 技术栈

| 依赖 | 版本 | 用途 |
|---|---|---|
| React | 18.x | 视图框架 |
| TypeScript | 5.x | 类型系统 |
| Vite | 5.x | 构建工具 |
| Tailwind CSS | 3.x | 样式框架 |
| @supabase/supabase-js | 2.x | Supabase 客户端 |
| react-router-dom | 6.x | 路由 |
| zustand | 4.x | 状态管理 |
| react-hook-form | 7.x | 表单 |
| lucide-react | latest | 图标 |
| dayjs | latest | 日期格式化 |

### 5.2 目录结构

```
quiz-app/
├── public/
├── src/
│   ├── components/
│   │   ├── Navbar.tsx
│   │   ├── QuestionCard.tsx
│   │   ├── CategoryFilter.tsx
│   │   ├── ProgressBar.tsx
│   │   ├── Loading.tsx
│   │   └── EmptyState.tsx
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── Questions.tsx
│   │   ├── Practice.tsx
│   │   ├── Exam.tsx
│   │   ├── WrongBook.tsx
│   │   ├── SubmitQuestion.tsx
│   │   ├── Profile.tsx
│   │   └── Login.tsx
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── questions.ts
│   │   ├── ai.ts
│   │   └── utils.ts
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   └── useQuestions.ts
│   ├── store/
│   │   ├── authStore.ts
│   │   ├── practiceStore.ts
│   │   └── examStore.ts
│   ├── types/index.ts
│   ├── styles/globals.css
│   ├── App.tsx
│   └── main.tsx
├── supabase/
│   ├── migrations/
│   │   └── 20240101_create_schema.sql
│   └── functions/...
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
└── .github/workflows/deploy.yml
```

### 5.3 路由表

| 路径 | 页面 | 保护策略 |
|---|---|---|
| `/` | Home — 首页 | 公开 |
| `/questions` | Questions — 题库浏览 | 公开 |
| `/practice` | Practice — 练习模式 | 公开 |
| `/exam` | Exam — 考试模式 | 公开 |
| `/wrong` | WrongBook — 错题本 | 需登录 |
| `/submit` | SubmitQuestion — 提交新题 | 需登录 |
| `/me` | Profile — 个人中心 | 需登录 |
| `/login` | Login — 登录/注册 | 公开（已登录跳转 /me） |

### 5.4 核心类型定义

```typescript
type Difficulty = 1 | 2 | 3; // 简单/中等/困难
type QuestionType = 'choice' | 'fill';
type Mode = 'practice' | 'exam';

interface Category {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

interface Question {
  id: string;
  category_id?: string;
  difficulty: Difficulty;
  type: QuestionType;
  question: string;
  options?: Record<string, string>;
  answer: string;
  explanation?: string;
  reference_url?: string;
  ai_resolution?: string;
  creator_id?: string;
  created_at: string;
}

interface AIConfig {
  api_base_url: string;
  api_key: string;
  model: string;
}
```

### 5.5 状态管理

**authStore** — 管理登录状态、用户信息
**practiceStore** — 练习模式的题目队列、当前题、是否已揭示答案
**examStore** — 考试会话的题目列表、作答记录、剩余时间

---

## 6. 部署流程

### 6.1 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 创建 .env
cp .env.example .env
# 填写 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY

# 3. 启动 Supabase CLI（首次需要：supabase login + supabase link）
supabase db push           # 应用数据库迁移
supabase functions deploy ai-resolve
supabase functions deploy ai-generate
supabase functions deploy ai-test-connection

# 4. 启动开发服务器
npm run dev
```

### 6.2 GitHub Pages 部署

通过 GitHub Actions 自动部署，配置文件位于 `.github/workflows/deploy.yml`：

- 触发：push 到 main 分支
- 步骤：checkout → setup node → npm ci → npm run build → deploy to gh-pages
- Pages Source 设置为 GitHub Actions

需要的 GitHub Secrets：
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### 6.3 Supabase 控制台手动配置

1. 创建新项目（获取 URL 和 anon key）
2. SQL Editor → 执行迁移脚本建表
3. Authentication → Providers → Email → Enable
4. Table Editor → 可手动插入预置题目和分类数据（可选）

---

## 7. 安全要点

1. **前端仅使用 anon key**，绝不暴露 service_role key
2. **RLS 策略严格**，history/wrong_book/ai_configs 仅本人可读写
3. **AI API Key 不回显**，前端保存后只显示 "已配置"，不展示 Key 内容
4. **题目内容前端校验**，避免注入；answer 字段仅用于比对，不用于任何代码执行
5. **用户输入题目内容** 需进行基本长度/格式校验

---

## 8. 后续可扩展方向

- 题目审核流程（当前直接入库，可改为提交 → 审核 → 公开）
- 支持更多题型（判断题、多选题、代码题）
- 排行榜、成就徽章
- 题库分类多级嵌套（目前一级分类）
- Realtime：多人同时练习的实时统计（当前架构可平滑接入）
- PWA 支持，离线可用已缓存的题目
