# 模式切换功能 Spec

## Why
当前项目刷题功能（题库、练习、考试、错题本）和背诵功能（记忆卡片、SM-2 复习）在同一个 Navbar 中并列展示，两个功能体系互不相关，用户认知负担大。需要一个类似昼夜切换的模式切换机制，让用户在「刷题模式」和「背诵模式」之间自由切换，首次进入时弹出全屏 Modal 让用户选择。

## What Changes
- 新增 `src/store/modeStore.ts`：Zustand store 管理模式状态（quiz / memory），localStorage 持久化
- 新增 `src/components/ModeSwitch.tsx`：Navbar 中的模式切换按钮（参考昼夜切换样式）
- 新增 `src/components/ModeSelectModal.tsx`：首次进入的全屏选择 Modal
- 修改 `src/components/Navbar.tsx`：根据模式过滤导航项 + 插入 ModeSwitch 按钮
- 修改 `src/App.tsx`：插入 ModeSelectModal + 模式切换时路由重定向

## Impact
- Affected code: `src/components/Navbar.tsx`, `src/App.tsx`
- New files: `src/store/modeStore.ts`, `src/components/ModeSwitch.tsx`, `src/components/ModeSelectModal.tsx`
- 现有路由和页面组件无需修改

## ADDED Requirements

### Requirement: 模式状态管理
系统 SHALL 提供 `modeStore`（Zustand）管理全局模式状态，类型为 `'quiz' | 'memory'`，默认值通过 localStorage 惰性初始化。

#### Scenario: 首次访问（无 localStorage 记录）
- **WHEN** 用户首次打开页面
- **THEN** mode 初始值为 `null`（未选择），触发 ModeSelectModal 弹出

#### Scenario: 已有选择记录
- **WHEN** 用户再次访问，localStorage 中有 `app-mode` 值
- **THEN** mode 初始值为 localStorage 中的值，不弹 Modal

### Requirement: 模式切换按钮
系统 SHALL 在 Navbar 右侧（主题切换按钮旁）提供一个模式切换图标按钮。

#### Scenario: 切换模式
- **WHEN** 用户点击切换按钮
- **THEN** 模式切换到另一个模式，页面自动跳转到对应首页（quiz→`/`，memory→`/memory`），localStorage 更新

#### Scenario: 按钮图标显示
- **WHEN** 当前为刷题模式
- **THEN** 显示背诵模式图标（如 Brain/BookOpen），hover 提示"切换到背诵模式"
- **WHEN** 当前为背诵模式
- **THEN** 显示刷题模式图标（如 ClipboardList），hover 提示"切换到刷题模式"

### Requirement: 首次选择 Modal
系统 SHALL 在用户首次访问（mode 为 null）时显示全屏 Modal，展示两个大卡片供用户选择。

#### Scenario: 选择模式
- **WHEN** Modal 弹出，用户点击"刷题模式"卡片
- **THEN** mode 设为 quiz，Modal 关闭，跳转到 `/`
#### Scenario: 选择模式
- **WHEN** Modal 弹出，用户点击"背诵模式"卡片
- **THEN** mode 设为 memory，Modal 关闭，跳转到 `/memory`

### Requirement: 导航项模式隔离
系统 SHALL 根据当前模式过滤 Navbar 导航项。

#### Scenario: 刷题模式导航
- **WHEN** 当前为 quiz 模式
- **THEN** Navbar 显示：首页、题库、练习、考试、错题本、贡献题目、我的

#### Scenario: 背诵模式导航
- **WHEN** 当前为 memory 模式
- **THEN** Navbar 显示：背诵首页、我的

#### Scenario: 未选择模式
- **WHEN** mode 为 null（Modal 弹出中）
- **THEN** Navbar 显示完整导航（兼容降级）
