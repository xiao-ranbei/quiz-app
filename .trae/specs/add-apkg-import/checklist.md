# Checklist

- [ ] Checkpoint 1: apkg-uploads 和 audio-cache Storage bucket 已创建
- [ ] Checkpoint 2: get_deck_media_map RPC 函数可正确返回 media_map
- [ ] Checkpoint 3: import-apkg Edge Function 能解析 collection.anki21 并写入 decks + cards
- [ ] Checkpoint 4: 字段映射正确（VocabKanji→front, VocabDefSC→back, 等）
- [ ] Checkpoint 5: media_map 存储在 deck.metadata 中
- [ ] Checkpoint 6: extract-audio Edge Function 能从 apkg 提取单个音频文件
- [ ] Checkpoint 7: 提取的音频上传到 audio-cache bucket 并返回 URL
- [ ] Checkpoint 8: 前端 ImportApkg 组件能选择文件并显示导入进度
- [ ] Checkpoint 9: 导入完成后 MemoryHome 牌组列表自动刷新
- [ ] Checkpoint 10: AudioPlayer 组件能懒加载播放音频
- [ ] Checkpoint 11: 已缓存的音频直接从 Storage URL 播放
- [ ] Checkpoint 12: TypeScript 类型检查通过
- [ ] Checkpoint 13: 生产构建成功
