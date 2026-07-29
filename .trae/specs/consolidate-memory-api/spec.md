# 背诵模块 API 整合 Spec

## Overview
- **Summary**: 将背诵模块（Memory Module）分散的数据访问操作整合成专用 API（Supabase RPC + 客户端聚合层），使页面能通过少量 API 调用获取所需的完整数据，大幅减少前端与后端的请求往返。
- **Purpose**: 优化页面对 Supabase 的调用方式，将多个分散的查询整合成结构化的 API，降低网络请求次数，提升首屏加载速度和交互流畅度。
- **Target Users**: 背诵模块用户（日语/英语单词、语法、短句学习者）

## Goals
- 创建 `get_memory_home_data` RPC，一次返回首页所需的统计数据、牌组列表及进度
- 创建 `get_study_queue` RPC，一次返回学习队列（到期卡 + 新卡）
- 创建 `submit_review` RPC，一次完成状态更新 + 复习记录插入
- 重构前端调用方式，页面从多次 fetch 改为调用整合后的 API
- 保持现有功能完全兼容，无行为变化

## Non-Goals (Out of Scope)
- 不修改数据库表结构
- 不改变 SM-2 算法逻辑
- 不修改 UI/UX 设计
- 不引入新的状态管理库
- 不实现离线缓存功能

## Background & Context
### 当前问题
背诵模块存在以下性能问题：
1. **MemoryHome 首屏加载**：需要调用 `getUserMemoryStats`（4次查询）+ `getDecks`（1次）+ `getDeckStatsBulk`（2次）= 约 7 次数据库请求
2. **MemoryStudy 启动**：`getTodayReviewQueue` 内部需要 5 次查询
3. **submitReview**：需要 3 次查询（查现有状态 + upsert + insert）

### 现有架构
- 前端数据访问层：`src/lib/cards.ts`（分散的函数调用）
- Supabase 层：RPC 函数（`get_category_question_counts`, `get_user_stats`）
- 缓存层：`src/lib/cache.ts`（客户端 TTL 缓存）

### 技术约束
- 项目使用 Supabase PostgreSQL，支持 RPC 函数
- 需兼容现有 RLS 策略
- RPC 函数使用 `security definer` 模式

## Functional Requirements

### FR-1: 首页数据整合 RPC
系统 SHALL 提供 `get_memory_home_data` RPC，一次调用返回首页所需的所有数据：
- 用户统计（dueToday, newToday, mastered, totalCards）
- 可见牌组列表（公开牌组 + 用户私有牌组）
- 每个牌组的进度统计（total, learned, mastered, dueToday, newCards）

#### Scenario: 登录用户访问首页
- **Given**: 用户已登录
- **When**: 调用 `get_memory_home_data()`
- **Then**: 返回包含统计 + 所有可见牌组 + 进度的完整数据

#### Scenario: 未登录用户访问首页
- **Given**: 用户未登录
- **When**: 调用 `get_memory_home_data()`
- **Then**: 返回公开牌组列表及基础统计（用户相关数据为 0）

### FR-2: 学习队列整合 RPC
系统 SHALL 提供 `get_study_queue` RPC，一次调用返回指定牌组的今日学习队列：
- 到期卡片（按 due 排序）
- 新卡片（限制数量）
- 合并后完整的卡片数据

#### Scenario: 获取学习队列
- **Given**: 用户已登录且有到期卡片
- **When**: 调用 `get_study_queue(deck_id, new_card_limit)`
- **Then**: 返回到期卡 + 新卡的合并队列

### FR-3: 提交复习整合 RPC
系统 SHALL 提供 `submit_review` RPC，一次调用完成：
- 查询现有学习状态
- 应用 SM-2 算法计算新状态
- 更新/插入 card_user_states
- 插入 card_reviews 记录
- 返回更新后的状态

#### Scenario: 提交复习结果
- **Given**: 用户已登录，正在复习某张卡片
- **When**: 调用 `submit_review(card_id, mode, quality, user_answer)`
- **Then**: SM-2 调度计算完成，状态更新，返回新的 state 和 review

### FR-4: 客户端 API 聚合层
系统 SHALL 在 `src/lib/cards.ts` 中提供统一的客户端 API 层：
- `fetchMemoryHomeData()`: 调用 RPC，返回首页数据
- `fetchStudyQueue(deckId, limit?)`: 调用 RPC，返回学习队列
- `submitReview(cardId, mode, quality, answer?)`: 调用 RPC，提交复习

### FR-5: 页面调用改造
系统 SHALL 改造页面组件，使用整合后的 API：
- `MemoryHome.tsx`: 用 1 次调用替代当前的 3 次调用
- `memoryStore.ts` (`start`): 用 1 次调用替代当前的 `getTodayReviewQueue`
- `memoryStore.ts` (`submitReview`): 用 1 次调用替代当前的多次查询

## Non-Functional Requirements

### NFR-1: 性能
- 首页数据加载：请求次数从 7 次降为 1-2 次（含缓存）
- 学习队列加载：请求次数从 5 次降为 1 次
- 复习提交：请求次数从 3 次降为 1 次

### NFR-2: 响应时间
- RPC 函数执行时间 < 100ms（正常负载下）
- 首屏数据感知加载时间 < 500ms（含网络延迟）

### NFR-3: 兼容性
- 现有公共 API 保持不变（`getDecks`, `getDeckStats`, `getDeckStatsBulk` 等保留）
- 页面组件行为完全一致

### NFR-4: 可维护性
- RPC 函数代码集中在迁移文件中
- 客户端 API 层清晰封装，易于理解和扩展

## Constraints
- **Technical**: 
  - Supabase PostgreSQL RPC 使用 `security definer` 模式
  - RPC 函数可访问 RLS 策略覆盖的数据
  - 保持与现有 `is_admin()` 函数兼容
- **Business**: 
  - 无额外数据库成本（使用现有免费额度）
  - 改造需通过现有测试
- **Dependencies**: 
  - 依赖 `sm2.ts` SM-2 算法逻辑（需在 RPC 中重新实现 SQL 版本）
  - 依赖现有 `decks`, `cards`, `card_user_states`, `card_reviews` 表结构

## Assumptions
- 用户已通过 Supabase Auth 认证
- 数据库支持 PL/pgSQL 语言
- SM-2 算法可在 SQL 中实现
- RPC 函数可通过 Supabase JavaScript 客户端调用

## Acceptance Criteria

### AC-1: 首页数据整合
- **Given**: 用户已登录，有多组公开牌组和私有牌组
- **When**: 访问背诵模块首页
- **Then**: 页面在 1 次主要请求后即可渲染所有统计数据和牌组列表（含进度条）
- **Verification**: `programmatic`
- **Notes**: 用浏览器 DevTools 验证网络请求数量

### AC-2: 学习队列整合
- **Given**: 某牌组有 5 张到期卡和 10 张新卡
- **When**: 用户开始学习该牌组
- **Then**: 学习队列通过 1 次请求加载，按到期卡→新卡顺序排列
- **Verification**: `programmatic`

### AC-3: 复习提交整合
- **Given**: 用户正在复习某张卡片
- **When**: 提交复习评分
- **Then**: 1 次请求完成 SM-2 计算、状态更新、记录插入
- **Verification**: `programmatic`

### AC-4: 未登录用户兼容
- **Given**: 用户未登录
- **When**: 访问首页
- **Then**: 仍可看到公开牌组列表，统计数据为 0
- **Verification**: `programmatic`

### AC-5: 现有功能回归
- **Given**: 所有现有测试
- **When**: 完成改造后运行测试
- **Then**: 所有现有测试通过
- **Verification**: `programmatic`

### AC-6: 用户体验一致
- **Given**: 改造前后
- **When**: 用户执行相同操作
- **Then**: UI 表现和交互完全一致
- **Verification**: `human-judgment`

## Open Questions
- [ ] SM-2 算法在 SQL 中实现是否与 TypeScript 版本完全一致？（需验证边界情况）
- [ ] 是否需要为 RPC 函数添加缓存层（如 Redis），还是仅依赖客户端缓存？
- [ ] 未登录用户的统计数据是否需要一个特殊的 public 版本 RPC？
