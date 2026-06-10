import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DIFFICULTY_LABEL, TYPE_LABEL } from '../types';
import type { Category, Difficulty, Question, QuestionType } from '../types';
import { getCategories, getQuestions, deleteQuestion, isCurrentUserAdmin } from '../lib/questions';
import CategoryFilter from '../components/CategoryFilter';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

export default function Questions() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [type, setType] = useState<QuestionType | ''>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    getCategories().then(setCategories);
    isCurrentUserAdmin().then(setIsAdmin);
  }, []);

  useEffect(() => {
    setLoading(true);
    getQuestions({
      categoryId: categoryId || undefined,
      difficulty: difficulty || undefined,
      type: type || undefined,
      keyword: keyword || undefined,
    })
      .then(setQuestions)
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
                  <div className="mt-3 text-sm text-theme-muted">
                    答案：<span className="text-emerald-700 dark:text-emerald-300">{q.answer}</span>
                  </div>
                  {q.explanation && (
                    <div className="mt-2 text-sm text-theme-muted">解析：{q.explanation}</div>
                  )}
                </div>
                {isAdmin && (
                  <button
                    onClick={() => handleDelete(q.id)}
                    disabled={deletingId === q.id}
                    className="shrink-0 px-3 py-1.5 text-xs rounded-md bg-rose-600/80 hover:bg-rose-600 text-white disabled:opacity-50"
                  >
                    {deletingId === q.id ? '删除中...' : '删除'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
