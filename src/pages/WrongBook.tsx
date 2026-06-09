import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Question, WrongBookItem } from '../types';
import { DIFFICULTY_LABEL, TYPE_LABEL } from '../types';
import { getWrongBook, toggleWrongBookMastered } from '../lib/questions';
import { useAuthStore } from '../store/authStore';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

export default function WrongBook() {
  const { user, loading: authLoading } = useAuthStore();
  const navigate = useNavigate();
  const [items, setItems] = useState<WrongBookItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [onlyNotMastered, setOnlyNotMastered] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (authLoading || !user) return;
    setLoading(true);
    getWrongBook(user.id)
      .then(setItems)
      .catch((e) => setErrorMsg(e.message))
      .finally(() => setLoading(false));
  }, [user, authLoading]);

  if (authLoading) return <Loading label="检查登录状态..." />;

  if (!user) {
    return (
      <div className="py-16 text-center">
        <div className="text-lg text-slate-200 mb-2">请先登录</div>
        <p className="text-sm text-slate-400 mb-6">错题本功能仅对登录用户可用。</p>
        <Link
          to="/login"
          className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm"
        >
          去登录
        </Link>
      </div>
    );
  }

  const visible = items.filter((i) => (onlyNotMastered ? !i.mastered : true));

  const toggle = async (id: string, mastered: boolean) => {
    try {
      await toggleWrongBookMastered(id, !mastered);
      setItems((prev) =>
        prev.map((p) => (p.id === id ? { ...p, mastered: !p.mastered } : p)),
      );
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '操作失败');
    }
  };

  const goPracticeWrong = () => {
    if (visible.length === 0) return;
    // 将错题 ID 作为参数打开练习模式（简单方案：存到 localStorage，在 Practice 中读取）
    const ids = visible.map((v) => (v.question as Question).id).join(',');
    localStorage.setItem('practice_wrong_ids', ids);
    navigate('/practice');
  };

  return (
    <div className="py-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-100 mb-1">错题本</h1>
      <p className="text-sm text-slate-400 mb-6">
        共 {items.length} 条记录，未掌握 {items.filter((i) => !i.mastered).length} 条
      </p>

      <div className="flex flex-wrap gap-3 items-center mb-6">
        <label className="inline-flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={onlyNotMastered}
            onChange={(e) => setOnlyNotMastered(e.target.checked)}
            className="accent-brand-500"
          />
          只看未掌握
        </label>
        <button
          onClick={goPracticeWrong}
          disabled={visible.length === 0}
          className="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-500 text-white rounded-md disabled:opacity-50"
        >
          批量重做错题
        </button>
      </div>

      {errorMsg && <div className="text-sm text-rose-400 mb-3">{errorMsg}</div>}

      {loading ? (
        <Loading />
      ) : visible.length === 0 ? (
        <EmptyState
          title={items.length === 0 ? '暂无错题记录' : '已全部掌握 ✓'}
          hint={items.length === 0 ? '去练习模式或考试模式做题吧' : '做得不错，继续加油'}
        />
      ) : (
        <div className="space-y-3">
          {visible.map((item) => {
            const q = item.question as Question | undefined;
            if (!q) return null;
            return (
              <div
                key={item.id}
                className="rounded-lg bg-slate-800/60 border border-slate-700 p-4"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-2">
                  <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-200">
                    {TYPE_LABEL[q.type]}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-200">
                    {DIFFICULTY_LABEL[q.difficulty]}
                  </span>
                  <span className="text-rose-300">错误 {item.wrong_count} 次</span>
                  <span className="text-slate-500">
                    最近：{new Date(item.last_wrong_at).toLocaleString('zh-CN')}
                  </span>
                  <button
                    onClick={() => toggle(item.id, item.mastered)}
                    className={`px-2 py-0.5 rounded text-xs ml-auto ${
                      item.mastered
                        ? 'bg-emerald-800/60 text-emerald-200 border border-emerald-700'
                        : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                    }`}
                  >
                    {item.mastered ? '✓ 已掌握' : '标记掌握'}
                  </button>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
