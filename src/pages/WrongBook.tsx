import { useEffect, useState } from 'react';
import type { Question, WrongBookItem } from '../types';
import { DIFFICULTY_LABEL } from '../types';
import { getWrongBook, toggleWrongBookMastered } from '../lib/questions';
import { useAuthStore } from '../store/authStore';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

export default function WrongBook() {
  const { user, loading: authLoading } = useAuthStore();
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
        <div className="text-lg text-theme-secondary mb-2">请先登录</div>
        <p className="text-sm text-theme-muted mb-6">错题本功能仅对登录用户可用。</p>
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

  return (
    <div className="py-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-theme-primary mb-1">错题本</h1>
      <p className="text-sm text-theme-muted mb-6">
        共 {items.length} 条记录，未掌握 {items.filter((i) => !i.mastered).length} 条
      </p>

      <div className="flex flex-wrap gap-3 items-center mb-6">
        <label className="inline-flex items-center gap-2 text-sm text-theme-secondary">
          <input
            type="checkbox"
            checked={onlyNotMastered}
            onChange={(e) => setOnlyNotMastered(e.target.checked)}
            className="accent-brand-500"
          />
          只看未掌握
        </label>
      </div>

      {errorMsg && <div className="text-sm text-rose-500 mb-3">{errorMsg}</div>}

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
                className="rounded-lg border border-theme bg-theme-card p-4"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-theme-muted mb-2">
                  <span className="px-2 py-0.5 rounded bg-theme-input text-theme-secondary">
                    {DIFFICULTY_LABEL[q.difficulty]}
                  </span>
                  <span className="text-rose-600 dark:text-rose-400">错误 {item.wrong_count} 次</span>
                  <span className="text-theme-muted">
                    最近：{new Date(item.last_wrong_at).toLocaleString('zh-CN')}
                  </span>
                  <button
                    onClick={() => toggle(item.id, item.mastered)}
                    className={`px-2 py-0.5 rounded text-xs ml-auto border ${
                      item.mastered
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                        : 'bg-theme-input border-theme text-theme-secondary hover:bg-theme-hover'
                    }`}
                  >
                    {item.mastered ? '✓ 已掌握' : '标记掌握'}
                  </button>
                </div>
                <div className="text-theme-primary leading-relaxed whitespace-pre-wrap">{q.question}</div>
                <div className="mt-3 text-sm text-theme-muted">
                  答案：<span className="text-emerald-600 dark:text-emerald-300">{q.answer}</span>
                </div>
                {q.explanation && (
                  <div className="mt-2 text-sm text-theme-muted">解析：{q.explanation}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
