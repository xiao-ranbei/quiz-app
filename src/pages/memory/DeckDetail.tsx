import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  LANG_LABEL,
  CARD_TYPE_LABEL,
  VISIBILITY_LABEL,
  REVIEW_MODE_LABEL,
} from '../../types';
import type {
  Card,
  Deck,
  DeckStats,
  ReviewHistoryItem,
  ReviewMode,
  Visibility,
} from '../../types';
import {
  getDeck,
  getCards,
  getDeckStats,
  getReviewHistory,
  updateDeck,
  deleteDeck,
  deleteCard,
  isCurrentUserAdmin,
} from '../../lib/cards';
import { fetchDeckDetailData } from '../../lib/questions';
import { useAuthStore } from '../../store/authStore';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';

const PAGE_SIZE = 20;
const MODE_KEY = 'memory-study-mode';
const MODES: ReviewMode[] = ['flashcard', 'choice', 'typing', 'dictation'];

// ============ 编辑牌组弹窗 ============
function DeckEditModal({
  deck,
  onSave,
  onClose,
}: {
  deck: Deck;
  onSave: (updates: {
    name: string;
    description: string;
    visibility: Visibility;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(deck.name);
  const [description, setDescription] = useState(deck.description ?? '');
  const [visibility, setVisibility] = useState<Visibility>(deck.visibility);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setErr('牌组名称不能为空');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        visibility,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-theme-card border border-theme shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-theme">
          <h2 className="text-lg font-semibold text-theme-primary">编辑牌组</h2>
          <button
            onClick={onClose}
            className="p-1 text-theme-muted hover:text-theme-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-theme-secondary mb-1">牌组名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-theme w-full"
              placeholder="牌组名称"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-theme-secondary mb-1">描述（可选）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="input-theme w-full"
              placeholder="牌组描述"
            />
          </div>

          <div>
            <label className="block text-sm text-theme-secondary mb-1">可见性</label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as Visibility)}
              className="input-theme w-full"
            >
              <option value="private">私有（仅自己可见）</option>
              <option value="public">公共（所有人可见）</option>
            </select>
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

// ============ 主组件 ============
export default function DeckDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();

  // 数据状态
  const [deck, setDeck] = useState<Deck | null>(null);
  const [stats, setStats] = useState<DeckStats | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [total, setTotal] = useState(0);
  const [history, setHistory] = useState<ReviewHistoryItem[]>([]);

  // UI 状态
  const [loading, setLoading] = useState(true);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [mode, setMode] = useState<ReviewMode>(() => {
    // 优先 URL 中的 mode 参数，其次 localStorage，最后默认闪卡
    const fromUrl = searchParams.get('mode');
    if (fromUrl && MODES.includes(fromUrl as ReviewMode)) return fromUrl as ReviewMode;
    const fromStorage = localStorage.getItem(MODE_KEY);
    if (fromStorage && MODES.includes(fromStorage as ReviewMode)) return fromStorage as ReviewMode;
    return 'flashcard';
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingDeck, setEditingDeck] = useState(false);
  const [deletingDeck, setDeletingDeck] = useState(false);
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 权限判断：创建者或管理员可管理
  const isOwner = deck?.creator_id === user?.id;
  const canManage = isOwner || isAdmin;

  // 关键字搜索 300ms debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKeyword(keyword), 300);
    return () => clearTimeout(t);
  }, [keyword]);

  // 初始加载 + 卡片分页：用聚合 API 一次获取所有数据
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setCardsLoading(true);
    setLoadError(null);
    Promise.all([
      fetchDeckDetailData(id, page, PAGE_SIZE, debouncedKeyword || undefined),
      isCurrentUserAdmin(),
    ])
      .then(([detail, admin]) => {
        const { deck: d, stats: s, reviewHistory: h, cards: { data, total: t } } = detail;
        setDeck(d);
        setStats(s);
        setHistory(h);
        setCards(data);
        setTotal(t);
        setIsAdmin(admin);
        if (!d) setLoadError('牌组不存在或无权访问');
      })
      .catch((e) => {
        setLoadError(e instanceof Error ? e.message : '加载失败');
      })
      .finally(() => {
        setLoading(false);
        setCardsLoading(false);
      });
  }, [id, page, debouncedKeyword]);

  // 关键字变化时重置到第一页
  const handleKeywordChange = (kw: string) => {
    setKeyword(kw);
    setPage(1);
  };

  const handleModeChange = (m: ReviewMode) => {
    setMode(m);
    // 写入 localStorage，作为下次默认模式
    localStorage.setItem(MODE_KEY, m);
  };

  const handleStartStudy = () => {
    if (!id) return;
    navigate(`/memory/study/${id}?mode=${mode}`);
  };

  const handleAddCard = () => {
    if (!id) return;
    navigate(`/memory/add?deck_id=${id}`);
  };

  const handleDeleteDeck = async () => {
    if (!id || !deck) return;
    if (!confirm(`确定删除牌组 "${deck.name}" 吗？牌组内所有卡片都会被一并删除，且无法撤销。`)) return;
    setDeletingDeck(true);
    setMsg(null);
    try {
      await deleteDeck(id);
      navigate('/memory');
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '删除失败' });
      setDeletingDeck(false);
    }
  };

  const handleSaveDeck = async (updates: {
    name: string;
    description: string;
    visibility: Visibility;
  }) => {
    if (!id) return;
    try {
      const updated = await updateDeck(id, updates);
      setDeck(updated);
      setMsg({ ok: true, text: '牌组信息已更新' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '更新失败' });
      throw e;
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    if (!confirm('确定删除该卡片吗？此操作无法撤销。')) return;
    setDeletingCardId(cardId);
    setMsg(null);
    try {
      await deleteCard(cardId);
      setCards((cs) => cs.filter((c) => c.id !== cardId));
      setTotal((t) => Math.max(0, t - 1));
      setStats((s) =>
        s ? { ...s, total: Math.max(0, s.total - 1) } : s,
      );
      setMsg({ ok: true, text: '卡片已删除' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '删除失败' });
    } finally {
      setDeletingCardId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 柱状图最高值（用于按比例计算高度）
  const maxCount = useMemo(
    () => Math.max(1, ...history.map((h) => h.count)),
    [history],
  );

  // 格式化日期为 MM-DD
  const formatShortDate = (dateStr: string) => dateStr.slice(5);

  // ============ 渲染卡片 metadata 关键字段 ============
  const renderCardMetadata = (card: Card) => {
    const meta = card.metadata ?? {};
    const items: { label: string; value: string }[] = [];

    if (deck?.lang === 'ja') {
      // 日语：reading、romaji、example_ja
      const m = meta as { reading?: string; romaji?: string; example_ja?: string };
      if (m.reading) items.push({ label: '读音', value: m.reading });
      if (m.romaji) items.push({ label: '罗马音', value: m.romaji });
      if (m.example_ja) items.push({ label: '例句', value: m.example_ja });
    } else if (deck?.lang === 'en') {
      // 英语：phonetic、pos、example_en
      const m = meta as { phonetic?: string; pos?: string; example_en?: string };
      if (m.phonetic) items.push({ label: '音标', value: m.phonetic });
      if (m.pos) items.push({ label: '词性', value: m.pos });
      if (m.example_en) items.push({ label: '例句', value: m.example_en });
    }

    if (items.length === 0) return null;

    return (
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-theme-muted">
        {items.map((it) => (
          <span key={it.label}>
            <span className="text-theme-secondary">{it.label}：</span>
            {it.value}
          </span>
        ))}
      </div>
    );
  };

  // ============ 渲染 ============
  if (loading) {
    return (
      <div className="py-8 max-w-5xl mx-auto">
        <Loading />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="py-8 max-w-5xl mx-auto">
        <EmptyState title="加载失败" hint={loadError} />
        <div className="text-center mt-4">
          <button
            onClick={() => navigate('/memory')}
            className="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-500 text-white rounded-md"
          >
            返回牌组列表
          </button>
        </div>
      </div>
    );
  }

  if (!deck) return null;

  return (
    <div className="py-8 max-w-5xl mx-auto">
      {/* 返回按钮 */}
      <button
        onClick={() => navigate('/memory')}
        className="inline-flex items-center gap-1 text-sm text-theme-muted hover:text-theme-secondary mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        返回牌组列表
      </button>

      {/* 消息提示 */}
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

      {/* ============ SubTask 8.2: 顶部牌组信息卡 ============ */}
      <section className="rounded-xl bg-theme-card border border-theme p-5 mb-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-theme-muted mb-2">
              <span className="px-2 py-0.5 rounded bg-theme-input text-theme-secondary">
                {LANG_LABEL[deck.lang]}
              </span>
              <span className="px-2 py-0.5 rounded bg-theme-input text-theme-secondary">
                {CARD_TYPE_LABEL[deck.card_type]}
              </span>
              <span
                className={`px-2 py-0.5 rounded border ${
                  deck.visibility === 'public'
                    ? 'bg-brand-500/10 border-brand-500/30 text-brand-700 dark:text-brand-200'
                    : 'bg-theme-input border-theme text-theme-secondary'
                }`}
              >
                {VISIBILITY_LABEL[deck.visibility]}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-theme-primary mb-2 break-words">
              {deck.name}
            </h1>
            {deck.description && (
              <p className="text-sm text-theme-muted leading-relaxed break-words">
                {deck.description}
              </p>
            )}
            {/* 统计概览 */}
            {stats && (
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-theme-muted">
                <span>
                  总卡片：<span className="text-theme-secondary font-medium">{stats.total}</span>
                </span>
                <span>
                  已学：<span className="text-theme-secondary font-medium">{stats.learned}</span>
                </span>
                <span>
                  已掌握：<span className="text-emerald-700 dark:text-emerald-300 font-medium">{stats.mastered}</span>
                </span>
                <span>
                  今日待复习：<span className="text-amber-600 dark:text-amber-300 font-medium">{stats.dueToday}</span>
                </span>
              </div>
            )}
          </div>

          {/* 顶部管理按钮 */}
          <div className="flex items-center gap-2 shrink-0">
            {canManage && (
              <>
                <button
                  onClick={() => setEditingDeck(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-theme text-theme-secondary hover:bg-theme-hover"
                  title="编辑牌组"
                >
                  <Pencil className="w-4 h-4" />
                  编辑牌组
                </button>
                <button
                  onClick={handleDeleteDeck}
                  disabled={deletingDeck}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-60"
                  title="删除牌组"
                >
                  <Trash2 className="w-4 h-4" />
                  {deletingDeck ? '删除中...' : '删除牌组'}
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ============ SubTask 8.3: 模式选择器 ============ */}
      <section className="rounded-xl bg-theme-card border border-theme p-5 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1">
            <div className="text-sm text-theme-secondary mb-2">选择学习模式</div>
            <div className="flex flex-wrap gap-2">
              {MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => handleModeChange(m)}
                  className={`px-4 py-2 text-sm rounded-md border transition-colors ${
                    mode === m
                      ? 'bg-brand-600 border-brand-600 text-white'
                      : 'border-theme text-theme-secondary hover:bg-theme-hover'
                  }`}
                >
                  {REVIEW_MODE_LABEL[m]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canManage && (
              <button
                onClick={handleAddCard}
                className="inline-flex items-center gap-1 px-4 py-2 text-sm rounded-md border border-theme text-theme-secondary hover:bg-theme-hover"
              >
                <Plus className="w-4 h-4" />
                添加卡片
              </button>
            )}
            <button
              onClick={handleStartStudy}
              className="inline-flex items-center gap-1 px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-500 text-white"
            >
              开始学习（{REVIEW_MODE_LABEL[mode]}）
            </button>
          </div>
        </div>
      </section>

      {/* ============ SubTask 8.6: 简单统计（最近 7 天复习柱状图） ============ */}
      <section className="rounded-xl bg-theme-card border border-theme p-5 mb-6">
        <h2 className="text-sm font-semibold text-theme-secondary mb-4">
          最近 7 天复习次数
        </h2>
        {history.length === 0 ? (
          <div className="text-sm text-theme-muted py-4 text-center">
            暂无复习记录
          </div>
        ) : (
          <div className="flex items-end justify-between gap-2 h-32">
            {history.map((h) => {
              const heightPct = (h.count / maxCount) * 100;
              return (
                <div
                  key={h.date}
                  className="flex-1 flex flex-col items-center gap-1"
                  title={`${h.date}：${h.count} 次`}
                >
                  {/* 柱子高度按 count 比例 */}
                  <div className="w-full flex items-end h-24">
                    <div
                      className={`w-full rounded-t transition-all ${
                        h.count > 0
                          ? 'bg-brand-500/80 hover:bg-brand-500'
                          : 'bg-theme-input'
                      }`}
                      style={{ height: `${Math.max(2, heightPct)}%` }}
                    />
                  </div>
                  <div className="text-xs text-theme-muted">{h.count}</div>
                  <div className="text-xs text-theme-muted">{formatShortDate(h.date)}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ============ SubTask 8.4: 卡片列表 ============ */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-theme-secondary">
            卡片列表
            <span className="ml-2 text-sm text-theme-muted font-normal">
              共 {total} 张
            </span>
          </h2>
          <input
            type="text"
            value={keyword}
            onChange={(e) => handleKeywordChange(e.target.value)}
            placeholder="搜索 front / back"
            className="input-theme w-64 max-w-full"
          />
        </div>

        {cardsLoading ? (
          <Loading />
        ) : cards.length === 0 ? (
          <EmptyState
            title={keyword ? '没有匹配的卡片' : '该牌组还没有卡片'}
            hint={keyword ? '尝试修改搜索关键字' : canManage ? '点击右上角"添加卡片"开始创建' : undefined}
          />
        ) : (
          <div className="space-y-3">
            {cards.map((card) => (
              <div
                key={card.id}
                className="rounded-lg bg-theme-card border border-theme p-4 hover:border-theme-muted transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* 正面 */}
                    <div className="text-theme-primary font-medium leading-relaxed break-words">
                      {card.front}
                    </div>
                    {/* 背面 */}
                    <div className="mt-2 text-sm text-emerald-700 dark:text-emerald-300 break-words">
                      {card.back}
                    </div>
                    {/* metadata 关键字段 */}
                    {renderCardMetadata(card)}
                    {/* tags */}
                    {card.tags && card.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {card.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 text-xs rounded bg-theme-input text-theme-muted"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 管理员/创建者可见的删除按钮 */}
                  {canManage && (
                    <div className="shrink-0">
                      <button
                        onClick={() => handleDeleteCard(card.id)}
                        disabled={deletingCardId === card.id}
                        className="p-2 text-rose-600 hover:bg-rose-500/10 rounded-md disabled:opacity-40"
                        title="删除卡片"
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

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm rounded-md border border-theme text-theme-secondary hover:bg-theme-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              上一页
            </button>
            <span className="text-sm text-theme-muted px-2">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm rounded-md border border-theme text-theme-secondary hover:bg-theme-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              下一页
            </button>
          </div>
        )}
      </section>

      {/* ============ SubTask 8.5: 编辑牌组弹窗 ============ */}
      {editingDeck && (
        <DeckEditModal
          deck={deck}
          onSave={handleSaveDeck}
          onClose={() => setEditingDeck(false)}
        />
      )}
    </div>
  );
}
