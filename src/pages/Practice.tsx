import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Category, Difficulty, Question, QuestionType } from '../types';
import { getCategories, getQuestions, savePracticeRecord } from '../lib/questions';
import { resolveQuestionAI } from '../lib/ai';
import { useAuthStore } from '../store/authStore';
import { usePracticeStore } from '../store/practiceStore';
import QuestionCard from '../components/QuestionCard';
import CategoryFilter from '../components/CategoryFilter';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

export default function Practice() {
  const [searchParams] = useSearchParams();
  const initialCategory = searchParams.get('category') ?? '';

  const [categories, setCategories] = useState<Category[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [categoryId, setCategoryId] = useState(initialCategory);
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [type, setType] = useState<QuestionType | ''>('');
  const [count, setCount] = useState(10);

  const [started, setStarted] = useState(false);
  const [aiMap, setAiMap] = useState<Record<string, string>>({});
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const user = useAuthStore((s) => s.user);
  const {
    queue, currentIndex, showAnswer,
    start, next, prev, reveal, reset,
  } = usePracticeStore();

  useEffect(() => {
    getCategories().then(setCategories);
  }, []);

  useEffect(() => {
    return () => reset();
  }, [reset]);

  const startPractice = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      console.log('[Practice] 开始加载题目, categoryId:', categoryId, 'difficulty:', difficulty, 'type:', type, 'count:', count);
      const qs = await getQuestions({
        categoryId: categoryId || undefined,
        difficulty: difficulty || undefined,
        type: type || undefined,
        keyword: keyword || undefined,
        limit: count,
        random: true,
      });
      console.log('[Practice] 获取到题目数量:', qs.length);
      if (qs.length === 0) {
        setErrorMsg('没有符合条件的题目，请调整筛选条件');
        return;
      }
      setQuestions(qs);
      start(qs);
      setCurrentAnswer('');
      setStarted(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[Practice] 加载题目失败:', e);
      setErrorMsg('加载失败: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  const current = queue[currentIndex];

  const handleSubmitAnswer = async (ans: string) => {
    setCurrentAnswer(ans);
    reveal();
    if (user && current) {
      const isCorrect = ans.trim().toLowerCase().replace(/\s+/g, '') === current.answer.trim().toLowerCase().replace(/\s+/g, '');
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
    setCurrentAnswer('');
    next();
  };

  const handleAskAI = async () => {
    if (!current) return;
    setAiLoadingId(current.id);
    try {
      const { resolution } = await resolveQuestionAI({
        question: current,
        userAnswer: currentAnswer,
      });
      setAiMap((m) => ({ ...m, [current.id]: resolution }));
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'AI 调用失败，请先在"我的"页面配置 AI API');
    } finally {
      setAiLoadingId(null);
    }
  };

  const correctCount = useMemo(() => {
    // 只统计当前会话中的答对数量（简单：每道题已 reveal 的比对一次）
    return 0;
  }, []);

  if (!started) {
    return (
      <div className="py-8 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-100 mb-1">练习模式</h1>
        <p className="text-sm text-slate-400 mb-6">
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
          <label className="text-sm text-slate-300">题目数量：</label>
          <input
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            className="w-24 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm"
          />
        </div>
        {errorMsg && <div className="text-sm text-rose-400 mb-3">{errorMsg}</div>}
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
          <h1 className="text-lg font-semibold text-slate-100">练习模式</h1>
          <div className="text-xs text-slate-400">
            第 {currentIndex + 1} / {queue.length} 题
          </div>
        </div>
        <button
          onClick={() => {
            setStarted(false);
            reset();
          }}
          className="text-sm text-slate-400 hover:text-slate-200"
        >
          重新选择
        </button>
      </div>

      <div className="w-full bg-slate-800 rounded-full h-1.5 mb-6">
        <div
          className="bg-brand-500 h-1.5 rounded-full transition-all"
          style={{ width: `${((currentIndex + (showAnswer ? 1 : 0)) / queue.length) * 100}%` }}
        ></div>
      </div>

      {loading && <Loading />}
      {!loading && current && (
        <>
          <QuestionCard
            question={current}
            mode="practice"
            userAnswer={currentAnswer}
            onAnswerChange={handleSubmitAnswer}
            showAnswer={showAnswer}
            onReveal={() => handleSubmitAnswer(currentAnswer || '')}
            aiResolution={aiMap[current.id]}
            aiLoading={aiLoadingId === current.id}
            onAskAI={handleAskAI}
          />
          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={prev}
              disabled={currentIndex === 0}
              className="px-4 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
            >
              上一题
            </button>
            <div className="text-sm text-slate-400">
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
              <span className="text-sm text-emerald-400">已完成全部题目 ✓</span>
            )}
          </div>
        </>
      )}

      {errorMsg && <div className="mt-4 text-sm text-rose-400">{errorMsg}</div>}
    </div>
  );
}
