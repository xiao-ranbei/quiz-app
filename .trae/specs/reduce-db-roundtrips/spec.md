# 减少数据库读写往返 Spec

## Why
项目当前对 Supabase 的查询存在大量重复请求、N+1 调用、全表拉取做前端聚合等问题。典型表现：用户每次切换页面（Home ↔ Practice ↔ Exam ↔ Questions 等）都会重新拉取 `categories` 表、`user_profiles` 表；`MemoryHome` 对每个牌组串行调用 `getDeckStats`；`saveExamSession` 对每道错题串行 RPC。这不仅拖慢首屏和交互，也消耗 Supabase 免费档的 API 配额。本次目标：以最小侵入式改造，把高频读操作的请求次数显著降下来。

## What Changes
- 新增客户端缓存层 `src/lib/cache.ts`（带 TTL 的内存缓存 + 失效工具），用于读多写少的全局数据
- `getCategories`、`isCurrentUserAdmin` 改为带缓存的版本；提供 `invalidateCategories()`、`invalidateAdmin()` 在增删改后失效
- `getCategoryQuestionCounts` 由"拉全表 category_id 到前端聚合"改为 SQL `group by` 聚合查询（仍走 PostgREST，无需新建 RPC）
- `getUserStats` 由"拉所有 user_history.is_correct 到前端 filter"改为 3 个并行 `head: true` count 查询（已部分并行，但当前拉了完整 is_correct 字段，改为只取 count）
- `MemoryHome.fetchProgress` 由"逐 deck 调用 getDeckStats"改为一次性批量查询 `cards` 表按 `deck_id` 分组聚合 + `card_user_states` 按 deck_id 聚合（仅 2 次查询替代 N 次）
- `saveExamSession` 中错题 `upsert_wrong_book` RPC 串行循环改为 `Promise.all` 并行
- `Practice.tsx` / `Questions.tsx` 中重复触发的 useEffect 依赖项检查（避免无谓重复拉取）

## Impact
- Affected specs: 无（独立性能优化）
- Affected code:
  - 新增 `src/lib/cache.ts`
  - 修改 `src/lib/questions.ts`（getCategories / isCurrentUserAdmin / getCategoryQuestionCounts / getUserStats / saveExamSession / insertCategory / deleteCategory）
  - 修改 `src/lib/cards.ts`（新增 `getDeckStatsBulk`，`MemoryHome` 调用方改造）
  - 修改 `src/pages/Home.tsx`、`src/pages/Practice.tsx`、`src/pages/Exam.tsx`、`src/pages/Questions.tsx`、`src/pages/SubmitQuestion.tsx`、`src/pages/Profile.tsx`、`src/pages/memory/MemoryHome.tsx`、`src/pages/memory/AddCard.tsx`、`src/pages/memory/DeckDetail.tsx`（使用缓存版本，写操作后失效缓存）
- 不修改数据库 schema、RLS 策略、Edge Functions
- 不改变任何用户可见行为

## ADDED Requirements

### Requirement: 客户端带 TTL 的内存缓存
系统 SHALL 提供一个通用的内存缓存工具，支持设定过期时间（TTL），并提供 `get/set/invalidate/clear` 能力。同一 key 在 TTL 内重复读取不再发起网络请求。

#### Scenario: 缓存命中
- **WHEN** 调用 `getCached(key, fetcher, ttl)` 且 key 在 TTL 内已被填充
- **THEN** 直接返回缓存值，不调用 fetcher，不发起网络请求

#### Scenario: 缓存失效后重新拉取
- **WHEN** 缓存项超过 TTL 后再次被读取
- **THEN** 调用 fetcher 重新拉取并更新缓存

#### Scenario: 主动失效
- **WHEN** 调用 `invalidate(key)` 后再读取
- **THEN** 触发一次新的 fetcher 调用

### Requirement: 分类列表缓存
系统 SHALL 对 `categories` 表的查询结果进行缓存，默认 TTL 5 分钟；在新增/删除分类后自动失效。

#### Scenario: 多页面切换不重复拉取
- **GIVEN** 用户已访问过 Home 页（已加载分类）
- **WHEN** 用户依次跳转到 Practice、Exam、Questions、SubmitQuestion 页面
- **THEN** 这 5 次页面切换中 `categories` 表的网络请求总次数 ≤ 1 次（在 TTL 内）

### Requirement: 管理员身份缓存
系统 SHALL 对当前登录用户的管理员判定结果按 `user.id` 缓存，登录期间不变；登出时清空。

#### Scenario: 同一登录会话内多次判定
- **GIVEN** 用户已登录
- **WHEN** 在 Home、SubmitQuestion、Questions、DeckDetail 四个页面分别触发管理员判定
- **THEN** `user_profiles` 表查询次数 = 1 次

## MODIFIED Requirements

### Requirement: 分类题目数统计聚合
`getCategoryQuestionCounts` SHALL 使用 SQL 聚合查询（`select('category_id')` 配合 PostgREST 不支持 group by 时的最小化字段拉取，或改用 RPC）返回每个分类的题目数，禁止拉取整个 questions 表的所有行到前端做聚合。

#### Scenario: 统计 1000 道题目
- **WHEN** 题库有 1000 道题目、20 个分类
- **THEN** 网络传输行数从 1000 行降为 ≤ 20 行（或单行聚合结果）

### Requirement: 用户统计聚合
`getUserStats` SHALL 只返回 4 个数字（totalAnswered / correct / wrongCount / examCount），禁止将 `user_history.is_correct` 完整字段拉到前端做 filter。correct 数量用 `count` + 过滤条件实现。

#### Scenario: 统计用户历史
- **WHEN** 用户有 500 条 history 记录
- **THEN** 网络传输从 500 行 `is_correct` 字段降为 0 行（全部用 `head: true` count）

### Requirement: 牌组统计批量查询
`getDeckStatsBulk(deckIds)` SHALL 在 ≤ 2 次查询内返回多个牌组的统计数据（total / learned / mastered / dueToday / newCards），替代逐 deck 串行调用 `getDeckStats`。

#### Scenario: 用户有 10 个牌组
- **WHEN** 在 MemoryHome 渲染 10 个牌组的进度条
- **THEN** 网络请求次数从 10 次降为 ≤ 2 次

### Requirement: 考试错题批量入库
`saveExamSession` 中错题的 `upsert_wrong_book` RPC 调用 SHALL 并行执行（`Promise.all`），禁止 `for` 循环内 `await` 串行。

#### Scenario: 考试 20 道题错 10 道
- **WHEN** 提交考试时 10 道错题需要入库
- **THEN** 错题入库耗时 ≈ 1 次 RPC 耗时（并行），而非 10 次串行累加

## 非目标（Out of Scope）
- 不引入 React Query / SWR 等第三方数据层库
- 不引入 IndexedDB / localStorage 持久化缓存
- 不改造 Edge Functions
- 不修改数据库 schema
- 不实现实时订阅（realtime subscriptions）
