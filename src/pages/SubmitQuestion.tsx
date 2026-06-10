import { useEffect, useState } from "react";
import type { Category, Difficulty, QuestionType } from "../types";
import { DIFFICULTY_LABEL, TYPE_LABEL } from "../types";
import { insertQuestion, insertQuestionsBulk, getCategories } from "../lib/questions";
import { useAuthStore } from "../store/authStore";
import { generateQuestions } from "../lib/ai";

type OptionsInput = { A: string; B: string; C: string; D: string; E?: string; F?: string };

const defaults = {
  categoryId: "",
  difficulty: 1 as Difficulty,
  type: "choice" as QuestionType,
  question: "",
  options: { A: "", B: "", C: "", D: "", E: "", F: "" } as OptionsInput,
  answer: "",
  explanation: "",
};

interface BatchQuestion {
  category_id?: string;
  difficulty: Difficulty;
  type: QuestionType;
  question: string;
  options?: string[];
  answer: string;
  explanation?: string;
}

export default function SubmitQuestion() {
  const { user } = useAuthStore();
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeTab, setActiveTab] = useState<"single" | "batch" | "ai">("single");
  const [form, setForm] = useState(defaults);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [batchJson, setBatchJson] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string>("");
  const [batchErrors, setBatchErrors] = useState<string[]>([]);

  useEffect(() => {
    getCategories().then(setCategories);
  }, []);

  if (!user) {
    return (
      <div className="py-16 text-center">
        <div className="text-lg text-theme-secondary mb-2">请先登录</div>
        <p className="text-sm text-theme-muted mb-6">登录后才能提交题目。</p>
      </div>
    );
  }

  const submitSingle = async () => {
    setMsg(null);
    if (!form.categoryId || !form.question.trim() || !form.answer.trim()) {
      setMsg("请填写分类、题目与答案");
      return;
    }
    if (form.type === "choice" && !Object.values(form.options).filter(Boolean).length) {
      setMsg("选择题请至少填写一个选项");
      return;
    }
    if (form.type === "multiple" && !Object.values(form.options).filter(Boolean).length) {
      setMsg("多选题请至少填写一个选项");
      return;
    }
    setSubmitting(true);
    try {
      const options: Record<string, string> = {};
      if (form.type === "choice" || form.type === "multiple") {
        const vals = Object.values(form.options)
          .map((v) => v.trim())
          .filter(Boolean);
        vals.forEach((v, i) => {
          const key = String.fromCharCode(65 + i);
          options[key] = v;
        });
      }
      await insertQuestion({
        category_id: form.categoryId,
        difficulty: form.difficulty,
        type: form.type,
        question: form.question.trim(),
        options: Object.keys(options).length ? options : undefined,
        answer: form.answer.trim().toUpperCase().replace(/[^A-F]/g, ""),
        explanation: form.explanation.trim() || undefined,
      });
      setMsg("题目已提交");
      setForm(defaults);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const validateBatchItem = (item: unknown, index: number): string[] => {
    const errors: string[] = [];
    if (typeof item !== "object" || item === null) {
      errors.push(`第 ${index + 1} 项不是有效的对象`);
      return errors;
    }
    const q = item as BatchQuestion;
    if (!q.type || !["choice", "multiple", "fill"].includes(q.type)) {
      errors.push(`第 ${index + 1} 项：type 必须是 "choice"、"multiple" 或 "fill"`);
    }
    if (!q.question?.trim()) {
      errors.push(`第 ${index + 1} 项：question 不能为空`);
    }
    if (!q.answer?.trim()) {
      errors.push(`第 ${index + 1} 项：answer 不能为空`);
    }
    if ((q.type === "choice" || q.type === "multiple") && (!q.options || !Array.isArray(q.options) || q.options.length === 0)) {
      errors.push(`第 ${index + 1} 项：选择题和多选题必须提供 options 数组`);
    }
    if (q.difficulty && (q.difficulty < 1 || q.difficulty > 3)) {
      errors.push(`第 ${index + 1} 项：difficulty 必须是 1、2 或 3`);
    }
    return errors;
  };

  const submitBatch = async () => {
    setMsg(null);
    setBatchErrors([]);
    if (!batchJson.trim()) {
      setMsg("请输入 JSON 数据");
      return;
    }
    setSubmitting(true);
    try {
      const items: unknown[] = JSON.parse(batchJson);
      if (!Array.isArray(items)) {
        setMsg("JSON 必须是数组格式");
        return;
      }
      if (items.length === 0) {
        setMsg("数组不能为空");
        return;
      }
      const allErrors: string[] = [];
      items.forEach((item, index) => {
        const errors = validateBatchItem(item, index);
        if (errors.length) {
          allErrors.push(...errors);
        }
      });
      if (allErrors.length > 0) {
        setBatchErrors(allErrors);
        setMsg(`发现 ${allErrors.length} 个验证错误`);
        return;
      }
      const questions = (items as BatchQuestion[]).map((item) => ({
        ...item,
        category_id: item.category_id || form.categoryId,
        difficulty: item.difficulty || form.difficulty,
        answer: item.answer.trim().toUpperCase().replace(/[^A-F]/g, ""),
        options: item.options
          ? item.options.reduce((acc, opt, idx) => {
              acc[String.fromCharCode(65 + idx)] = opt;
              return acc;
            }, {} as Record<string, string>)
          : undefined,
      }));
      await insertQuestionsBulk(questions);
      setMsg(`成功导入 ${questions.length} 道题目`);
      setBatchJson("");
      setBatchErrors([]);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "JSON 解析失败或导入出错");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAIGenerate = async () => {
    setMsg(null);
    if (!aiPrompt.trim()) {
      setMsg("请输入出题提示");
      return;
    }
    setAiLoading(true);
    try {
      const result = await generateQuestions({
        prompt: aiPrompt,
        count: 5,
        categoryId: form.categoryId || undefined,
      });
      setAiResult(result);
      setMsg("AI 生成完成");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "AI 生成失败，请检查个人中心的 API 配置");
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiResultImport = () => {
    if (!aiResult.trim()) return;
    setBatchJson(aiResult);
    setActiveTab("batch");
  };

  const tabs = [
    { key: "single", label: "单题提交" },
    { key: "batch", label: "批量导入" },
    { key: "ai", label: "AI 出题" },
  ];

  const allOptionKeys = form.type === "multiple" ? ["A", "B", "C", "D", "E", "F"] : ["A", "B", "C", "D"];

  return (
    <div className="py-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-theme-primary mb-1">贡献题目</h1>
      <p className="text-sm text-theme-muted mb-6">
        你也可以在个人中心配置 AI，然后使用 AI 辅助生成题目或补充解析。
      </p>

      <div className="rounded-xl border border-theme bg-theme-card p-5">
        <div className="flex border-b border-theme mb-4">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key as typeof activeTab);
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

        {activeTab === "single" && (
          <div>
            <div className="grid md:grid-cols-3 gap-3 mb-4">
              <div>
                <label htmlFor="categoryId" className="block text-sm text-theme-secondary mb-1.5">
                  分类
                </label>
                <select
                  id="categoryId"
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  className="input-theme w-full"
                >
                  <option value="">选择分类</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="difficulty" className="block text-sm text-theme-secondary mb-1.5">
                  难度
                </label>
                <select
                  id="difficulty"
                  value={form.difficulty}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      difficulty: Number(e.target.value) as Difficulty,
                    })
                  }
                  className="input-theme w-full"
                >
                  {([1, 2, 3] as Difficulty[]).map((d) => (
                    <option key={d} value={d}>
                      {DIFFICULTY_LABEL[d]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="questionType" className="block text-sm text-theme-secondary mb-1.5">
                  题型
                </label>
                <select
                  id="questionType"
                  value={form.type}
                  onChange={(e) =>
                    setForm({ ...form, type: e.target.value as QuestionType })
                  }
                  className="input-theme w-full"
                >
                  <option value="choice">{TYPE_LABEL.choice}</option>
                  <option value="multiple">{TYPE_LABEL.multiple}</option>
                  <option value="fill">{TYPE_LABEL.fill}</option>
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label htmlFor="questionContent" className="block text-sm text-theme-secondary mb-1.5">
                题目
              </label>
              <textarea
                id="questionContent"
                rows={4}
                value={form.question}
                onChange={(e) => setForm({ ...form, question: e.target.value })}
                placeholder={form.type === "fill" ? "填空题：_____等于42。" : "下列哪个是正确的..."}
                className="input-theme w-full"
              />
            </div>

            {(form.type === "choice" || form.type === "multiple") && (
              <div className="grid md:grid-cols-2 gap-3 mb-4">
                {allOptionKeys.map((key) => (
                  <div key={key}>
                    <label htmlFor={`option-${key}`} className="block text-sm text-theme-secondary mb-1">
                      选项 {key}
                    </label>
                    <input
                      id={`option-${key}`}
                      value={form.options[key]}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          options: { ...form.options, [key]: e.target.value },
                        })
                      }
                      placeholder={`选项 ${key}`}
                      className="input-theme w-full"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-3 mb-4">
              <div>
                <label htmlFor="answer" className="block text-sm text-theme-secondary mb-1.5">
                  答案{form.type === "choice" ? "（A/B/C/D）" : form.type === "multiple" ? "（多选答案如：ABD）" : ""}
                </label>
                <input
                  id="answer"
                  value={form.answer}
                  onChange={(e) => setForm({ ...form, answer: e.target.value.toUpperCase() })}
                  placeholder={form.type === "fill" ? "填空的答案" : form.type === "multiple" ? "ABD" : "B"}
                  className="input-theme w-full"
                />
              </div>
              <div>
                <label htmlFor="explanation" className="block text-sm text-theme-secondary mb-1.5">
                  解析（可选）
                </label>
                <input
                  id="explanation"
                  value={form.explanation}
                  onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                  placeholder="为什么这个答案是对的"
                  className="input-theme w-full"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={submitSingle}
                disabled={submitting}
                className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium disabled:opacity-60"
              >
                {submitting ? "提交中..." : "提交题目"}
              </button>
              {msg && <span className="text-sm text-theme-muted">{msg}</span>}
            </div>
          </div>
        )}

        {activeTab === "batch" && (
          <div>
            <div className="grid md:grid-cols-3 gap-3 mb-4">
              <div>
                <label htmlFor="batchCategory" className="block text-sm text-theme-secondary mb-1.5">
                  默认分类
                </label>
                <select
                  id="batchCategory"
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  className="input-theme w-full"
                >
                  <option value="">选择分类（可选）</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="batchDifficulty" className="block text-sm text-theme-secondary mb-1.5">
                  默认难度
                </label>
                <select
                  id="batchDifficulty"
                  value={form.difficulty}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      difficulty: Number(e.target.value) as Difficulty,
                    })
                  }
                  className="input-theme w-full"
                >
                  {([1, 2, 3] as Difficulty[]).map((d) => (
                    <option key={d} value={d}>
                      {DIFFICULTY_LABEL[d]}
                    </option>
                  ))}
                </select>
              </div>
              <div></div>
            </div>

            <div className="mb-4">
              <label htmlFor="batchJson" className="block text-sm text-theme-secondary mb-1.5">
                JSON 数据
              </label>
              <textarea
                id="batchJson"
                rows={12}
                value={batchJson}
                onChange={(e) => {
                  setBatchJson(e.target.value);
                  setBatchErrors([]);
                }}
                placeholder={`[
  {
    "type": "choice",
    "question": "问题内容",
    "options": ["选项A", "选项B", "选项C", "选项D"],
    "answer": "A",
    "explanation": "解析（可选）"
  },
  {
    "type": "multiple",
    "question": "多选题：以下哪些是正确的？",
    "options": ["选项A", "选项B", "选项C", "选项D"],
    "answer": "ABD",
    "difficulty": 2
  },
  {
    "type": "fill",
    "question": "填空题：_____是答案",
    "answer": "正确答案"
  }
]`}
                className="input-theme w-full font-mono text-sm"
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
              <div className="font-semibold mb-1">JSON 格式说明：</div>
              <ul className="list-disc list-inside space-y-1">
                <li><code>type</code>: 必填，<code>"choice"</code>（单选）、<code>"multiple"</code>（多选）或 <code>"fill"</code>（填空）</li>
                <li><code>question</code>: 必填，题目内容</li>
                <li><code>options</code>: 选择题/多选题必填，选项数组</li>
                <li><code>answer</code>: 必填，答案（单选填 A/B/C/D；多选填如 ABD；填空填具体答案）</li>
                <li><code>difficulty</code>: 可选，1-3，默认使用上方选择</li>
                <li><code>category_id</code>: 可选，分类ID，默认使用上方选择</li>
                <li><code>explanation</code>: 可选，解析内容</li>
              </ul>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={submitBatch}
                disabled={submitting}
                className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium disabled:opacity-60"
              >
                {submitting ? "导入中..." : "批量导入"}
              </button>
              {msg && <span className="text-sm text-theme-muted">{msg}</span>}
            </div>
          </div>
        )}

        {activeTab === "ai" && (
          <div>
            <div className="mb-4">
              <label htmlFor="aiPrompt" className="block text-sm text-theme-secondary mb-1.5">
                出题提示
              </label>
              <textarea
                id="aiPrompt"
                rows={4}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="请描述你想要的题目类型，例如：
- 生成5道关于 JavaScript 的选择题
- 生成10道关于 React Hooks 的中等难度题目
- 生成关于 TypeScript 类型系统的题目，包含单选题和多选题"
                className="input-theme w-full"
              />
            </div>

            <div className="grid md:grid-cols-3 gap-3 mb-4">
              <div>
                <label htmlFor="aiCategory" className="block text-sm text-theme-secondary mb-1.5">
                  目标分类（可选）
                </label>
                <select
                  id="aiCategory"
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  className="input-theme w-full"
                >
                  <option value="">不指定分类</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="aiDifficulty" className="block text-sm text-theme-secondary mb-1.5">
                  难度（可选）
                </label>
                <select
                  id="aiDifficulty"
                  value={form.difficulty}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      difficulty: Number(e.target.value) as Difficulty,
                    })
                  }
                  className="input-theme w-full"
                >
                  <option value="0">由 AI 决定</option>
                  {([1, 2, 3] as Difficulty[]).map((d) => (
                    <option key={d} value={d}>
                      {DIFFICULTY_LABEL[d]}
                    </option>
                  ))}
                </select>
              </div>
              <div></div>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={handleAIGenerate}
                disabled={aiLoading}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium disabled:opacity-60"
              >
                {aiLoading ? "AI 思考中..." : "让 AI 出题"}
              </button>
              {msg && <span className="text-sm text-theme-muted">{msg}</span>}
            </div>

            {aiResult && (
              <div className="border border-theme rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm text-theme-secondary font-medium">AI 生成结果</label>
                  <button
                    onClick={handleAiResultImport}
                    className="text-sm text-brand-600 hover:underline"
                  >
                    导入到批量提交
                  </button>
                </div>
                <textarea
                  rows={10}
                  value={aiResult}
                  readOnly
                  className="input-theme w-full font-mono text-sm"
                />
              </div>
            )}

            <div className="mt-4 text-xs text-theme-muted bg-theme-input rounded p-3">
              <div className="font-semibold mb-1">使用说明：</div>
              <ul className="list-disc list-inside space-y-1">
                <li>需要在个人中心配置 AI API Key 才能使用此功能</li>
                <li>提示语越详细，生成的题目质量越高</li>
                <li>生成的题目会包含题目、选项、答案和解析</li>
                <li>点击"导入到批量提交"可直接导入生成的题目</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
