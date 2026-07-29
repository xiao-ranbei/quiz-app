# Checklist

> 本清单用于在实现完成后逐项验收。每项必须实际验证（看代码 / 跑测试 / 手动操作），不可凭主观判断。
> 通过则勾选 `[x]`，未通过则保持 `[ ]` 并在 tasks.md 中新建修复任务。

---

## 缓存工具（Task 1）

- [x] `src/lib/cache.ts` 存在并导出 `getCached`、`invalidate`、`invalidatePrefix`、`clearAll`
- [x] `getCached` 在并发调用同一 key 时只发起一次 fetcher 请求（promise 去重）
- [x] TTL 过期后再读取会触发新的 fetcher 调用
- [x] `invalidate(key)` 后再读取会触发新的 fetcher 调用
- [x] 单元测试 `npx tsx src/lib/cache.test.ts` 3 个用例全通过

## 分类缓存（Task 2）

- [x] `getCategories` 默认 TTL 5 分钟；TTL 内多次调用只发起 1 次网络请求
- [x] `insertCategory` 成功后调用 `invalidateCategories()`
- [x] `deleteCategory` 成功后调用 `invalidateCategories()`
- [x] `isCurrentUserAdmin` 按 `user.id` 缓存，同一登录会话内只查 1 次 `user_profiles`
- [x] `authStore.signOut` 中调用 `clearAll()` 清空所有缓存
- [x] Home / Practice / Exam / Questions / SubmitQuestion / AddCard / DeckDetail 7 个页面行为无回归

## 服务端聚合（Task 3）

- [x] 新增 SQL 迁移文件创建 `get_category_question_counts()` RPC 函数
- [x] `getCategoryQuestionCounts` 改为调用 RPC，不再拉全表 `category_id` 字段
- [x] 新增 `get_user_stats(p_user_id)` RPC 函数一次性返回 4 个数字
- [x] `getUserStats` 改为调用 RPC，不再拉 `user_history.is_correct` 字段到前端
- [x] Home 页面三张统计卡数据与改造前一致（total / 分类数 / 不变）
- [x] Profile 页面统计数据与改造前一致（totalAnswered / correct / wrongCount / examCount）

## 牌组统计批量（Task 4）

- [x] `src/lib/cards.ts` 新增 `getDeckStatsBulk(deckIds)` 函数
- [x] `getDeckStatsBulk` 内部查询次数 ≤ 2 次（cards 1 次 + card_user_states 1 次）
- [x] `MemoryHome.fetchProgress` 改为调用 `getDeckStatsBulk`
- [x] MemoryHome 页面牌组进度条数据与改造前一致（mastered / total / percent）
- [x] `getDeckStats`（单 deck 版）仍存在并被 `DeckDetail` 使用

## 串行批量化（Task 5）

- [x] `saveExamSession` 中错题 RPC 调用改为 `Promise.all` 并行
- [x] 不再有 `for (const a of params.answers) { await supabase.rpc(...) }` 串行代码
- [x] 提交考试后 `wrong_book` 表数据正确（与改造前一致）

## useEffect 审计（Task 6）

- [x] `Practice.tsx` 的 useEffect 依赖数组正确，无重复触发
- [x] `Questions.tsx` 的筛选 useEffect 依赖数组正确，无每次 render 都拉取
- [x] 切换页面时浏览器 Network 面板观察：`categories` 请求在 TTL 内只出现 1 次

## 兼容性与代码质量

- [x] `npm run typecheck` 全部通过
- [x] `npm run build` 成功生成 `dist/`
- [x] 无 console.error 或未捕获的 Promise rejection
- [x] 新增的 cache.ts 遵循现有代码风格（函数命名、中文注释）
- [x] 不修改数据库 RLS 策略
- [x] 不修改 Edge Functions
- [x] 不修改现有 questions / exam / practice / wrong_book / memory 模块的用户可见行为

---

## 验证统计预期

- **网络请求减少**：
  - 6 个页面切换 categories 请求：6 次 → 1 次（-83%）
  - 4 个页面 isAdmin 请求：4 次 → 1 次（-75%）
  - MemoryHome 10 个牌组统计：10 次 → 2 次（-80%）
  - 考试 10 道错题入库：10 次串行 → 1 次并行（耗时 -90%）
  - Home 页面 questionCount + categoryCounts 全表拉取：1000 行 → ≤ 20 行
