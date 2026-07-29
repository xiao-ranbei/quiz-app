# Tasks

- [x] Task 1: 创建带 TTL 的内存缓存工具 `src/lib/cache.ts`
  - [x] SubTask 1.1: 实现 `CacheEntry` 结构（value、expireAt、promise 防击穿）
  - [x] SubTask 1.2: 实现 `getCached(key, fetcher, ttlMs)` —— 命中返回值；未命中调用 fetcher（同时去重并发请求）；过期自动重拉
  - [x] SubTask 1.3: 实现 `invalidate(key)` / `invalidatePrefix(prefix)` / `clearAll()`
  - [x] SubTask 1.4: 编写 3 个纯函数单元测试（命中 / 过期 / 失效）

- [x] Task 2: 改造 `getCategories` + `isCurrentUserAdmin` 使用缓存
  - [x] SubTask 2.1: `getCategories` 默认 TTL 5 分钟，命中直接返回
  - [x] SubTask 2.2: 新增 `invalidateCategories()`；在 `insertCategory`、`deleteCategory` 成功后调用
  - [x] SubTask 2.3: `isCurrentUserAdmin` 按 `user.id` 缓存（key 形如 `admin:${userId}`），TTL 整个登录会话（设为 30 分钟足够长）
  - [x] SubTask 2.4: 在 `authStore.signOut` 中调用 `clearAll()` 清空所有缓存
  - [x] SubTask 2.5: 确认所有调用点（Home / Practice / Exam / Questions / SubmitQuestion / AddCard / DeckDetail）行为不变

- [x] Task 3: 服务端聚合优化
  - [x] SubTask 3.1: `getCategoryQuestionCounts` 改为只 `select('category_id')` 拉字段后前端 reduce（当前已是此模式，确认无误）→ 进一步改为 PostgREST `select('category_id')` + 前端聚合，行数仍是全表，故改为 RPC `get_category_question_counts` 返回 `{category_id, count}[]`
  - [x] SubTask 3.2: 在 `supabase/migrations/` 新增 SQL 迁移文件，创建 `get_category_question_counts()` RPC 函数
  - [x] SubTask 3.3: `getUserStats` 中 historyRes 改为 `head: true, count: 'exact'` 拿 totalAnswered；correct 用第二个查询 `.eq('is_correct', true).head(true).count('exact')`；不再 select is_correct 字段
  - [x] SubTask 3.4: 同样新增 `get_user_stats(p_user_id uuid)` RPC 一次性返回 4 个数字，`getUserStats` 改为调用该 RPC（更优）

- [x] Task 4: 牌组统计批量查询
  - [x] SubTask 4.1: 在 `src/lib/cards.ts` 新增 `getDeckStatsBulk(deckIds: string[])`，内部用 2 次查询：① `cards` 表按 `deck_id` IN (...) 拉全部卡的 `id, deck_id`；② `card_user_states` 表按 `card_id` IN (...) + `user_id` 拉状态，前端按 deck_id 分组聚合
  - [x] SubTask 4.2: `MemoryHome.fetchProgress` 改为调用 `getDeckStatsBulk`
  - [x] SubTask 4.3: 确认 `getDeckStats`（单 deck 版）保留，仍被 `DeckDetail` 使用

- [x] Task 5: 串行 RPC 批量化
  - [x] SubTask 5.1: `saveExamSession` 中错题 `upsert_wrong_book` 的 `for await` 循环改为 `await Promise.all(...)`
  - [x] SubTask 5.2: `savePracticeRecord` 内单次 RPC 保持不变（本就是单次）

- [x] Task 6: useEffect 依赖审计
  - [x] SubTask 6.1: `Practice.tsx` 的 4 个 useEffect 检查是否有重复触发；如有空依赖但读了 state 的情况，修正
  - [x] SubTask 6.2: `Questions.tsx` 的筛选 useEffect 确认依赖数组正确（避免每次 render 都拉取）

- [x] Task 7: 类型检查 + 构建验证
  - [x] SubTask 7.1: `npm run typecheck` 通过
  - [x] SubTask 7.2: `npm run build` 成功
  - [x] SubTask 7.3: 单元测试 `npx tsx src/lib/cache.test.ts` 通过（如有）

# Task Dependencies
- Task 2 依赖 Task 1（缓存工具）
- Task 3、4、5、6 相互独立，可并行
- Task 7 依赖所有前置任务
