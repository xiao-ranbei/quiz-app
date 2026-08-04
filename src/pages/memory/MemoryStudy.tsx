import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle,
  Edit3,
  Headphones,
  Layers,
} from 'lucide-react';
import type { Card, Lang, ReviewMode } from '../../types';
import { useMemoryStore } from '../../store/memoryStore';
import { getDeck } from '../../lib/memory/decks';
import EmptyState from '../../components/EmptyState';
import Loading from '../../components/Loading';
import FlashcardMode from './study/FlashcardMode';
import ChoiceMode from './study/ChoiceMode';
import InputMode from './study/InputMode';
import StudyComplete from './study/StudyComplete';
import { shuffle } from './study/studyUtils';
import { supportsSpeech } from './study/speech';

// 顶部模式切换按钮配置
const MODE_LIST: { mode: ReviewMode; label: string; icon: typeof Layers }[] = [
  { mode: 'flashcard', label: '闪卡', icon: Layers },
  { mode: 'choice', label: '选择题', icon: CheckCircle },
  { mode: 'typing', label: '拼写', icon: Edit3 },
  { mode: 'dictation', label: '听写', icon: Headphones },
];

export default function MemoryStudy() {
  const { deckId } = useParams<{ deckId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialMode = (searchParams.get('mode') || 'flashcard') as ReviewMode;

  const {
    queue,
    currentIndex,
    mode,
    isFlipped,
    isLoading,
    error,
    correctCount,
    wrongCount,
    startTime,
    isFinished,
    start,
    changeMode,
    flip,
    submitReview,
  } = useMemoryStore();

  // 牌组语言（用于听写朗读，null 表示尚未加载）
  const [deckLang, setDeckLang] = useState<Lang | null>(null);
  // 当前题是否已作答（进度条用，具体作答状态在各模式组件内部）
  const [answered, setAnswered] = useState(false);
  const [notice, setNotice] = useState(''); // 降级提示

  const current = queue[currentIndex];

  // ============ 启动逻辑 ============
  useEffect(() => {
    if (!deckId) return;
    let cancelled = false;
    start(deckId, initialMode);
    // 拉取牌组语言（用于听写朗读 lang 字段）
    getDeck(deckId)
      .then((d) => {
        if (!cancelled) setDeckLang(d?.lang ?? 'en');
      })
      .catch(() => {
        if (!cancelled) setDeckLang('en');
      });
    return () => {
      cancelled = true;
    };
    // 离开页面时不清空 store，便于恢复
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, initialMode]);

  // 切换到下一张 / 切换模式时重置作答状态
  useEffect(() => {
    setAnswered(false);
  }, [currentIndex, mode]);

  // ============ 选择题选项（4 个，去重） ============
  const choiceOptions = useMemo<Array<{ back: string; isCorrect: boolean }>>(
    () => {
      if (mode !== 'choice' || !current || queue.length < 4) return [];
      const others = queue.filter((c) => c.id !== current.id);
      const shuffled = shuffle(others);
      const picks: Card[] = [];
      const seen = new Set<string>([current.back]);
      for (const c of shuffled) {
        if (picks.length >= 3) break;
        if (seen.has(c.back)) continue;
        picks.push(c);
        seen.add(c.back);
      }
      if (picks.length < 3) return []; // 不够 3 个不同干扰项，触发降级
      const options = [
        { back: current.back, isCorrect: true },
        ...picks.map((c) => ({ back: c.back, isCorrect: false })),
      ];
      return shuffle(options);
    },
    [current?.id, mode, queue],
  );

  // 模式降级检查（URL 进入时 / queue 变化后）
  useEffect(() => {
    if (isLoading || !deckId) return;
    if (mode === 'choice' && queue.length > 0 && queue.length < 4) {
      setNotice('牌组卡片不足 4 张，无法使用选择题模式，已切换为闪卡');
      start(deckId, 'flashcard');
    } else if (mode === 'dictation' && !supportsSpeech) {
      setNotice('浏览器不支持语音合成，已切换为拼写模式');
      start(deckId, 'typing');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isLoading, queue.length, supportsSpeech]);

  // ============ 模式切换 ============
  const handleModeChange = (newMode: ReviewMode) => {
    if (!deckId) return;
    setNotice('');
    // 降级检查：如果新模式不支持当前队列，切换到兼容模式
    if (newMode === 'choice' && queue.length < 4) {
      setNotice('牌组卡片不足 4 张，无法使用选择题模式，已切换为闪卡');
      // queue 为空时需要 start 重新拉取；否则仅切换模式
      if (queue.length === 0) start(deckId, 'flashcard');
      else changeMode('flashcard');
      return;
    }
    if (newMode === 'dictation' && !supportsSpeech) {
      setNotice('浏览器不支持语音合成，已切换为拼写模式');
      if (queue.length === 0) start(deckId, 'typing');
      else changeMode('typing');
      return;
    }
    // queue 为空时需要 start 重新拉取
    if (queue.length === 0) {
      start(deckId, newMode);
      return;
    }
    // 正常切换：仅更新模式，不重新拉取队列
    changeMode(newMode);
  };

  // ============ 评分提交（各模式统一走 store） ============
  const handleSubmitReview = (quality: number, answer?: string) => {
    submitReview(quality, answer).catch((e) =>
      console.warn('submitReview failed', e),
    );
  };

  // ============ 完成总结页 ============
  if (isFinished) {
    return (
      <div className="py-8 max-w-3xl mx-auto">
        <StudyComplete
          correctCount={correctCount}
          wrongCount={wrongCount}
          startTime={startTime}
          onBack={() => navigate(`/memory/deck/${deckId}`)}
          onRestart={() => deckId && start(deckId, mode)}
        />
      </div>
    );
  }

  // 加载中
  if (isLoading) {
    return (
      <div className="py-8 max-w-3xl mx-auto">
        <Loading label="加载复习队列..." />
      </div>
    );
  }

  // 错误
  if (error) {
    return (
      <div className="py-8 max-w-3xl mx-auto">
        <div className="text-sm text-rose-500 mb-3">{error}</div>
        <button
          onClick={() => navigate(`/memory/deck/${deckId}`)}
          className="text-sm text-brand-500 hover:underline"
        >
          返回牌组
        </button>
      </div>
    );
  }

  // 空状态：今日已完成
  if (queue.length === 0) {
    return (
      <div className="py-8 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-lg font-semibold text-theme-primary">背诵学习</h1>
          <button
            onClick={() => navigate(`/memory/deck/${deckId}`)}
            className="text-sm text-theme-muted hover:text-theme-secondary"
          >
            返回牌组
          </button>
        </div>
        <EmptyState
          title="今日已完成"
          hint="当前牌组没有需要复习的卡片，请稍后再来或选择其他牌组。"
        />
      </div>
    );
  }

  if (!current) return null;

  // 计算实际渲染模式（处理降级）
  const renderMode: 'flashcard' | 'choice' | 'typing' | 'dictation' = (() => {
    if (mode === 'choice') {
      return choiceOptions.length > 0 ? 'choice' : 'flashcard';
    }
    if (mode === 'dictation') {
      return supportsSpeech ? 'dictation' : 'typing';
    }
    return mode;
  })();

  // 进度计算
  const progressPct =
    ((currentIndex +
      (answered || (mode === 'flashcard' && isFlipped) ? 1 : 0)) /
      queue.length) *
    100;

  return (
    <div className="py-8 max-w-3xl mx-auto">
      {/* ============ 顶部进度 ============ */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-theme-primary">背诵学习</h1>
          <div className="text-xs text-theme-muted">
            第 {currentIndex + 1} / {queue.length} 张
          </div>
        </div>
        <button
          onClick={() => navigate(`/memory/deck/${deckId}`)}
          className="inline-flex items-center text-sm text-theme-muted hover:text-theme-secondary"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          退出
        </button>
      </div>

      {/* 进度条 */}
      <div className="w-full bg-theme-secondary rounded-full h-1.5 mb-4">
        <div
          className="bg-brand-500 h-1.5 rounded-full transition-all progress-bar"
          style={
            {
              '--progress': `${Math.min(progressPct, 100)}%`,
            } as React.CSSProperties
          }
        ></div>
      </div>

      {/* 模式切换（4 个图标按钮） */}
      <div className="flex items-center gap-2 mb-4">
        {MODE_LIST.map(({ mode: m, label, icon: Icon }) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => handleModeChange(m)}
              title={label}
              aria-label={label}
              className={`inline-flex items-center justify-center w-10 h-10 rounded-lg border transition-colors ${
                active
                  ? 'border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-200'
                  : 'border-theme text-theme-muted hover:bg-theme-hover'
              }`}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </div>

      {notice && (
        <div className="mb-3 text-sm text-amber-600 dark:text-amber-400">
          {notice}
        </div>
      )}

      {/* ============ 闪卡模式 ============ */}
      {renderMode === 'flashcard' && (
        <FlashcardMode
          key={`${current.id}-flashcard`}
          card={current}
          deckId={deckId ?? ''}
          isFlipped={isFlipped}
          onFlip={flip}
          onGrade={handleSubmitReview}
        />
      )}

      {/* ============ 选择题模式 ============ */}
      {renderMode === 'choice' && (
        <ChoiceMode
          key={`${current.id}-choice`}
          card={current}
          deckId={deckId ?? ''}
          options={choiceOptions}
          onSubmit={handleSubmitReview}
          onAnsweredChange={setAnswered}
        />
      )}

      {/* ============ 拼写 / 听写模式 ============ */}
      {renderMode === 'typing' && (
        <InputMode
          key={`${current.id}-typing`}
          variant="typing"
          card={current}
          deckId={deckId ?? ''}
          lang={deckLang}
          onSubmit={handleSubmitReview}
          onAnsweredChange={setAnswered}
        />
      )}
      {renderMode === 'dictation' && (
        <InputMode
          key={`${current.id}-dictation`}
          variant="dictation"
          card={current}
          deckId={deckId ?? ''}
          lang={deckLang}
          onSubmit={handleSubmitReview}
          onAnsweredChange={setAnswered}
        />
      )}
    </div>
  );
}
