import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, ListChecks, Sparkles, Trophy } from 'lucide-react';
import { getCategories, getQuestionCount } from '../lib/questions';
import Loading from '../components/Loading';

export default function Home() {
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [cats, cnt] = await Promise.all([getCategories(), getQuestionCount()]);
        setCategories(cats);
        setTotal(cnt);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="py-8 md:py-12">
      <section className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-theme-primary mb-3">
          高效刷题 · <span className="text-brand-300">AI 辅助</span>
        </h1>
        <p className="text-theme-muted max-w-xl mx-auto">
          支持选择题、填空题，按分类和难度筛选，内置练习模式和考试模式，错题本自动收录。
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
            className="px-5 py-2.5 bg-theme-card hover-theme text-theme-primary rounded-lg text-sm font-medium border border-theme"
          >
            <span className="inline-flex items-center gap-2">
              <Trophy className="w-4 h-4" /> 模拟考试
            </span>
          </Link>
          <Link
            to="/submit"
            className="px-5 py-2.5 bg-theme-card hover-theme text-theme-primary rounded-lg text-sm font-medium border border-theme"
          >
            <span className="inline-flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> AI 出题
            </span>
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
        <div className="rounded-xl bg-theme-card border border-theme p-5">
          <div className="text-3xl text-brand-300 font-bold mb-1">
            {loading ? '—' : total.toLocaleString()}
          </div>
          <div className="text-sm text-theme-muted">题库题目</div>
        </div>
        <div className="rounded-xl bg-theme-card border border-theme p-5">
          <div className="text-3xl text-emerald-300 font-bold mb-1">
            {loading ? '—' : categories.length}
          </div>
          <div className="text-sm text-theme-muted">题目分类</div>
        </div>
        <div className="rounded-xl bg-theme-card border border-theme p-5">
          <div className="text-3xl text-amber-300 font-bold mb-1 flex items-center gap-2">
            <ClipboardCheck className="w-7 h-7" />
          </div>
          <div className="text-sm text-theme-muted">可在个人中心配置 AI 解析</div>
        </div>
      </section>

      {!loading && categories.length > 0 && (
        <section className="max-w-4xl mx-auto mt-10">
          <h2 className="text-lg font-semibold text-theme-secondary mb-3">快速练习</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {categories.slice(0, 6).map((c) => (
              <Link
                key={c.id}
                to={`/practice?category=${c.id}`}
                className="rounded-lg bg-theme-card border border-theme p-4 text-theme-secondary hover:border-brand-500 hover:text-brand-300"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {loading && <Loading />}
    </div>
  );
}
