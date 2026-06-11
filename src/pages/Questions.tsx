import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Trash2, X } from 'lucide-react';
import { DIFFICULTY_LABEL, TYPE_LABEL } from '../types';
import type { Category, Difficulty, Question, QuestionType } from '../types';
import { getCategories, getQuestions, deleteQuestion, updateQuestion, isCurrentUserAdmin } from '../lib/questions';
import CategoryFilter from '../components/CategoryFilter';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

interface EditForm {
  categoryId: string;
  difficulty: Difficulty;
  type: QuestionType;
  question: string;
  options: { A: string; B: string; C: string; D: string; E?: string; F?: string };
  answer: string;
  explanation: string;
}

function QuestionEditModal({
  question,
  categories,
  onSave,
  onClose,
}: {
  question: Question;
  categories: Category[];
  onSave: (id: string, updates: Partial<Question>) => Promise<void>;
  onClose: () => void;
}) {
  const defaults = (): EditForm => {
    const opts = question.options || {};
    return {
      categoryId: question.category_id || '',
      difficulty: question.difficulty,
      type: question.type,
      question: question.question,
      options: {
        A: opts['A'] || '',
        B: opts['B'] || '',
        C: opts['C'] || '',
        D: opts['D'] || '',
        E: opts['E'] || '',
        F: opts['F'] || '',
      },
      answer: question.answer,
      explanation: question.explanation || '',
    };
  };

  const [form, setForm] = useState<EditForm>(defaults);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const allOptionKeys: (keyof EditForm['options'])[] =
    form.type === 'multiple' ? ['A', 'B', 'C', 'D', 'E', 'F'] : ['A', 'B', 'C', 'D'];

  const handleSave = async () => {
    if (!form.question.trim() || !form.answer.trim()) {
      setErr('题目和答案不能为空');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const opts: Record<string, string> = {};
      allOptionKeys.forEach((k) => {
        const v = form.options[k];
        if (v?.trim()) opts[k] = v.trim();
      });
      const updates: Partial<Question> = {
        category_id: form.categoryId || undefined,
        difficulty: form.difficulty,
        type: form.type,
        question: form.question.trim(),
        answer:
          form.type === 'fill'
            ? form.answer.trim()
            : form.answer.trim().toUpperCase().replace(/[^A-F]/g, ''),
        explanation: form.explanation.trim() || undefined,
        options: Object.keys(opts).length > 0 ? opts : undefined,
      };
      await onSave(question.id, updates);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-theme-card border border-theme shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-theme">
          <h2 className="text-lg font-semibold text-theme-primary">编辑题目</h2>
          <button onClick={onClose} className="p-1 text-theme-muted hover:text-theme-secondary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm text-theme-secondary mb-1">分类</label>
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="input-theme w-full"
              >
                <option value="">无分类</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-theme-secondary mb-1">难度</label>
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
              <label className="block text-sm text-theme-secondary mb-1">题型</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as QuestionType })}
                className="input-theme w-full"
              >
                <option value="choice">单选题</option>
                <option value="multiple">多选题</option>
                <option value="fill">填空题</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-theme-secondary mb-1">题目</label>
            <textarea
              value={form.question}
              onChange={(e) => setForm({ ...form, question: e.target.value })}
              rows={3}
              className="input-theme w-full"
            />
          </div>

          {(form.type === 'choice' || form.type === 'multiple') && (
            <div className="grid grid-cols-2 gap-3">
              {allOptionKeys.map((key) => (
                <div key={key}>
                  <label className="block text-sm text-theme-secondary mb-1">选项 {key}</label>
                  <input
                    value={form.options[key] ?? ''}
                    onChange={(e) =>
                      setForm({ ...form, options: { ...form.options, [key]: e.target.value } })
                    }
                    className="input-theme w-full"
                    placeholder={`选项 ${key}`}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-theme-secondary mb-1">
                答案
                {form.type === 'choice' ? '（A/B/C/D）' : form.type === 'multiple' ? '（如：ABD）' : ''}
              </label>
              <input
                value={form.answer}
                onChange={(e) =>
                  setForm({
                    ...form,
                    answer:
                      form.type === 'fill' ? e.target.value : e.target.value.toUpperCase(),
                  })
                }
                className="input-theme w-full"
                placeholder={form.type === 'fill' ? '填空答案' : form.type === 'multiple' ? 'ABD' : 'B'}
              />
            </div>
            <div>
              <label className="block text-sm text-theme-secondary mb-1">参考链接（可选）</label>
              <input
                value={question.reference_url || ''}
                readOnly
                className="input-theme w-full opacity-60"
                title="暂不支持编辑参考链接"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-theme-secondary mb-1">解析</label>
            <textarea
              value={form.explanation}
              onChange={(e) => setForm({ ...form, explanation: e.target.value })}
              rows={3}
              placeholder="题目解析（可选）"
              className="input-theme w-full"
            />
          </div>

          {err && (
            <div className="text-sm text-rose-600 bg-rose-500/10 rounded p-2">{err}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-theme">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-theme text-theme-secondary hover:bg-theme-hover"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-60"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Questions() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [type, setType] = useState<QuestionType | ''>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    getCategories().then(setCategories);
    isCurrentUserAdmin().then(setIsAdmin);
  }, []);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    getQuestions({
      categoryId: categoryId || undefined,
      difficulty: difficulty || undefined,
      type: type || undefined,
      keyword: keyword || undefined,
    })
      .then((qs) => {
        setQuestions(qs);
        setLoadError(null);
      })
      .catch((e) => {
        setLoadError(e instanceof Error ? e.message : '加载失败');
      })
      .finally(() => setLoading(false));
  }, [categoryId, difficulty, type, keyword]);

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    if (!confirm('确定删除该题目吗？此操作无法撤销。')) return;
    setDeletingId(id);
    setMsg(null);
    try {
      await deleteQuestion(id);
      setQuestions((qs) => qs.filter((q) => q.id !== id));
      setMsg({ ok: true, text: '题目已删除' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '删除失败' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleSave = async (id: string, updates: Partial<Question>) => {
    try {
      const updated = await updateQuestion(id, updates);
      // 保存成功后，从当前列表中替换该题目。
      // 如果修改了分类/难度/题型，导致该题不再匹配当前筛选条件，
      // useEffect 会在筛选条件变化时自动重新拉取数据。
      setQuestions((qs) => qs.map((q) => (q.id === id ? updated : q)));
      setMsg({ ok: true, text: '题目已保存' });
      // 保存后主动重新拉取一次，确保与服务器数据完全一致
      getQuestions({
        categoryId: categoryId || undefined,
        difficulty: difficulty || undefined,
        type: type || undefined,
        keyword: keyword || undefined,
      }).then(setQuestions);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '保存失败';
      setMsg({ ok: false, text: '保存失败：' + msg });
      throw e;
    }
  };

  const catMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.id, c.name);
    return m;
  }, [categories]);

  return (
    <div className="py-8 max-w-5xl mx-auto">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-theme-primary mb-1">题库</h1>
          <p className="text-sm text-theme-muted">按分类和难度筛选，共 {questions.length} 题</p>
        </div>
        <Link
          to="/practice"
          className="hidden md:inline-block px-4 py-2 text-sm bg-brand-600 hover:bg-brand-500 text-white rounded-md"
        >
          开始练习
        </Link>
      </div>

      {msg && (
        <div
          className={`mb-4 text-sm rounded-md p-3 border ${
            msg.ok
              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300'
          }`}
        >
          {msg.text}
        </div>
      )}

      <CategoryFilter
        categories={categories}
        keyword={keyword}
        onKeywordChange={setKeyword}
        selectedCategory={categoryId}
        onCategoryChange={setCategoryId}
        selectedDifficulty={difficulty}
        onDifficultyChange={setDifficulty}
        selectedType={type}
        onTypeChange={setType}
      />

      {loading ? (
        <Loading />
      ) : loadError ? (
        <EmptyState title="加载失败" hint={loadError} />
      ) : questions.length === 0 ? (
        <EmptyState title="没有符合条件的题目" hint="尝试修改筛选条件" />
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <div
              key={q.id}
              className="rounded-lg bg-theme-card border border-theme p-4 hover:border-theme-muted transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-theme-muted mb-2">
                    <span className="px-2 py-0.5 rounded bg-theme-input text-theme-secondary">
                      {TYPE_LABEL[q.type]}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-theme-input text-theme-secondary">
                      {DIFFICULTY_LABEL[q.difficulty]}
                    </span>
                    {q.category_id && catMap.has(q.category_id) && (
                      <span className="px-2 py-0.5 rounded bg-brand-500/10 border border-brand-500/30 text-brand-700 dark:text-brand-200">
                        {catMap.get(q.category_id)}
                      </span>
                    )}
                  </div>
                  <div className="text-theme-primary leading-relaxed whitespace-pre-wrap">
                    {q.question}
                  </div>
                  {q.options && (
                    <div className="mt-3 text-sm space-y-1">
                      {Object.entries(q.options).map(([k, v]) => (
                        <div key={k} className="text-theme-muted">
                          <span className="font-medium mr-2">{k}.</span>
                          {v}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 text-sm text-theme-muted">
                    答案：<span className="text-emerald-700 dark:text-emerald-300 font-medium">{q.answer}</span>
                  </div>
                  {q.explanation && (
                    <div className="mt-2 text-sm text-theme-muted">
                      <span className="font-medium">解析：</span>
                      {q.explanation}
                    </div>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={() => setEditingQuestion(q)}
                      className="p-2 text-amber-600 hover:bg-amber-500/10 rounded-md"
                      title="编辑题目"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(q.id)}
                      disabled={deletingId === q.id}
                      className="p-2 text-rose-600 hover:bg-rose-500/10 rounded-md disabled:opacity-40"
                      title="删除题目"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editingQuestion && (
        <QuestionEditModal
          question={editingQuestion}
          categories={categories}
          onSave={handleSave}
          onClose={() => setEditingQuestion(null)}
        />
      )}
    </div>
  );
}
