import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, ListChecks, Plus, Sparkles, Trash2, Trophy, X } from 'lucide-react';
import {
  getCategories,
  getQuestionCount,
  getCategoryQuestionCounts,
  insertCategory,
  deleteCategory,
  isCurrentUserAdmin,
} from '../lib/questions';
import { useAuthStore } from '../store/authStore';
import Loading from '../components/Loading';
import type { Category } from '../types';

export default function Home() {
  const { user } = useAuthStore();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Map<string, number>>(new Map());
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [deletingCat, setDeletingCat] = useState<string | null>(null);
  const [catMsg, setCatMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [cats, cnt, counts, admin] = await Promise.all([
          getCategories(),
          getQuestionCount(),
          getCategoryQuestionCounts(),
          isCurrentUserAdmin(),
        ]);
        setCategories(cats);
        setTotal(cnt);
        setCategoryCounts(counts);
        setIsAdmin(admin);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    setCatMsg(null);
    try {
      const cat = await insertCategory(newCatName.trim());
      setCategories((prev) => [...prev, cat]);
      setNewCatName('');
      setShowAddCat(false);
      setCatMsg(`分类 "${cat.name}" 已创建`);
    } catch (e) {
      setCatMsg(e instanceof Error ? e.message : '创建失败');
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    const count = categoryCounts.get(cat.id) || 0;
    if (count > 0) {
      setCatMsg(`分类 "${cat.name}" 下还有 ${count} 道题目，不能删除`);
      return;
    }
    if (!confirm(`确定删除分类 "${cat.name}"？`)) return;
    setDeletingCat(cat.id);
    setCatMsg(null);
    try {
      await deleteCategory(cat.id);
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      setCatMsg(`分类 "${cat.name}" 已删除`);
    } catch (e) {
      setCatMsg(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeletingCat(null);
    }
  };

  const nonEmptyCategories = categories.filter((c) => (categoryCounts.get(c.id) || 0) > 0);

  return (
    <div className="py-8 md:py-12">
      <section className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-theme-primary mb-3">
          高效刷题 · <span className="text-brand-600 dark:text-brand-300">AI 辅助</span>
        </h1>
        <p className="text-theme-muted max-w-xl mx-auto">
          支持单选题、多选题、填空题，按分类和难度筛选，内置练习模式和考试模式，错题本自动收录。
        </p>
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <Link
            to="/practice"
            className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium"
          >
            <span className="inline-flex items-center gap-2">
              <ListChecks className="w-4 h-4" /> 开始练习
            </span>
          </Link>
          <Link
            to="/exam"
            className="px-5 py-2.5 bg-theme-card hover:bg-theme-hover text-theme-primary rounded-lg text-sm font-medium border border-theme"
          >
            <span className="inline-flex items-center gap-2">
              <Trophy className="w-4 h-4" /> 模拟考试
            </span>
          </Link>
          <Link
            to="/submit"
            className="px-5 py-2.5 bg-theme-card hover:bg-theme-hover text-theme-primary rounded-lg text-sm font-medium border border-theme"
          >
            <span className="inline-flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> AI 出题
            </span>
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
        <div className="rounded-xl bg-theme-card border border-theme p-5 text-center">
          <div className="text-3xl text-brand-600 dark:text-brand-300 font-bold mb-1">
            {loading ? '—' : total.toLocaleString()}
          </div>
          <div className="text-sm text-theme-muted">题库题目</div>
        </div>
        <div className="rounded-xl bg-theme-card border border-theme p-5 text-center">
          <div className="text-3xl text-emerald-700 dark:text-emerald-300 font-bold mb-1">
            {loading ? '—' : nonEmptyCategories.length}
          </div>
          <div className="text-sm text-theme-muted">题目分类</div>
        </div>
        <div className="rounded-xl bg-theme-card border border-theme p-5 text-center">
          <div className="text-3xl text-amber-600 dark:text-amber-300 font-bold mb-1 flex items-center gap-2 justify-center">
            <ClipboardCheck className="w-7 h-7" />
          </div>
          <div className="text-sm text-theme-muted">可在个人中心配置 AI 解析</div>
        </div>
      </section>

      {!loading && nonEmptyCategories.length > 0 && (
        <section className="max-w-4xl mx-auto mt-10">
          <h2 className="text-lg font-semibold text-theme-secondary mb-3">快速练习</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {nonEmptyCategories.slice(0, 6).map((c) => {
              const count = categoryCounts.get(c.id) || 0;
              return (
                <Link
                  key={c.id}
                  to={`/practice?category=${c.id}`}
                  className="rounded-lg bg-theme-card border border-theme p-4 text-theme-secondary hover:border-brand-500 hover:text-brand-600 dark:hover:text-brand-300 text-center"
                >
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-theme-muted mt-1">{count} 题</div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {isAdmin && !loading && (
        <section className="max-w-4xl mx-auto mt-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-theme-secondary">分类管理</h2>
            <button
              onClick={() => setShowAddCat(true)}
              className="px-3 py-1.5 text-sm bg-brand-600 hover:bg-brand-500 text-white rounded-md flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> 新增分类
            </button>
          </div>

          {catMsg && (
            <div className="mb-3 text-sm text-theme-muted bg-theme-input rounded p-2">{catMsg}</div>
          )}

          {showAddCat && (
            <div className="mb-4 p-4 rounded-lg border border-theme bg-theme-card">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="分类名称"
                  className="input-theme flex-1"
                  autoFocus
                />
                <button
                  onClick={handleAddCategory}
                  className="px-3 py-1.5 text-sm bg-brand-600 hover:bg-brand-500 text-white rounded-md"
                >
                  创建
                </button>
                <button
                  onClick={() => {
                    setShowAddCat(false);
                    setNewCatName('');
                  }}
                  className="p-1.5 text-theme-muted hover:text-theme-secondary"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {categories.map((c) => {
              const count = categoryCounts.get(c.id) || 0;
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-theme bg-theme-card"
                >
                  <div>
                    <span className="text-theme-primary font-medium">{c.name}</span>
                    <span className="ml-2 text-xs text-theme-muted">({count} 题)</span>
                  </div>
                  <button
                    onClick={() => handleDeleteCategory(c)}
                    disabled={count > 0 || deletingCat === c.id}
                    className="p-1.5 text-rose-600 hover:bg-rose-500/10 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                    title={count > 0 ? '分类下有题目，不能删除' : '删除分类'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {loading && <Loading />}
    </div>
  );
}
