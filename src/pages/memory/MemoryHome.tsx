import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlarmClock,
  Brain,
  CheckCircle2,
  Globe,
  GraduationCap,
  Layers,
  Lock,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import {
  createDeck,
  getDeckStats,
  getDecks,
  getUserMemoryStats,
} from '../../lib/cards';
import { useAuthStore } from '../../store/authStore';
import Loading from '../../components/Loading';
import type {
  CardType,
  Deck,
  DeckInput,
  DeckStats,
  Lang,
  MemoryStats,
  Visibility,
} from '../../types';
import {
  CARD_TYPE_LABEL,
  LANG_LABEL,
  VISIBILITY_LABEL,
} from '../../types';

// 牌组卡片所需的进度信息
interface DeckWithProgress extends Deck {
  mastered: number;
  total: number;
  percent: number;
}

// 新建牌组表单的初始值
const EMPTY_FORM: DeckInput = {
  name: '',
  description: '',
  lang: 'ja',
  card_type: 'word',
  visibility: 'private',
};

export default function MemoryHome() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [myDecks, setMyDecks] = useState<DeckWithProgress[]>([]);
  const [publicDecks, setPublicDecks] = useState<DeckWithProgress[]>([]);
  const [loading, setLoading] = useState(true);

  // 新建牌组弹窗状态
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<DeckInput>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  // 并行获取每个牌组的 stats，计算掌握进度
  const fetchProgress = async (decks: Deck[]): Promise<DeckWithProgress[]> => {
    const statsArr = await Promise.all(
      decks.map((d) => getDeckStats(d.id).catch(() => null)),
    );
    return decks.map((d, i) => {
      const s: DeckStats | null = statsArr[i];
      const mastered = s?.mastered ?? 0;
      const total = s?.total ?? 0;
      const percent = total > 0 ? Math.round((mastered / total) * 100) : 0;
      return { ...d, mastered, total, percent };
    });
  };

  // 加载页面数据：整体统计 + 我的牌组 + 公共牌组
  const loadData = async () => {
    setLoading(true);
    try {
      const [memoryStats, myDeckList, publicDeckList] = await Promise.all([
        getUserMemoryStats(),
        user
          ? getDecks({ creator_id: user.id })
          : Promise.resolve([] as Deck[]),
        getDecks({ visibility: 'public' }),
      ]);
      setStats(memoryStats);

      // getDecks({ creator_id }) 返回「公开 + 本人私有」，
      // 这里再按 creator_id 过滤，确保「我的牌组」只展示本人创建的
      const myOwn = myDeckList.filter((d) => d.creator_id === user?.id);
      setMyDecks(await fetchProgress(myOwn));
      setPublicDecks(await fetchProgress(publicDeckList));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // 提交新建牌组
  const handleCreate = async () => {
    if (!form.name.trim()) {
      setCreateMsg('请填写牌组名称');
      return;
    }
    setCreating(true);
    setCreateMsg(null);
    try {
      await createDeck({
        name: form.name.trim(),
        description: form.description?.trim() || undefined,
        lang: form.lang,
        card_type: form.card_type,
        visibility: form.visibility,
      });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      await loadData();
    } catch (e) {
      setCreateMsg(e instanceof Error ? e.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const closeCreate = () => {
    setShowCreate(false);
    setForm(EMPTY_FORM);
    setCreateMsg(null);
  };

  // 渲染单张牌组卡片
  const renderDeckCard = (deck: DeckWithProgress) => (
    <button
      key={deck.id}
      onClick={() => navigate(`/memory/deck/${deck.id}`)}
      className="text-left rounded-xl bg-theme-card border border-theme p-4 hover:border-brand-500 hover:shadow-sm transition"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="font-semibold text-theme-primary line-clamp-1">
          {deck.name}
        </div>
        {deck.visibility === 'public' ? (
          <Globe className="w-4 h-4 text-theme-muted shrink-0" />
        ) : (
          <Lock className="w-4 h-4 text-theme-muted shrink-0" />
        )}
      </div>

      {deck.description && (
        <div className="text-xs text-theme-muted line-clamp-2 mb-2">
          {deck.description}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className="px-2 py-0.5 text-xs rounded bg-brand-500/10 text-brand-600 dark:text-brand-300">
          {LANG_LABEL[deck.lang]}
        </span>
        <span className="px-2 py-0.5 text-xs rounded bg-theme-input text-theme-secondary">
          {CARD_TYPE_LABEL[deck.card_type]}
        </span>
        <span className="px-2 py-0.5 text-xs rounded bg-theme-input text-theme-secondary">
          {VISIBILITY_LABEL[deck.visibility]}
        </span>
      </div>

      {/* 进度条：已掌握 / 总数 */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full bg-theme-input overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${deck.percent}%` }}
          />
        </div>
        <div className="text-xs text-theme-muted whitespace-nowrap">
          {deck.mastered}/{deck.total}
        </div>
      </div>
    </button>
  );

  // 渲染空状态
  const renderEmpty = (text: string) => (
    <div className="rounded-xl border border-dashed border-theme bg-theme-card p-6 text-center text-sm text-theme-muted">
      {text}
    </div>
  );

  return (
    <div className="py-8 md:py-12">
      {/* 标题 + 新建按钮 */}
      <section className="flex items-end justify-between mb-8 max-w-5xl mx-auto">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-theme-primary mb-1 flex items-center gap-2">
            <Brain className="w-7 h-7 text-brand-600 dark:text-brand-300" />
            背诵模块
          </h1>
          <p className="text-sm text-theme-muted">
            基于 SM-2 间隔重复算法，管理你的单词 / 语法 / 短句牌组。
          </p>
        </div>
        {user ? (
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-500 text-white rounded-md flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-4 h-4" /> 新建牌组
          </button>
        ) : (
          <button
            disabled
            className="px-4 py-2 text-sm bg-theme-card border border-theme text-theme-muted rounded-md cursor-not-allowed shrink-0"
          >
            登录后创建
          </button>
        )}
      </section>

      {/* 顶部仪表盘：三张统计卡 */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto mb-10">
        <div className="rounded-xl bg-theme-card border border-theme p-5 text-center">
          <div className="flex items-center justify-center mb-1">
            <AlarmClock className="w-7 h-7 text-amber-600 dark:text-amber-300" />
          </div>
          <div className="text-3xl font-bold text-amber-600 dark:text-amber-300 mb-1">
            {loading || !stats ? '—' : stats.dueToday}
          </div>
          <div className="text-sm text-theme-muted">今日待复习</div>
        </div>
        <div className="rounded-xl bg-theme-card border border-theme p-5 text-center">
          <div className="flex items-center justify-center mb-1">
            <Sparkles className="w-7 h-7 text-brand-600 dark:text-brand-300" />
          </div>
          <div className="text-3xl font-bold text-brand-600 dark:text-brand-300 mb-1">
            {loading || !stats ? '—' : stats.newToday}
          </div>
          <div className="text-sm text-theme-muted">今日新卡</div>
        </div>
        <div className="rounded-xl bg-theme-card border border-theme p-5 text-center">
          <div className="flex items-center justify-center mb-1">
            <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-300" />
          </div>
          <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-300 mb-1">
            {loading || !stats ? '—' : stats.mastered}
          </div>
          <div className="text-sm text-theme-muted">已掌握</div>
        </div>
      </section>

      {loading && <Loading />}

      {/* 我的牌组（仅登录用户） */}
      {!loading && user && (
        <section className="max-w-5xl mx-auto mt-6">
          <h2 className="text-lg font-semibold text-theme-secondary mb-3 flex items-center gap-2">
            <Layers className="w-5 h-5" /> 我的牌组
          </h2>
          {myDecks.length === 0
            ? renderEmpty('还没有牌组，点击右上角新建')
            : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {myDecks.map(renderDeckCard)}
              </div>
            )}
        </section>
      )}

      {/* 公共牌组 */}
      {!loading && (
        <section className="max-w-5xl mx-auto mt-10">
          <h2 className="text-lg font-semibold text-theme-secondary mb-3 flex items-center gap-2">
            <Globe className="w-5 h-5" /> 公共牌组
          </h2>
          {publicDecks.length === 0
            ? renderEmpty('暂无公共牌组')
            : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {publicDecks.map(renderDeckCard)}
              </div>
            )}
        </section>
      )}

      {/* 新建牌组弹窗 */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeCreate}
        >
          <div
            className="w-full max-w-md rounded-xl bg-theme-card border border-theme shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-theme">
              <h3 className="font-semibold text-theme-primary flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-brand-600 dark:text-brand-300" />
                新建牌组
              </h3>
              <button
                onClick={closeCreate}
                className="p-1.5 text-theme-muted hover:text-theme-secondary"
                aria-label="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* 名称 */}
              <div>
                <label className="block text-sm text-theme-secondary mb-1">
                  名称 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="如：N3 核心词汇"
                  className="input-theme"
                  autoFocus
                />
              </div>

              {/* 描述 */}
              <div>
                <label className="block text-sm text-theme-secondary mb-1">
                  描述 <span className="text-theme-muted text-xs">（可选）</span>
                </label>
                <textarea
                  value={form.description ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="简要描述这个牌组的内容"
                  rows={2}
                  className="input-theme resize-none"
                />
              </div>

              {/* 语言 */}
              <div>
                <label className="block text-sm text-theme-secondary mb-1">
                  语言
                </label>
                <div className="flex gap-2">
                  {(Object.keys(LANG_LABEL) as Lang[]).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setForm({ ...form, lang: l })}
                      className={`flex-1 px-3 py-2 text-sm rounded-md border transition ${
                        form.lang === l
                          ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-300'
                          : 'border-theme text-theme-secondary hover:bg-theme-hover'
                      }`}
                    >
                      {LANG_LABEL[l]}
                    </button>
                  ))}
                </div>
              </div>

              {/* 类型 */}
              <div>
                <label className="block text-sm text-theme-secondary mb-1">
                  类型
                </label>
                <div className="flex gap-2">
                  {(Object.keys(CARD_TYPE_LABEL) as CardType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm({ ...form, card_type: t })}
                      className={`flex-1 px-3 py-2 text-sm rounded-md border transition ${
                        form.card_type === t
                          ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-300'
                          : 'border-theme text-theme-secondary hover:bg-theme-hover'
                      }`}
                    >
                      {CARD_TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* 可见性 */}
              <div>
                <label className="block text-sm text-theme-secondary mb-1">
                  可见性
                </label>
                <div className="flex gap-2">
                  {(Object.keys(VISIBILITY_LABEL) as Visibility[]).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setForm({ ...form, visibility: v })}
                      className={`flex-1 px-3 py-2 text-sm rounded-md border transition flex items-center justify-center gap-1.5 ${
                        form.visibility === v
                          ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-300'
                          : 'border-theme text-theme-secondary hover:bg-theme-hover'
                      }`}
                    >
                      {v === 'public' ? (
                        <Globe className="w-3.5 h-3.5" />
                      ) : (
                        <Lock className="w-3.5 h-3.5" />
                      )}
                      {VISIBILITY_LABEL[v]}
                    </button>
                  ))}
                </div>
              </div>

              {createMsg && (
                <div className="text-sm text-rose-600 dark:text-rose-300">
                  {createMsg}
                </div>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="flex justify-end gap-2 p-4 border-t border-theme">
              <button
                onClick={closeCreate}
                disabled={creating}
                className="px-4 py-2 text-sm rounded-md border border-theme text-theme-secondary hover:bg-theme-hover disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50"
              >
                {creating ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
