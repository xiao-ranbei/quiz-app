import { useEffect, useRef, useState } from "react";
import { Plus, X, Sparkles, FileUp } from "lucide-react";
import type { Deck, Lang, CardType, CardInput } from "../../types";
import { LANG_LABEL, CARD_TYPE_LABEL } from "../../types";
import { insertCard, insertCardsBulk, getDecks, createDeck } from "../../lib/cards";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/authStore";
import { toast } from "../../store/toastStore";

// ============================================================
// 类型与常量
// ============================================================

type ActiveTab = "single" | "batch" | "ai";

// 单卡表单字段定义
interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
  textarea?: boolean;
}

const defaultSingleForm = {
  deckId: "",
  lang: "ja" as Lang,
  cardType: "word" as CardType,
  front: "",
  back: "",
  reading: "",
  romaji: "",
  phonetic: "",
  pos: "",
  example: "",
  example_zh: "",
  translation: "",
  notes: "",
  tags: "",
};

// AI 生成结果项（可编辑）
interface AiCardItem {
  front: string;
  back: string;
  metadata: Record<string, unknown>;
  tags: string[];
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 根据 lang + cardType 返回需要渲染的 metadata 字段
 */
function getMetadataFields(lang: Lang, cardType: CardType): FieldDef[] {
  if (cardType === "word") {
    // 统一字段（日语/英语通用），按语言调整 label 和 placeholder
    const isJa = lang === "ja";
    return [
      isJa
        ? { key: "reading", label: "假名注音", placeholder: "ねこ" }
        : { key: "phonetic", label: "音标", placeholder: "/əˈbændən/" },
      { key: "pos", label: "词性", placeholder: isJa ? "名詞 / 動詞" : "verb / noun" },
      { key: "example", label: isJa ? "日语例句" : "英语例句", placeholder: isJa ? "猫は寝ている。" : "Don't abandon hope.", textarea: true },
      { key: "example_zh", label: "中文翻译", placeholder: "猫在睡觉。", textarea: true },
    ];
  }
  if (cardType === "grammar") {
    return [
      { key: "example", label: lang === "ja" ? "日语例句" : "英语例句", textarea: true },
      { key: "example_zh", label: "中文翻译", textarea: true },
      { key: "notes", label: "用法备注", textarea: true },
    ];
  }
  // sentence
  return [
    { key: "translation", label: "翻译", textarea: true },
    { key: "notes", label: "备注", textarea: true },
  ];
}

/**
 * 从单卡表单构造 metadata 对象（仅包含非空字段）
 */
function buildMetadata(form: typeof defaultSingleForm): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  const stringFields: (keyof typeof defaultSingleForm)[] = [
    "reading",
    "romaji",
    "phonetic",
    "pos",
    "example",
    "example_zh",
    "translation",
    "notes",
  ];
  for (const f of stringFields) {
    const v = form[f];
    if (typeof v === "string" && v.trim()) meta[f] = v.trim();
  }
  return meta;
}

/**
 * 解析 tags 字符串（逗号分隔）
 */
function parseTags(tagsStr: string): string[] {
  return tagsStr
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * 校验单个批量导入项
 */
function validateBatchItem(item: unknown): string[] {
  const errors: string[] = [];
  if (typeof item !== "object" || item === null) {
    errors.push("该项不是有效对象");
    return errors;
  }
  const obj = item as Record<string, unknown>;
  if (!obj.front || typeof obj.front !== "string") errors.push("front 必填");
  if (!obj.back || typeof obj.back !== "string") errors.push("back 必填");
  return errors;
}

/**
 * 简单 CSV 解析
 * - 首行为表头，逗号分隔
 * - tags 字段以 | 分隔
 * - metadata 字段按 JSON 字符串解析
 */
function parseCsv(text: string): Record<string, unknown>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      if (h === "tags") {
        obj[h] = values[i]?.split("|").map((t) => t.trim()).filter(Boolean) ?? [];
      } else if (h === "metadata") {
        try {
          obj[h] = JSON.parse(values[i] || "{}");
        } catch {
          obj[h] = {};
        }
      } else {
        obj[h] = values[i] ?? "";
      }
    });
    return obj;
  });
}

// ============================================================
// 主组件
// ============================================================

export default function AddCard() {
  const { user, loading: authLoading } = useAuthStore();

  // 通用状态
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>("");
  const [showNewDeckForm, setShowNewDeckForm] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("single");
  const [msg, setMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 单卡表单
  const [form, setForm] = useState(defaultSingleForm);

  // 批量导入
  const [batchText, setBatchText] = useState("");
  const [batchErrors, setBatchErrors] = useState<string[]>([]);
  const [batchParsed, setBatchParsed] = useState<Record<string, unknown>[] | null>(null);
  const [batchInvalidRows, setBatchInvalidRows] = useState<number[]>([]);

  // AI 生成
  const [aiTopic, setAiTopic] = useState("");
  const [aiCount, setAiCount] = useState(10);
  const [aiLang, setAiLang] = useState<Lang>("ja");
  const [aiCardType, setAiCardType] = useState<CardType>("word");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCards, setAiCards] = useState<AiCardItem[] | null>(null);

  const toastedRef = useRef(false);
  useEffect(() => {
    if (!authLoading && !user && !toastedRef.current) {
      toastedRef.current = true;
      toast.warning('请先登录后添加卡片');
    }
  }, [authLoading, user]);

  // 加载牌组列表
  useEffect(() => {
    if (!user) return;
    getDecks({ creator_id: user.id }).then(setDecks).catch(() => {
      // 忽略错误，保持空列表
    });
  }, [user]);

  if (!user) {
    return (
      <div className="py-16 text-center">
        <div className="text-lg text-theme-secondary mb-2">请先登录</div>
        <p className="text-sm text-theme-muted mb-6">登录后才能添加卡片。</p>
      </div>
    );
  }

  // ------------------------------------------------------------
  // 新建牌组
  // ------------------------------------------------------------
  const handleCreateDeck = async () => {
    if (!newDeckName.trim()) return;
    setMsg(null);
    try {
      const deck = await createDeck({
        name: newDeckName.trim(),
        lang: activeTab === "single" ? form.lang : aiLang,
        card_type: activeTab === "single" ? form.cardType : aiCardType,
        visibility: "private",
      });
      setDecks((prev) => [deck, ...prev]);
      setSelectedDeckId(deck.id);
      setNewDeckName("");
      setShowNewDeckForm(false);
      setMsg(`牌组 "${deck.name}" 已创建`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "创建牌组失败");
    }
  };

  // ------------------------------------------------------------
  // 单卡录入
  // ------------------------------------------------------------
  const submitSingle = async () => {
    setMsg(null);
    if (!form.deckId) {
      setMsg("请选择目标牌组");
      return;
    }
    if (!form.front.trim() || !form.back.trim()) {
      setMsg("请填写 front 和 back");
      return;
    }
    setSubmitting(true);
    try {
      await insertCard({
        deck_id: form.deckId,
        front: form.front.trim(),
        back: form.back.trim(),
        metadata: buildMetadata(form),
        tags: parseTags(form.tags),
      });
      setMsg("卡片已添加");
      // 清空 front/back 与 metadata 字段，保留 deckId/lang/cardType
      setForm((f) => ({
        ...defaultSingleForm,
        deckId: f.deckId,
        lang: f.lang,
        cardType: f.cardType,
      }));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  // ------------------------------------------------------------
  // 批量导入：解析 + 校验
  // ------------------------------------------------------------
  const handleParseBatch = () => {
    setMsg(null);
    setBatchErrors([]);
    setBatchParsed(null);
    setBatchInvalidRows([]);

    const text = batchText.trim();
    if (!text) {
      setMsg("请输入要解析的数据");
      return;
    }

    let items: Record<string, unknown>[] = [];

    // 简单 CSV 检测：以 front,back 开头
    if (text.startsWith("front,back")) {
      try {
        items = parseCsv(text);
      } catch (e) {
        setMsg(e instanceof Error ? `CSV 解析失败：${e.message}` : "CSV 解析失败");
        return;
      }
    } else {
      try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          setMsg("JSON 必须是数组格式，用 [ ... ] 包裹");
          return;
        }
        items = parsed as Record<string, unknown>[];
      } catch (e) {
        setMsg(e instanceof Error ? `JSON 解析失败：${e.message}` : "JSON 解析失败");
        return;
      }
    }

    if (items.length === 0) {
      setMsg("未解析到任何数据行");
      return;
    }

    const allErrors: string[] = [];
    const invalidRows: number[] = [];
    items.forEach((item, idx) => {
      const errs = validateBatchItem(item);
      if (errs.length) {
        invalidRows.push(idx);
        errs.forEach((er) => allErrors.push(`第 ${idx + 1} 行：${er}`));
      }
    });

    setBatchParsed(items);
    setBatchInvalidRows(invalidRows);
    if (allErrors.length > 0) {
      setBatchErrors(allErrors);
      setMsg(`解析完成：${items.length} 行，其中 ${invalidRows.length} 行有错误`);
    } else {
      setMsg(`解析完成：${items.length} 行全部通过校验`);
    }
  };

  // ------------------------------------------------------------
  // 批量导入：写入数据库
  // ------------------------------------------------------------
  const submitBatch = async () => {
    setMsg(null);
    if (!selectedDeckId) {
      setMsg("请选择目标牌组");
      return;
    }
    if (!batchParsed || batchParsed.length === 0) {
      setMsg("请先点击「解析」按钮");
      return;
    }
    if (batchInvalidRows.length > 0) {
      setMsg("存在校验失败的行，请修正后再导入");
      return;
    }
    setSubmitting(true);
    try {
      const cardInputs: CardInput[] = batchParsed.map((item) => ({
        deck_id: selectedDeckId,
        front: String(item.front).trim(),
        back: String(item.back).trim(),
        metadata: (item.metadata as Record<string, unknown>) ?? {},
        tags: Array.isArray(item.tags)
          ? (item.tags as string[]).map((t) => String(t).trim()).filter(Boolean)
          : [],
      }));
      const inserted = await insertCardsBulk(cardInputs);
      setMsg(`成功导入 ${inserted.length} 张卡片`);
      setBatchText("");
      setBatchParsed(null);
      setBatchErrors([]);
      setBatchInvalidRows([]);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "导入失败");
    } finally {
      setSubmitting(false);
    }
  };

  // ------------------------------------------------------------
  // AI 生成
  // ------------------------------------------------------------
  const handleAIGenerate = async () => {
    setMsg(null);
    if (!aiTopic.trim()) {
      setMsg("请输入主题");
      return;
    }
    if (aiCount < 1 || aiCount > 50) {
      setMsg("数量需在 1-50 之间");
      return;
    }
    setAiLoading(true);
    setAiCards(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-generate-cards", {
        body: {
          topic: aiTopic.trim(),
          lang: aiLang,
          card_type: aiCardType,
          count: aiCount,
        },
      });
      if (error) throw new Error(error.message);
      // 兼容多种返回结构
      const cardsRaw: unknown = (data as { cards?: unknown }).cards
        ?? (data as { data?: unknown }).data
        ?? (Array.isArray(data) ? data : null);
      if (!Array.isArray(cardsRaw)) {
        throw new Error("AI 返回数据格式异常");
      }
      const cards: AiCardItem[] = (cardsRaw as Record<string, unknown>[]).map((c) => ({
        front: String(c.front ?? "").trim(),
        back: String(c.back ?? "").trim(),
        metadata: (c.metadata as Record<string, unknown>) ?? {},
        tags: Array.isArray(c.tags) ? (c.tags as string[]).map(String) : [],
      }));
      setAiCards(cards);
      setMsg(`AI 生成完成，共 ${cards.length} 张`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "AI 生成失败");
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiCardChange = (idx: number, field: "front" | "back", value: string) => {
    setAiCards((prev) => {
      if (!prev) return prev;
      return prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c));
    });
  };

  const handleAiImport = async () => {
    setMsg(null);
    if (!selectedDeckId) {
      setMsg("请选择目标牌组");
      return;
    }
    if (!aiCards || aiCards.length === 0) {
      setMsg("没有可导入的卡片");
      return;
    }
    // 过滤掉 front/back 为空的卡片
    const valid = aiCards.filter((c) => c.front.trim() && c.back.trim());
    if (valid.length === 0) {
      setMsg("所有卡片的 front/back 都为空，无法导入");
      return;
    }
    setSubmitting(true);
    try {
      const cardInputs: CardInput[] = valid.map((c) => ({
        deck_id: selectedDeckId,
        front: c.front.trim(),
        back: c.back.trim(),
        metadata: c.metadata,
        tags: c.tags,
      }));
      const inserted = await insertCardsBulk(cardInputs);
      setMsg(`成功导入 ${inserted.length} 张卡片`);
      setAiCards(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "导入失败");
    } finally {
      setSubmitting(false);
    }
  };

  // ------------------------------------------------------------
  // 渲染辅助：牌组选择器（单卡/AI/批量共用）
  // ------------------------------------------------------------
  const renderDeckSelector = (value: string, onChange: (v: string) => void) => (
    <div>
      <label htmlFor="deckSelect" className="block text-sm text-theme-secondary mb-1.5">
        目标牌组
      </label>
      <div className="flex gap-2">
        <select
          id="deckSelect"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input-theme flex-1"
        >
          <option value="">选择牌组</option>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowNewDeckForm((s) => !s)}
          className="px-3 py-2 text-xs bg-brand-600 hover:bg-brand-500 text-white rounded-md flex items-center gap-1 whitespace-nowrap"
        >
          <Plus className="w-3 h-3" /> 新建牌组
        </button>
      </div>
      {showNewDeckForm && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={newDeckName}
            onChange={(e) => setNewDeckName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateDeck()}
            placeholder="新牌组名称"
            className="input-theme flex-1 text-sm"
            autoFocus
          />
          <button
            type="button"
            onClick={handleCreateDeck}
            className="px-3 py-1.5 text-xs bg-brand-600 hover:bg-brand-500 text-white rounded-md"
          >
            创建
          </button>
          <button
            type="button"
            onClick={() => {
              setShowNewDeckForm(false);
              setNewDeckName("");
            }}
            className="p-1.5 text-theme-muted hover:text-theme-secondary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );

  // ------------------------------------------------------------
  // 渲染
  // ------------------------------------------------------------
  const tabs: { key: ActiveTab; label: string }[] = [
    { key: "single", label: "单卡录入" },
    { key: "batch", label: "批量导入" },
    { key: "ai", label: "AI 生成" },
  ];

  const metadataFields = getMetadataFields(form.lang, form.cardType);

  return (
    <div className="py-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-theme-primary mb-1">添加卡片</h1>
      <p className="text-sm text-theme-muted mb-4">
        通过单卡录入、批量导入或 AI 生成三种方式向牌组添加卡片。
      </p>

      <div className="rounded-xl border border-theme bg-theme-card p-5">
        {/* Tab 切换 */}
        <div className="flex border-b border-theme mb-4">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setMsg(null);
                setBatchErrors([]);
              }}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.key
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-theme-muted hover:text-theme-secondary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ========== 单卡录入 ========== */}
        {activeTab === "single" && (
          <div>
            <div className="grid md:grid-cols-3 gap-3 mb-4">
              {renderDeckSelector(form.deckId, (v) => setForm({ ...form, deckId: v }))}
              <div>
                <label htmlFor="cardLang" className="block text-sm text-theme-secondary mb-1.5">
                  语言
                </label>
                <select
                  id="cardLang"
                  value={form.lang}
                  onChange={(e) => setForm({ ...form, lang: e.target.value as Lang })}
                  className="input-theme w-full"
                >
                  <option value="ja">{LANG_LABEL.ja}</option>
                  <option value="en">{LANG_LABEL.en}</option>
                </select>
              </div>
              <div>
                <label htmlFor="cardType" className="block text-sm text-theme-secondary mb-1.5">
                  卡片类型
                </label>
                <select
                  id="cardType"
                  value={form.cardType}
                  onChange={(e) => setForm({ ...form, cardType: e.target.value as CardType })}
                  className="input-theme w-full"
                >
                  <option value="word">{CARD_TYPE_LABEL.word}</option>
                  <option value="grammar">{CARD_TYPE_LABEL.grammar}</option>
                  <option value="sentence">{CARD_TYPE_LABEL.sentence}</option>
                </select>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3 mb-4">
              <div>
                <label htmlFor="cardFront" className="block text-sm text-theme-secondary mb-1.5">
                  Front（正面）
                </label>
                <input
                  id="cardFront"
                  value={form.front}
                  onChange={(e) => setForm({ ...form, front: e.target.value })}
                  placeholder={form.lang === "ja" ? "猫" : "abandon"}
                  className="input-theme w-full"
                />
              </div>
              <div>
                <label htmlFor="cardBack" className="block text-sm text-theme-secondary mb-1.5">
                  Back（背面）
                </label>
                <input
                  id="cardBack"
                  value={form.back}
                  onChange={(e) => setForm({ ...form, back: e.target.value })}
                  placeholder="猫 / 放弃"
                  className="input-theme w-full"
                />
              </div>
            </div>

            {/* 动态 metadata 字段 */}
            <div className="grid md:grid-cols-2 gap-3 mb-4">
              {metadataFields.map((field) => (
                <div key={field.key}>
                  <label htmlFor={`meta-${field.key}`} className="block text-sm text-theme-secondary mb-1.5">
                    {field.label}
                  </label>
                  {field.textarea ? (
                    <textarea
                      id={`meta-${field.key}`}
                      rows={2}
                      value={(form as Record<string, string>)[field.key] ?? ""}
                      onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                      placeholder={field.placeholder}
                      className="input-theme w-full"
                    />
                  ) : (
                    <input
                      id={`meta-${field.key}`}
                      value={(form as Record<string, string>)[field.key] ?? ""}
                      onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                      placeholder={field.placeholder}
                      className="input-theme w-full"
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="mb-4">
              <label htmlFor="cardTags" className="block text-sm text-theme-secondary mb-1.5">
                标签（逗号分隔）
              </label>
              <input
                id="cardTags"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="JLPT-N5, 动物"
                className="input-theme w-full"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={submitSingle}
                disabled={submitting}
                className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium disabled:opacity-60"
              >
                {submitting ? "提交中..." : "添加卡片"}
              </button>
              {msg && <span className="text-sm text-theme-muted">{msg}</span>}
            </div>
          </div>
        )}

        {/* ========== 批量导入 ========== */}
        {activeTab === "batch" && (
          <div>
            <div className="mb-4">
              {renderDeckSelector(selectedDeckId, setSelectedDeckId)}
            </div>

            <div className="mb-4">
              <label htmlFor="batchText" className="block text-sm text-theme-secondary mb-1.5">
                JSON 数组 或 CSV 文本
              </label>
              <textarea
                id="batchText"
                rows={12}
                value={batchText}
                onChange={(e) => {
                  setBatchText(e.target.value);
                  setBatchErrors([]);
                  setBatchParsed(null);
                  setBatchInvalidRows([]);
                }}
                placeholder={`支持两种格式：

JSON：
[
  { "front": "猫", "back": "猫", "metadata": { "reading": "ねこ", "pos": "名詞" }, "tags": ["JLPT-N5"] },
  { "front": "犬", "back": "狗", "metadata": { "reading": "いぬ" } }
]

CSV（首行表头，tags 用 | 分隔）：
front,back,reading,pos,example,example_zh,tags
猫,猫,ねこ,名詞,猫は寝ている。,猫在睡觉。,JLPT-N5|动物
犬,狗,いぬ,inu,JLPT-N5|动物`}
                className={`input-theme w-full font-mono text-sm ${
                  batchInvalidRows.length > 0 ? "border-rose-500" : ""
                }`}
              />
            </div>

            {batchErrors.length > 0 && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30">
                <div className="text-sm font-medium text-rose-600 mb-2">验证错误：</div>
                <ul className="text-xs text-rose-700 space-y-1 max-h-32 overflow-y-auto">
                  {batchErrors.map((error, idx) => (
                    <li key={idx} className="list-disc list-inside">{error}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="text-xs text-theme-muted bg-theme-input rounded p-3 mb-4">
              <div className="font-semibold mb-1">格式说明：</div>
              <ul className="list-disc list-inside space-y-1">
                <li>JSON 数组：每项必须有 <code>front</code> 和 <code>back</code>，可选 <code>metadata</code>、<code>tags</code></li>
                <li>CSV：首行表头以 <code>front,back</code> 开头；<code>tags</code> 用 <code>|</code> 分隔；<code>metadata</code> 用 JSON 字符串</li>
                <li>失败行将在文本框显示红色边框提示</li>
              </ul>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleParseBatch}
                disabled={submitting}
                className="px-5 py-2.5 bg-theme-input hover:bg-theme-muted text-theme-secondary rounded-lg text-sm font-medium border border-theme disabled:opacity-60 flex items-center gap-1.5"
              >
                <FileUp className="w-4 h-4" /> 解析 & 校验
              </button>
              <button
                onClick={submitBatch}
                disabled={submitting || !batchParsed || batchInvalidRows.length > 0}
                className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium disabled:opacity-60"
              >
                {submitting ? "导入中..." : `导入到牌组${batchParsed ? `（${batchParsed.length}）` : ""}`}
              </button>
              {msg && <span className="text-sm text-theme-muted">{msg}</span>}
            </div>
          </div>
        )}

        {/* ========== AI 生成 ========== */}
        {activeTab === "ai" && (
          <div>
            <div className="mb-4">
              {renderDeckSelector(selectedDeckId, setSelectedDeckId)}
            </div>

            <div className="mb-4">
              <label htmlFor="aiTopic" className="block text-sm text-theme-secondary mb-1.5">
                主题描述
              </label>
              <textarea
                id="aiTopic"
                rows={3}
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                placeholder={"例如：\n- JLPT N3 动词\n- 英语商务高频词\n- 日语 N2 语法点 〜について"}
                className="input-theme w-full"
              />
            </div>

            <div className="grid md:grid-cols-3 gap-3 mb-4">
              <div>
                <label htmlFor="aiCount" className="block text-sm text-theme-secondary mb-1.5">
                  数量（1-50）
                </label>
                <input
                  id="aiCount"
                  type="number"
                  min={1}
                  max={50}
                  value={aiCount}
                  onChange={(e) => setAiCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                  className="input-theme w-full"
                />
              </div>
              <div>
                <label htmlFor="aiLang" className="block text-sm text-theme-secondary mb-1.5">
                  语言
                </label>
                <select
                  id="aiLang"
                  value={aiLang}
                  onChange={(e) => setAiLang(e.target.value as Lang)}
                  className="input-theme w-full"
                >
                  <option value="ja">{LANG_LABEL.ja}</option>
                  <option value="en">{LANG_LABEL.en}</option>
                </select>
              </div>
              <div>
                <label htmlFor="aiCardType" className="block text-sm text-theme-secondary mb-1.5">
                  卡片类型
                </label>
                <select
                  id="aiCardType"
                  value={aiCardType}
                  onChange={(e) => setAiCardType(e.target.value as CardType)}
                  className="input-theme w-full"
                >
                  <option value="word">{CARD_TYPE_LABEL.word}</option>
                  <option value="grammar">{CARD_TYPE_LABEL.grammar}</option>
                  <option value="sentence">{CARD_TYPE_LABEL.sentence}</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={handleAIGenerate}
                disabled={aiLoading}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                {aiLoading ? "AI 生成中..." : "生成卡片"}
              </button>
              {msg && <span className="text-sm text-theme-muted">{msg}</span>}
            </div>

            {aiCards && aiCards.length > 0 && (
              <div className="border border-theme rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm text-theme-secondary font-medium">
                    AI 生成结果（{aiCards.length} 张，可编辑 front/back）
                  </label>
                  <button
                    onClick={handleAiImport}
                    disabled={submitting}
                    className="px-3 py-1.5 text-xs bg-brand-600 hover:bg-brand-500 text-white rounded-md disabled:opacity-60"
                  >
                    {submitting ? "导入中..." : "导入到牌组"}
                  </button>
                </div>
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-theme-muted border-b border-theme">
                        <th className="px-2 py-1.5 w-10">#</th>
                        <th className="px-2 py-1.5">Front</th>
                        <th className="px-2 py-1.5">Back</th>
                        <th className="px-2 py-1.5">Tags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiCards.map((c, idx) => (
                        <tr key={idx} className="border-b border-theme/50 align-top">
                          <td className="px-2 py-1.5 text-theme-muted">{idx + 1}</td>
                          <td className="px-2 py-1.5">
                            <input
                              value={c.front}
                              onChange={(e) => handleAiCardChange(idx, "front", e.target.value)}
                              className="input-theme w-full text-sm"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              value={c.back}
                              onChange={(e) => handleAiCardChange(idx, "back", e.target.value)}
                              className="input-theme w-full text-sm"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-xs text-theme-muted">
                            {c.tags.length > 0 ? c.tags.join(", ") : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="text-xs text-theme-muted bg-theme-input rounded p-3">
              <div className="font-semibold mb-1">使用说明：</div>
              <ul className="list-disc list-inside space-y-1">
                <li>调用后端 <code>ai-generate-cards</code> Edge Function 生成卡片</li>
                <li>主题描述越具体，生成质量越高</li>
                <li>生成结果以表格展示，每行的 front/back 均可直接编辑</li>
                <li>点击「导入到牌组」会将所有有效卡片批量写入所选牌组</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
