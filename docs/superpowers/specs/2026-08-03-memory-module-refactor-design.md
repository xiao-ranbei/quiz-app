# 背诵模块审查与重构设计

日期：2026-08-03

## 背景

用户要求审查并重构 quiz-app 的背诵模块（SM-2 算法、记忆流程、牌组/复习记录）。审查已完成，本设计为已确认的“重构 + 修 bug”范围。

## 审查发现（按严重程度）

1. **安全（高）**：`get_study_queue`、`get_deck_detail`、`submit_review` 均为 `SECURITY DEFINER` 函数，但未校验牌组可见性。任何登录用户传入私有 `deck_id` 即可读取私有牌组的卡片内容，绕过 RLS。
2. **UX bug**：空队列调用 `start()` 时 `isFinished` 被置为 true，页面显示“本轮完成 🎉 共复习 0 张”，而不是“今日已完成”空状态。
3. **死代码 / 重复实现**：客户端旧版 `getTodayReviewQueue` / `submitReview`（降级方案从未接线）；`getUserMemoryStats`、`getDeckStatsBulk`、`getDeckStats`、`getCards` 无调用方；`DeckDetail` 存在未使用的 import；`sm2.test.ts`、`cache.test.ts` 被 vitest `exclude`，从不运行。
4. **双实现漂移**：SM-2 在 TS 与 SQL 各一份（本次不合并，仅修 quality 取整不一致）。
5. **结构问题**：`MemoryStudy.tsx` 700+ 行；`cards.ts` 1050+ 行；`fetchDeckDetailData` 位于 `questions.ts`；RPC 解析大量 `as any` 与伪造字段。

## 范围

**本次做：**

- 修复空队列完成页 bug（前端 store）。
- 新增迁移修复 RPC 越权（仅新增迁移文件，不自动部署）。
- 清理死代码与未使用 import。
- 拆分 `MemoryStudy.tsx` 与 `cards.ts`，移动 `fetchDeckDetailData`。
- 统一 RPC 返回类型解析，去掉 `as any` 与伪造字段（相关类型字段改为可选）。
- 将 `sm2.test.ts` / `cache.test.ts` 转为标准 vitest 套件并启用；补充空队列与 store 会话测试。

**本次不做：**

- 不合并 TS/SQL 双 SM-2 实现（属于深度重构范围）。
- 不合并 `get_memory_home_data` / `get_memory_profile_data` 的重复 SQL。
- 不部署迁移到远程 Supabase。

## 方案

### 1. RPC 越权修复（新增迁移）

在三个 SECURITY DEFINER 函数内显式校验牌组可见性：`visibility = 'public'` 或 `creator_id = auth.uid()` 或 `public.is_admin()`。

- `get_study_queue`：不可见时返回 `'[]'`。
- `get_deck_detail`：deck 查询条件加入可见性校验，不可见时返回 `NULL`（前端显示“牌组不存在或无权访问”）。
- `submit_review`：校验卡片存在且其牌组可见，否则抛异常。

### 2. 空队列 bug

`memoryStore.start()` 中 `isFinished: queue.length === 0` 改为 `isFinished: false`，空队列由页面既有“今日已完成”分支处理。

### 3. 死代码清理

- `cards.ts` 删除：`getTodayReviewQueue`、`submitReview`、`getDeckStats`、`getDeckStatsBulk`、`getUserMemoryStats`、`getCards`。
- `memoryStore.ts` 删除 eslint-disable 的遗留 import。
- `DeckDetail.tsx` 删除未使用 import（`getCards`、`getDeckStats`、`getReviewHistory`）。

### 4. 结构拆分

`src/lib/cards.ts` 拆为 `src/lib/memory/`：

- `user.ts`：`getCurrentUserId`
- `decks.ts`：牌组 CRUD（`getDecks`、`getDeck`、`createDeck`、`updateDeck`、`deleteDeck`）
- `cards.ts`：卡片 CRUD（`insertCard`、`insertCardsBulk`、`updateCard`、`deleteCard`）
- `review.ts`：`fetchStudyQueue`、`submitReviewRpc`
- `stats.ts`：`fetchMemoryHomeData`、`fetchMemoryProfileData`、`getReviewHistory`、`getRecentReviews`、`fetchDeckDetailData`（从 `questions.ts` 移入）
- `index.ts`：barrel re-export

`MemoryStudy.tsx` 拆为 `src/pages/memory/study/`：

- `studyUtils.ts`：`shuffle`、`formatDuration`、`gradeTyping`、`getCardAudioMeta`
- `speech.ts`：`supportsSpeech`、`speak`
- `FlashcardMode.tsx`、`ChoiceMode.tsx`、`InputMode.tsx`（拼写/听写共用，variant 区分）、`StudyComplete.tsx`
- 主文件保留：会话编排、模式切换与降级、进度条、空/加载/错误分支；模式组件用 `key={card.id + mode}` 强制重置本地作答状态

### 5. 类型与解析

- `Card.creator_id`、`Card.created_at`、`DeckWithStats.creator_id/created_at/updated_at` 改为可选。
- 各 RPC 解析用类型化 parser 替换 `as any`，不再伪造字段。

### 6. 测试

- `sm2.test.ts`、`cache.test.ts` 改为标准 `describe/it/expect`，从 vitest exclude 移除。
- 新增 `src/store/memoryStore.test.ts`（空队列 + 会话持久化）。
- `MemoryStudy.test.tsx` 增加空队列“今日已完成”用例与选择题模式用例。

## 验证

- `npm run typecheck`
- `npm test`
- `npm run build`
- 迁移 SQL 静态审查（本地无 Postgres，不自动执行）

## 交付

- 分支：`codex/memory-module-refactor`
- 迁移：`supabase/migrations/20260803_fix_memory_rpc_visibility.sql`（用户自行 `supabase db push` 部署）
