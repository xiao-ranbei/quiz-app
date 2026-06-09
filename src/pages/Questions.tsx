import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DIFFICULTY_LABEL, TYPE_LABEL } from '../types';
import type { Category, Difficulty, Question, QuestionType } from '../types';
import { getCategories, getQuestions } from '../lib/questions';
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

  useEffect(() => {
    getCategories().then(setCategories);
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

  const catMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.id, c.name);
    return m;
  }, [categories]);

  return (
    <div className="py-8">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 mb-1">题库</h1>
          <p className="text-sm text-slate-400">按分类和难度筛选，共 {questions.length} 题</p>
        </div>
        <Link
          to="/practice"
          className="hidden md:inline-block px-4 py-2 text-sm bg-brand-600 hover:bg-brand-500 text-white rounded-md"
        >
          开始练习
        </Link>
      </div>

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
              className="rounded-lg bg-slate-800/60 border border-slate-700 p-4 hover:border-slate-600 transition-colors"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-2">
                <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-200">
                  {TYPE_LABEL[q.type]}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-200">
                  {DIFFICULTY_LABEL[q.difficulty]}
                </span>
                {q.category_id && catMap.has(q.category_id) && (
                  <span className="px-2 py-0.5 rounded bg-brand-900/60 text-brand-200 border border-brand-800">
                    {catMap.get(q.category_id)}
                  </span>
                )}
              </div>
              <div className="text-slate-100 leading-relaxed whitespace-pre-wrap">
                {q.question}
              </div>
              <div className="mt-3 text-sm text-slate-400">
                答案：<span className="text-emerald-300">{q.answer}</span>
              </div>
              {q.explanation && (
                <div className="mt-2 text-sm text-slate-400">解析：{q.explanation}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
