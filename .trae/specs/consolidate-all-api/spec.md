# 全局 Supabase 操作 API 整合 Spec

## Overview
- **Summary**: 将题库模块各页面（Home、DeckDetail、Profile、Exam、Practice）分散的 Supabase 查询整合为页面级聚合 RPC，并优化交互层（debounce、authStore 复用、模式切换不重复拉队列），全面降低数据库请求频度。
- **Purpose**: 参照背诵模块已验证的 RPC 聚合模式，将项目中剩余的高频分散查询整合为专用 API，减少网络往返。
- **Target Users**: 所有使用题库/背诵模块的用户

## Goals
- 创建 5 个聚合 RPC：get_home_data、get_deck_detail、get_profile_data、submit_exam_session、save_practice_record
- 改造 5 个页面使用聚合 API
- 添加关键字搜索 debounce（Questions.tsx、DeckDetail.tsx）
- getCurrentUserId 改用 authStore 避免重复 auth.getUser()
- MemoryStudy 模式切换不重复拉取队列

## Non-Goals
- 不修改数据库表结构
- 不修改 RLS 策略
- 不修改 UI/UX
- 不引入新依赖库

## Functional Requirements

### FR-1: Home 页聚合 RPC
`get_home_data()` 一次返回：题目总数、分类题目计数列表。

### FR-2: DeckDetail 页聚合 RPC
`get_deck_detail(p_deck_id, p_page, p_pagesize, p_search)` 一次返回：牌组信息、统计、7天复习历史、分页卡片列表（含 total）。

### FR-3: Profile 页聚合 RPC
`get_profile_data()` 一次返回：用户统计、考试历史、AI 配置。

### FR-4: Exam 交卷聚合 RPC
`submit_exam_session(p_user_id, p_title, p_total, p_time_limit_sec, p_answers jsonb)` 一次完成：插入 exam_sessions、批量插入 user_history、批量 upsert wrong_book。

### FR-5: Practice 作答聚合 RPC
`save_practice_record(p_user_id, p_question_id, p_user_answer, p_is_correct)` 一次完成：插入 user_history、答错时 upsert wrong_book。

### FR-6: 交互层优化
- Questions.tsx / DeckDetail.tsx 关键字搜索添加 300ms debounce
- cards.ts 中 getCurrentUserId 改为从 authStore 读取
- memoryStore.ts 新增 changeMode 方法，模式切换不重新拉队列

## Acceptance Criteria

### AC-1: Home 页请求减少
- **Given**: 用户访问首页
- **When**: 页面加载完成
- **Then**: 主要数据请求 <= 1 次 RPC（categories/admin 缓存命中时）
- **Verification**: `programmatic`

### AC-2: DeckDetail 页请求减少
- **Given**: 用户进入牌组详情页
- **When**: 页面加载完成
- **Then**: 主要数据请求从 8-10 次降为 1 次 RPC（搜索时另计）
- **Verification**: `programmatic`

### AC-3: Profile 页请求减少
- **Given**: 用户进入个人中心
- **When**: 页面加载完成
- **Then**: 请求从 3 次降为 1 次 RPC
- **Verification**: `programmatic`

### AC-4: Exam 交卷请求减少
- **Given**: 用户提交考试，答错 10 题
- **When**: 提交完成
- **Then**: 请求从 2+10=12 次降为 1 次 RPC
- **Verification**: `programmatic`

### AC-5: Practice 作答请求减少
- **Given**: 用户答错 1 题
- **When**: 作答提交完成
- **Then**: 请求从 2 次降为 1 次 RPC
- **Verification**: `programmatic`

### AC-6: 关键字搜索防抖
- **Given**: 用户在搜索框快速输入 10 个字符
- **When**: 输入完成
- **Then**: 最多触发 1 次查询（300ms debounce 后）
- **Verification**: `programmatic`

### AC-7: 现有功能回归
- **Given**: 完成改造后
- **When**: 运行类型检查和构建
- **Then**: 全部通过
- **Verification**: `programmatic`
