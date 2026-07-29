# 全局 Supabase 操作 API 整合 - 实施计划

## [x] Task 1: 创建 5 个聚合 RPC 迁移文件
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 创建 `get_home_data()` RPC：返回题目总数 + 分类题目计数
  - 创建 `get_deck_detail(p_deck_id, p_page, p_pagesize, p_search)` RPC：返回牌组信息+统计+复习历史+分页卡片
  - 创建 `get_profile_data()` RPC：返回用户统计+考试历史+AI配置
  - 创建 `submit_exam_session(p_user_id, p_title, p_total, p_time_limit_sec, p_answers)` RPC：一次性交卷
  - 创建 `save_practice_record(p_user_id, p_question_id, p_user_answer, p_is_correct)` RPC：一次性作答记录
- **Test Requirements**:
  - `programmatic` TR-1.1: 所有 RPC 创建成功，supabase db push 无错误
  - `programmatic` TR-1.2: 每个 RPC 返回的 JSON 结构正确

## [x] Task 2: 创建客户端 API 层函数
- **Priority**: high
- **Depends On**: Task 1
- **Description**: 
  - 在 questions.ts 新增 fetchHomeData()、fetchDeckDetailData()、fetchProfileData()、submitExamSessionRpc()、savePracticeRecordRpc()
  - 在 cards.ts 修改 getCurrentUserId 改用 authStore
- **Test Requirements**:
  - `programmatic` TR-2.1: 新函数正确调用 supabase.rpc()
  - `programmatic` TR-2.2: 返回数据正确映射到 TypeScript 类型

## [ ] Task 3: 改造 Home/DeckDetail/Profile 页面
- **Priority**: high
- **Depends On**: Task 2
- **Description**: 
  - Home.tsx 用 fetchHomeData() 替代 Promise.all
  - DeckDetail.tsx 用 fetchDeckDetailData() 替代 4 路并行 + getCards
  - Profile.tsx 用 fetchProfileData() 替代 3 路并行
- **Test Requirements**:
  - `programmatic` TR-3.1: 页面加载请求数降为 1 次 RPC
  - `human-judgement` TR-3.2: UI 渲染与改造前一致

## [x] Task 4: 改造 Exam/Practice 写操作
- **Priority**: high
- **Depends On**: Task 2
- **Description**: 
  - Exam.tsx 用 submitExamSessionRpc() 替代 saveExamSession
  - Practice.tsx 用 savePracticeRecordRpc() 替代 savePracticeRecord
- **Test Requirements**:
  - `programmatic` TR-4.1: 交卷请求从 2+N 降为 1 次
  - `programmatic` TR-4.2: 作答请求从 2 次降为 1 次

## [x] Task 5: 交互层优化
- **Priority**: high
- **Depends On**: Task 3
- **Description**: 
  - Questions.tsx / DeckDetail.tsx 关键字搜索添加 300ms debounce
  - memoryStore.ts 新增 changeMode(mode) 方法，不重新拉队列
  - MemoryStudy.tsx 模式切换改用 changeMode
- **Test Requirements**:
  - `programmatic` TR-5.1: 快速输入 10 字符最多触发 1 次查询
  - `programmatic` TR-5.2: 模式切换不触发 fetchStudyQueue

## [x] Task 6: 类型检查 + 构建 + 测试
- **Priority**: high
- **Depends On**: Task 3, Task 4, Task 5
- **Description**: 运行 typecheck、build、现有单元测试
- **Test Requirements**:
  - `programmatic` TR-6.1: npm run typecheck 无错误
  - `programmatic` TR-6.2: npm run build 成功
  - `programmatic` TR-6.3: 现有单元测试通过

## [ ] Task 7: 部署迁移 + 提交推送
- **Priority**: high
- **Depends On**: Task 6
- **Description**: supabase db push 部署 RPC，git commit + push
- **Test Requirements**:
  - `programmatic` TR-7.1: 迁移部署成功
  - `programmatic` TR-7.2: 代码推送成功

# Task Dependencies
- Task 2 依赖 Task 1
- Task 3, Task 4 依赖 Task 2，可并行
- Task 5 依赖 Task 3
- Task 6 依赖 Task 3, 4, 5
- Task 7 依赖 Task 6
