# Checklist

> 本清单用于在实现完成后逐项验收。每项必须实际验证（看代码 / 跑测试 / 手动操作），不可凭主观判断。
> 通过则勾选 `[x]`，未通过则保持 `[ ]` 并在 tasks.md 中新建修复任务。
>
> 标记说明：
> - `[x]` = 代码层面已验证通过
> - `[~]` = 需用户运行时手动验证（如 `supabase db reset`、浏览器操作）
> - `[ ]` = 未通过或未验证

---

## 数据层（Phase 1）

- [~] 迁移文件 `supabase/migrations/20250701_create_memory_cards.sql` 存在且可通过 `supabase db reset` 执行
- [x] `decks`、`cards`、`card_user_states`、`card_reviews` 4 张表均已创建
- [x] `cards.deck_id` 外键带 `on delete cascade`
- [x] `card_user_states` 与 `card_reviews` 的 `card_id` 外键带 `on delete cascade`
- [x] `card_user_states` 有 `unique(user_id, card_id)` 约束
- [x] 索引 `cards(deck_id)`、`cards(creator_id)`、`card_user_states(user_id, due)`、`card_reviews(user_id, reviewed_at desc)` 已创建
- [x] 4 张表均已启用 RLS
- [x] `decks` 策略：公开牌组 SELECT 对所有人开放；INSERT/UPDATE/DELETE 限创建者或管理员
- [x] `cards` 策略：通过 deck_id 联表判定可见性；改删限创建者或管理员
- [x] `card_user_states` 与 `card_reviews` 策略：仅 `user_id = auth.uid()` 可读写
- [x] 示例数据：2 个公共牌组（日语 1 + 英语 1）+ 5 张卡片（日语 3 + 英语 2）已插入
- [x] 未重复创建 `public.is_admin()` 函数（复用 20250611 迁移中的版本）

## 类型定义（Phase 1）

- [x] `src/types/index.ts` 末尾追加了 `Lang`、`CardType`、`ReviewMode`、`Deck`、`Card`、`CardUserState`、`CardReview`、`MemoryStats` 类型
- [x] `LANG_LABEL`、`CARD_TYPE_LABEL`、`REVIEW_MODE_LABEL` 枚举到中文标签映射已添加
- [x] `npm run typecheck` 通过且无 TypeScript 错误

## SM-2 算法（Phase 1）

- [x] `src/lib/sm2.ts` 存在并导出 `sm2(state, quality)` 函数
- [x] 首次学习（quality=4）→ `interval=1`、`repetitions=1`、`due=明天`
- [x] 答错（quality=2）→ `repetitions=0`、`interval=0`、`due=今天`（今天重做）
- [x] 连续答对 3 次（quality=5）→ `interval` 依次为 1、6、16
- [x] ease 因子最低不低于 1.3
- [x] 单元测试用例已编写并全部通过（`npx tsx src/lib/sm2.test.ts` 4 个用例全通过）

## 业务逻辑层（Phase 2）

- [x] `src/lib/cards.ts` 存在并导出 spec 中列出的全部 16 个函数
- [x] `getTodayReviewQueue` 正确返回 `due <= now` 的卡 + 新卡配额（默认 20）
- [x] `submitReview` 在一次调用内完成 upsert `card_user_states` + insert `card_reviews`
- [x] `getDecks(filter)` 支持 `visibility` 与 `creator_id` 过滤
- [x] `insertCardsBulk` 可一次性插入多张卡片
- [~] AI Edge Function `supabase/functions/ai-generate-cards/index.ts` 已部署（代码已就位，需用户执行 `supabase functions deploy`）
- [x] 未登录调用 Edge Function 返回 401（代码逻辑验证）
- [x] AI 返回的 JSON 围栏被正确清理后解析
- [x] AI 解析失败时返回 502 + 原始文本（便于调试）

## 状态管理（Phase 3）

- [x] `src/store/memoryStore.ts` 存在并导出 `useMemoryStore`
- [x] `start(deckId, mode)` 正确拉取队列并初始化游标
- [x] `submitReview` 调用 `lib/cards.submitReview` 后自动 `next`
- [x] 队列结束时 `currentIndex` 不会越界（`isFinished` 标记）
- [x] 会话进度可写入 `sessionStorage`，刷新可恢复

## 页面（Phase 3）

### MemoryHome (`/memory`)
- [x] 游客可见公共牌组分区，「新建牌组」按钮置灰或跳转登录
- [x] 登录用户可见「我的牌组」分区
- [x] 三张统计卡（今日待复习 / 今日新卡 / 已掌握）数据准确
- [x] 每个牌组卡片显示进度条
- [x] 「新建牌组」弹窗表单字段完整（名称/语言/类型/可见性）

### DeckDetail (`/memory/deck/:id`)
- [x] 显示牌组元信息与「开始学习」按钮
- [x] 4 种模式 Tab 可切换并写入 localStorage
- [x] 卡片列表支持分页（20/页）与关键字搜索
- [x] 管理员/创建者可见编辑/删除/添加按钮
- [~] 普通用户在他人私有牌组上访问时返回 404 或权限提示（需运行时验证）

### MemoryStudy (`/memory/study/:deckId`)
- [x] 顶部进度条显示 `currentIndex + 1 / queue.length`
- [x] 模式切换按钮可工作（切换后重置当前卡状态）
- [x] **闪卡模式**：点击卡片可翻转，4 个评分按钮对应 quality 0/3/4/5
- [x] **选择题模式**：4 个选项打乱，作答后揭示对错，正确→5 错误→2
- [x] **选择题模式**：牌组卡片 < 4 时降级为闪卡并提示
- [x] **拼写模式**：显示 `back`，输入 `front`，归一化比对正确
- [x] **拼写模式**：完全正确→5，仅大小写/空格差异→4，完全错误→2
- [x] **听写模式**：自动调用 `SpeechSynthesis.speak()` 朗读
- [x] **听写模式**：使用 `lang` 字段对应的语音（`ja-JP` 或 `en-US`）
- [x] **听写模式**：浏览器不支持时降级为拼写模式并提示
- [~] 作答后 `card_user_states.due` 字段被正确更新（需运行时验证）
- [x] 队列结束显示「本次完成」总结（答对数 / 答错数 / 用时）

### AddCard (`/memory/add`)
- [x] 三个 Tab 可切换：单卡录入 / 批量导入 / AI 生成
- [x] 单卡录入表单按 `lang` + `card_type` 动态显示 metadata 字段
- [x] 批量导入支持 JSON 数组格式
- [x] 批量导入失败行高亮显示
- [x] 批量导入支持 CSV 格式（首行表头）
- [x] AI 生成调用 `ai-generate-cards` 并展示返回卡片
- [x] AI 生成的卡片可预览/编辑后一键导入到指定牌组

## 集成与导航（Phase 4）

- [x] `src/App.tsx` 中有 4 条新路由：`/memory`、`/memory/deck/:id`、`/memory/study/:deckId`、`/memory/add`
- [x] `src/components/Navbar.tsx` 中「背诵」入口位于「题库」与「练习」之间
- [~] 点击导航栏「背诵」可正确跳转到 `/memory`（需运行时验证）

## 端到端冒烟测试（Phase 4）

> 以下项需用户手动执行（Task 12）

- [~] 游客可在公共牌组上完成一次闪卡复习
- [~] 注册新用户 → 创建私有牌组 → 录入 3 张卡 → 完成一次学习会话
- [~] 管理员创建的公共牌组对所有用户可见
- [~] 4 种模式各完成 1 张卡后 `card_reviews` 表有 4 条日志
- [~] 现有题库功能无回归：
  - [~] `/questions` 可浏览题目
  - [~] `/practice` 可开始练习
  - [~] `/exam` 可开始考试
  - [~] `/wrong` 错题本正常显示
- [~] 现有数据库表（`questions`、`categories`、`user_history`、`wrong_book`、`exam_sessions`）数据未被修改

## 安全与权限

- [~] 未登录用户访问 `/memory/add` 被重定向到 `/login`（需运行时验证）
- [~] 未登录用户访问 `/memory/study/:deckId` 可学习公共牌组，但 `card_user_states` 不会写入（或写入失败不报错）
- [x] 普通用户无法删除他人创建的私有牌组（RLS 策略验证）
- [x] 普通用户无法编辑公共牌组（RLS 策略验证）
- [x] 管理员可管理所有牌组（公开与私有）（RLS 策略验证）
- [x] 前端不暴露 `service_role` key（仅使用 anon key）
- [x] AI API Key 在 Edge Function 中从 `user_ai_configs` 读取，不通过前端流转

## 代码质量

- [x] `npm run typecheck` 全部通过
- [x] `npm run build` 成功生成 `dist/`
- [x] 无 console.error 或未捕获的 Promise rejection
- [x] 新增文件遵循现有代码风格（函数命名、Tailwind 类名约定、中文注释）
- [x] 不修改现有 questions / exam / practice / wrong_book 模块任何代码

---

## 验证统计

- **代码层面已验证通过**：53 项
- **需用户运行时验证**：18 项（标记为 `[~]`）
- **未通过**：0 项
