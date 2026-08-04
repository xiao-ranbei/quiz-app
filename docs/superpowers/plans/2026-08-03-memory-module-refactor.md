# 背诵模块重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构背诵模块代码结构并修复空队列完成页与 RPC 越权两个 bug，全程保持现有行为与测试/类型检查全绿。

**Architecture:** 前端把 `cards.ts` 按领域拆为 `src/lib/memory/*`，把 `MemoryStudy.tsx` 按学习模式拆为独立组件；数据库侧新增一个迁移给三个 SECURITY DEFINER RPC 补牌组可见性校验；死代码与伪字段清理；被禁用的旧测试转为 vitest 套件并启用。

**Tech Stack:** React 18 / Vite / TypeScript / Zustand / Supabase (SQL, SECURITY DEFINER RPC) / Vitest / Tailwind。

**执行方式：** 用户已确认本会话内联执行（executing-plans）。

---

## 文件结构

新建：
- `src/lib/memory/user.ts` — `getCurrentUserId`
- `src/lib/memory/decks.ts` — 牌组 CRUD
- `src/lib/memory/cards.ts` — 卡片 CRUD
- `src/lib/memory/review.ts` — 学习队列 + 提交复习 RPC
- `src/lib/memory/stats.ts` — 聚合数据 + 复习历史 + 最近复习 + `fetchDeckDetailData`
- `src/lib/memory/index.ts` — barrel
- `src/store/memoryStore.test.ts` — store 测试
- `src/pages/memory/study/studyUtils.ts`、`speech.ts`、`FlashcardMode.tsx`、`ChoiceMode.tsx`、`InputMode.tsx`、`StudyComplete.tsx`
- `supabase/migrations/20260803_fix_memory_rpc_visibility.sql`

修改：
- `src/lib/cards.ts`（删除后由 memory/* 替代）
- `src/lib/questions.ts`（移除 `fetchDeckDetailData`）
- `src/store/memoryStore.ts`（空队列 bug、清遗留 import、抽 `persistCurrent`）
- `src/pages/memory/MemoryStudy.tsx`（瘦身为编排层）
- `src/pages/memory/MemoryHome.tsx` / `DeckDetail.tsx` / `AddCard.tsx` / `Profile.tsx`（import 更新）
- `src/types/index.ts`（可选字段）
- `src/lib/sm2.test.ts`、`src/lib/cache.test.ts`、`vitest.config.ts`（转标准套件）
- `src/pages/memory/MemoryStudy.test.tsx`（mock 路径 + 新用例）

删除：`src/lib/cards.ts`。

---

### Task 1: 设计文档与实施计划

**Files:**
- Create: `docs/superpowers/specs/2026-08-03-memory-module-refactor-design.md`（已完成）
- Create: `docs/superpowers/plans/2026-08-03-memory-module-refactor.md`（本文件）

- [x] 写设计文档（已完成）
- [ ] 提交文档

```bash
git add docs/superpowers
git commit -m "docs: 背诵模块重构设计文档与实施计划"
```

---

### Task 2: TDD 修复空队列完成页 bug

**Files:**
- Create: `src/store/memoryStore.test.ts`
- Modify: `src/pages/memory/MemoryStudy.test.tsx`
- Modify: `src/store/memoryStore.ts`

- [ ] **Step 1: 写失败的 store 测试**

```ts
// src/store/memoryStore.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMemoryStore } from './memoryStore';
import type { Card } from '../types';

const cardsMock = vi.hoisted(() => ({
  fetchStudyQueue: vi.fn(),
  submitReviewRpc: vi.fn(),
}));

vi.mock('../../lib/cards', () => cardsMock);

const card: Card = {
  id: 'c1', deck_id: 'deck1', front: 'ねこ', back: '猫',
  metadata: {}, tags: [], creator_id: null, created_at: '',
};

beforeEach(() => {
  useMemoryStore.getState().reset();
  vi.clearAllMocks();
});

describe('memoryStore.start', () => {
  it('空队列时 isFinished 为 false（页面应显示“今日已完成”）', async () => {
    cardsMock.fetchStudyQueue.mockResolvedValue([]);
    await useMemoryStore.getState().start('deck1', 'flashcard');
    const s = useMemoryStore.getState();
    expect(s.queue).toEqual([]);
    expect(s.isFinished).toBe(false);
    expect(s.isLoading).toBe(false);
  });

  it('start 后保存会话，reset 后 restore 可恢复进度', async () => {
    cardsMock.fetchStudyQueue.mockResolvedValue([card, { ...card, id: 'c2' }]);
    await useMemoryStore.getState().start('deck1', 'flashcard');
    useMemoryStore.getState().next();
    expect(useMemoryStore.getState().currentIndex).toBe(1);
    useMemoryStore.getState().reset();
    expect(useMemoryStore.getState().currentIndex).toBe(0);
    useMemoryStore.getState().restore();
    expect(useMemoryStore.getState().currentIndex).toBe(1);
    expect(useMemoryStore.getState().deckId).toBe('deck1');
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run src/store/memoryStore.test.ts
```
预期：第一个用例 FAIL（`isFinished` 实际为 true）。

- [ ] **Step 3: 修 `memoryStore.ts`**

`start()` 中 `isFinished: queue.length === 0` 改为 `isFinished: false`。

- [ ] **Step 4: 组件级空队列用例**

`MemoryStudy.test.tsx` 增加：

```ts
it('队列为空时显示今日已完成，而不是完成页', async () => {
  cardsMock.fetchStudyQueue.mockResolvedValue([]);
  renderStudy();
  await waitFor(() => expect(screen.getByText('今日已完成')).toBeTruthy());
  expect(screen.queryByText(/本轮完成/)).toBeNull();
});
```

- [ ] **Step 5: 运行全部测试 + typecheck**

```bash
npm test
npm run typecheck
```

- [ ] **Step 6: 提交**

```bash
git add src/store/memoryStore.ts src/store/memoryStore.test.ts src/pages/memory/MemoryStudy.test.tsx
git commit -m "fix(memory): 空队列学习显示今日已完成而非完成页"
```

---

### Task 3: 启用 sm2 / cache 旧测试

**Files:**
- Modify: `src/lib/sm2.test.ts`、`src/lib/cache.test.ts`、`vitest.config.ts`

- [ ] **Step 1: 将 `sm2.test.ts` 转为标准套件**

保留 4 个用例（首次学习、答错重置、连续答对、ease 下限），改用 `describe/it/expect` 与 `vi.useFakeTimers`/真实 Date 断言，删除文件底部 `runAllTests()`。

- [ ] **Step 2: 将 `cache.test.ts` 转为标准套件**

保留 4 个用例（命中、过期重拉、主动失效、并发去重），改用 `describe/it/expect` 与 `await`，删除底部 `runAllTests()`。

- [ ] **Step 3: 从 `vitest.config.ts` 移除 exclude 两项**

```ts
exclude: ['**/node_modules/**'],
```

- [ ] **Step 4: 验证并提交**

```bash
npm test
git add src/lib/sm2.test.ts src/lib/cache.test.ts vitest.config.ts
git commit -m "test(memory): 启用 sm2 与 cache 测试套件"
```

---

### Task 4: 删除死代码

**Files:**
- Modify: `src/lib/cards.ts`、`src/store/memoryStore.ts`、`src/pages/memory/DeckDetail.tsx`

- [ ] **Step 1: 删除 `cards.ts` 中的死函数**

删除：`getTodayReviewQueue`、`submitReview`、`getDeckStats`、`getDeckStatsBulk`、`getUserMemoryStats`、`getCards`，并清理因此不再使用的 import（`sm2`、`CardUserState`、`CardReview`、`DeckStats` 等）。

- [ ] **Step 2: 删除 `memoryStore.ts` 遗留 import 与 eslint-disable**

移除 `getTodayReviewQueue as _getTodayReviewQueueLegacy`、`submitReview as _submitReviewApiLegacy` 及对应注释和 `/* eslint-disable */`。

- [ ] **Step 3: 删除 `DeckDetail.tsx` 未使用 import**

移除 `getCards`、`getDeckStats`、`getReviewHistory`。

- [ ] **Step 4: 验证**

```bash
npm run typecheck
npm test
```

- [ ] **Step 5: 提交**

```bash
git add src/lib/cards.ts src/store/memoryStore.ts src/pages/memory/DeckDetail.tsx
git commit -m "refactor(memory): 清理死代码与未使用 import"
```

---

### Task 5: 拆分 cards.ts 到 src/lib/memory/

**Files:**
- Create: `src/lib/memory/user.ts`、`decks.ts`、`cards.ts`、`review.ts`、`stats.ts`、`index.ts`
- Modify: `src/pages/memory/MemoryHome.tsx`、`MemoryStudy.tsx`、`DeckDetail.tsx`、`AddCard.tsx`、`Profile.tsx`、`src/lib/questions.ts`、`src/pages/memory/MemoryStudy.test.tsx`、`src/store/memoryStore.test.ts`
- Delete: `src/lib/cards.ts`

- [ ] **Step 1: 按设计文档文件结构搬运函数**

`fetchDeckDetailData` 从 `questions.ts` 移入 `memory/stats.ts`；`isCurrentUserAdmin` 保持从 `questions.ts` 导出，调用方改为直接引用 `questions.ts`。

- [ ] **Step 2: 更新全部 import**

```bash
rg -l "from '.*lib/cards'" src
```
逐一改为指向 `../lib/memory/<模块>`（barrel `index.ts` 导出全部）。

- [ ] **Step 3: 更新测试 mock 路径**

`MemoryStudy.test.tsx`：改为 `vi.mock('../../lib/memory/review', ...)`（`fetchStudyQueue`）与 `vi.mock('../../lib/memory/decks', ...)`（`getDeck`）。`memoryStore.test.ts` 同步改为 `vi.mock('../../lib/memory/review', ...)`。

- [ ] **Step 4: 删除 `src/lib/cards.ts`，验证无残留引用**

```bash
rg -n "lib/cards" src
npm run typecheck
npm test
npm run build
```

- [ ] **Step 5: 提交**

```bash
git add src/lib src/pages src/store
git commit -m "refactor(memory): 拆分 cards.ts 为 memory 领域模块"
```

---

### Task 6: 拆分 MemoryStudy.tsx

**Files:**
- Create: `src/pages/memory/study/studyUtils.ts`、`speech.ts`、`FlashcardMode.tsx`、`ChoiceMode.tsx`、`InputMode.tsx`、`StudyComplete.tsx`
- Modify: `src/pages/memory/MemoryStudy.tsx`

- [ ] **Step 1: 抽公共纯函数**

`studyUtils.ts`：`shuffle`、`formatDuration`、`gradeTyping`、`getCardAudioMeta`；`speech.ts`：`supportsSpeech`、`speak`。

- [ ] **Step 2: 提取四个模式组件 + 完成页**

签名（props 最小化，作答本地状态进组件）：

```ts
// FlashcardMode
props: { card: Card; deckId: string; isFlipped: boolean; onFlip(): void; onGrade(q: number): void }
// ChoiceMode
props: { card: Card; deckId: string; options: Array<{back: string; isCorrect: boolean}>;
         onNext(quality: number, answer?: string): void }
// InputMode
props: { variant: 'typing' | 'dictation'; card: Card; deckId: string; lang: Lang;
         onNext(quality: number, answer: string): void }
// StudyComplete
props: { correctCount: number; wrongCount: number; startTime: number | null;
         onBack(): void; onRestart(): void }
```

- [ ] **Step 3: 瘦身 `MemoryStudy.tsx`**

保留：store 会话、模式降级逻辑、`choiceOptions` useMemo、进度条、notice、空/加载/错误/完成分支。用 `key={current.id + mode}` 挂载模式组件以重置本地作答状态；移除主组件内的 `userAnswer/selectedOption/isAnswered/isCorrect` state 及对应重置 effect。

- [ ] **Step 4: 增加选择题模式用例**

`MemoryStudy.test.tsx`：queue 4 张卡 → 进入 choice 模式 → 点击选项 → 出现“下一题” → 点击后推进。

- [ ] **Step 5: 验证并提交**

```bash
npm run typecheck
npm test
npm run build
git add src/pages/memory
git commit -m "refactor(memory): 按学习模式拆分 MemoryStudy"
```

---

### Task 7: 新增 RPC 越权修复迁移

**Files:**
- Create: `supabase/migrations/20260803_fix_memory_rpc_visibility.sql`

- [ ] **Step 1: 写迁移**

三个函数 `CREATE OR REPLACE`，核心改动：

```sql
-- get_study_queue：函数体开头加
IF NOT EXISTS (
  SELECT 1 FROM public.decks d
  WHERE d.id = p_deck_id
    AND (d.visibility = 'public' OR d.creator_id = v_user_id OR public.is_admin())
) THEN
  RETURN '[]'::json;
END IF;

-- get_deck_detail：deck 查询条件加可见性
-- WHERE d.id = p_deck_id
--   AND (d.visibility = 'public' OR d.creator_id = v_user_id OR public.is_admin())

-- submit_review：用户 id 获取后加
IF NOT EXISTS (
  SELECT 1 FROM public.cards c
  JOIN public.decks d ON d.id = c.deck_id
  WHERE c.id = p_card_id
    AND (d.visibility = 'public' OR d.creator_id = v_user_id OR public.is_admin())
) THEN
  RAISE EXCEPTION '卡片不存在或无权访问';
END IF;
```

其余函数体与现有版本保持一致（逐字复制现有实现，仅插入以上校验）。

- [ ] **Step 2: 静态审查**

对照 `20250733_study_queue_rpc.sql`、`20250735_page_aggregate_rpcs.sql`、`20250734_submit_review_rpc.sql` 逐字核对；`is_admin()` 仅授权给 authenticated，但 SECURITY DEFINER 函数内调用不受影响。

- [ ] **Step 3: 提交**

```bash
git add supabase/migrations/20260803_fix_memory_rpc_visibility.sql
git commit -m "fix(memory): RPC 增加牌组可见性校验，阻止私有牌组越权读取"
```

---

### Task 8: 类型解析统一

**Files:**
- Modify: `src/types/index.ts`、`src/lib/memory/stats.ts`、`src/lib/memory/review.ts`

- [ ] **Step 1: 字段可选化**

`Card.creator_id?: string | null`、`Card.created_at?: string`、`DeckWithStats.creator_id?: string | null`、`created_at?: string`、`updated_at?: string`。

- [ ] **Step 2: 替换 `as any`**

各 RPC 返回定义显式 row 类型并写 `parseDeckStats`、`parseDeckWithStats`、`parseCard` 等 parser，不再伪造 `creator_id: null` / `created_at: ''`，缺省字段不赋值。

- [ ] **Step 3: 验证并提交**

```bash
npm run typecheck
npm test
git add src/types/index.ts src/lib/memory
git commit -m "refactor(memory): 统一 RPC 返回类型解析，移除 as any 与伪造字段"
```

---

### Task 9: memoryStore 收尾

**Files:**
- Modify: `src/store/memoryStore.ts`

- [ ] **Step 1: 抽 `persistCurrent()`**

从当前 state 组装 `SessionPayload` 并 `saveSession`，`start/next/prev/setIndex` 复用。

- [ ] **Step 2: `start` catch 记录错误**

保留用户提示文案，`console.error(e)` 记录真实错误。

- [ ] **Step 3: 验证并提交**

```bash
npm test
npm run typecheck
git add src/store/memoryStore.ts
git commit -m "refactor(memory): 抽取会话持久化逻辑并记录 start 错误"
```

---

### Task 10: 最终验证

- [ ] 全量验证

```bash
npm run typecheck
npm test
npm run build
```

- [ ] 确认迁移文件存在且命名排序正确
- [ ] 确认 `rg -n "lib/cards"` 无残留（`src` 内）
- [ ] 若失败：回退修正对应任务，不跳过验证

---

### Task 11: 收尾

- [ ] 使用 finishing-a-development-branch 技能决定合并/PR 方式
