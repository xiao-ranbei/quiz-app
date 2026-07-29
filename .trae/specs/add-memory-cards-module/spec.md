# 背诵模块（Memory Cards Module）Spec

> Change-ID: `add-memory-cards-module`
> 范围：在现有刷题平台基础上，新增一个**完全独立**的「背诵模块」，用于记忆日语 / 英语的单词、语法、短句，采用 Anki SM-2 间隔重复算法。
>
> 不在本次范围内：整体网页 UI 重构（用户已确认作为后续独立 spec 处理）。本模块沿用现有 Tailwind 风格与组件约定。

---

## Why

现有 quiz-app 已具备「做题」能力，但语言学习场景下「主动背诵 + 间隔重复」是更高效的方式。用户希望背诵日语（单词 / 语法 / 短句）与英语（单词 / 语法 / 短句）共 6 类内容，且需要 Anki SM-2 算法自动安排今日复习队列，避免遗忘。新增独立的背诵模块可在不污染现有题库的前提下，提供专业背诵体验。

## What Changes

### 新增子系统
- **数据层**：新增 `decks`、`cards`、`card_user_states`（SM-2 调度状态）、`card_reviews`（复习日志）共 4 张表，与现有 `questions` 体系完全独立
- **业务逻辑**：在 `src/lib/cards.ts` 实现卡片 CRUD、SM-2 调度算法、今日队列计算
- **页面层**：新增 4 个页面
  - `/memory`：模块首页（今日学习仪表盘 + 牌组列表）
  - `/memory/deck/:id`：牌组详情与卡片浏览
  - `/memory/study/:id`：学习/复习会话（4 种作答模式）
  - `/memory/add`：新增卡片（单卡 / 批量 JSON / AI 生成）
- **导航**：Navbar 增加「背诵」入口
- **AI 能力**：新增 `ai-generate-cards` Edge Function，复用 `shared/ai-client.ts`
- **权限**：游客可背诵公共牌组；登录用户可创建私有牌组；管理员可管理公共牌组

### 字段设计（覆盖 6 类内容）
采用**结构化字段 + JSONB 元数据**设计，避免日语 / 英语字段差异导致的表结构分裂：

| 字段 | 类型 | 说明 |
|---|---|---|
| `front` | text | 卡片正面（如日语假名、英语单词、语法点标题） |
| `back` | text | 卡片背面（中文释义、详细解释） |
| `lang` | enum | `ja` / `en` |
| `card_type` | enum | `word` / `grammar` / `sentence` |
| `metadata` | jsonb | 语言特有字段，如日语 ` {reading, romaji, example_ja, example_zh}`；英语 `{phonetic, pos, example_en, example_zh}` |
| `tags` | text[] | 自由标签（如 `JLPT-N3`、`CET-6`、`动词`） |

### 复习模式（4 种）
1. **闪卡翻转**（默认）：正反面翻转，用户自评「不记得 / 困难 / 良好 / 简单」四档，驱动 SM-2
2. **选择题**：从同牌组随机抽 3 个干扰项，用户选正确释义
3. **拼写/听写**：给出提示（中文释义或正面），用户输入答案，归一化比对
4. **听写模式**：调用浏览器 `SpeechSynthesis` API 朗读，用户输入听到的内容（日语与英语均使用 `lang` 字段切换语音）

> 4 种模式均产出 0–1 的「回答质量分」`q`，统一喂给 SM-2 算法更新调度状态。

### SM-2 算法
在 `src/lib/sm2.ts` 实现 SuperMemo-2 算法：
- 输入：`{ ease, interval, repetitions, last_reviewed }` + `quality(0-5)`
- 输出：更新后的状态 + `due` 日期
- `quality` 映射：闪卡 4 档 → `{0, 3, 4, 5}`；选择题 / 拼写 / 听写：正确→5，错误→2

## Impact

- **Affected specs**: 无（新模块）
- **Affected code**:
  - 新增：`src/pages/memory/*`、`src/lib/cards.ts`、`src/lib/sm2.ts`、`src/store/memoryStore.ts`、`supabase/functions/ai-generate-cards/index.ts`、`supabase/migrations/20250701_create_memory_cards.sql`
  - 修改：[src/App.tsx](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/App.tsx)（路由）、[src/components/Navbar.tsx](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/components/Navbar.tsx)（导航）、[src/types/index.ts](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/types/index.ts)（类型）
  - **不修改**：现有 questions / exam / practice / wrong_book 任何代码与数据

## ADDED Requirements

### Requirement: 牌组管理
系统 SHALL 提供牌组（Deck）作为卡片的容器，区分公共牌组与私有牌组。

#### Scenario: 游客访问公共牌组
- **WHEN** 未登录用户访问 `/memory`
- **THEN** 看到所有 `visibility='public'` 的牌组列表
- **AND** 可以开始背诵与查看统计
- **AND** 「创建牌组」按钮置灰并提示登录

#### Scenario: 用户创建私有牌组
- **WHEN** 登录用户在 `/memory` 点击「新建牌组」
- **THEN** 弹窗输入名称、语言（日/英）、类型（单词/语法/短句）、可见性（默认私有）
- **AND** 提交后牌组出现在「我的牌组」分区

#### Scenario: 管理员管理公共牌组
- **WHEN** 管理员访问任意公共牌组详情页
- **THEN** 显示「编辑」「删除」「设为公共/私有」按钮
- **AND** 普通用户在公共牌组上不显示这些按钮

### Requirement: 卡片数据模型
系统 SHALL 用统一表结构存储日语 / 英语的 6 类内容，通过 `lang` 与 `card_type` 区分。

#### Scenario: 日语单词卡片字段
- **WHEN** 用户录入一张日语单词卡片
- **THEN** 必填字段：`front`（汉字/假名）、`back`（中文释义）
- **AND** 元数据可选：`metadata.reading`（假名注音）、`metadata.romaji`、`metadata.example_ja`、`metadata.example_zh`

#### Scenario: 英语语法卡片字段
- **WHEN** 用户录入一张英语语法卡片
- **THEN** 必填字段：`front`（语法点，如 "used to do"）、`back`（用法说明）
- **AND** 元数据可选：`metadata.example_en`、`metadata.example_zh`、`metadata.notes`

### Requirement: SM-2 间隔重复调度
系统 SHALL 使用 SuperMemo-2 算法为每张卡片维护调度状态，自动安排今日复习队列。

#### Scenario: 首次学习新卡
- **WHEN** 用户首次看到一张新卡并完成作答
- **THEN** 创建 `card_user_states` 记录，`ease=2.5`、`interval=1`、`repetitions=0`、`due=明天`
- **AND** 若 quality < 3，`due=今天`（重做）

#### Scenario: 计算今日队列
- **WHEN** 用户进入 `/memory/study/:deckId`
- **THEN** 系统查询该牌组下：`due <= now` 的卡片 + 当日新卡配额（默认 20 张/天）
- **AND** 按到期时间升序、新卡排后
- **AND** 若队列为空，提示「今日已完成」

#### Scenario: 答题后更新调度
- **WHEN** 用户对某卡作答并得到 quality 分
- **THEN** 调用 SM-2 更新 `ease`、`interval`、`repetitions`、`due`
- **AND** 同时在 `card_reviews` 插入一条日志（含 mode、quality、user_answer、reviewed_at）

### Requirement: 四种作答模式
系统 SHALL 在学习会话中提供 4 种可切换的作答模式，所有模式产出统一的 quality 分。

#### Scenario: 闪卡翻转模式
- **WHEN** 用户选择「闪卡」模式
- **THEN** 显示卡片正面，点击卡片翻转显示背面
- **AND** 翻转后显示 4 个评分按钮：「不记得 (0) / 困难 (3) / 良好 (4) / 简单 (5)」
- **AND** 点击后进入下一张并更新 SM-2 状态

#### Scenario: 选择题模式
- **WHEN** 用户选择「选择题」模式
- **THEN** 显示卡片正面 + 从同牌组随机抽 3 张卡的 `back` 作为干扰项 + 正确答案，共 4 选项打乱
- **AND** 用户选择后立即揭示对错
- **AND** 正确→quality=5，错误→quality=2
- **AND** 若牌组卡片数 < 4，提示该模式不可用并降级为闪卡

#### Scenario: 拼写模式
- **WHEN** 用户选择「拼写」模式
- **THEN** 显示卡片背面（中文释义），输入框等待用户输入 `front`
- **AND** 提交后用 `normalizeAnswer` 归一化比对
- **AND** 正确→quality=5，部分匹配（仅大小写/空格差异）→quality=4，完全错误→quality=2

#### Scenario: 听写模式
- **WHEN** 用户选择「听写」模式
- **THEN** 自动调用 `SpeechSynthesis.speak()` 朗读卡片 `front`，使用 `lang` 字段对应的语音（`ja-JP` 或 `en-US`）
- **AND** 显示「重听」「显示答案」按钮 + 输入框
- **AND** 提交后比对逻辑同拼写模式
- **AND** 若浏览器不支持 SpeechSynthesis，提示并降级为拼写模式

### Requirement: 数据来源
系统 SHALL 支持 4 种卡片数据来源。

#### Scenario: 用户手动录入
- **WHEN** 登录用户在 `/memory/add` 选择「单卡录入」Tab
- **THEN** 表单按选定的 `lang` + `card_type` 动态显示对应字段
- **AND** 提交后插入 `cards` 表，`creator_id = 当前用户`

#### Scenario: JSON 批量导入
- **WHEN** 用户在 `/memory/add` 选择「批量导入」Tab
- **THEN** 提供文本域粘贴 JSON 数组，格式 `[{front, back, metadata, tags}]`
- **AND** 前端校验必填字段，失败行高亮显示
- **AND** 提交后用 `insertCardsBulk` 一次性插入
- **AND** 支持 CSV 格式：第一行表头，自动转换

#### Scenario: AI 辅助生成
- **WHEN** 用户在 `/memory/add` 选择「AI 生成」Tab
- **THEN** 输入主题（如「JLPT N3 动词」「英语商务高频词」）+ 数量
- **AND** 调用 `ai-generate-cards` Edge Function
- **AND** 返回的卡片可预览、编辑后一键导入到指定牌组

#### Scenario: 管理员预设词库
- **WHEN** 管理员创建公共牌组并录入/导入卡片
- **THEN** 所有用户在 `/memory` 看到「公共牌组」分区，可直接开始背诵
- **AND** 普通用户的 `card_user_states` 独立维护，互不干扰

### Requirement: 学习进度与统计
系统 SHALL 记录用户学习进度并展示统计。

#### Scenario: 模块首页仪表盘
- **WHEN** 用户访问 `/memory`
- **THEN** 显示「今日待复习 N 张」「今日新卡 N 张」「已掌握 N 张」三张统计卡
- **AND** 显示「我的牌组」与「公共牌组」两个分区
- **AND** 每个牌组显示进度条（已掌握 / 总数）

#### Scenario: 牌组详情页
- **WHEN** 用户访问 `/memory/deck/:id`
- **THEN** 显示牌组元信息、卡片列表（可分页/搜索）、统计图表（最近 7 天复习次数）
- **AND** 提供「开始学习」按钮跳转到 `/memory/study/:id`

### Requirement: AI 生成卡片 Edge Function
系统 SHALL 提供 `ai-generate-cards` Edge Function，复用现有 `shared/ai-client.ts`。

#### Scenario: 调用 AI 生成
- **WHEN** 前端 POST `{ topic, lang, card_type, count, deck_id? }` 到 `ai-generate-cards`
- **THEN** 必须登录，从 `Authorization` Header 解析用户
- **THEN** 读取用户 `user_ai_configs`，构造 prompt 要求 AI 返回 JSON `{ cards: [{front, back, metadata, tags?}] }`
- **AND** 清理 ```json 围栏后 `JSON.parse`
- **AND** 解析失败返回 502 + 原始文本
- **AND** 成功返回 `{ cards }`，前端可选择是否直接插入数据库

## MODIFIED Requirements

### Requirement: 应用路由与导航
现有 [App.tsx](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/App.tsx) 路由表 SHALL 新增 4 条 memory 路由：

| 路径 | 页面 |
|---|---|
| `/memory` | MemoryHome |
| `/memory/deck/:id` | DeckDetail |
| `/memory/study/:deckId` | MemoryStudy |
| `/memory/add` | AddCard |

[Navbar.tsx](file:///c:/Users/xiao_/Documents/Projects/quiz-app/src/components/Navbar.tsx) SHALL 在导航栏新增「背诵」入口，位于「题库」与「练习」之间。

## REMOVED Requirements

无（本 spec 仅新增，不删除现有功能）。

---

## 数据模型设计

### 表结构

```sql
-- 牌组
create table decks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  lang text not null check (lang in ('ja','en')),
  card_type text not null check (card_type in ('word','grammar','sentence')),
  visibility text not null default 'private' check (visibility in ('public','private')),
  creator_id uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 卡片
create table cards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid references decks(id) on delete cascade,
  front text not null,
  back text not null,
  metadata jsonb default '{}',
  tags text[] default '{}',
  creator_id uuid references auth.users(id),
  created_at timestamptz default now()
);

-- 用户调度状态（SM-2）
create table card_user_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  card_id uuid references cards(id) on delete cascade,
  ease float default 2.5,
  interval_days int default 0,
  repetitions int default 0,
  due timestamptz default now(),
  last_reviewed timestamptz,
  unique(user_id, card_id)
);

-- 复习日志
create table card_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  card_id uuid references cards(id) on delete cascade,
  mode text check (mode in ('flashcard','choice','typing','dictation')),
  quality int check (quality between 0 and 5),
  user_answer text,
  reviewed_at timestamptz default now()
);
```

### RLS 策略

- `decks`：公开牌组所有人可读；登录用户可创建；管理员或创建者可改/删
- `cards`：通过 deck_id 联表判定可见性（公开 deck 的卡片所有人可读；私有 deck 仅创建者可读）；管理员或创建者可改/删
- `card_user_states`：仅 `user_id = auth.uid()` 可读写
- `card_reviews`：仅 `user_id = auth.uid()` 可读写

### 索引

- `cards(deck_id)`、`cards(creator_id)`
- `card_user_states(user_id, due)` — 今日队列查询核心索引
- `card_reviews(user_id, reviewed_at desc)`

---

## 关键模块设计

### `src/lib/sm2.ts`

```ts
export interface SM2State {
  ease: number;
  interval: number;
  repetitions: number;
  lastReviewed: Date | null;
}

export interface SM2Result extends SM2State {
  due: Date;
}

export function sm2(state: SM2State, quality: number): SM2Result
```

### `src/lib/cards.ts`

主要导出函数：

| 函数 | 说明 |
|---|---|
| `getDecks(filter)` | 获取牌组列表（公开 + 当前用户私有） |
| `getDeck(id)` | 获取牌组详情 |
| `createDeck(input)` | 新建牌组 |
| `updateDeck(id, input)` | 更新牌组 |
| `deleteDeck(id)` | 删除牌组 |
| `getCards(deckId, pagination)` | 分页获取卡片 |
| `getCard(id)` | 单卡详情 |
| `insertCard(input)` | 插入单卡 |
| `insertCardsBulk(items)` | 批量插入 |
| `updateCard(id, input)` | 更新卡片 |
| `deleteCard(id)` | 删除卡片 |
| `getTodayReviewQueue(deckId, newCardLimit=20)` | 获取今日队列（due 卡 + 新卡配额） |
| `submitReview(cardId, mode, quality, userAnswer?)` | 提交一次复习，更新 SM-2 状态并写日志 |
| `getDeckStats(deckId)` | 牌组维度统计（已掌握/学习中/未学） |
| `getUserMemoryStats()` | 用户维度统计（今日待复习/今日新卡/已掌握） |
| `getReviewHistory(days=7)` | 最近 N 天复习次数 |

### `src/store/memoryStore.ts`

Zustand store，承载学习会话状态：

```ts
interface MemoryStudyState {
  deckId: string | null;
  queue: Card[];
  currentIndex: number;
  mode: 'flashcard' | 'choice' | 'typing' | 'dictation';
  isFlipped: boolean;
  start(deckId, mode) / next() / prev() / setIndex(i)
  flip() / submitReview(quality, userAnswer?) / reset()
}
```

会话进度可选写入 `sessionStorage`，刷新可恢复（与现有 Practice 模式一致）。

---

## 验收标准（参考 checklist.md）

1. 数据库迁移成功执行，4 张表 + RLS + 索引就位
2. 4 种背诵模式均可正常作答并更新 SM-2 状态
3. 今日队列计算正确（首次使用时所有卡均视为新卡）
4. 游客可用公共牌组，登录用户可创建私有牌组
5. AI 生成返回合法 JSON 且可导入
6. 现有题库功能（questions/practice/exam/wrong_book）无回归
