# Welcome 落地页 Spec

## Why
当前首次进入应用是通过一个全屏 Modal 让用户选择模式，缺乏对项目的介绍。需要一个真正的落地页（`/welcome`），既介绍应用功能，又提供模式选择入口，视觉上更有吸引力。

## What Changes
- 新增 `src/pages/Welcome.tsx`：落地页，包含 Hero 介绍区 + 双卡片模式选择 + 底部特色区
- 修改 `src/App.tsx`：添加 `/welcome` 路由，mode 为 null 时重定向到 `/welcome`，移除 ModeSelectModal
- 修改 `src/components/Navbar.tsx`：Logo 点击跳转 `/welcome` 而非 clearMode
- 修改 `src/components/ModeSwitch.tsx`：切换模式时跳转对应首页，不变
- 删除 `src/components/ModeSelectModal.tsx`：被 Welcome 页面替代

## Impact
- New files: `src/pages/Welcome.tsx`
- Modified: `src/App.tsx`, `src/components/Navbar.tsx`
- Deleted: `src/components/ModeSelectModal.tsx`
- 现有路由 `/` 和 `/memory` 不变

## ADDED Requirements

### Requirement: Welcome 落地页
系统 SHALL 在 `/welcome` 路由提供一个落地页，包含项目介绍和模式选择入口。

#### Scenario: 页面结构
- **WHEN** 用户访问 `/welcome`
- **THEN** 显示三部分内容：Hero 介绍区（大标题 + 标语 + 简介）、双卡片模式选择区（刷题 / 背诵）、底部特色区（4 个核心特色图标 + 文字）

#### Scenario: Hero 区
- **WHEN** 页面加载
- **THEN** 顶部显示大号 "Quiz" 标题、一句话标语（如"刷题与背诵，一站搞定"）、简短描述，背景带品牌色渐变光效

#### Scenario: 选择刷题模式
- **WHEN** 用户点击刷题卡片
- **THEN** mode 设为 quiz，跳转到 `/`

#### Scenario: 选择背诵模式
- **WHEN** 用户点击背诵卡片
- **THEN** mode 设为 memory，跳转到 `/memory`

### Requirement: 自动重定向
系统 SHALL 在 mode 为 null 时自动将用户重定向到 `/welcome`。

#### Scenario: 首次访问
- **WHEN** 用户首次访问应用（mode 为 null），访问任意路由
- **THEN** 自动重定向到 `/welcome`

#### Scenario: 已选择模式
- **WHEN** 用户已选择模式（mode 不为 null），访问 `/welcome`
- **THEN** 仍可正常查看 Welcome 页面，可重新选择模式

### Requirement: Logo 跳转
系统 SHALL 在点击 Navbar 左上角 Logo 时跳转到 `/welcome`。

#### Scenario: 点击 Logo
- **WHEN** 用户点击 Navbar 左上角 Quiz Logo
- **THEN** 跳转到 `/welcome` 页面

## MODIFIED Requirements

### Requirement: Navbar Logo 行为
Logo 点击从 `clearMode`（清除模式）改为 `navigate('/welcome')`（跳转落地页）。

## REMOVED Requirements

### Requirement: ModeSelectModal
**Reason**: 被 Welcome 落地页替代
**Migration**: 删除 `src/components/ModeSelectModal.tsx`，App.tsx 中移除其引用
