import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle,
  Edit3,
  Eye,
  Headphones,
  Layers,
  Volume2,
} from 'lucide-react';
import type { Card, Lang, ReviewMode } from '../../types';
import { useMemoryStore } from '../../store/memoryStore';
import { normalizeAnswer } from '../../lib/utils';
import { getDeck } from '../../lib/cards';
import EmptyState from '../../components/EmptyState';
import Loading from '../../components/Loading';
import AudioPlayer from '../../components/AudioPlayer';

// 顶部模式切换按钮配置
const MODE_LIST: { mode: ReviewMode; label: string; icon: typeof Layers }[] = [
  { mode: 'flashcard', label: '闪卡', icon: Layers },
  { mode: 'choice', label: '选择题', icon: CheckCircle },
  { mode: 'typing', label: '拼写', icon: Edit3 },
  { mode: 'dictation', label: '听写', icon: Headphones },
];

// 朗读函数（用于听写模式）
function speak(text: string, lang: Lang) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === 'ja' ? 'ja-JP' : 'en-US';
  utterance.rate = 0.8; // 稍慢便于学习
  window.speechSynthesis.speak(utterance);
}

// Fisher-Yates 打乱
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 从卡片 metadata 中提取音频文件名和读音信息（apkg 导入的卡片）
function getCardAudioMeta(card: Card): {
  audio?: string;
  exampleAudio?: string;
  reading?: string;
  pitch?: string;
  pos?: string;
  example?: string;
  exampleReading?: string;
  exampleZh?: string;
} {
  const meta = card.metadata as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const key of ['audio', 'example_audio', 'reading', 'pitch', 'pos', 'example', 'example_reading', 'example_zh']) {
    if (typeof meta[key] === 'string' && meta[key]) {
      result[key] = meta[key] as string;
    }
  }
  return {
    audio: result.audio,
    exampleAudio: result.example_audio,
    reading: result.reading,
    pitch: result.pitch,
    pos: result.pos,
    example: result.example,
    exampleReading: result.example_reading,
    exampleZh: result.example_zh,
  };
}

// 用时格式化 mm:ss
function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 拼写/听写模式打分
// 完全匹配 → 5；归一化后相等（仅大小写/空格差异）→ 4；其他 → 2
function gradeTyping(userAnswer: string, correctAnswer: string): number {
  if (userAnswer === correctAnswer) return 5;
  if (normalizeAnswer(userAnswer) === normalizeAnswer(correctAnswer)) return 4;
  return 2;
}

// 完成页统计小盒子
function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: 'emerald' | 'rose' | 'brand' | 'amber';
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    rose: 'text-rose-600 dark:text-rose-400',
    brand: 'text-brand-600 dark:text-brand-400',
    amber: 'text-amber-600 dark:text-amber-400',
  };
  return (
    <div className="rounded-lg border border-theme bg-theme-input p-4">
      <div className="text-xs text-theme-muted mb-1">{label}</div>
      <div className={`text-xl font-bold ${colorMap[color]}`}>{value}</div>
    </div>
  );
}

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
  // 当前题作答状态
  const [userAnswer, setUserAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [notice, setNotice] = useState(''); // 降级提示

  const supportsSpeech =
    typeof window !== 'undefined' && 'speechSynthesis' in window;
  const current = queue[currentIndex];

  // ============ SubTask 9.2: 启动逻辑 ============
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

  // 切换到下一张 / 切换模式时重置本地作答状态
  useEffect(() => {
    setUserAnswer('');
    setSelectedOption(null);
    setIsAnswered(false);
    setIsCorrect(false);
  }, [currentIndex, mode]);

  // ============ SubTask 9.7: 听写模式自动朗读 ============
  useEffect(() => {
    if (!deckLang || mode !== 'dictation' || !current || !supportsSpeech) return;
    speak(current.front, deckLang);
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, mode, deckLang, supportsSpeech]);

  // ============ SubTask 9.5: 选择题选项（4 个，去重） ============
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

  // ============ SubTask 9.4: 闪卡评分 ============
  const handleFlashcardGrade = (quality: number) => {
    if (!current) return;
    submitReview(quality).catch((e) => console.warn('submitReview failed', e));
  };

  // ============ SubTask 9.5: 选择题 ============
  const handleChoiceSelect = (option: string, correct: boolean) => {
    if (isAnswered) return;
    setSelectedOption(option);
    setIsAnswered(true);
    setIsCorrect(correct);
  };

  const handleChoiceNext = () => {
    if (!current) return;
    submitReview(isCorrect ? 5 : 2, selectedOption ?? undefined).catch((e) =>
      console.warn('submitReview failed', e),
    );
  };

  // ============ SubTask 9.6 / 9.7: 拼写 / 听写 ============
  const handleTypingSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isAnswered || !current) return;
    const quality = gradeTyping(userAnswer, current.front);
    setIsAnswered(true);
    setIsCorrect(quality >= 4);
  };

  // 听写「显示答案」按钮：揭示正确答案（按已输入内容打分）
  const handleTypingReveal = () => {
    if (isAnswered || !current) return;
    const quality = gradeTyping(userAnswer, current.front);
    setIsAnswered(true);
    setIsCorrect(quality >= 4);
  };

  const handleTypingNext = () => {
    if (!current) return;
    const quality = gradeTyping(userAnswer, current.front);
    submitReview(quality, userAnswer).catch((e) =>
      console.warn('submitReview failed', e),
    );
  };

  // ============ SubTask 9.9: 完成总结页 ============
  if (isFinished) {
    const duration = startTime ? Date.now() - startTime : 0;
    const total = correctCount + wrongCount;
    const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    return (
      <div className="py-8 max-w-3xl mx-auto">
        <div className="rounded-xl border border-theme bg-theme-card p-8 text-center">
          <div className="text-2xl font-bold text-theme-primary mb-2">
            本轮完成 🎉
          </div>
          <div className="text-sm text-theme-muted mb-6">
            共复习 {total} 张卡片
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatBox label="答对" value={String(correctCount)} color="emerald" />
            <StatBox label="答错" value={String(wrongCount)} color="rose" />
            <StatBox label="用时" value={formatDuration(duration)} color="brand" />
            <StatBox label="正确率" value={`${accuracy}%`} color="amber" />
          </div>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => navigate(`/memory/deck/${deckId}`)}
              className="px-5 py-2.5 text-sm rounded-md border border-theme text-theme-secondary hover:bg-theme-hover"
            >
              返回牌组
            </button>
            <button
              onClick={() => deckId && start(deckId, mode)}
              className="px-5 py-2.5 text-sm rounded-md bg-brand-600 hover:bg-brand-500 text-white"
            >
              再来一轮
            </button>
          </div>
        </div>
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
      (isAnswered || (mode === 'flashcard' && isFlipped) ? 1 : 0)) /
      queue.length) *
    100;

  return (
    <div className="py-8 max-w-3xl mx-auto">
      {/* ============ SubTask 9.3: 顶部进度 ============ */}
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

      {/* ============ SubTask 9.4: 闪卡模式 ============ */}
      {renderMode === 'flashcard' && (() => {
        const audioMeta = getCardAudioMeta(current);
        return (
          <>
            <button
              type="button"
              onClick={() => flip()}
              className="w-full text-left rounded-xl border border-theme bg-theme-card p-8 min-h-[280px] flex flex-col items-center justify-center transition-colors hover:bg-theme-hover cursor-pointer"
            >
              <div className="text-xs text-theme-muted mb-4">
                {isFlipped ? '背面（答案）' : '正面'}
              </div>
              <div className="text-2xl md:text-3xl text-theme-primary text-center leading-relaxed whitespace-pre-wrap break-all">
                {isFlipped ? current.back : current.front}
              </div>

              {/* 正面：显示读音 + 音频按钮 */}
              {!isFlipped && (audioMeta.reading || audioMeta.audio) && (
                <div className="mt-3 flex items-center gap-2">
                  {audioMeta.reading && (
                    <span className="text-base text-theme-secondary">
                      {audioMeta.reading}
                    </span>
                  )}
                  {audioMeta.audio && deckId && (
                    <AudioPlayer
                      deckId={deckId}
                      filename={audioMeta.audio}
                      size="md"
                    />
                  )}
                </div>
              )}

              {/* 背面：显示例句 + 例句音频 */}
              {isFlipped && (audioMeta.example || audioMeta.exampleAudio || audioMeta.exampleZh) && (
                <div className="mt-4 max-w-full text-center space-y-1">
                  {audioMeta.example && (
                    <div className="text-sm text-theme-secondary whitespace-pre-wrap break-all">
                      {audioMeta.example}
                    </div>
                  )}
                  {audioMeta.exampleReading && (
                    <div className="text-xs text-theme-muted">
                      {audioMeta.exampleReading}
                    </div>
                  )}
                  {audioMeta.exampleZh && (
                    <div className="text-xs text-theme-muted">
                      {audioMeta.exampleZh}
                    </div>
                  )}
                  {audioMeta.exampleAudio && deckId && (
                    <div className="flex justify-center pt-1">
                      <AudioPlayer
                        deckId={deckId}
                        filename={audioMeta.exampleAudio}
                        size="sm"
                      />
                    </div>
                  )}
                </div>
              )}

              {!isFlipped && (
                <div className="mt-6 text-xs text-theme-muted">
                  点击卡片翻转查看答案
                </div>
              )}
            </button>

            {isFlipped && (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => handleFlashcardGrade(0)}
                  className="px-4 py-2.5 text-sm rounded-md bg-rose-600 hover:bg-rose-500 text-white"
                >
                  不记得
                </button>
                <button
                  type="button"
                  onClick={() => handleFlashcardGrade(3)}
                  className="px-4 py-2.5 text-sm rounded-md bg-amber-600 hover:bg-amber-500 text-white"
                >
                  困难
                </button>
                <button
                  type="button"
                  onClick={() => handleFlashcardGrade(4)}
                  className="px-4 py-2.5 text-sm rounded-md bg-blue-600 hover:bg-blue-500 text-white"
                >
                  良好
                </button>
                <button
                  type="button"
                  onClick={() => handleFlashcardGrade(5)}
                  className="px-4 py-2.5 text-sm rounded-md bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  简单
                </button>
              </div>
            )}
          </>
        );
      })()}

      {/* ============ SubTask 9.5: 选择题模式 ============ */}
      {renderMode === 'choice' && (() => {
        const audioMeta = getCardAudioMeta(current);
        return (
        <div className="rounded-xl border border-theme bg-theme-card p-6">
          <div className="text-xs text-theme-muted mb-3">
            根据正面选择正确的背面
          </div>
          <div className="flex items-start gap-3 mb-5">
            <h2 className="flex-1 text-xl md:text-2xl text-theme-primary leading-relaxed whitespace-pre-wrap break-all">
              {current.front}
            </h2>
            {audioMeta.reading && (
              <span className="text-sm text-theme-secondary shrink-0 mt-1">
                {audioMeta.reading}
              </span>
            )}
            {audioMeta.audio && deckId && (
              <AudioPlayer
                deckId={deckId}
                filename={audioMeta.audio}
                size="md"
                className="shrink-0 mt-1"
              />
            )}
          </div>
          <div className="space-y-2">
            {choiceOptions.map((opt, idx) => {
              const isSelected = selectedOption === opt.back;
              let extra =
                'border-theme text-theme-secondary hover:bg-theme-hover';
              if (isAnswered) {
                if (opt.isCorrect) {
                  extra =
                    'bg-emerald-700/20 border-emerald-500 text-emerald-800 dark:text-emerald-100';
                } else if (isSelected) {
                  extra =
                    'bg-rose-700/20 border-rose-500 text-rose-800 dark:text-rose-100';
                }
              } else if (isSelected) {
                extra =
                  'bg-brand-600/20 border-brand-500 text-brand-700 dark:text-brand-200';
              }
              return (
                <button
                  key={`${idx}-${opt.back}`}
                  type="button"
                  disabled={isAnswered}
                  onClick={() => handleChoiceSelect(opt.back, opt.isCorrect)}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${extra}`}
                >
                  {opt.back}
                </button>
              );
            })}
          </div>

          {isAnswered && (
            <div className="mt-4">
              <div
                className={`text-sm font-semibold mb-2 ${
                  isCorrect
                    ? 'text-emerald-700 dark:text-emerald-200'
                    : 'text-rose-700 dark:text-rose-200'
                }`}
              >
                {isCorrect ? '✓ 回答正确' : '✗ 回答错误'}
              </div>
              <button
                type="button"
                onClick={handleChoiceNext}
                className="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-500 text-white"
              >
                下一题
              </button>
            </div>
          )}
        </div>
        );
      })()}

      {/* ============ SubTask 9.6: 拼写模式 ============ */}
      {renderMode === 'typing' && (() => {
        const audioMeta = getCardAudioMeta(current);
        return (
        <div className="rounded-xl border border-theme bg-theme-card p-6">
          <div className="text-xs text-theme-muted mb-3">
            拼写：根据背面输入正面（front）
          </div>
          <div className="mb-4">
            <div className="text-xs text-theme-muted mb-1">提示（背面）</div>
            <div className="text-xl md:text-2xl text-theme-primary leading-relaxed whitespace-pre-wrap break-all">
              {current.back}
            </div>
          </div>

          <form onSubmit={handleTypingSubmit}>
            <input
              type="text"
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              disabled={isAnswered}
              placeholder="请输入答案..."
              className="input-theme w-full"
              autoFocus
            />
            {!isAnswered && (
              <div className="mt-3">
                <button
                  type="submit"
                  className="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-500 text-white"
                >
                  提交
                </button>
              </div>
            )}
          </form>

          {isAnswered && (
            <div
              className={`mt-4 rounded-lg p-4 border ${
                isCorrect
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : 'border-rose-500 bg-rose-500/10'
              }`}
            >
              <div
                className={`text-sm font-semibold mb-1 ${
                  isCorrect
                    ? 'text-emerald-700 dark:text-emerald-200'
                    : 'text-rose-700 dark:text-rose-200'
                }`}
              >
                {isCorrect ? '✓ 回答正确' : '✗ 回答错误'}
              </div>
              <div className="text-sm text-theme-secondary flex items-center gap-2 flex-wrap">
                <span>
                  正确答案：<span className="font-medium">{current.front}</span>
                </span>
                {audioMeta.reading && (
                  <span className="text-theme-muted">[{audioMeta.reading}]</span>
                )}
                {audioMeta.audio && deckId && (
                  <AudioPlayer
                    deckId={deckId}
                    filename={audioMeta.audio}
                    size="sm"
                  />
                )}
              </div>
              {userAnswer && (
                <div className="text-sm text-theme-muted mt-1">
                  你的答案：{userAnswer}
                </div>
              )}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={handleTypingNext}
                  className="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-500 text-white"
                >
                  下一题
                </button>
              </div>
            </div>
          )}
        </div>
        );
      })()}

      {/* ============ SubTask 9.7: 听写模式 ============ */}
      {renderMode === 'dictation' && (() => {
        const audioMeta = getCardAudioMeta(current);
        return (
        <div className="rounded-xl border border-theme bg-theme-card p-6">
          <div className="text-xs text-theme-muted mb-3">
            听写：听录音后输入正面（front）
          </div>

          {/* 重听 + 显示答案 */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              type="button"
              onClick={() => deckLang && speak(current.front, deckLang)}
              className="inline-flex items-center px-3 py-2 text-sm rounded-md border border-theme text-theme-secondary hover:bg-theme-hover"
            >
              <Volume2 className="w-4 h-4 mr-1.5" />
              重听
            </button>
            {audioMeta.audio && deckId && (
              <AudioPlayer
                deckId={deckId}
                filename={audioMeta.audio}
                size="sm"
                className="inline-flex"
              />
            )}
            <button
              type="button"
              onClick={handleTypingReveal}
              disabled={isAnswered}
              className="inline-flex items-center px-3 py-2 text-sm rounded-md border border-theme text-theme-secondary hover:bg-theme-hover disabled:opacity-50"
            >
              <Eye className="w-4 h-4 mr-1.5" />
              显示答案
            </button>
          </div>

          <form onSubmit={handleTypingSubmit}>
            <input
              type="text"
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              disabled={isAnswered}
              placeholder="请输入答案..."
              className="input-theme w-full"
              autoFocus
            />
            {!isAnswered && (
              <div className="mt-3">
                <button
                  type="submit"
                  className="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-500 text-white"
                >
                  提交
                </button>
              </div>
            )}
          </form>

          {isAnswered && (
            <div
              className={`mt-4 rounded-lg p-4 border ${
                isCorrect
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : 'border-rose-500 bg-rose-500/10'
              }`}
            >
              <div
                className={`text-sm font-semibold mb-1 ${
                  isCorrect
                    ? 'text-emerald-700 dark:text-emerald-200'
                    : 'text-rose-700 dark:text-rose-200'
                }`}
              >
                {isCorrect ? '✓ 回答正确' : '✗ 回答错误'}
              </div>
              <div className="text-sm text-theme-secondary flex items-center gap-2 flex-wrap">
                <span>
                  正确答案：<span className="font-medium">{current.front}</span>
                </span>
                {audioMeta.reading && (
                  <span className="text-theme-muted">[{audioMeta.reading}]</span>
                )}
              </div>
              {userAnswer && (
                <div className="text-sm text-theme-muted mt-1">
                  你的答案：{userAnswer}
                </div>
              )}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={handleTypingNext}
                  className="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-500 text-white"
                >
                  下一题
                </button>
              </div>
            </div>
          )}
        </div>
        );
      })()}
    </div>
  );
}
