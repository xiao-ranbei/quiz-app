# 背诵模块：统一 Metadata 结构 + 多模型 apkg 导入映射

**日期**：2026-07-31
**状态**：待 review

---

## 1. 背景与问题

### 1.1 当前痛点

背诵模块的日语和英语导入/展示存在以下不一致：

1. **类型定义割裂**：`JaWordMetadata` 和 `EnWordMetadata` 各自为独立接口，导致：
   - 日语单词缺少 `pos`（词性）字段，但实际 Anki 导入的 `VocabPoS` 值已写入 metadata，TS 类型却声明没有
   - 英语单词缺少 `reading`/`romaji` 等可扩展字段
   - 例句字段命名不一致（`example_ja` vs `example_en`），但导入时实际统一存的是 `example`

2. **导入映射硬编码**：`FIELD_MAP` 只适配「大厂日语句典」的 Vocab 模型（含 `VocabKanji`/`VocabFurigana`/`VocabPoS` 等字段）。英语 apkg 导入时会落入「通用映射」分支，所有字段按 `field_2`、`field_3` 命名，丢失语义。

3. **通用映射无意义命名**：对于非标准模型（无论日语还是英语），超过 2 个字段后全部变成 `field_N`，导入后需要手动理解每个字段的含义，体验差。

### 1.2 设计目标

- 消除语言差异：用 **统一的 Metadata 接口** 涵盖日语 + 英语
- 消除模型差异：用 **多套预设映射 + 关键词语义识别** 应对不同 Anki 模型
- 完全向后兼容：已导入的旧数据（metadata 是 JSONB，key 名不变）完全无需迁移
- 不破坏现有 apkg 导入：日语 Vocab 模型映射 100% 保持原有行为

---

## 2. 统一 Metadata 类型设计

### 2.1 WordMetadata（统一单词元数据）

合并 `JaWordMetadata` 和 `EnWordMetadata` 为单一接口，按 **信息语义** 分类，不分语言：

```typescript
export interface WordMetadata {
  // ---- 词性（日语/英语通用） ----
  pos?: string;
  // 日语：名詞/動詞/形容詞/副詞 etc.
  // 英语：noun/verb/adjective/adverb etc.

  // ---- 发音相关 ----
  reading?: string;         // 日语假名注音（如 "ねこ"）；英语可复用为空
  romaji?: string;          // 日语罗马音（如 "neko"）
  phonetic?: string;        // 英语音标（如 "/əˈbændən/"）；部分日语模型也提供音标注释
  pitch?: string;           // 日语音调（如 "01"）

  // ---- 释义 ----
  meaning?: string;         // 释义文本（中日通用；back 字段存 main 释义，此处可放补充释义）

  // ---- 例句 ----
  example?: string;         // 例句原文（日语：日语原文；英语：英语原文）
  example_reading?: string; // 例句注音/音标（日语假名 or 英语音标）
  example_zh?: string;      // 例句中文翻译（统一）

  // ---- 音频 ----
  audio?: string;           // 单词音频文件名（来自 [sound:xxx]）
  example_audio?: string;   // 例句音频文件名

  // ---- 其他通用 ----
  synonyms?: string;        // 同义词/近义词
  notes?: string;           // 备注/用法提示

  // ---- 兜底（向后兼容 + 扩展） ----
  [key: string]: unknown;
}
```

### 2.2 GrammarMetadata（统一语法元数据）

```typescript
export interface GrammarMetadata {
  example?: string;          // 例句原文（日语/英语均用此 key）
  example_zh?: string;       // 例句中文翻译
  notes?: string;            // 用法备注
  pos?: string;              // 适用词性/语法点标签
  [key: string]: unknown;
}
```

### 2.3 SentenceMetadata（统一短句元数据）

```typescript
export interface SentenceMetadata {
  translation?: string;      // 翻译
  notes?: string;            // 备注
  [key: string]: unknown;
}
```

### 2.4 向后兼容性说明

| 旧 key 名 | 新 key 名 | 处理方式 |
|---|---|---|
| `example_ja`（JaWordMetadata 中声明但实际导入没用到） | `example` | 旧声明已删除；实际导入的 metadata 本来就存的是 `example` |
| `example_en`（EnWordMetadata 中声明但实际导入没用到） | `example` | 同上 |
| `field_2`, `field_3` 等 | 保留兜底 `[key: string]` | 旧数据仍可访问；新导入尝试识别成有意义的 key |

---

## 3. 多模型 apkg 导入映射设计

### 3.1 分层映射策略

```
             ┌──────────────────────────┐
             │   检测当前笔记的模型     │
             └────────────┬─────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
 匹配日语 Vocab    匹配英语 Vocab      通用映射
 (预设字段映射)    (预设字段映射)    (关键词语义识别)
         └────────────┬────────────┘
                      ▼
          统一生成 front/back/metadata
                      ▼
         相同的 Edge Function 写库逻辑
```

### 3.2 预设模型定义

```typescript
// 模型类型（来自 SQLite 的 model）
interface AnkiModel {
  id: number;
  name: string;
  flds: Array<{ name: string; ord: number }>;
}

// 预设日语 Vocab 模型（大厂日语句典）
const JA_VOCAB_MAP: Record<string, string> = {
  VocabKanji:     'front',
  VocabDefSC:     'back',
  VocabFurigana:  'reading',
  VocabPitch:     'pitch',
  VocabPoS:       'pos',         // ⚠ 之前已有，现在类型系统中正式支持
  VocabAudio:     'audio',
  SentKanji1:     'example',
  SentFurigana1:  'example_reading',
  SentDefSC1:     'example_zh',
  SentAudio1:     'example_audio',
};

// 预设英语常见模型（Word/Phonetic/PoS/Definition/Example 系列）
const EN_VOCAB_MAP: Record<string, string> = {
  Word:             'front',
  Term:             'front',       // 别名
  Phonetic:         'phonetic',
  IPA:              'phonetic',    // 别名
  PoS:              'pos',
  PartOfSpeech:     'pos',         // 别名
  'Part of Speech': 'pos',         // 别名
  Definition:       'back',
  Meaning:          'back',        // 别名
  Def:              'back',        // 别名
  Example:          'example',
  Sentence:         'example',     // 别名
  Translation:      'example_zh',
  ExampleZh:        'example_zh',
  Synonyms:         'synonyms',
  Audio:            'audio',
};
```

### 3.3 模型检测逻辑（按单个 note 的 mid）

```typescript
type FieldMap = Record<string, number>;  // Anki字段名 → 列索引(ord)

/**
 * 根据模型字段名自动选择映射策略，返回:
 *   - fieldMap：{ anki字段名: targetKey } (只含能识别的字段)
 *   - genericFallbacks：未识别字段数 > 0 时，true 表示后续走语义关键词兜底
 */
function resolveModelMapping(model: AnkiModel): {
  fieldMap: Record<string, string>;  // anki字段名 → target key（front/back/pos...）
  fieldIndexMap: FieldMap;           // anki字段名 → ord
  genericMode: boolean;
} {
  const fieldNames = model.flds.map(f => f.name);
  const fieldIndexMap = Object.fromEntries(model.flds.map(f => [f.name, f.ord]));

  // 检测：日语 Vocab 模型（优先）
  if (fieldNames.some(n => n === 'VocabKanji')) {
    return {
      fieldMap: JA_VOCAB_MAP,
      fieldIndexMap,
      genericMode: false,
    };
  }

  // 检测：英语 Vocab 模型（含 Word/Phonetic/PoS 中至少 2 个）
  const enHits = ['Word', 'Phonetic', 'PoS', 'PartOfSpeech', 'Definition']
    .filter(k => fieldNames.includes(k)).length;
  if (enHits >= 2) {
    return {
      fieldMap: EN_VOCAB_MAP,
      fieldIndexMap,
      genericMode: false,
    };
  }

  // 通用模型：走语义关键词识别
  return {
    fieldMap: buildSemanticMap(fieldNames),
    fieldIndexMap,
    genericMode: true,
  };
}
```

### 3.4 语义关键词识别（通用映射兜底）

当模型不在预设集合中时，通过「小写 + 去空格」后匹配关键词语义：

```typescript
const SEMANTIC_RULES: Array<{ match: RegExp; target: string }> = [
  // 发音
  { match: /(furigana|kana|reading|yomi|よみ)/i,            target: 'reading' },
  { match: /(romaji|roman|ローマ字)/i,                       target: 'romaji' },
  { match: /(phonetic|pronunciation|ipa|音标?)/i,           target: 'phonetic' },
  { match: /(pitch|accent|intonation|音调?|ピッチ)/i,       target: 'pitch' },

  // 词性
  { match: /^(pos|partofspeech|part of speech|词性|品詞)$/i,target: 'pos' },

  // 释义
  { match: /(meaning|definition|def|translation|释义|意味|翻訳|訳)/i, target: 'meaning' },

  // 例句
  { match: /^(example|sentence|例文)$/i,                                   target: 'example' },
  { match: /(example_reading|sentence_reading|例え?文.*?(読み|仮名|注音))/i,target: 'example_reading' },
  { match: /(example.*?zh|example.*?cn|translation.*?zh|中文.*?例|例文.*?訳)/i, target: 'example_zh' },

  // 音频
  { match: /(audio|sound|mp3|voice|音声|発音.*?音)/i,          target: 'audio' },
  { match: /(example.?audio|sentence.?audio|例文.*?音声)/i,   target: 'example_audio' },

  // 其他
  { match: /(synonym|同義語|類義語)/i,                         target: 'synonyms' },
  { match: /(note|comment|remark|usage|メモ|備考|注記)/i,     target: 'notes' },
];

/**
 * 对 anki 字段名做语义匹配，返回 { anki字段名: targetKey }
 * 无法匹配的字段仍保留原名 → key（或兜底 field_N）
 */
function buildSemanticMap(fieldNames: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  let frontSet = false;
  let backSet = false;

  for (let i = 0; i < fieldNames.length; i++) {
    const raw = fieldNames[i];
    const norm = raw.toLowerCase().replace(/[\s_\-]+/g, '');

    // 前两字段默认 front/back（如果没被语义规则抢先匹配到）
    if (!frontSet && i === 0) { result[raw] = 'front'; frontSet = true; continue; }
    if (!backSet && i === 1)  { result[raw] = 'back';  backSet  = true; continue; }

    // 语义规则匹配
    let matched = false;
    for (const rule of SEMANTIC_RULES) {
      if (rule.match.test(norm) || rule.match.test(raw)) {
        result[raw] = rule.target;
        matched = true;
        break;
      }
    }

    // 兜底：保留原名做 key（如果 key 名干净），否则 field_N
    if (!matched) {
      const cleanKey = raw.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_')
                          .replace(/_+/g, '_')
                          .replace(/^_|_$/g, '')
                          .toLowerCase();
      if (cleanKey.length > 0 && cleanKey !== `field_${i}`) {
        result[raw] = cleanKey;
      } else {
        result[raw] = `field_${i}`;
      }
    }
  }

  return result;
}
```

### 3.5 解析流程改动（parseApkg）

当前 `parseApkg` 是「全局找一个 vocab 模型 → 所有 note 按同一套 map 解析」。

**改为按模型逐个解析**：因为一个 apkg 内可能同时包含多种模型（日语模型 + 英语模型混合）。

```typescript
// 为每个模型构建 mapping（mid → {fieldMap, fieldIndexMap, genericMode}）
const modelMaps = new Map<string, ReturnType<typeof resolveModelMapping>>();
for (const [mid, model] of Object.entries(modelsJson)) {
  modelMaps.set(mid, resolveModelMapping(model));
}

// 遍历每一条 note 时用对应 mid 的 mapping
for (const nid of noteIds) {
  const note = noteMap.get(nid);
  const mapping = modelMaps.get(note.mid);
  const { fieldMap, fieldIndexMap } = mapping!;

  // 按 fieldMap 逐个处理（替代原有的"if vocab 分支 / else 通用分支"）
  for (const [ankiField, targetKey] of Object.entries(fieldMap)) {
    const idx = fieldIndexMap[ankiField];
    if (idx === undefined || idx >= note.flds.length) continue;
    const raw = note.flds[idx];
    if (!raw) continue;

    if (targetKey === 'front') front = stripSoundTags(raw);
    else if (targetKey === 'back') back = stripSoundTags(raw);
    else if (targetKey === 'audio' || targetKey === 'example_audio') {
      const fname = extractAudioFilename(raw);
      if (fname) metadata[targetKey] = fname;
    } else {
      metadata[targetKey] = stripSoundTags(raw);
    }
  }

  // 通用模式下补充兜底：未被 fieldMap 覆盖的 Anki 字段 → metadata.<原名clean>
  // ...
}
```

---

## 4. 展示层适配改动

### 4.1 展示组件的 metadata 读取策略

前端卡片组件（CardReview / Flashcard / 选择题 / 拼写页）需按以下统一策略读取：

| 展示元素 | 读取规则 | 示例 |
|---|---|---|
| 发音 | `reading` ?? `phonetic`（按 deck.lang 决定标签：「假名」或「音标」） | ja→ねこ；en→/əˈbændən/ |
| 词性 | `pos`（直接显示，不分语言） | 名詞 / verb |
| 例句原文 | `example`（按 deck.lang 决定标签） | 「日语例句」或「English Sentence」 |
| 例句注音 | `example_reading`（仅非空时显示） | 「では、また」 |
| 例句翻译 | `example_zh`（标签统一：「中文翻译」） | 「那么，再见」 |
| 单词音频 | `audio`（AudioPlayer 懒加载） | 🔊 |
| 例句音频 | `example_audio`（仅非空时显示） | 🔊 |
| 同义词 | `synonyms`（仅非空时，显示为标签） | cat, kitty, feline |
| 备注 | `notes`（折叠或小字显示） | — |

### 4.2 涉及文件

- `src/components/CardReview.tsx` — 闪卡模式的卡片正反面渲染
- `src/components/CardChoice.tsx`（或等效组件）— 选择题模式
- `src/components/CardTyping.tsx`（或等效组件）— 拼写/听写模式
- 任何直接解构 `(metadata as JaWordMetadata).example_ja` 的地方 → 改为读取统一 key

### 4.3 兜底 & 容错

所有 `metadata.xxx` 读取都用可选链 / nullish coalescing，字段不存在时什么都不渲染，不显示占位。

---

## 5. 错误处理 & 边缘场景

| 场景 | 处理方式 |
|---|---|
| 同时命中 JA_VOCAB_MAP 检测条件和 EN_VOCAB_MAP | JA_VOCAB_MAP 优先（检测顺序写在前） |
| 一个 apkg 里多种模型混合（日语 + 英语牌组） | 每个模型独立 mapping，按 note 的 mid 选择 |
| 通用模式也识别不出的字段 | 保留原字段名做 metadata key（或兜底 field_N） |
| 语义识别把不相干字段误匹配 | 规则用严格前缀/全词匹配 + 明确中英文词；误匹配可通过 SEMANTIC_RULES 调整 |
| 旧数据 `example_ja`/`example_en`（如果存在） | `WordMetadata` 保留 `[key: string]: unknown` 兜底；展示层额外兼容：`example ?? example_ja ?? example_en` |

---

## 6. 实施步骤

| 步骤 | 文件 | 改动 | 风险 |
|---|---|---|---|
| 1 | `src/types/index.ts` | 合并 Ja/En WordMetadata，统一 Grammar/Sentence | 低：key 名无变化，只是 TS 层面合并 |
| 2 | `src/lib/apkg-import.ts` | 替换 FIELD_MAP 为 JA_VOCAB_MAP + EN_VOCAB_MAP，新增 resolveModelMapping / buildSemanticMap，按模型逐个解析 | 中：需确保日语 Vocab 映射行为与之前完全一致 |
| 3 | 前端展示组件（CardReview 等） | 读取统一的 pos / reading / phonetic / example / example_zh，删除分语言判断 | 低：key 名本来就一致，只是 TS 类型提示更准确 |
| 4 | `src/lib/cards.ts` + 其他消费 CardMetadata 的文件 | 如有直接引用 JaWordMetadata / EnWordMetadata 的地方，改为 WordMetadata | 低：grep 全仓检查 |
| 5 | tsc / build / 冒烟测试 | 导入一个日语 apkg 验证数据结构不变；构造一个英语 apkg 测试 EN_VOCAB_MAP | — |

---

## 7. 验证标准

1. **日语回归**：重新导入现有 eggrolls-JLPT10k-v3.apkg，front/back/pos/reading/example 等字段与重构前完全一致
2. **英语映射**：构造或找一个英语 apkg（Word/Phonetic/PoS/Definition/Example 字段），导入后 metadata 出现 `phonetic`、`pos`、`example` 等语义字段，不再是 `field_2`, `field_3`
3. **通用语义映射**：随便放一个自定义模型（字段含「例文」「音声」「同義語」等中文/日文名），导入后能被识别成 example/audio/synonyms
4. **类型检查通过**：`tsc --noEmit` 无错
5. **构建通过**：`npm run build` 无错

---

## 8. 范围外（暂不做）

- 已导入旧数据的 SQL migration 迁移（实际不需要，key 名没改）
- 前端 UI 重新设计 / 布局美化（仅改动字段读取逻辑，不改动样式）
- 新增日语/英语以外的第三语言
