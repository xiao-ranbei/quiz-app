# Tasks

- [ ] Task 1: 创建数据库迁移文件
  - [ ] SubTask 1.1: 创建 `supabase/migrations/20250737_apkg_import.sql`，创建 apkg-uploads 和 audio-cache 两个 Storage bucket
  - [ ] SubTask 1.2: 创建 RPC 函数 `get_deck_media_map(p_deck_id)` 返回 deck 的 media_map

- [ ] Task 2: 创建 import-apkg Edge Function
  - [ ] SubTask 2.1: 创建 `supabase/functions/import-apkg/index.ts`，用 Deno 标准库 unzip + sql.js 解析 SQLite
  - [ ] SubTask 2.2: 读取 col 表的 decks/models JSON，映射字段，批量 INSERT decks + cards
  - [ ] SubTask 2.3: 存储 media_map 到 deck.metadata，返回导入结果

- [ ] Task 3: 创建 extract-audio Edge Function
  - [ ] SubTask 3.1: 创建 `supabase/functions/extract-audio/index.ts`，接收 deck_id + media_key，从原始 apkg 提取单个音频
  - [ ] SubTask 3.2: 提取后上传到 audio-cache bucket，返回公开 URL

- [ ] Task 4: 创建前端导入工具和组件
  - [ ] SubTask 4.1: 创建 `src/lib/apkg-import.ts`，JSZip 解压 + 上传 + 调用 Edge Function
  - [ ] SubTask 4.2: 创建 `src/components/ImportApkg.tsx`，导入按钮 + 进度提示 UI
  - [ ] SubTask 4.3: 创建 `src/components/AudioPlayer.tsx`，懒加载播放组件

- [ ] Task 5: 集成到现有页面
  - [ ] SubTask 5.1: 修改 `MemoryHome.tsx` 插入 ImportApkg 组件
  - [ ] SubTask 5.2: 修改 `MemoryStudy.tsx` 在卡片学习中集成 AudioPlayer

- [ ] Task 6: 类型检查与构建验证
  - [ ] SubTask 6.1: npm run typecheck 无错误
  - [ ] SubTask 6.2: npm run build 成功

# Task Dependencies
- Task 2, Task 3 依赖 Task 1
- Task 4 依赖 Task 2, Task 3
- Task 5 依赖 Task 4
- Task 6 依赖 Task 5
