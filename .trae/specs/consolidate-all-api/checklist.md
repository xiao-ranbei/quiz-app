# 全局 Supabase 操作 API 整合 - 验证清单

## RPC 函数验证
- [ ] Checkpoint 1: get_home_data RPC 创建成功，返回题目总数+分类计数
- [ ] Checkpoint 2: get_deck_detail RPC 创建成功，返回牌组+统计+历史+卡片分页
- [ ] Checkpoint 3: get_profile_data RPC 创建成功，返回统计+考试+AI配置
- [ ] Checkpoint 4: submit_exam_session RPC 创建成功，一次性完成交卷
- [ ] Checkpoint 5: save_practice_record RPC 创建成功，一次性完成作答记录

## 前端集成验证
- [ ] Checkpoint 6: fetchHomeData() 正确调用 RPC
- [ ] Checkpoint 7: fetchDeckDetailData() 正确调用 RPC
- [ ] Checkpoint 8: fetchProfileData() 正确调用 RPC
- [ ] Checkpoint 9: submitExamSessionRpc() 正确调用 RPC
- [ ] Checkpoint 10: savePracticeRecordRpc() 正确调用 RPC
- [ ] Checkpoint 11: getCurrentUserId 改用 authStore，不再调用 auth.getUser()

## 页面改造验证
- [ ] Checkpoint 12: Home.tsx 加载请求数 <= 1 次 RPC
- [ ] Checkpoint 13: DeckDetail.tsx 加载请求数 <= 1 次 RPC
- [ ] Checkpoint 14: Profile.tsx 加载请求数 <= 1 次 RPC
- [ ] Checkpoint 15: Exam.tsx 交卷请求数 == 1 次 RPC
- [ ] Checkpoint 16: Practice.tsx 作答请求数 == 1 次 RPC

## 交互层验证
- [ ] Checkpoint 17: Questions.tsx 搜索 debounce 300ms 生效
- [ ] Checkpoint 18: DeckDetail.tsx 搜索 debounce 300ms 生效
- [ ] Checkpoint 19: memoryStore changeMode 不触发 fetchStudyQueue
- [ ] Checkpoint 20: MemoryStudy 模式切换使用 changeMode

## 兼容性验证
- [ ] Checkpoint 21: 原有公共函数保留
- [ ] Checkpoint 22: TypeScript 类型检查通过
- [ ] Checkpoint 23: 生产构建成功
- [ ] Checkpoint 24: 现有单元测试通过
