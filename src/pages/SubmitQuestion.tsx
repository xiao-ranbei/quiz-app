import { useEffect, useState } from 'react';
import type { Category, Difficulty, QuestionType } from '../types';
import { DIFFICULTY_LABEL, TYPE_LABEL } from '../types';
import { insertQuestion, getCategories } from '../lib/questions';
import { useAuthStore } from '../store/authStore';

type OptionsInput = { A: string; B: string; C: string; D: string };

const defaults = {
  categoryId: '',
  difficulty: 1 as Difficulty,
  type: 'choice' as QuestionType,
  question: '',
  options: { A: '', B: '', C: '', D: '' } as OptionsInput,
  answer: '',
  explanation: '',
};

export default function SubmitQuestion() {
  const { user } = useAuthStore();
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState(defaults);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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

  const submit = async () => {
    setMsg(null);
    if (!form.categoryId || !form.question.trim() || !form.answer.trim()) {
      setMsg('请填写分类、题目与答案');
      return;
    }
    setSubmitting(true);
    try {
      const options =
        form.type === 'choice'
          ? (Object.values(form.options)
              .map((v) => v.trim())
              .filter(Boolean) as string[])
          : [];
      await insertQuestion({
        category_id: form.categoryId,
        difficulty: form.difficulty,
        type: form.type,
        question: form.question.trim(),
        options,
        answer: form.answer.trim(),
        explanation: form.explanation.trim() || undefined,
      });
      setMsg('题目已提交');
      setForm(defaults);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="py-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-theme-primary mb-1">提交题目</h1>
      <p className="text-sm text-theme-muted mb-6">
        你也可以在个人中心配置 AI，然后在下面使用 AI 辅助生成题目或补充解析。
      </p>

      <div className="rounded-xl border border-theme bg-theme-card p-5">
        <div className="grid md:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-sm text-theme-secondary mb-1.5">分类</label>
            <select
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
            <label className="block text-sm text-theme-secondary mb-1.5">难度</label>
            <select
              value={form.difficulty}
              onChange={(e) =>
                setForm({ ...form, difficulty: Number(e.target.value) as Difficulty })
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
            <label className="block text-sm text-theme-secondary mb-1.5">题型</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as QuestionType })}
              className="input-theme w-full"
            >
              <option value="choice">{TYPE_LABEL.choice}</option>
              <option value="fill">{TYPE_LABEL.fill}</option>
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-theme-secondary mb-1.5">题目</label>
          <textarea
            rows={4}
            value={form.question}
            onChange={(e) => setForm({ ...form, question: e.target.value })}
            placeholder={form.type === 'choice' ? '下列哪个是正确的...' : '填空题：_____等于42。'}
            className="input-theme w-full"
          />
        </div>

        {form.type === 'choice' && (
          <div className="grid md:grid-cols-2 gap-3 mb-4">
            {(['A', 'B', 'C', 'D'] as const).map((key) => (
              <input
                key={key}
                value={form.options[key]}
                onChange={(e) =>
                  setForm({ ...form, options: { ...form.options, [key]: e.target.value } })
                }
                placeholder={`选项 ${key}`}
                className="input-theme"
              />
            ))}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-sm text-theme-secondary mb-1.5">
              答案{form.type === 'choice' ? '（A / B / C / D）' : ''}
            </label>
            <input
              value={form.answer}
              onChange={(e) => setForm({ ...form, answer: e.target.value })}
              placeholder={form.type === 'choice' ? 'B' : '填空的答案'}
              className="input-theme w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-theme-secondary mb-1.5">解析（可选）</label>
            <input
              value={form.explanation}
              onChange={(e) => setForm({ ...form, explanation: e.target.value })}
              placeholder="为什么这个答案是对的"
              className="input-theme w-full"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={submitting}
            className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium disabled:opacity-60"
          >
            {submitting ? '提交中...' : '提交题目'}
          </button>
          {msg && <span className="text-sm text-theme-muted">{msg}</span>}
        </div>
      </div>
    </div>
  );
}
