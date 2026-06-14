import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Category, Difficulty, Question, QuestionType } from '../types';
import { getCategories, getQuestions, getQuestionsByIds, savePracticeRecord, updateQuestion } from '../lib/questions';
import { resolveQuestionAI } from '../lib/ai';
import { useAuthStore } from '../store/authStore';
import { usePracticeStore } from '../store/practiceStore';
import QuestionCard from '../components/QuestionCard';
import CategoryFilter from '../components/CategoryFilter';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

const FILTERS_KEY = 'practice_filters';
const SESSION_KEY = 'practice_session';

function loadFilters(): {
  keyword: string;
  categoryId: string;
  difficulty: Difficulty | '';
  type: QuestionType | '';
  count: number;
} {
  try {
    const raw = sessionStorage.getItem(FILTERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { keyword: '', categoryId: '', difficulty: '', type: '', count: 10 };
}

function saveFilters(f: ReturnType<typeof loadFilters>) {
  try {
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify(f));
  } catch {}
}

interface SessionData {
  queueIds: string[];
  currentIndex: number;
  userAnswers: Record<string, string>;
  aiMap: Record<string, string>;
  showAnswer: boolean;
}

function loadSession(): SessionData | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveSession(data: SessionData) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {}
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

export default function Practice() {
  const [searchParams] = useSearchParams();

  const [categories, setCategories] = useState<Category[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false); // 是否正在恢复答题状态

  // 从 sessionStorage 恢复筛选状态；URL 参数优先级最高
  const [keyword, setKeyword] = useState(() => loadFilters().keyword);
  const [categoryId, setCategoryId] = useState(() => searchParams.get('category') || loadFilters().categoryId);
  const [difficulty, setDifficulty] = useState<Difficulty | ''>(() => loadFilters().difficulty);
  const [type, setType] = useState<QuestionType | ''>(() => loadFilters().type);
  const [count, setCount] = useState(() => loadFilters().count);

  const [started, setStarted] = useState(false);
  const [aiMap, setAiMap] = useState<Record<string, string>>({});
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState('');

  const user = useAuthStore((s) => s.user);
  const {
    queue, currentIndex, showAnswer,
    start, next, prev, setIndex, reveal, reset,
  } = usePracticeStore();

  // 恢复答题状态（页面刷新后自动恢复）
  useEffect(() => {
    const session = loadSession();
    if (!session) return;
    setRestoring(true);
    getQuestionsByIds(session.queueIds)
      .then((qs) => {
        if (!qs.length) return;
        start(qs);
        setAiMap(session.aiMap);
        setUserAnswers(session.userAnswers);
        setStarted(true);
        const { currentIndex: idx, showAnswer: sa } = session;
        const targetIndex = Math.min(idx, qs.length - 1);
        if (targetIndex > 0) setIndex(targetIndex);
        if (sa) reveal();
      })
      .catch(console.warn)
      .finally(() => setRestoring(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getCategories().then(setCategories);
  }, []);

  useEffect(() => {
    return () => reset();
  }, [reset]);

  // 筛选状态变化时自动保存到 sessionStorage
  useEffect(() => {
    saveFilters({ keyword, categoryId, difficulty, type, count });
  }, [keyword, categoryId, difficulty, type, count]);

  // 答题状态变化时自动保存
  useEffect(() => {
    if (!started || !queue.length) return;
    saveSession({
      queueIds: queue.map((q) => q.id),
      currentIndex,
      userAnswers,
      aiMap,
      showAnswer,
    });
  }, [started, queue, currentIndex, userAnswers, aiMap, showAnswer]);

  const startPractice = async () => {
    setErrorMsg('');
    setLoading(true);
    setUserAnswers({});
    setAiMap({});
    try {
      const qs = await getQuestions({
        categoryId: categoryId || undefined,
        difficulty: difficulty || undefined,
        type: type || undefined,
        keyword: keyword || undefined,
        limit: count,
        random: true,
      });
      if (!qs || qs.length === 0) {
        setErrorMsg('题库中没有符合条件的题目，请先在 Supabase 中导入题库或调整筛选条件。');
        setLoading(false);
        return;
      }
      setQuestions(qs);
      setStarted(true);
      start(qs);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '读取题库失败，请稍后再试。');
    } finally {
      setLoading(false);
    }
  };

  const current = queue[currentIndex];

  const handleSubmitAnswer = async (ans: string) => {
    // 保存用户答案
    if (current) {
      setUserAnswers((prev) => ({ ...prev, [current.id]: ans }));
    }
    reveal();
    if (user && current) {
      const normalize = (a: string) => {
        const cleaned = a.trim().toLowerCase().replace(/\s+/g, '');
        if (current.type === 'multiple') {
          return Array.from(new Set(cleaned.split(''))).sort().join('');
        }
        return cleaned;
      };
      const isCorrect = normalize(ans) === normalize(current.answer);
      try {
        await savePracticeRecord({
          questionId: current.id,
          userAnswer: ans,
          isCorrect,
          userId: user.id,
        });
      } catch (e) {
        console.warn('保存记录失败', e);
      }
    }
  };

  const handleNext = () => {
    next();
  };

  const handlePrev = () => {
    prev();
  };

  const handleAskAI = async () => {
    if (!current) return;
    // 点击 AI 解析时自动显示答案（如果尚未作答则直接展示）
    if (!showAnswer) {
      reveal();
    }
    setAiLoadingId(current.id);
    try {
      const { resolution } = await resolveQuestionAI({
        question: current,
        userAnswer: userAnswers[current.id] || '',
      });
      setAiMap((m) => ({ ...m, [current.id]: resolution }));

      // 将 AI 解析结果自动写入题目的 explanation 字段
      try {
        await updateQuestion(current.id, {
          explanation: current.explanation
            ? `${current.explanation}\n\n---\n\nAI 解析：\n${resolution}`
            : resolution,
        });
      } catch (saveErr) {
        console.warn('保存 AI 解析到题目失败（可能缺少更新权限）', saveErr);
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'AI 调用失败，请先在"我的"页面配置 AI API');
    } finally {
      setAiLoadingId(null);
    }
  };

  const correctCount = useMemo(() => 0, []);

  if (!started) {
    return (
      <div className="py-8 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-theme-primary mb-1">练习模式</h1>
        <p className="text-sm text-theme-muted mb-6">
          选择题型、分类与难度后开始，做完每题立即反馈，并可请求 AI 解析。
        </p>
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
        <div className="mb-6 flex items-center gap-3">
          <label htmlFor="practice-count" className="text-sm text-theme-secondary">题目数量：</label>
          <input
            id="practice-count"
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            className="input-theme w-24"
          />
        </div>
        {errorMsg && <div className="text-sm text-rose-500 mb-3">{errorMsg}</div>}
        <button
          onClick={startPractice}
          disabled={loading}
          className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium disabled:opacity-60"
        >
          {loading ? '加载中...' : '开始练习'}
        </button>
        {questions.length === 0 && (
          <div className="mt-8">
            <EmptyState title="还没有题库数据" hint="请先在 Supabase 中导入迁移脚本和题目数据" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="py-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-theme-primary">练习模式</h1>
          <div className="text-xs text-theme-muted">
            第 {currentIndex + 1} / {queue.length} 题
          </div>
        </div>
        <button
          onClick={() => {
            setStarted(false);
            setUserAnswers({});
            setAiMap({});
            clearSession();
            reset();
          }}
          className="text-sm text-theme-muted hover:text-theme-secondary"
        >
          重新选择
        </button>
      </div>

      <div className="w-full bg-theme-secondary rounded-full h-1.5 mb-6">
        <div
          className="bg-brand-500 h-1.5 rounded-full transition-all progress-bar"
          style={{ '--progress': `${((currentIndex + (showAnswer ? 1 : 0)) / queue.length) * 100}%` } as React.CSSProperties}
        ></div>
      </div>

      {loading && <Loading />}
      {restoring && (
        <div className="flex items-center justify-center py-16">
          <span className="text-sm text-theme-muted animate-pulse">正在恢复答题进度...</span>
        </div>
      )}
      {!loading && !restoring && current && (
        <>
          <QuestionCard
            question={current}
            mode="practice"
            userAnswer={userAnswers[current.id] || ''}
            onAnswerChange={handleSubmitAnswer}
            showAnswer={showAnswer}
            onReveal={() => handleSubmitAnswer(userAnswers[current.id] || '')}
            aiResolution={aiMap[current.id]}
            aiLoading={aiLoadingId === current.id}
            onAskAI={handleAskAI}
          />
          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={prev}
              disabled={currentIndex === 0}
              className="px-4 py-2 text-sm rounded-md border border-theme text-theme-secondary hover:bg-theme-hover disabled:opacity-50"
            >
              上一题
            </button>
            <div className="text-sm text-theme-muted">
              {correctCount > 0 ? `已答对 ${correctCount}/${queue.length}` : ''}
            </div>
            {currentIndex < queue.length - 1 ? (
              <button
                onClick={handleNext}
                disabled={!showAnswer}
                className="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50"
              >
                下一题
              </button>
            ) : (
              <span className="text-sm text-emerald-600 dark:text-emerald-400">已完成全部题目 ✓</span>
            )}
          </div>
        </>
      )}

      {errorMsg && <div className="mt-4 text-sm text-rose-500">{errorMsg}</div>}
    </div>
  );
}
