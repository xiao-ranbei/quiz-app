import { useEffect, useMemo, useState } from 'react';
import type { Category, Difficulty, Question, QuestionType } from '../types';
import { getCategories, getQuestions, saveExamSession } from '../lib/questions';
import { useAuthStore } from '../store/authStore';
import { useExamStore } from '../store/examStore';
import QuestionCard from '../components/QuestionCard';
import CategoryFilter from '../components/CategoryFilter';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

export default function Exam() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [prepStage, setPrepStage] = useState(true);
  const [categoryId, setCategoryId] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [type, setType] = useState<QuestionType | ''>('');
  const [count, setCount] = useState(10);
  const [timeLimit, setTimeLimit] = useState(15);
  const [errorMsg, setErrorMsg] = useState('');
  const [remainingSec, setRemainingSec] = useState(0);

  const user = useAuthStore((s) => s.user);
  const exam = useExamStore();

  useEffect(() => {
    getCategories().then(setCategories);
  }, []);

  useEffect(() => {
    if (prepStage || exam.submitted) return;
    const ticker = setInterval(() => {
      const elapsed = Math.floor((Date.now() - exam.startedAt) / 1000);
      const left = exam.timeLimitSec - elapsed;
      setRemainingSec(left);
      if (left <= 0) {
        clearInterval(ticker);
        handleSubmitExam();
      }
    }, 1000);
    return () => clearInterval(ticker);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepStage, exam.startedAt, exam.timeLimitSec, exam.submitted]);

  const startExam = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      const qs = await getQuestions({
        categoryId: categoryId || undefined,
        difficulty: difficulty || undefined,
        type: type || undefined,
        limit: count,
        random: true,
      });
      if (qs.length < 1) {
        setErrorMsg('没有符合条件的题目，请调整筛选');
        return;
      }
      exam.start({
        title: '模拟考试',
        questions: qs,
        timeLimitSec: timeLimit * 60,
      });
      setRemainingSec(timeLimit * 60);
      setPrepStage(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitExam = async () => {
    if (exam.submitted) return;
    exam.submit();
    // 标准化答案：多选题按字符排序去重比较；其他做 trim
    const normalize = (a: string, type: QuestionType) => {
      const cleaned = a.trim().toLowerCase().replace(/\s+/g, '');
      if (type === 'multiple') {
        return Array.from(new Set(cleaned.split(''))).sort().join('');
      }
      return cleaned;
    };
    const answers = exam.questions.map((q) => {
      const ua = exam.userAnswers[q.id] ?? '';
      const isCorrect = normalize(ua, q.type) === normalize(q.answer, q.type);
      return { questionId: q.id, userAnswer: ua, isCorrect };
    });
    if (user) {
      try {
        await saveExamSession({
          userId: user.id,
          title: '模拟考试',
          total: exam.questions.length,
          timeLimitSec: exam.timeLimitSec,
          answers,
        });
      } catch (e) {
        console.warn(e);
      }
    }
  };

  const resetExam = () => {
    exam.reset();
    setPrepStage(true);
    setErrorMsg('');
  };

  const current = exam.questions[exam.currentIndex];

  const mm = String(Math.floor(remainingSec / 60)).padStart(2, '0');
  const ss = String(remainingSec % 60).padStart(2, '0');

  const stats = useMemo(() => {
    if (!exam.submitted) return null;
    const normalize = (a: string, type: QuestionType) => {
      const cleaned = a.trim().toLowerCase().replace(/\s+/g, '');
      if (type === 'multiple') {
        return Array.from(new Set(cleaned.split(''))).sort().join('');
      }
      return cleaned;
    };
    const answers = exam.questions.map((q) => {
      const ua = exam.userAnswers[q.id] ?? '';
      return normalize(ua, q.type) === normalize(q.answer, q.type);
    });
    const correct = answers.filter(Boolean).length;
    return { correct, total: exam.questions.length, percent: Math.round((correct / exam.questions.length) * 100) };
  }, [exam.submitted, exam.questions, exam.userAnswers]);

  if (prepStage) {
    return (
      <div className="py-8 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-theme-primary mb-1">模拟考试</h1>
        <p className="text-sm text-theme-muted mb-6">
          设定题目数量与时间限制，完成后查看成绩与错题解析。
        </p>
        <CategoryFilter
          categories={categories}
          selectedCategory={categoryId}
          onCategoryChange={setCategoryId}
          selectedDifficulty={difficulty}
          onDifficultyChange={setDifficulty}
          selectedType={type}
          onTypeChange={setType}
          showKeyword={false}
        />
        <div className="grid md:grid-cols-2 gap-4 mt-2">
          <div>
            <label htmlFor="exam-count" className="block text-sm text-theme-secondary mb-2">题目数量（1-50）</label>
            <input
              id="exam-count"
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              className="input-theme w-full"
            />
          </div>
          <div>
            <label htmlFor="exam-time" className="block text-sm text-theme-secondary mb-2">时间限制（分钟）</label>
            <input
              id="exam-time"
              type="number"
              min={1}
              max={180}
              value={timeLimit}
              onChange={(e) => setTimeLimit(Math.max(1, Math.min(180, Number(e.target.value) || 1)))}
              className="input-theme w-full"
            />
          </div>
        </div>
        {errorMsg && <div className="text-sm text-rose-500 mt-3">{errorMsg}</div>}
        <div className="mt-6">
          <button
            onClick={startExam}
            disabled={loading}
            className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium disabled:opacity-60"
          >
            {loading ? '正在准备题目...' : `开始考试（${count} 题，${timeLimit} 分钟）`}
          </button>
        </div>
        <div className="mt-10">
          <EmptyState title="注意" hint="考试开始后时间将自动倒计时，到达时间会自动交卷。" />
        </div>
      </div>
    );
  }

  if (exam.submitted && stats) {
    return (
      <div className="py-8 max-w-3xl mx-auto">
        <div className="rounded-xl border border-theme bg-theme-card p-8 text-center mb-6">
          <div className="text-sm text-theme-muted mb-2">考试成绩</div>
          <div className="text-5xl font-bold text-brand-600 dark:text-brand-300 mb-2">
            {stats.correct} / {stats.total}
          </div>
          <div className="text-lg text-theme-secondary">正确率 {stats.percent}%</div>
          <div className="text-sm text-theme-muted mt-2">
            用时 {timeLimit - Math.ceil(remainingSec / 60)} 分钟
          </div>
        </div>

        <h2 className="text-lg font-semibold text-theme-primary mb-4">逐题解析</h2>
        <div className="space-y-4">
          {exam.questions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              mode="review"
              userAnswer={exam.userAnswers[q.id] ?? ''}
              showAnswer
            />
          ))}
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={resetExam}
            className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium"
          >
            再来一次
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-theme-primary">{exam.title}</h1>
          <div className="text-xs text-theme-muted">
            第 {exam.currentIndex + 1} / {exam.questions.length} 题
          </div>
        </div>
        <div
          className={`px-4 py-2 rounded-lg text-sm font-mono border ${
            remainingSec < 60
              ? 'bg-rose-500/10 border-rose-500 text-rose-600 dark:text-rose-200'
              : 'bg-theme-card border-theme text-theme-secondary'
          }`}
        >
          ⏱ {mm}:{ss}
        </div>
      </div>

      <div className="w-full bg-theme-secondary rounded-full h-1.5 mb-5">
        <div
          className="bg-brand-500 h-1.5 rounded-full transition-all progress-bar"
          style={{ '--progress': `${((exam.currentIndex + 1) / exam.questions.length) * 100}%` } as React.CSSProperties}
        ></div>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {exam.questions.map((q, idx) => {
          const answered = !!exam.userAnswers[q.id];
          const isCurrent = idx === exam.currentIndex;
          return (
            <button
              key={q.id}
              onClick={() => exam.goTo(idx)}
              className={`w-9 h-9 text-sm rounded-md border transition-colors ${
                isCurrent
                  ? 'bg-brand-600 text-white border-brand-500'
                  : answered
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-200'
                  : 'bg-theme-card border-theme text-theme-secondary hover:bg-theme-hover'
              }`}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>

      {loading && <Loading />}
      {!loading && current && (
        <div>
          <QuestionCard
            question={current}
            mode="exam"
            userAnswer={exam.userAnswers[current.id] ?? ''}
            onAnswerChange={(ans) => exam.setAnswer(current.id, ans)}
            showAIBtn={false}
          />
          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={() => exam.goTo(Math.max(0, exam.currentIndex - 1))}
              disabled={exam.currentIndex === 0}
              className="px-4 py-2 text-sm rounded-md border border-theme text-theme-secondary hover:bg-theme-hover disabled:opacity-50"
            >
              上一题
            </button>
            {exam.currentIndex < exam.questions.length - 1 ? (
              <button
                onClick={() => exam.goTo(exam.currentIndex + 1)}
                className="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-500 text-white"
              >
                下一题
              </button>
            ) : (
              <button
                onClick={handleSubmitExam}
                className="px-4 py-2 text-sm rounded-md bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                提交试卷
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
