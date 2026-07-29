# 背诵模块 API 整合 - 验证清单

## RPC 函数验证
- [x] Checkpoint 1: `calculate_sm2_state` SQL 函数创建成功，接受正确参数并返回正确的 SM-2 状态
- [x] Checkpoint 2: `get_memory_home_data` RPC 创建成功，返回结构符合前端需求
- [x] Checkpoint 3: `get_study_queue` RPC 创建成功，正确返回到期卡和新卡合并队列
- [x] Checkpoint 4: `submit_review` RPC 创建成功，一次完成状态更新和记录插入
- [x] Checkpoint 5: 所有 RPC 函数使用 `security definer` 模式，正确处理权限

## 功能验证
- [ ] Checkpoint 6: 登录用户访问首页，RPC 返回统计数据 + 公开牌组 + 私有牌组 + 进度
- [ ] Checkpoint 7: 未登录用户访问首页，RPC 返回公开牌组 + 基础统计（用户相关为 0）
- [ ] Checkpoint 8: 学习队列正确按到期卡优先排序，然后补充新卡
- [ ] Checkpoint 9: 复习提交后，SM-2 算法正确计算新调度状态
- [ ] Checkpoint 10: 复习记录正确插入 card_reviews 表

## 前端集成验证
- [x] Checkpoint 11: `fetchMemoryHomeData()` 函数正确调用 RPC 并解析返回数据
- [x] Checkpoint 12: `fetchStudyQueue()` 函数正确调用 RPC 并解析返回数据
- [x] Checkpoint 13: `submitReviewRpc()` 函数正确调用 RPC 并解析返回数据
- [x] Checkpoint 14: MemoryHome.tsx 改造后仅发起 1 次主要 RPC 请求加载首页数据
- [x] Checkpoint 15: memoryStore.ts start 方法改造后仅发起 1 次 RPC 请求加载学习队列
- [x] Checkpoint 16: memoryStore.ts submitReview 方法改造后仅发起 1 次 RPC 请求提交复习

## 兼容性验证
- [x] Checkpoint 17: 原有公共函数（getDecks, getDeckStats 等）保持不变
- [x] Checkpoint 18: TypeScript 类型检查通过（npm run typecheck）
- [x] Checkpoint 19: 生产构建成功（npm run build）
- [x] Checkpoint 20: 现有单元测试全部通过（sm2.test.ts, cache.test.ts）

## 性能验证
- [ ] Checkpoint 21: 首屏加载网络请求次数 <= 2 次（含缓存）
- [ ] Checkpoint 22: 学习队列加载网络请求次数 == 1 次
- [ ] Checkpoint 23: 复习提交网络请求次数 == 1 次
- [ ] Checkpoint 24: RPC 函数响应时间 < 100ms（正常负载）

## 用户体验验证
- [ ] Checkpoint 25: 首页 UI 渲染与改造前完全一致
- [ ] Checkpoint 26: 学习流程和交互与改造前完全一致
- [ ] Checkpoint 27: 完成总结页展示正确
- [ ] Checkpoint 28: 错误处理和降级逻辑正常工作
- [ ] Checkpoint 29: 未登录用户访问受限功能时仍能看到 toast 提示

## 边界情况验证
- [ ] Checkpoint 30: 空牌组（无卡片）处理正确
- [ ] Checkpoint 31: 无到期卡时返回空队列
- [ ] Checkpoint 32: 首次学习（无历史状态）SM-2 初始状态正确
- [ ] Checkpoint 33: RLS 策略正确保护数据访问
