# 背诵模块 API 整合 - 实施计划

## [x] Task 1: 创建 SM-2 算法 SQL 实现
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 在迁移文件中实现 SM-2 间隔重复算法的 SQL 版本
  - 创建 `calculate_sm2_state` 函数，接收现有状态和质量评分，返回新的调度状态
  - 确保与 `sm2.ts` TypeScript 版本逻辑一致
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-1.1: SQL 函数接受 (ease, interval_days, repetitions, last_reviewed, quality) 输入，返回 (ease, interval_days, repetitions, due)
  - `programmatic` TR-1.2: quality >= 3 时 interval 正确增长，quality < 3 时 interval 重置为 0
  - `programmatic` TR-1.3: ease 变化公式正确（ease = max(1.3, ease + 0.1 - (5-q)*(0.08+(5-q)*0.02))）
- **Notes**: 参考 `src/lib/sm2.ts` 中的 TypeScript 实现

## [x] Task 2: 创建首页数据整合 RPC
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 在 `supabase/migrations/` 新增 SQL 迁移文件
  - 创建 `get_memory_home_data` RPC 函数
  - 返回结构：{ stats: MemoryStats, my_decks: DeckWithStats[], public_decks: DeckWithStats[] }
  - 未登录用户返回公开牌组 + 基础统计
  - 登录用户返回公开+私有牌组 + 完整统计
- **Acceptance Criteria Addressed**: AC-1, AC-4
- **Test Requirements**:
  - `programmatic` TR-2.1: RPC 返回的 JSON 结构符合 TypeScript 类型定义
  - `programmatic` TR-2.2: 登录用户调用返回私有牌组 + 公开牌组
  - `programmatic` TR-2.3: 未登录用户调用仅返回公开牌组，用户统计为 0
  - `programmatic` TR-2.4: 每个牌组包含 total/learned/mastered/dueToday/newCards 统计

## [x] Task 3: 创建学习队列整合 RPC
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 创建 `get_study_queue(deck_id uuid, new_card_limit int default 20)` RPC 函数
  - 一次查询返回到期卡 + 新卡的合并队列
  - 按到期卡优先、按 due 排序，然后补新卡
  - 仅返回卡片核心数据（id, front, back, deck_id）
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `programmatic` TR-3.1: RPC 正确返回到期卡（due <= now）按时间升序
  - `programmatic` TR-3.2: 新卡数量不超过 new_card_limit
  - `programmatic` TR-3.3: 到期卡数量 + 新卡数量 <= new_card_limit（若到期卡已超限）
  - `programmatic` TR-3.4: 未登录用户调用返回空数组

## [x] Task 4: 创建复习提交整合 RPC
- **Priority**: high
- **Depends On**: Task 1
- **Description**: 
  - 创建 `submit_review(card_id uuid, mode text, quality int, user_answer text)` RPC 函数
  - 一次调用完成：查询现有状态 → SM-2 计算 → upsert card_user_states → insert card_reviews
  - 需使用 Task 1 创建的 SM-2 SQL 函数
  - 返回更新后的 state 和 review 记录
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-4.1: RPC 调用后 card_user_states 表正确更新
  - `programmatic` TR-4.2: RPC 调用后 card_reviews 表正确插入记录
  - `programmatic` TR-4.3: 返回的 state 包含正确的新调度数据
  - `programmatic` TR-4.4: 未登录用户调用返回错误

## [x] Task 5: 创建客户端 API 聚合层
- **Priority**: high
- **Depends On**: Task 2, Task 3, Task 4
- **Description**: 
  - 在 `src/lib/cards.ts` 中新增调用 RPC 的函数
  - `fetchMemoryHomeData()`: 调用 get_memory_home_data RPC
  - `fetchStudyQueue(deckId, limit?)`: 调用 get_study_queue RPC
  - `submitReviewRpc(cardId, mode, quality, answer?)`: 调用 submit_review RPC
  - 保留原有函数作为降级方案
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3
- **Test Requirements**:
  - `programmatic` TR-5.1: 新函数正确调用 supabase.rpc()
  - `programmatic` TR-5.2: 返回数据正确映射到 TypeScript 类型
  - `programmatic` TR-5.3: 错误处理和异常捕获正确

## [x] Task 6: 改造 MemoryHome.tsx 使用整合 API
- **Priority**: high
- **Depends On**: Task 5
- **Description**: 
  - 修改 `MemoryHome.tsx` 的 `loadData` 函数
  - 用 `fetchMemoryHomeData()` 替代原来的 3 次调用
  - 保持现有 UI 渲染逻辑不变
  - 添加缓存支持（利用现有 cache.ts）
- **Acceptance Criteria Addressed**: AC-1, AC-6
- **Test Requirements**:
  - `programmatic` TR-6.1: 页面加载时仅发起 1 次主要 RPC 请求
  - `programmatic` TR-6.2: 统计数据和牌组正确渲染
  - `human-judgement` TR-6.3: UI 表现与改造前一致

## [x] Task 7: 改造 memoryStore.ts 使用整合 API
- **Priority**: high
- **Depends On**: Task 5
- **Description**: 
  - 修改 `start` 方法：用 `fetchStudyQueue()` 替代 `getTodayReviewQueue`
  - 修改 `submitReview` 方法：用 `submitReviewRpc()` 替代 `submitReviewApi`
  - 保持现有会话管理逻辑不变
- **Acceptance Criteria Addressed**: AC-2, AC-3, AC-6
- **Test Requirements**:
  - `programmatic` TR-7.1: start 方法仅发起 1 次 RPC 请求
  - `programmatic` TR-7.2: submitReview 方法仅发起 1 次 RPC 请求
  - `human-judgement` TR-7.3: 学习流程和交互与改造前一致

## [x] Task 8: 类型检查与构建验证
- **Priority**: high
- **Depends On**: Task 6, Task 7
- **Description**: 
  - 运行 TypeScript 类型检查
  - 运行生产构建
  - 确保所有现有测试通过
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `programmatic` TR-8.1: `npm run typecheck` 无错误
  - `programmatic` TR-8.2: `npm run build` 成功
  - `programmatic` TR-8.3: 现有单元测试（sm2.test.ts, cache.test.ts）通过

## [x] Task 9: 集成测试与手动验证
- **Priority**: medium
- **Depends On**: Task 8
- **Description**: 
  - 部署迁移到 Supabase 测试环境
  - 手动测试各主要场景
  - 验证网络请求次数减少
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3
- **Test Requirements**:
  - `programmatic` TR-9.1: 首页加载请求次数 <= 2 次
  - `programmatic` TR-9.2: 学习队列加载请求次数 == 1 次
  - `programmatic` TR-9.3: 复习提交请求次数 == 1 次
  - `human-judgement` TR-9.4: 整体功能正常，无回归问题

# Task Dependencies
- Task 2, Task 3 互相独立，可并行
- Task 4 依赖 Task 1（SM-2 SQL 函数）
- Task 5 依赖 Task 2, Task 3, Task 4
- Task 6, Task 7 依赖 Task 5，可并行
- Task 8 依赖 Task 6, Task 7
- Task 9 依赖 Task 8
