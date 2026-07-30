# Apkg 导入功能 Spec

## Why
用户希望在背诵模块一键导入 Anki .apkg 文件，复用 Anki 生态的牌组资源。当前项目无导入功能，用户只能手动逐张添加卡片。

## What Changes
- 新增 `supabase/functions/import-apkg/index.ts`：Edge Function，用 sql.js 解析 SQLite + 写入数据库
- 新增 `src/lib/apkg-import.ts`：前端工具，JSZip 解压 + 上传 + 调用 Edge Function
- 新增 `src/components/AudioPlayer.tsx`：音频懒加载播放组件
- 新增 `src/components/ImportApkg.tsx`：导入按钮 + 进度提示 UI
- 新增 `supabase/migrations/20250737_apkg_import.sql`：Storage bucket + 辅助函数
- 修改 `src/pages/memory/MemoryHome.tsx`：插入 ImportApkg 组件
- 修改 `src/pages/memory/MemoryStudy.tsx`：卡片学习中集成 AudioPlayer
- 新增 `supabase/functions/extract-audio/index.ts`：Edge Function，按需提取单个音频文件

## Impact
- New files: 6 个新文件
- Modified: MemoryHome.tsx, MemoryStudy.tsx
- 数据库：decks 表 metadata 字段新增 media_map，cards 表 metadata 新增 audio 相关字段
- Storage：新增 apkg-uploads 和 audio-cache 两个 bucket

## ADDED Requirements

### Requirement: Apkg 导入
系统 SHALL 提供从 .apkg 文件导入牌组和卡片的功能。

#### Scenario: 导入流程
- **WHEN** 用户在 MemoryHome 页面点击"导入 .apkg"按钮，选择文件
- **THEN** 前端用 JSZip 解压提取 collection.anki21 和 media 文件，上传到 Storage，调用 Edge Function 解析并写入数据库，返回导入结果

#### Scenario: 字段映射
- **WHEN** Edge Function 解析 notes 表
- **THEN** VocabKanji→front，VocabDefSC→back，VocabFurigana→metadata.reading，VocabPitch→metadata.pitch，VocabPoS→metadata.pos，VocabAudio→metadata.audio，SentKanji1→metadata.example，SentFurigana1→metadata.example_reading，SentDefSC1→metadata.example_zh，SentAudio1→metadata.example_audio

#### Scenario: Deck 映射
- **WHEN** Edge Function 解析 col.decks JSON
- **THEN** 每个 Anki deck 创建一条 decks 记录，lang='ja'，card_type='word'，creator_id 为当前用户，metadata 存储原始 deck 信息

### Requirement: 音频懒加载播放
系统 SHALL 支持卡片音频懒加载播放，不在导入时提取全部音频。

#### Scenario: 首次播放
- **WHEN** 用户在学习页面点击播放音频按钮
- **THEN** 系统从 card.metadata.audio 获取文件名，从 deck.metadata.media_map 查找数字 key，检查 audio-cache bucket 是否已有该文件，无则调用 Edge Function 从原始 apkg 提取，存入 cache 后播放

#### Scenario: 后续播放
- **WHEN** 音频已缓存在 Storage
- **THEN** 直接从 Storage URL 播放，无需再次提取

### Requirement: 导入进度反馈
系统 SHALL 在导入过程中显示进度状态。

#### Scenario: 进度显示
- **WHEN** 导入进行中
- **THEN** 显示当前步骤（解压中→上传中→解析中→导入中→完成），并显示成功/失败结果
