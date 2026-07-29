# Quiz App — Code Wiki

> 本文档为「刷题平台」项目仓库的结构化代码百科，覆盖项目整体架构、主要模块职责、关键类与函数说明、依赖关系及项目运行方式。
>
> - 仓库根目录：`quiz-app/`
> - 版本：`0.1.0`
> - 技术栈：React 18 + TypeScript 5 + Vite 5 + Tailwind CSS 3 + Supabase (PostgreSQL + Auth + Edge Functions) + Zustand
> - 部署：GitHub Pages（前端静态资源）+ Supabase（数据库、鉴权、Edge Functions）

---

## 目录

1. [项目概述](#1-项目概述)
2. [整体架构](#2-整体架构)
3. [目录结构](#3-目录结构)
4. [技术栈与依赖](#4-技术栈与依赖)
5. [前端模块职责](#5-前端模块职责)
6. [关键类与函数说明](#6-关键类与函数说明)
7. [Supabase 后端](#7-supabase-后端)
8. [数据库设计与 RLS](#8-数据库设计与-rls)
9. [依赖关系图](#9-依赖关系图)
10. [项目运行方式](#10-项目运行方式)
11. [部署流程](#11-部署流程)
12. [安全要点与设计约束](#12-安全要点与设计约束)
13. [可扩展方向](#13-可扩展方向)

---

## 1. 项目概述

### 1.1 项目定位

一个在线刷题学习平台，支持单选题 / 多选题 / 填空题三种题型的练习与考试，内置错题本、AI 智能解析与 AI 辅助出题能力。前端为静态 SPA，部署在 GitHub Pages；后端基于 Supabase（PostgreSQL + Auth + Edge Functions）。

### 1.2 核心功能

| 模块 | 能力说明 |
|---|---|
| 题库浏览 | 按分类、难度、题型、关键字筛选题目，管理员可编辑/批量删除 |
| 练习模式 | 一题一答、即时反馈、AI 解析、刷新自动恢复进度 |
| 考试模式 | 限时作答、自动交卷、成绩统计与逐题解析 |
| 错题本 | 答错自动收录、支持「已掌握」标记 |
| 题目贡献 | 单题提交、JSON 批量导入、AI 辅助出题 |
| 用户中心 | 答题统计、考试记录、AI API 配置与连接测试 |
| 鉴权 | 邮箱+密码注册/登录（无需邮箱验证），管理员角色控制 |

### 1.3 用户角色权限

| 角色 | 可执行操作 |
|---|---|
| 游客 | 浏览题库、练习、考试 |
| 登录用户 | 上述 + 提交新题、错题本、做题历史保存、配置 AI API |
| 管理员 | 上述 + 增删分类、编辑/删除题目、批量管理 |

管理员通过邮箱白名单 `xiao_ranbei@outlook.com` 或 `user_profiles.role_key = 'admin'` 判定。

---

## 2. 整体架构

```
┌──────────────────────────── GitHub Pages ──────────────────────────────┐
│                       React + Vite (dist/)                              │
│                                                                         │
│   Navbar ─ Home ─ Questions ─ Practice ─ Exam ─ WrongBook ─ Submit ─ Me│
│                                                                         │
│   Zustand 状态管理 ── React Router 路由 ── Tailwind 样式                │
└───────────────────────────┬───────────────────┬─────────────────────────┘
                            │                   │
                       HTTPS 请求          HTTPS 请求
                            │                   │
        ┌───────────────────▼─────────┐   ┌────▼──────────────────────────┐
        │     Supabase Platform        │   │   Supabase Edge Functions     │
        │                              │   │    (Deno runtime)             │
        │   · PostgreSQL (RLS)         │   │   · ai-resolve  (AI 解析)    │
        │   · Auth (Email/Password)    │   │   · ai-generate (AI 出题)    │
        │   · Realtime（可选）          │   │   · ai-test-connection       │
        └──────────────────────────────┘   └───────────────┬──────────────┘
                                                          │ HTTPS
                                                          ▼
                                          ┌───────────────────────────────┐
                                          │   用户自定义 AI API           │
                                          │  (OpenAI / Anthropic 兼容)   │
                                          └───────────────────────────────┘
```

**架构特点：**

- 前后端解耦：前端纯静态产物，可托管于任意静态 CDN（默认 GitHub Pages）
- 数据层全权交由 Supabase PostgreSQL，通过 RLS（行级安全）实现权限隔离
- AI 能力通过 Edge Functions 中转，避免在前端暴露用户的 API Key
- 状态管理使用 Zustand（轻量、无 Provider），分模块拆分 store

---

## 3. 目录结构

```
quiz-app/
├── .github/
│   └── workflows/
│       └── deploy.yml                     # GitHub Actions CI/CD
├── docs/
│   └── design-spec.md                     # 设计规范文档
├── public/
│   └── favicon.svg
├── src/
│   ├── components/                        # 通用 UI 组件
│   │   ├── CategoryFilter.tsx             # 筛选器（分类/难度/题型/关键字）
│   │   ├── EmptyState.tsx                 # 空状态占位
│   │   ├── Loading.tsx                    # 加载中占位
│   │   ├── MarkdownText.tsx               # 轻量 Markdown 渲染（无第三方依赖）
│   │   ├── Navbar.tsx                     # 顶部导航栏
│   │   └── QuestionCard.tsx               # 题目卡片（练习/考试/复习三态）
│   ├── lib/                               # 数据访问与工具
│   │   ├── ai.ts                          # AI 相关前端 API 封装
│   │   ├── questions.ts                   # 题目/分类/历史/错题本数据访问层
│   │   ├── supabase.ts                    # Supabase 客户端单例
│   │   └── utils.ts                       # 通用工具函数
│   ├── pages/                             # 路由页面
│   │   ├── Exam.tsx                       # 模拟考试
│   │   ├── Home.tsx                       # 首页 + 分类管理
│   │   ├── Login.tsx                      # 登录/注册
│   │   ├── Practice.tsx                   # 练习模式
│   │   ├── Profile.tsx                    # 个人中心
│   │   ├── Questions.tsx                  # 题库浏览
│   │   ├── SubmitQuestion.tsx             # 题目贡献（单题/批量/AI）
│   │   └── WrongBook.tsx                  # 错题本
│   ├── store/                             # Zustand 状态管理
│   │   ├── authStore.ts                   # 鉴权状态
│   │   ├── examStore.ts                   # 考试会话状态
│   │   └── practiceStore.ts               # 练习会话状态
│   ├── styles/
│   │   └── globals.css                    # 全局样式 + 主题变量
│   ├── types/
│   │   └── index.ts                       # 全局类型定义
│   ├── App.tsx                            # 应用根组件 + 路由表
│   ├── main.tsx                           # 应用入口
│   └── vite-env.d.ts                      # Vite 环境变量类型
├── supabase/
│   ├── functions/                         # Supabase Edge Functions (Deno)
│   │   ├── ai-generate/index.ts           # AI 出题
│   │   ├── ai-resolve/index.ts            # AI 解析
│   │   ├── ai-test-connection/index.ts    # AI 连接测试
│   │   └── shared/
│   │       ├── ai-client.ts               # 通用 AI 调用封装（OpenAI/Anthropic）
│   │       └── cors.ts                    # CORS 工具
│   ├── migrations/                        # SQL 迁移脚本
│   │   ├── 20240101_create_schema.sql     # 初始建表
│   │   ├── 20250102_add_multiple_choice.sql # 多选题支持
│   │   ├── 20250611_add_user_roles.sql    # 用户角色系统
│   │   ├── 20250612_allow_questions_update.sql # 修复 UPDATE RLS
│   │   └── 20250613_seed_example_questions.sql  # 示例题库
│   ├── .gitignore
│   └── config.toml                        # Supabase 本地配置
├── .env.example                           # 环境变量示例
├── .gitignore
├── deploy-all.ps1                         # 一键部署脚本（PowerShell）
├── deploy-functions.ps1                   # Edge Functions 部署脚本
├── index.html                             # HTML 入口
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
└── vite.config.js / vite.config.d.ts      # 构建产物 / 类型声明
```

---

## 4. 技术栈与依赖

### 4.1 运行时依赖（dependencies）

| 依赖 | 版本 | 用途 |
|---|---|---|
| `react` / `react-dom` | ^18.3.1 | 视图框架 |
| `react-router-dom` | ^6.26.2 | 路由（使用 `HashRouter`） |
| `zustand` | ^4.5.5 | 全局状态管理 |
| `@supabase/supabase-js` | ^2.45.4 | Supabase 客户端（DB + Auth + Functions） |
| `react-hook-form` | ^7.53.0 | 表单管理（已在依赖中保留） |
| `lucide-react` | ^0.441.0 | 图标库 |
| `dayjs` | ^1.11.13 | 日期处理 |

### 4.2 开发依赖（devDependencies）

| 依赖 | 版本 | 用途 |
|---|---|---|
| `typescript` | ^5.6.2 | 类型系统 |
| `vite` | ^5.4.6 | 构建工具 |
| `@vitejs/plugin-react` | ^4.3.1 | React 插件 |
| `tailwindcss` / `postcss` / `autoprefixer` | ^3.4.12 / ^8.4.47 / ^10.4.20 | CSS 框架与处理 |
| `@types/react` / `@types/react-dom` | ^18.3.5 / ^18.3.0 | React 类型声明 |

### 4.3 后端依赖

- **Supabase Edge Functions 运行时**：Deno（`deno_version = 2`）
- **Supabase JS SDK（在 Edge Functions 中）**：`jsr:@supabase/supabase-js@2`
- 无需 `npm install`，由 Deno 运行时直接从 jsr.io 拉取

### 4.4 npm 脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动 Vite 开发服务器（默认端口 5173） |
| `npm run build` | `tsc -b && vite build` 类型检查 + 构建到 `dist/` |
| `npm run preview` | 预览构建产物 |
| `npm run typecheck` | 仅做 TypeScript 类型检查（`tsc --noEmit`） |

---

## 5. 前端模块职责

### 5.1 应用入口

#### [`src/main.tsx`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/main.tsx)

ReactDOM 渲染入口，使用 `React.StrictMode` 包裹根组件，引入全局样式 `globals.css`。

#### [`src/App.tsx`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/App.tsx)

- 使用 `HashRouter`（适配 GitHub Pages 静态托管，无需服务端 rewrite）
- 在 `useEffect` 中调用 `initAuth()` 初始化鉴权监听
- 渲染 `Navbar` 与所有路由
- 兜底路由 `*` 渲染 Home

**路由表：**

| 路径 | 页面组件 | 是否需登录 |
|---|---|---|
| `/` | `Home` | 公开 |
| `/questions` | `Questions` | 公开 |
| `/practice` | `Practice` | 公开（保存历史需登录） |
| `/exam` | `Exam` | 公开（保存记录需登录） |
| `/wrong` | `WrongBook` | 需登录 |
| `/submit` | `SubmitQuestion` | 需登录 |
| `/me` | `Profile` | 需登录 |
| `/login` | `Login` | 公开（已登录自动跳 `/`） |

### 5.2 页面模块（`src/pages`）

#### [`Home.tsx`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/pages/Home.tsx)

- 首页 hero 区与统计卡片（题目总数、分类数、AI 提示）
- 「快速练习」网格展示非空分类入口
- 管理员可见「分类管理」面板：新增/删除分类（带空分类校验）

#### [`Questions.tsx`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/pages/Questions.tsx)

- 题库列表 + 筛选 + 关键字搜索
- 内嵌 `QuestionEditModal`：管理员可编辑题目（分类/难度/题型/题干/选项/答案/解析）
- 管理员可单选/多选删除（带二次确认）
- 保存后自动重新拉取列表，确保与服务端一致

#### [`Practice.tsx`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/pages/Practice.tsx)

- 筛选 + 题量配置 → 开始练习
- **进度持久化**：将筛选条件、答题队列、用户答案、AI 解析结果写入 `sessionStorage`，刷新后自动恢复
- 答题后调用 `savePracticeRecord` 写入历史；答错时通过 RPC `upsert_wrong_book` 写入错题本
- 「问 AI 解析」：调用 `resolveQuestionAI`，成功后把解析写回 `questions.explanation`

#### [`Exam.tsx`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/pages/Exam.tsx)

- 准备阶段：配置题量与时长 → 拉题 → 启动考试
- 作答阶段：倒计时（< 60s 红色告警）、题号导航、上一题/下一题/提交试卷
- 时间到自动交卷
- 提交后调用 `saveExamSession`，写入 `exam_sessions` 与 `user_history`，错题同步进入错题本
- 成绩页：正确率、用时、逐题解析

#### [`WrongBook.tsx`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/pages/WrongBook.tsx)

- 列出当前用户错题，关联题目信息
- 支持「只看未掌握」筛选
- 「标记掌握/取消掌握」切换

#### [`SubmitQuestion.tsx`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/pages/SubmitQuestion.tsx)

三个 Tab：

1. **单题提交**：表单填写 → `insertQuestion`
2. **批量导入**：JSON 数组 → 校验（`validateBatchItem`）→ 自动按 `category_name` 创建分类 → `insertQuestionsBulk`
3. **AI 出题**：提示词 → `generateQuestions` → 结果可一键导入到批量 Tab

管理员可见内嵌的分类管理面板。

#### [`Profile.tsx`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/pages/Profile.tsx)

- 统计卡片：累计答题、正确率、错题数、考试次数
- AI API 配置表单（`api_base_url` / `api_key` / `model`）+ 连接测试按钮
- 最近考试记录列表（最多 20 条）

#### [`Login.tsx`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/pages/Login.tsx)

- 登录/注册切换
- 调用 `authStore.signIn` / `signUp`，错误通过 `authStore.error` 展示
- 登录成功后自动跳转首页

### 5.3 通用组件（`src/components`）

#### [`Navbar.tsx`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/components/Navbar.tsx)

- 顶部导航，包含 7 个 `navItems`
- 深色/浅色主题切换（基于 `document.documentElement.classList`，写入 `localStorage['theme']`）
- 已登录显示用户名与「退出」，未登录显示「登录」
- 移动端汉堡菜单

#### [`QuestionCard.tsx`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/components/QuestionCard.tsx)

题目展示与作答的核心组件，支持三种模式：

- `mode='practice'`：单选直接提交、多选需点「提交答案」、填空回车提交；展示「查看答案」与「问 AI 解析」按钮
- `mode='exam'`：多选实时保存为草稿、不立即揭示答案
- `mode='review'`：仅展示题目与正确答案/解析（考试结束后用）

通过 `isRevealed` 区分是否揭示答案，揭示后正确选项高亮绿色、错误用户选项高亮红色。

#### [`CategoryFilter.tsx`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/components/CategoryFilter.tsx)

筛选器组件，可通过 `showType` / `showKeyword` 控制是否显示题型与关键字输入。

#### [`MarkdownText.tsx`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/components/MarkdownText.tsx)

无第三方依赖的轻量 Markdown 渲染器，支持：

- 行内：`` `code` ``、`**bold**`、`*italic*`、`[link](url)`
- 块级：标题、无序/有序列表、引用、代码块、分隔线、段落
- 输出经过 `escapeHtml` 转义，避免 XSS
- 通过 `dangerouslySetInnerHTML` 注入

#### [`Loading.tsx`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/components/Loading.tsx) / [`EmptyState.tsx`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/components/EmptyState.tsx)

简单的加载与空状态占位组件。

### 5.4 状态管理（`src/store`）

所有 store 基于 Zustand，无 persisted 中间件，状态保存在内存中（持久化由各页面自行处理）。

#### [`authStore.ts`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/store/authStore.ts)

```ts
interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  signIn: (email, password) => Promise<void>;
  signUp: (email, password) => Promise<void>;
  setAuth: (session, user) => void;
  signOut: () => Promise<void>;
}
```

- `initAuth()`：在 `App.tsx` 启动时调用，先 `getSession()` 读取已存在会话，再 `onAuthStateChange()` 监听后续变化

#### [`practiceStore.ts`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/store/practiceStore.ts)

```ts
interface PracticeState {
  queue: Question[];
  currentIndex: number;
  showAnswer: boolean;
  start / next / prev / setIndex / reveal / reset
}
```

仅负责练习会话的游标与「是否揭示答案」状态，不保存用户答案（用户答案由 `Practice.tsx` 本地 state 管理，并写入 `sessionStorage`）。

#### [`examStore.ts`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/store/examStore.ts)

```ts
interface ExamState {
  title: string;
  questions: Question[];
  currentIndex: number;
  userAnswers: Record<string, string>;
  timeLimitSec: number;
  startedAt: number;
  submitted: boolean;
  start / setAnswer / goTo / submit / reset
}
```

承载整个考试会话的题目列表与作答记录，但**不持久化**（刷新会丢失，故考试模式下应避免刷新）。

---

## 6. 关键类与函数说明

### 6.1 类型定义（[`src/types/index.ts`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/types/index.ts)）

| 类型 | 说明 |
|---|---|
| `Difficulty` | `1 \| 2 \| 3`，分别对应简单/中等/困难 |
| `QuestionType` | `'choice' \| 'multiple' \| 'fill'` |
| `Mode` | `'practice' \| 'exam'` |
| `Category` | 分类（id / name / description / created_at） |
| `Question` | 题目（含 options/answer/explanation/reference_url/ai_resolution 等） |
| `Profile` | 用户资料 |
| `UserHistory` | 做题历史记录 |
| `WrongBookItem` | 错题本项（含 wrong_count / mastered） |
| `ExamSession` | 考试会话 |
| `AIConfig` | 用户 AI 配置（api_base_url / api_key / model） |
| `DIFFICULTY_LABEL` | 难度枚举到中文标签的映射 |
| `TYPE_LABEL` | 题型枚举到中文标签的映射 |

### 6.2 数据访问层（[`src/lib/questions.ts`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/lib/questions.ts)）

| 函数 | 说明 |
|---|---|
| `getCategories()` | 获取全部分类（按名称升序） |
| `getQuestions(params)` | 多条件筛选题目；`random=true` 时前端打乱；`limit` 截断 |
| `getQuestionsByIds(ids)` | 按 id 顺序批量取题（用于练习进度恢复） |
| `getQuestionCount(params)` | 仅统计数量（`head: true`） |
| `insertQuestion(q)` | 插入单题，返回新记录 |
| `insertQuestionsBulk(items)` | 批量插入 |
| `insertCategory(name, description?)` | 新建分类 |
| `deleteCategory(id)` | 删除分类 |
| `updateQuestion(id, updates)` | 更新题目字段 |
| `getCategoryByName(name)` | 按名称查分类（大小写不敏感） |
| `getOrCreateCategory(name)` | 「查不到则新建」的便捷封装 |
| `getCategoryQuestionCounts()` | 返回 `Map<category_id, count>`，用于首页统计 |
| `savePracticeRecord(params)` | 写入 `user_history`；答错时 RPC `upsert_wrong_book` |
| `saveExamSession(params)` | 写入 `exam_sessions`（含 `crypto.randomUUID()` 作为 sessionId），批量写历史，错题入库 |
| `getUserStats(userId)` | 并行查询得出「累计答题/正确数/错题数/考试次数」 |
| `getWrongBook(userId, includeQuestion?)` | 获取错题本，可联表查询题目 |
| `toggleWrongBookMastered(id, mastered)` | 切换「已掌握」状态 |
| `getExamSessions(userId)` | 获取最近 20 条考试记录 |
| `isCurrentUserAdmin()` | 双重判定：邮箱白名单 + `user_profiles.role_key` |
| `deleteQuestion(id)` / `deleteQuestionsBulk(ids)` | 删除题目（RLS 二次校验管理员） |

### 6.3 AI 前端封装（[`src/lib/ai.ts`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/lib/ai.ts)）

| 函数 | 说明 |
|---|---|
| `getAIConfig(userId)` | 读取当前用户的 AI 配置 |
| `saveAIConfig(userId, config)` | upsert 用户 AI 配置（按 `user_id` 唯一约束） |
| `testAIConnection(config)` | 调用 `ai-test-connection` Edge Function |
| `resolveQuestionAI({question, userAnswer})` | 调用 `ai-resolve`，返回 `{resolution, cached}` |
| `generateQuestions({prompt, count?, categoryId?})` | 调用 `ai-generate`，返回 JSON 字符串 |

### 6.4 工具函数（[`src/lib/utils.ts`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/lib/utils.ts)）

| 函数 | 说明 |
|---|---|
| `formatDate(iso)` | 格式化为中文日期字符串 |
| `normalizeAnswer(ans)` | `trim + 去除空白 + toLowerCase` |
| `isAnswerCorrect(userAnswer, correctAnswer)` | 单选严格比对、其他宽松比对 |

> 注意：实际页面中（Practice/Exam）答案比对逻辑是内联实现的，未统一使用 `utils.isAnswerCorrect`，多选题会先排序去重再比较。

### 6.5 Supabase 客户端（[`src/lib/supabase.ts`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/lib/supabase.ts)）

```ts
export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'public-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true },
});
```

单例导出，被 `authStore` / `questions.ts` / `ai.ts` 共用。若环境变量未配置会在控制台告警。

---

## 7. Supabase 后端

### 7.1 配置（[`supabase/config.toml`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/supabase/config.toml)）

- `project_id = "quiz-app"`
- API 端口 `54325`，DB 端口 `54322`，Studio 端口 `54323`
- Auth：`site_url = "http://localhost:5173"`，邮箱注册开启，邮箱验证关闭（`enable_confirmations = false`），最短密码 6 位
- Edge Runtime：Deno 2，`policy = "per_worker"`（支持热重载）
- Storage / Realtime / Inbucket（邮件测试）均已开启

### 7.2 Edge Functions（Deno 运行时）

#### 共享模块

##### [`shared/ai-client.ts`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/supabase/functions/shared/ai-client.ts)

核心函数 `callAI(config, messages, temperature = 0.7): Promise<string>`：

- 通过 `baseUrl.includes('/anthropic')` 判断走 Anthropic 协议还是 OpenAI 协议
- OpenAI 路径：`POST {baseUrl}/chat/completions`，Header `Authorization: Bearer {api_key}`
- Anthropic 路径：`POST {baseUrl}/v1/messages`，Header `x-api-key` + `anthropic-version: 2023-06-01`
- 自动补全 baseUrl（如 `https://api.openai.com` → `https://api.openai.com/v1`）
- 60 秒超时（`AbortSignal.timeout(60000)`）
- 网络错误友好提示

##### [`shared/cors.ts`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/supabase/functions/shared/cors.ts)

- `getCorsHeaders(req)`：反射 Origin，允许 GET/POST/OPTIONS
- `corsJson(body, init, req)`：构造带 CORS 头的 JSON 响应
- `handleCorsPreflight(req)`：处理 OPTIONS 预检，返回 `Response | null`

#### [`ai-test-connection/index.ts`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/supabase/functions/ai-test-connection/index.ts)

- 入参：`{ api_base_url, api_key, model }`
- 用 `temperature: 0.1` 发送 `"请只回复一个单词：OK"`
- 返回 `{ ok: true, message, sample }` 或 `{ ok: false, error }`
- **不需要登录**（直接用前端传入的配置测试）

#### [`ai-resolve/index.ts`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/supabase/functions/ai-resolve/index.ts)

- 入参：`{ question_id?, question, type, options?, answer, explanation?, user_answer? }`
- **必须登录**：从 `Authorization` Header 解析用户
- **缓存机制**：若 `questions.ai_resolution` 已有值，直接返回 `{ resolution, cached: true }`
- 否则读取该用户的 `user_ai_configs`，构造系统提示词与用户提示词调用 AI
- 成功后将解析写回 `questions.ai_resolution`（缓存）
- 返回 `{ resolution, cached: false }`

#### [`ai-generate/index.ts`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/supabase/functions/ai-generate/index.ts)

- 入参：`{ topic, count?, difficulty?, type?, category_id? }`
- **必须登录**
- 构造 prompt 要求 AI 严格输出 JSON：`{ questions: [{question, options?, answer, explanation?}] }`
- 清理返回内容（去除 ` ```json ` 围栏）后 `JSON.parse`
- 解析失败返回 502 + 原始文本，便于调试
- 返回 `{ questions }`（每题附带 type/difficulty/category_id）

---

## 8. 数据库设计与 RLS

### 8.1 表结构概览

| 表 | 用途 | 关键字段 |
|---|---|---|
| `categories` | 题目分类 | `id`, `name`, `description` |
| `questions` | 题目 | `category_id`, `difficulty(1-3)`, `type(choice/multiple/fill)`, `question`, `options(jsonb)`, `answer`, `explanation`, `reference_url`, `ai_resolution`, `creator_id` |
| `profiles` | 旧版用户资料（已被 `user_profiles` 替代） | `id`, `nickname` |
| `user_profiles` | 新版用户档案（含角色） | `id`, `email`, `role_key(user/admin)` |
| `roles` | 角色字典 | `key`, `name` |
| `user_history` | 做题历史 | `user_id`, `question_id`, `user_answer`, `is_correct`, `mode(practice/exam)`, `session_id` |
| `wrong_book` | 错题本 | `user_id`, `question_id`, `wrong_count`, `last_wrong_at`, `mastered`，`unique(user_id, question_id)` |
| `exam_sessions` | 考试会话 | `user_id`, `title`, `total_questions`, `time_limit_sec`, `started_at`, `submitted_at`, `score` |
| `user_ai_configs` | 用户 AI 配置 | `user_id(unique)`, `api_base_url`, `api_key`, `model` |

### 8.2 迁移脚本演进

| 迁移文件 | 作用 |
|---|---|
| [`20240101_create_schema.sql`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/supabase/migrations/20240101_create_schema.sql) | 初始建表 + RLS + `upsert_wrong_book` RPC + 示例数据 |
| [`20250102_add_multiple_choice.sql`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/supabase/migrations/20250102_add_multiple_choice.sql) | 加入 `multiple` 题型约束；管理员可增删分类 |
| [`20250611_add_user_roles.sql`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/supabase/migrations/20250611_add_user_roles.sql) | 新增 `roles` / `user_profiles` / `is_admin()` 函数；统一管理员判定 |
| [`20250612_allow_questions_update.sql`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/supabase/migrations/20250612_allow_questions_update.sql) | 修复 questions 表缺失 UPDATE RLS 的 Bug |
| [`20250613_seed_example_questions.sql`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/supabase/migrations/20250613_seed_example_questions.sql) | 20 道示例题（含 5 个分类） |

### 8.3 RLS 策略要点

- **公开可读**：`categories`、`questions`
- **登录可插入**：`questions`（任何登录用户可贡献题目）
- **管理员可改/删**：`categories`、`questions`（通过 `public.is_admin()` 判定）
- **本人可读写**：`user_history`、`wrong_book`、`exam_sessions`、`user_ai_configs`、`user_profiles`
- **关键 SQL 函数**：`public.is_admin()`、`public.upsert_wrong_book(p_user_id, p_question_id)`、`public.handle_new_user()`（注册触发器）

### 8.4 触发器

`on_auth_user_created`：用户注册后自动在 `user_profiles` 插入记录；邮箱为 `xiao_ranbei@outlook.com` 自动设为 `admin`，其他为 `user`。

---

## 9. 依赖关系图

### 9.1 模块依赖（前端）

```
main.tsx
  └── App.tsx
       ├── store/authStore ─── lib/supabase
       ├── components/Navbar
       └── pages/*
            ├── components/* (QuestionCard, CategoryFilter, Loading, EmptyState, MarkdownText)
            ├── lib/questions ──┐
            ├── lib/ai ─────────┼── lib/supabase
            ├── lib/utils ──────┘
            └── store/* (authStore, practiceStore, examStore)
```

### 9.2 数据流（以「练习答题 → AI 解析」为例）

```
User clicks option
  └─ QuestionCard.onAnswerChange
       └─ Practice.handleSubmitAnswer
            ├─ setUserAnswers (local state)
            ├─ practiceStore.reveal
            ├─ savePracticeRecord (lib/questions)
            │    ├─ supabase.from('user_history').insert
            │    └─ supabase.rpc('upsert_wrong_book') (if wrong)
            └─ (可选) handleAskAI
                 └─ resolveQuestionAI (lib/ai)
                      └─ supabase.functions.invoke('ai-resolve')
                           ├─ check ai_resolution cache
                           ├─ callAI (shared/ai-client.ts)
                           │    └─ user AI API (OpenAI/Anthropic)
                           └─ update questions.ai_resolution
```

### 9.3 后端依赖

```
Edge Function (Deno)
  ├── jsr:@supabase/supabase-js@2
  ├── shared/ai-client.ts ── fetch ──> 外部 AI API
  └── shared/cors.ts
```

---

## 10. 项目运行方式

### 10.1 环境准备

| 工具 | 版本要求 | 说明 |
|---|---|---|
| Node.js | ≥ 18（CI 使用 22） | 前端构建 |
| npm | 随 Node | 依赖管理 |
| Supabase CLI | 最新 | 数据库迁移与 Edge Functions 部署 |
| Git | 任意 | 版本控制 |

### 10.2 本地开发步骤

1. **克隆并安装依赖**

   ```bash
   git clone <repo-url>
   cd quiz-app
   npm install
   ```

2. **配置环境变量**

   复制 [.env.example](file:///c:/Users/xiao_/Documents/Projects/quiz-app/.env.example) 为 `.env`，填入：

   ```
   VITE_SUPABASE_URL=你的 Supabase 项目 URL
   VITE_SUPABASE_ANON_KEY=你的 Supabase anon key
   ```

3. **初始化 Supabase 后端**（首次）

   ```bash
   supabase login
   supabase link --project-ref <你的项目 ID>
   supabase db push                    # 应用所有 migrations
   supabase functions deploy --project-ref <你的项目 ID>
   ```

   或直接在 Supabase Dashboard 的 SQL Editor 中按顺序执行 `supabase/migrations/*.sql`。

4. **启动开发服务器**

   ```bash
   npm run dev
   ```

   默认访问 `http://localhost:5173`。

5. **（可选）启动本地 Supabase**

   ```bash
   supabase start          # 启动本地 Docker 全套服务
   supabase db reset       # 重置并执行 migrations + seed
   ```

### 10.3 类型检查与构建

```bash
npm run typecheck     # 仅类型检查
npm run build         # tsc -b && vite build，输出到 dist/
npm run preview       # 本地预览构建产物
```

### 10.4 Edge Functions 本地调试

```bash
supabase functions serve ai-resolve --env-file ./supabase/.env.local
```

通过 `http://localhost:54321/functions/v1/ai-resolve` 访问。

---

## 11. 部署流程

### 11.1 GitHub Actions 自动部署（[`.github/workflows/deploy.yml`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/.github/workflows/deploy.yml)）

**触发条件：** push 到 `main` 分支，或手动 `workflow_dispatch`

**Jobs：**

1. **`build-frontend`**：`npm ci` → `npm run build`（注入 Secrets 作为环境变量）→ 上传 `dist/` 为 Pages artifact
2. **`deploy-pages`**：依赖 `build-frontend`，使用 `actions/deploy-pages@v4` 部署到 GitHub Pages
3. **`deploy-supabase`**：与前端**并行**执行
   - 安装 Supabase CLI
   - `supabase link`
   - `supabase db push`（推送 migrations）
   - `supabase functions deploy`（部署全部 Edge Functions）

**所需 GitHub Secrets：**

| Secret | 用途 |
|---|---|
| `VITE_SUPABASE_URL` | 构建时注入前端 |
| `VITE_SUPABASE_ANON_KEY` | 构建时注入前端 |
| `SUPABASE_ACCESS_TOKEN` | CLI 鉴权 |
| `SUPABASE_DB_PASSWORD` | 数据库迁移 |
| `SUPABASE_PROJECT_ID` | 项目引用 ID |

**GitHub Pages 设置：** Source 必须选择 "GitHub Actions"。

### 11.2 一键部署脚本（[`deploy-all.ps1`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/deploy-all.ps1)）

PowerShell 脚本，依次执行：

1. 检查 Node / Supabase CLI / Git
2. `npm run build`
3. `supabase db push`
4. `supabase functions deploy`
5. `git add -A && git commit && git push origin main`（最多重试 5 次）

运行方式：`.\deploy-all.ps1`

### 11.3 仅部署 Edge Functions（[`deploy-functions.ps1`](file:///c:/Users/xiao_/Documents/Projects/quiz-app/deploy-functions.ps1)）

- 自动定位 `supabase.exe`（优先 `C:\Users\xiao_\scoop\shims\supabase.exe`）
- 检查登录状态，未登录则触发 `supabase login`
- 链接项目 `soiswftjljwcnuzkmpoj`
- 逐个部署 `ai-test-connection`、`ai-resolve`、`ai-generate`

### 11.4 生产访问地址

- 前端：`https://xiao-ranbei.github.io/quiz-app/`
- Supabase Dashboard：`https://supabase.com/dashboard/project/soiswftjljwcnuzkmpoj`

---

## 12. 安全要点与设计约束

1. **前端仅使用 anon key**，绝不暴露 `service_role` key
2. **RLS 严格策略**：所有用户私有表（`user_history`、`wrong_book`、`user_ai_configs`、`exam_sessions`）均限制 `user_id = auth.uid()`
3. **AI API Key 不在前端明文流转**：调用 AI 时由 Edge Function 从 `user_ai_configs` 表读取，前端只保存不展示
4. **管理员双重判定**：邮箱白名单 + `user_profiles.role_key`，RLS 与前端各做一次校验
5. **MarkdownText 防 XSS**：所有内容经 `escapeHtml` 后再做格式替换
6. **答案比对仅用于判定**：`answer` 字段不参与任何代码执行
7. **sessionStorage 持久化**：练习进度仅存于当前会话，不跨设备同步
8. **CORS 反射 Origin**：Edge Functions 反射请求 Origin 而非固定 `*`，配合 `Allow-Credentials: true`

### 已知约束

- 考试模式状态不持久化，刷新会丢失作答
- 题目随机打乱在前端完成（PostgREST 不支持 `order('random()')`），题量大时会拉取全量再切片
- `utils.isAnswerCorrect` 与页面内联比对逻辑重复，未来可统一
- `profiles` 与 `user_profiles` 两张表并存（历史遗留），新代码使用 `user_profiles`

---

## 13. 可扩展方向

- 题目审核流程（提交 → 审核 → 公开）
- 更多题型（判断题、代码题、连线题）
- 题库分类多级嵌套
- 排行榜与成就徽章
- Realtime 多人练习实时统计
- PWA 离线缓存已下载题目
- 考试会话持久化（支持断点续考）
- AI 解析批量预生成（夜间任务）

---

## 附录：关键文件快速索引

| 模块 | 文件 |
|---|---|
| 应用入口 | [src/main.tsx](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/main.tsx), [src/App.tsx](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/App.tsx) |
| 类型定义 | [src/types/index.ts](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/types/index.ts) |
| Supabase 客户端 | [src/lib/supabase.ts](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/lib/supabase.ts) |
| 数据访问层 | [src/lib/questions.ts](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/lib/questions.ts) |
| AI 前端封装 | [src/lib/ai.ts](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/lib/ai.ts) |
| 状态管理 | [src/store/authStore.ts](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/store/authStore.ts), [practiceStore.ts](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/store/practiceStore.ts), [examStore.ts](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/store/examStore.ts) |
| 题目组件 | [src/components/QuestionCard.tsx](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/components/QuestionCard.tsx) |
| AI Edge Functions | [supabase/functions/ai-resolve/index.ts](file:///c:/Users/xiao_/Documents/Projects/quiz-app/supabase/functions/ai-resolve/index.ts), [ai-generate/index.ts](file:///c:/Users/xiao_/Documents/Projects/quiz-app/supabase/functions/ai-generate/index.ts), [ai-test-connection/index.ts](file:///c:/Users/xiao_/Documents/Projects/quiz-app/supabase/functions/ai-test-connection/index.ts) |
| 共享 AI 客户端 | [supabase/functions/shared/ai-client.ts](file:///c:/Users/xiao_/Documents/Projects/quiz-app/supabase/functions/shared/ai-client.ts) |
| 数据库迁移 | [supabase/migrations/](file:///c:/Users/xiao_/Documents/Projects/quiz-app/supabase/migrations/) |
| CI/CD | [.github/workflows/deploy.yml](file:///c:/Users/xiao_/Documents/Projects/quiz-app/.github/workflows/deploy.yml) |
| 设计规范 | [docs/design-spec.md](file:///c:/Users/xiao_/Documents/Projects/quiz-app/docs/design-spec.md) |
