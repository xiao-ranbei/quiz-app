import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AIConfig, ExamSession } from '../types';
import type {
  DeckWithStats,
  MemoryStats,
  RecentReview,
  ReviewHistoryItem,
} from '../types';
import { LANG_LABEL, CARD_TYPE_LABEL, REVIEW_MODE_LABEL } from '../types';
import { getAIConfig, saveAIConfig, testAIConnection } from '../lib/ai';
import { fetchProfileData } from '../lib/questions';
import { fetchMemoryProfileData } from '../lib/cards';
import { useAuthStore } from '../store/authStore';
import type { AppMode } from '../store/modeStore';
import { useModeStore } from '../store/modeStore';
import { useRequireAuth } from '../store/useRequireAuth';
import { toast } from '../store/toastStore';
import Loading from '../components/Loading';
import {
  AlarmClock,
  BookOpen,
  Brain,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Layers,
  Sparkles,
} from 'lucide-react';

// ============================================================
// Quiz 模式下的 Profile（原内容，略作整理）
// ============================================================
interface QuizProfileProps {
  onRequireAuth: () => void;
}

function QuizProfile({ onRequireAuth }: QuizProfileProps) {
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();

  const [stats, setStats] = useState<{
    totalAnswered: number;
    correct: number;
    wrongCount: number;
    examCount: number;
  } | null>(null);
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [aiCfg, setAiCfg] = useState<AIConfig>({
    api_base_url: '',
    api_key: '',
    model: '',
  });
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message?: string;
    error?: string;
  } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchProfileData().then(({ stats, examSessions, aiConfig }) => {
      setStats(stats);
      setSessions(examSessions);
      if (aiConfig) setAiCfg(aiConfig);
    });
  }, [user]);

  if (!stats) return <Loading />;

  const accuracy = stats.totalAnswered > 0
    ? Math.round((stats.correct / stats.totalAnswered) * 100)
    : 0;

  const handleSaveAI = async () => {
    try {
      await saveAIConfig(user!.id, aiCfg);
      setMsg('AI 配置已保存');
      setTimeout(() => setMsg(null), 3000);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '保存失败');
    }
  };

  const handleTest = async () => {
    const res = await testAIConnection(aiCfg);
    setTestResult(res);
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <div className="rounded-xl border border-theme bg-theme-card p-4">
          <div className="text-2xl font-bold text-theme-primary">
            {stats.totalAnswered}
          </div>
          <div className="text-sm text-theme-muted">累计答题</div>
        </div>
        <div className="rounded-xl border border-theme bg-theme-card p-4">
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-300">
            {accuracy}%
          </div>
          <div className="text-sm text-theme-muted">正确率</div>
        </div>
        <div className="rounded-xl border border-theme bg-theme-card p-4">
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-300">
            {stats.wrongCount}
          </div>
          <div className="text-sm text-theme-muted">错题总数</div>
        </div>
        <div className="rounded-xl border border-theme bg-theme-card p-4">
          <div className="text-2xl font-bold text-brand-600 dark:text-brand-300">
            {stats.examCount}
          </div>
          <div className="text-sm text-theme-muted">考试次数</div>
        </div>
      </div>

      <section className="rounded-xl border border-theme bg-theme-card p-5 mb-8">
        <h2 className="text-lg font-semibold text-theme-primary mb-3">
          AI API 配置
        </h2>
        <p className="text-sm text-theme-muted mb-4">
          配置后可在做题时请求 AI 解析，也可借助 AI 辅助出题。使用 OpenAI
          兼容的接口格式。Key 仅在你的账号下可见。
        </p>
        <div className="grid md:grid-cols-3 gap-3">
          <input
            value={aiCfg.api_base_url}
            onChange={(e) => setAiCfg({ ...aiCfg, api_base_url: e.target.value })}
            placeholder="API Base URL（如 https://api.openai.com/v1）"
            className="input-theme"
          />
          <input
            value={aiCfg.api_key}
            type="password"
            onChange={(e) => setAiCfg({ ...aiCfg, api_key: e.target.value })}
            placeholder="API Key"
            className="input-theme"
          />
          <input
            value={aiCfg.model}
            onChange={(e) => setAiCfg({ ...aiCfg, model: e.target.value })}
            placeholder="Model（如 gpt-4o-mini）"
            className="input-theme"
          />
        </div>
        <div className="flex gap-2 mt-4 items-center flex-wrap">
          <button
            onClick={handleSaveAI}
            className="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-500 text-white"
          >
            保存
          </button>
          <button
            onClick={handleTest}
            className="px-4 py-2 text-sm rounded-md border border-theme text-theme-secondary hover:bg-theme-hover"
          >
            测试连接
          </button>
          {msg && <span className="text-sm text-theme-muted ml-3">{msg}</span>}
          {testResult && (
            <span
              className={`text-sm ml-3 ${
                testResult.ok
                  ? 'text-emerald-600 dark:text-emerald-300'
                  : 'text-rose-600 dark:text-rose-300'
              }`}
            >
              {testResult.message ||
                testResult.error ||
                (testResult.ok ? '连接成功' : '失败')}
            </span>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-theme-primary mb-3">
          最近考试记录
        </h2>
        {sessions.length === 0 ? (
          <div className="text-sm text-theme-muted rounded-xl border border-theme bg-theme-card p-5">
            暂无考试记录。去模拟考试试试吧。
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const score = typeof s.score === 'number' ? s.score : 0;
              const pct = Math.round((score / s.total_questions) * 100);
              return (
                <div
                  key={s.id}
                  className="rounded-lg border border-theme bg-theme-card p-4 flex items-center justify-between"
                >
                  <div>
                    <div className="text-sm text-theme-secondary">{s.title}</div>
                    <div className="text-xs text-theme-muted mt-1">
                      {new Date(s.started_at).toLocaleString('zh-CN')} ·{' '}
                      {s.total_questions} 题 ·{' '}
                      {Math.round(s.time_limit_sec / 60)} 分钟
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-300">
                      {score}/{s.total_questions}
                    </div>
                    <div className="text-xs text-theme-muted">{pct}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

// ============================================================
// Memory 模式下的 Profile
// ============================================================

function SparklineChart({ data }: { data: ReviewHistoryItem[] }) {
  const width = 560;
  const height = 140;
  const padX = 24;
  const padY = 20;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  if (!data || data.length === 0) {
    return (
      <div className="h-[140px] flex items-center justify-center text-sm text-theme-muted">
        暂无复习数据，开始学习后将显示复习趋势
      </div>
    );
  }

  const maxCount = Math.max(1, ...data.map((d) => d.count));
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;

  const points = data.map((d, i) => {
    const x = padX + stepX * i;
    const y = padY + innerH - (d.count / maxCount) * innerH;
    return { x, y, d };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  // 填充阴影
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${height - padY} L ${points[0].x.toFixed(1)} ${height - padY} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[140px]">
      {/* 网格线 */}
      {[0, 1, 2, 3, 4].map((i) => {
        const y = padY + (innerH * i) / 4;
        return (
          <line
            key={i}
            x1={padX}
            y1={y}
            x2={width - padX}
            y2={y}
            stroke="currentColor"
            className="text-theme/40"
            strokeDasharray="2 4"
          />
        );
      })}
      {/* 面积填充 */}
      <defs>
        <linearGradient id="sparkArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgb(139,92,246)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="rgb(139,92,246)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#sparkArea)" />
      {/* 折线 */}
      <path
        d={linePath}
        fill="none"
        stroke="rgb(139,92,246)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 数据点 + 日期标签 */}
      {points.map((p, i) => {
        const label = p.d.date.slice(5).replace('-', '/');
        const isLast = i === points.length - 1;
        return (
          <g key={p.d.date}>
            <circle
              cx={p.x}
              cy={p.y}
              r={isLast ? 4 : 3}
              fill={isLast ? 'rgb(16,185,129)' : 'rgb(139,92,246)'}
            />
            <text
              x={p.x}
              y={height - 4}
              textAnchor="middle"
              className="fill-theme-muted text-[10px]"
            >
              {label}
            </text>
          </g>
        );
      })}
      {/* Y 轴最大值标签 */}
      {maxCount > 0 && (
        <text
          x={4}
          y={padY + 4}
          className="fill-theme-muted text-[10px]"
        >
          {maxCount}
        </text>
      )}
    </svg>
  );
}

function qualityColor(quality: number): string {
  if (quality >= 4) return 'text-emerald-600 dark:text-emerald-300';
  if (quality >= 2) return 'text-amber-600 dark:text-amber-300';
  return 'text-rose-600 dark:text-rose-300';
}

function qualityLabel(quality: number): string {
  if (quality >= 5) return '极佳';
  if (quality === 4) return '正确';
  if (quality === 3) return '犹豫';
  if (quality === 2) return '错误';
  if (quality === 1) return '严重错误';
  return '完全忘记';
}

function MemoryProfile() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [myDecks, setMyDecks] = useState<DeckWithStats[]>([]);
  const [reviewHistory, setReviewHistory] = useState<ReviewHistoryItem[]>([]);
  const [recentReviews, setRecentReviews] = useState<RecentReview[]>([]);

  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    fetchMemoryProfileData(7, 20)
      .then((res) => {
        setStats(res.stats);
        setMyDecks(res.myDecks);
        setReviewHistory(res.reviewHistory);
        setRecentReviews(res.recentReviews);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || !stats) return <Loading />;

  const masteredRate =
    stats.totalCards > 0
      ? Math.round((stats.mastered / stats.totalCards) * 100)
      : 0;

  return (
    <>
      {/* 6 张统计卡 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <div className="rounded-xl border border-theme bg-theme-card p-4 text-center">
          <div className="flex items-center justify-center mb-1">
            <AlarmClock className="w-7 h-7 text-amber-600 dark:text-amber-300" />
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-300 mb-1">
            {stats.dueToday}
          </div>
          <div className="text-xs text-theme-muted">今日待复习</div>
        </div>
        <div className="rounded-xl border border-theme bg-theme-card p-4 text-center">
          <div className="flex items-center justify-center mb-1">
            <Sparkles className="w-7 h-7 text-brand-600 dark:text-brand-300" />
          </div>
          <div className="text-2xl font-bold text-brand-600 dark:text-brand-300 mb-1">
            {stats.newToday}
          </div>
          <div className="text-xs text-theme-muted">今日新卡</div>
        </div>
        <div className="rounded-xl border border-theme bg-theme-card p-4 text-center">
          <div className="flex items-center justify-center mb-1">
            <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-300" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-300 mb-1">
            {stats.mastered}
          </div>
          <div className="text-xs text-theme-muted">已掌握 ({masteredRate}%)</div>
        </div>
        <div className="rounded-xl border border-theme bg-theme-card p-4 text-center">
          <div className="flex items-center justify-center mb-1">
            <BookOpen className="w-7 h-7 text-brand-600 dark:text-brand-300" />
          </div>
          <div className="text-2xl font-bold text-brand-600 dark:text-brand-300 mb-1">
            {stats.learning}
          </div>
          <div className="text-xs text-theme-muted">在学</div>
        </div>
        <div className="rounded-xl border border-theme bg-theme-card p-4 text-center">
          <div className="flex items-center justify-center mb-1">
            <Layers className="w-7 h-7 text-theme-secondary" />
          </div>
          <div className="text-2xl font-bold text-theme-primary mb-1">
            {stats.totalCards}
          </div>
          <div className="text-xs text-theme-muted">总卡片</div>
        </div>
        <div className="rounded-xl border border-theme bg-theme-card p-4 text-center">
          <div className="flex items-center justify-center mb-1">
            <Calendar className="w-7 h-7 text-amber-600 dark:text-amber-300" />
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-300 mb-1">
            {stats.studyDays}
          </div>
          <div className="text-xs text-theme-muted">学习天数</div>
        </div>
      </div>

      {/* 复习趋势 */}
      <section className="rounded-xl border border-theme bg-theme-card p-5 mb-8">
        <h2 className="text-lg font-semibold text-theme-primary mb-4 flex items-center gap-2">
          <Brain className="w-5 h-5 text-brand-500" />
          最近 7 天复习趋势
        </h2>
        <SparklineChart data={reviewHistory} />
      </section>

      {/* 我的牌组概览 */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-theme-primary mb-3 flex items-center gap-2">
          <Layers className="w-5 h-5" /> 我的牌组概览
        </h2>
        {myDecks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-theme bg-theme-card p-6 text-center text-sm text-theme-muted">
            还没有牌组，去背诵模块「新建牌组」或「导入 .apkg」试试吧
          </div>
        ) : (
          <div className="rounded-xl border border-theme bg-theme-card overflow-hidden">
            {myDecks.map((d, idx) => {
              const percent =
                d.total > 0 ? Math.round((d.mastered / d.total) * 100) : 0;
              return (
                <button
                  key={d.id}
                  onClick={() => navigate(`/memory/deck/${d.id}`)}
                  className={`w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left transition hover:bg-theme-hover ${
                    idx !== 0 ? 'border-t border-theme' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold text-theme-primary truncate">
                        {d.name}
                      </div>
                      <span className="px-2 py-0.5 text-[11px] rounded bg-brand-500/10 text-brand-600 dark:text-brand-300">
                        {LANG_LABEL[d.lang]}
                      </span>
                      <span className="px-2 py-0.5 text-[11px] rounded bg-theme-input text-theme-secondary">
                        {CARD_TYPE_LABEL[d.card_type]}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-theme-input overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <div className="text-xs text-theme-muted whitespace-nowrap">
                        {d.mastered}/{d.total} · {percent}%
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-theme-muted shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 最近复习记录 */}
      <section>
        <h2 className="text-lg font-semibold text-theme-primary mb-3 flex items-center gap-2">
          <ClipboardList className="w-5 h-5" /> 最近复习
        </h2>
        {recentReviews.length === 0 ? (
          <div className="text-sm text-theme-muted rounded-xl border border-theme bg-theme-card p-5">
            还没有复习记录，进入牌组开始学习后将显示在这里
          </div>
        ) : (
          <div className="rounded-xl border border-theme bg-theme-card overflow-hidden divide-y divide-theme">
            {recentReviews.map((r) => (
              <div
                key={r.id}
                className="px-5 py-3 flex items-start gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 text-[11px] rounded bg-theme-input text-theme-secondary">
                      {REVIEW_MODE_LABEL[r.mode]}
                    </span>
                    <span
                      className={`text-xs font-medium ${qualityColor(r.quality)}`}
                    >
                      {qualityLabel(r.quality)}（q={r.quality}）
                    </span>
                  </div>
                  <div className="mt-1.5 text-sm text-theme-primary truncate">
                    {r.front}
                  </div>
                  {r.back && (
                    <div className="mt-0.5 text-xs text-theme-muted truncate">
                      {r.back}
                    </div>
                  )}
                </div>
                <div className="text-xs text-theme-muted whitespace-nowrap pt-1">
                  {new Date(r.reviewed_at).toLocaleString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

// ============================================================
// 顶层 Profile 容器：共用 header（退出登录 + 邮箱）+ 按模式分支
// ============================================================
export default function Profile() {
  const { user, signOut, loading: authLoading } = useAuthStore();
  const { mode } = useModeStore();
  const requireAuth = useRequireAuth();
  const toastedRef = useRef(false);

  useEffect(() => {
    if (!authLoading && !user && !toastedRef.current) {
      toastedRef.current = true;
      toast.warning('请先登录后查看个人中心');
      setTimeout(requireAuth, 300, '请先登录后查看个人中心');
    }
  }, [authLoading, user, requireAuth]);

  if (!user) {
    return (
      <div className="py-16 text-center">
        <div className="text-lg text-theme-secondary mb-2">请先登录</div>
      </div>
    );
  }

  const modeTitle: Record<AppMode, string> = {
    quiz: '刷题模式',
    memory: '背诵模式',
  };

  return (
    <div className="py-8 max-w-5xl mx-auto">
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-theme-primary mb-1">
            个人中心
          </h1>
          <div className="text-sm text-theme-muted flex items-center gap-2 flex-wrap">
            <span>{user.email}</span>
            <span className="text-theme/50">·</span>
            <span className="inline-flex items-center gap-1">
              {mode === 'quiz' ? (
                <ClipboardList className="w-3.5 h-3.5 text-brand-500" />
              ) : (
                <Brain className="w-3.5 h-3.5 text-emerald-500" />
              )}
              {modeTitle[mode as AppMode] ?? '未选择模式'}
            </span>
          </div>
        </div>
        <button
          onClick={() => signOut()}
          className="px-4 py-2 text-sm rounded-md border border-theme text-theme-secondary hover:bg-theme-hover"
        >
          退出登录
        </button>
      </div>

      {mode === 'quiz' ? (
        <QuizProfile onRequireAuth={() => requireAuth('请先登录')} />
      ) : mode === 'memory' ? (
        <MemoryProfile />
      ) : (
        <div className="rounded-xl border border-dashed border-theme bg-theme-card p-10 text-center text-sm text-theme-muted">
          请先选择模式后再查看个人中心
        </div>
      )}
    </div>
  );
}
