# Tasks

- [x] Task 1: 创建 modeStore 状态管理
  - [x] SubTask 1.1: 创建 `src/store/modeStore.ts`，Zustand store，mode 类型为 `'quiz' | 'memory' | null`
  - [x] SubTask 1.2: localStorage 惰性初始化（key: `app-mode`），setMode 方法同步写入 localStorage

- [x] Task 2: 创建 ModeSwitch 切换按钮组件
  - [x] SubTask 2.1: 创建 `src/components/ModeSwitch.tsx`，参考 Navbar 中昼夜切换按钮样式
  - [x] SubTask 2.2: 刷题模式显示 Brain 图标（切换到背诵），背诵模式显示 ClipboardList 图标（切换到刷题）
  - [x] SubTask 2.3: 点击切换时调用 setMode + navigate 到对应首页

- [x] Task 3: 创建 ModeSelectModal 首次选择弹窗
  - [x] SubTask 3.1: 创建 `src/components/ModeSelectModal.tsx`，全屏 Modal，两个大卡片并排
  - [x] SubTask 3.2: 刷题卡片（ClipboardList 图标 + 标题 + 描述），背诵卡片（Brain 图标 + 标题 + 描述）
  - [x] SubTask 3.3: 点击卡片调用 setMode + 关闭 Modal + navigate 到对应首页

- [x] Task 4: 改造 Navbar 支持模式隔离
  - [x] SubTask 4.1: 根据 mode 过滤 navItems（quiz 模式显示刷题导航，memory 模式显示背诵导航）
  - [x] SubTask 4.2: 在主题切换按钮旁插入 ModeSwitch 组件（桌面端 + 移动端）
  - [x] SubTask 4.3: mode 为 null 时显示完整导航（降级兼容）

- [x] Task 5: 改造 App.tsx 插入 Modal
  - [x] SubTask 5.1: 在 App 组件中引入 ModeSelectModal，mode 为 null 时渲染
  - [x] SubTask 5.2: 监听 mode 变化，切换时自动重定向到对应首页

- [x] Task 6: 类型检查与构建验证
  - [x] SubTask 6.1: npm run typecheck 无错误
  - [x] SubTask 6.2: npm run build 成功

# Task Dependencies
- Task 2, Task 3 依赖 Task 1
- Task 4 依赖 Task 1, Task 2
- Task 5 依赖 Task 1, Task 3
- Task 6 依赖 Task 4, Task 5
