# Tasks

> 本任务清单按依赖顺序组织，前置任务未完成时不可开始后续任务。
> 标记为 `[P]` 的任务可与其他同级 `[P]` 任务并行执行。

---

## Phase 1：数据层与基础设施

- [x] Task 1: 创建数据库迁移脚本
  - [x] SubTask 1.1: 新建 `supabase/migrations/20250701_create_memory_cards.sql`
  - [x] SubTask 1.2: 创建 `decks`、`cards`、`card_user_states`、`card_reviews` 4 张表（含字段约束、外键、`on delete cascade`）
  - [x] SubTask 1.3: 创建索引 `cards(deck_id)`、`cards(creator_id)`、`card_user_states(user_id, due)`、`card_reviews(user_id, reviewed_at desc)`
  - [x] SubTask 1.4: 启用 RLS 并为 4 张表编写策略（公开牌组可读、私有牌组仅创建者、用户状态/日志仅本人）
  - [x] SubTask 1.5: 复用 `public.is_admin()` 函数（已在 20250611 迁移中存在），不重复创建
  - [x] SubTask 1.6: 在 SQL 末尾插入 1 个示例公共牌组 + 5 张示例卡片（日语单词 3 张 + 英语单词 2 张），便于联调
  - 验证：`supabase db reset` 后 4 张表与示例数据就位，RLS 策略可在 Supabase Dashboard 看到

- [x] Task 2: 新增类型定义 `[P]`
  - [x] SubTask 2.1: 在 `src/types/index.ts` 末尾追加 `Lang`、`CardType`、`ReviewMode`、`Deck`、`Card`、`CardUserState`、`CardReview`、`MemoryStats` 等类型
  - [x] SubTask 2.2: 追加 `LANG_LABEL`、`CARD_TYPE_LABEL`、`REVIEW_MODE_LABEL` 等枚举到中文标签映射
  - 验证：`npm run typecheck` 通过

- [x] Task 3: 实现 SM-2 算法 `[P]`
  - [x] SubTask 3.1: 新建 `src/lib/sm2.ts`
  - [x] SubTask 3.2: 实现 `sm2(state, quality)` 函数，严格遵循 SuperMemo-2 算法（quality 0-5，ease 最低 1.3，interval 三档计算）
  - [x] SubTask 3.3: 编写 4 个单元测试用例：首次学习（q=4）、答错重置（q=2）、连续答对 3 次、ease 不可低于 1.3
  - 验证：单元测试通过（可用 `node --test` 或简单断言脚本）

> Task 1 完成前不可开始 Task 5、6、7、8、9（依赖数据库表）。Task 2、3 可与 Task 1 并行。

---

## Phase 2：业务逻辑层

- [x] Task 4: 实现卡片数据访问层
  - [x] SubTask 4.1: 新建 `src/lib/cards.ts`，导入 `supabase` 客户端与类型
  - [x] SubTask 4.2: 实现 Deck CRUD：`getDecks(filter)`、`getDeck(id)`、`createDeck`、`updateDeck`、`deleteDeck`
  - [x] SubTask 4.3: 实现 Card CRUD：`getCards(deckId, pagination)`、`getCard`、`insertCard`、`insertCardsBulk`、`updateCard`、`deleteCard`
  - [x] SubTask 4.4: 实现 `getTodayReviewQueue(deckId, newCardLimit=20)`：查 `card_user_states` 中 `due <= now` + 该 deck 中无 state 记录的新卡，按 due 升序、新卡排后
  - [x] SubTask 4.5: 实现 `submitReview(cardId, mode, quality, userAnswer?)`：先 upsert `card_user_states`，再插入 `card_reviews`，整个操作用一个事务或顺序 await
  - [x] SubTask 4.6: 实现 `getDeckStats(deckId)`、`getUserMemoryStats()`、`getReviewHistory(days=7)`
  - [x] SubTask 4.7: 实现 `isCurrentUserAdmin()` 复用（从 `questions.ts` 中 import 即可，不重复实现）
  - 验证：浏览器控制台手动调用各函数，能正确返回数据

- [x] Task 5: 实现 AI 生成卡片 Edge Function
  - [x] SubTask 5.1: 新建 `supabase/functions/ai-generate-cards/index.ts`
  - [x] SubTask 5.2: 复用 `shared/cors.ts` 处理 CORS 与 OPTIONS 预检
  - [x] SubTask 5.3: 复用 `shared/ai-client.ts` 的 `callAI`
  - [x] SubTask 5.4: 从 `Authorization` Header 解析用户，未登录返回 401
  - [x] SubTask 5.5: 读取用户 `user_ai_configs`，构造 prompt：要求 AI 严格返回 JSON `{ cards: [{front, back, metadata, tags?}] }`，按 `lang` + `card_type` 给出对应字段示例
  - [x] SubTask 5.6: 清理 ` ```json ` 围栏后 `JSON.parse`，失败返回 502 + 原始文本
  - [x] SubTask 5.7: 成功返回 `{ cards }`
  - 验证：用 curl 或 Supabase Dashboard 调用，返回合法 JSON

> Task 4 与 Task 5 无强依赖，可并行。但 Task 4 完成后才能开始 Phase 3 的页面开发。

---

## Phase 3：状态管理与页面开发

- [x] Task 6: 实现 memoryStore
  - [x] SubTask 6.1: 新建 `src/store/memoryStore.ts`
  - [x] SubTask 6.2: 定义 `MemoryStudyState` 接口（deckId、queue、currentIndex、mode、isFlipped）
  - [x] SubTask 6.3: 实现 `start(deckId, mode)` — 调用 `getTodayReviewQueue` 拉队列
  - [x] SubTask 6.4: 实现 `next / prev / setIndex / flip / reset`
  - [x] SubTask 6.5: 实现 `submitReview(quality, userAnswer?)` — 调用 `lib/cards.submitReview`，更新当前卡片的本地 state，自动 `next`
  - [x] SubTask 6.6: 可选写入 `sessionStorage`（key: `memory-study-session`），刷新可恢复
  - 验证：store 单独 import 后调用各方法状态变化正确

- [x] Task 7: 实现 MemoryHome 页面 `[P]`
  - [x] SubTask 7.1: 新建 `src/pages/memory/MemoryHome.tsx`
  - [x] SubTask 7.2: 顶部仪表盘：三张统计卡（今日待复习 / 今日新卡 / 已掌握），调用 `getUserMemoryStats`
  - [x] SubTask 7.3: 「我的牌组」分区（登录用户）：调用 `getDecks({ visibility: 'private', creator_id: me })`，显示牌组卡片 + 进度条
  - [x] SubTask 7.4: 「公共牌组」分区：调用 `getDecks({ visibility: 'public' })`
  - [x] SubTask 7.5: 顶部「新建牌组」按钮：登录用户弹窗表单（名称/语言/类型/可见性）；未登录跳转 `/login`
  - [x] SubTask 7.6: 牌组卡片点击跳转 `/memory/deck/:id`
  - 验证：登录/未登录两种状态下页面展示正确

- [x] Task 8: 实现 DeckDetail 页面 `[P]`
  - [x] SubTask 8.1: 新建 `src/pages/memory/DeckDetail.tsx`
  - [x] SubTask 8.2: 顶部牌组信息卡 + 「开始学习」按钮（跳转 `/memory/study/:id`，可携带 `mode` query 参数）
  - [x] SubTask 8.3: 模式选择器：4 个 Tab（闪卡/选择/拼写/听写），选择后写入 localStorage 作为默认模式
  - [x] SubTask 8.4: 卡片列表（分页 20/页 + 关键字搜索 front/back）
  - [x] SubTask 8.5: 管理员/创建者可见「编辑牌组」「删除牌组」「添加卡片」按钮
  - [x] SubTask 8.6: 简单统计：最近 7 天复习次数柱状图（用 div 宽度模拟，不引入图表库）
  - 验证：可浏览卡片、可跳转学习、管理员按钮显隐正确

- [x] Task 9: 实现 MemoryStudy 学习会话页面
  - [x] SubTask 9.1: 新建 `src/pages/memory/MemoryStudy.tsx`
  - [x] SubTask 9.2: 启动时从 `memoryStore.start(deckId, mode)` 拉队列，空队列显示「今日已完成」
  - [x] SubTask 9.3: 顶部进度条 `currentIndex + 1 / queue.length` + 模式切换按钮（切换后重置当前卡状态）
  - [x] SubTask 9.4: **闪卡模式**：卡片正反面翻转 + 4 个评分按钮（不记得 0 / 困难 3 / 良好 4 / 简单 5）
  - [x] SubTask 9.5: **选择题模式**：从 `queue` 中随机抽 3 张卡的 `back` + 当前卡 `back`，打乱展示
  - [x] SubTask 9.6: **拼写模式**：显示 `back`，输入框接收 `front`，归一化比对（复用 `utils.normalizeAnswer`）
  - [x] SubTask 9.7: **听写模式**：检测 `window.speechSynthesis`，存在则朗读 `front`（`lang` → `ja-JP`/`en-US`）；不存在降级为拼写模式
  - [x] SubTask 9.8: 所有模式作答后调用 `memoryStore.submitReview`，自动进入下一张
  - [x] SubTask 9.9: 队列结束显示「本次完成」总结：答对数 / 答错数 / 用时
  - 验证：4 种模式各跑通一次完整会话，`card_user_states.due` 字段正确更新

- [x] Task 10: 实现 AddCard 页面 `[P]`
  - [x] SubTask 10.1: 新建 `src/pages/memory/AddCard.tsx`
  - [x] SubTask 10.2: 三个 Tab：单卡录入 / 批量导入 / AI 生成
  - [x] SubTask 10.3: 单卡录入：选择目标牌组 + `lang` + `card_type`，表单动态显示 metadata 字段
  - [x] SubTask 10.4: 批量导入：JSON 数组文本域 + 格式说明 + 行级校验失败高亮 + CSV 解析（首行表头）
  - [x] SubTask 10.5: AI 生成：主题输入 + 数量 + `lang`/`card_type` 选择 + 调用 `ai-generate-cards`，返回卡片可预览/编辑后一键导入
  - 验证：3 种方式均能成功写入 `cards` 表

> Task 7、8、10 互不依赖，可并行。Task 9 依赖 Task 6 (memoryStore) 完成。

---

## Phase 4：集成与导航

- [x] Task 11: 接入路由与导航
  - [x] SubTask 11.1: 在 `src/App.tsx` 的 Routes 内新增 4 条路由：`/memory`、`/memory/deck/:id`、`/memory/study/:deckId`、`/memory/add`
  - [x] SubTask 11.2: 在 `src/components/Navbar.tsx` 的 `navItems` 数组中「题库」与「练习」之间插入「背诵」项，路径 `/memory`
  - 验证：导航栏显示「背诵」入口，4 个页面均可访问

- [ ] Task 12: 端到端冒烟测试
  - [ ] SubTask 12.1: 游客访问 `/memory` 看到公共牌组，可完成一次闪卡复习
  - [ ] SubTask 12.2: 注册新用户 → 创建私有牌组 → 录入 3 张卡 → 完成一次学习会话
  - [ ] SubTask 12.3: 管理员创建公共牌组 → 所有用户可见
  - [ ] SubTask 12.4: 切换 4 种模式各完成 1 张卡，确认 `card_reviews` 表有 4 条日志
  - [ ] SubTask 12.5: 验证现有题库功能（`/questions`、`/practice`、`/exam`、`/wrong`）无回归
  - 验证：所有子任务通过

---

# Task Dependencies

- Task 1（数据库）→ 阻塞 Task 4、5、6、7、8、9、10、12
- Task 2（类型）→ 阻塞 Task 4、6、7、8、9、10
- Task 3（SM-2）→ 阻塞 Task 4（submitReview 用到）
- Task 4（cards.ts）→ 阻塞 Task 6、7、8、9、10、12
- Task 5（AI Edge Function）→ 阻塞 Task 10（AI 生成 Tab）
- Task 6（memoryStore）→ 阻塞 Task 9
- Task 7、8、10 可与 Task 9 并行（前提是 Task 4、6 已完成）
- Task 11 依赖 Task 7、8、9、10 全部完成（路由要指向已实现的页面）
- Task 12（E2E）依赖所有前置任务

## 可并行批次建议

| 批次 | 可并行任务 | 前置条件 |
|---|---|---|
| 1 | Task 1、Task 2、Task 3 | 无 |
| 2 | Task 4、Task 5 | Task 1、2、3 完成 |
| 3 | Task 6、Task 7、Task 8、Task 10 | Task 4 完成（Task 6 也依赖 Task 5 完成以支持 AI） |
| 4 | Task 9 | Task 6 完成 |
| 5 | Task 11 | Task 7、8、9、10 完成 |
| 6 | Task 12 | 全部完成 |
