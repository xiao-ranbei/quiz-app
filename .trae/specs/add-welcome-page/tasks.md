# Tasks

- [x] Task 1: 创建 Welcome 落地页
  - [x] SubTask 1.1: 创建 `src/pages/Welcome.tsx`，Hero 区（大标题 + 标语 + 简介 + 渐变光效背景）
  - [x] SubTask 1.2: 双卡片模式选择区（刷题卡片：ClipboardList 图标 + 标题 + 功能要点 + 进入按钮；背诵卡片：Brain 图标 + 标题 + 功能要点 + 进入按钮）
  - [x] SubTask 1.3: 底部特色区（4 个核心特色：SM-2 算法、AI 出题、错题追踪、间隔复习，各含图标 + 标题 + 描述）
  - [x] SubTask 1.4: 点击卡片调用 setMode + navigate 到对应首页

- [x] Task 2: 改造 App.tsx 路由和重定向
  - [x] SubTask 2.1: 添加 `/welcome` 路由指向 Welcome 组件
  - [x] SubTask 2.2: 移除 ModeSelectModal 的导入和渲染
  - [x] SubTask 2.3: 添加路由守卫：mode 为 null 时重定向到 `/welcome`（使用 Navigate 组件包装）

- [x] Task 3: 改造 Navbar Logo 跳转
  - [x] SubTask 3.1: Logo 从 `onClick={clearMode}` 改为 `onClick={() => navigate('/welcome')}`
  - [x] SubTask 3.2: 移除不再需要的 clearMode 引用（如未在其他地方使用）

- [x] Task 4: 删除 ModeSelectModal 组件
  - [x] SubTask 4.1: 删除 `src/components/ModeSelectModal.tsx`

- [x] Task 5: 类型检查与构建验证
  - [x] SubTask 5.1: npm run typecheck 无错误
  - [x] SubTask 5.2: npm run build 成功

# Task Dependencies
- Task 2 依赖 Task 1
- Task 3 独立，可与 Task 1 并行
- Task 4 依赖 Task 2（确保 App.tsx 不再引用后才能删）
- Task 5 依赖 Task 2, Task 3, Task 4
