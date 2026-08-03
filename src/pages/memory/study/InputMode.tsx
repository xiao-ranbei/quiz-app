import { useEffect, useState } from 'react';
import { Eye, Volume2 } from 'lucide-react';
import type { Card, Lang } from '../../../types';
import { getCardAudioMeta, gradeTyping } from './studyUtils';
import { cancelSpeech, speak, supportsSpeech } from './speech';
import AudioPlayer from '../../../components/AudioPlayer';

interface InputModeProps {
  variant: 'typing' | 'dictation';
  card: Card;
  deckId: string;
  lang: Lang | null;
  onSubmit: (quality: number, answer: string) => void;
  onAnsweredChange?: (answered: boolean) => void;
}

export default function InputMode({
  variant,
  card,
  deckId,
  lang,
  onSubmit,
  onAnsweredChange,
}: InputModeProps) {
  const [userAnswer, setUserAnswer] = useState('');
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const audioMeta = getCardAudioMeta(card);

  // 听写模式：卡片切换（组件随 key 重挂载）时自动朗读一次
  useEffect(() => {
    if (variant === 'dictation' && lang && supportsSpeech) {
      speak(card.front, lang);
      return () => cancelSpeech();
    }
    return undefined;
  }, [variant, card.front, lang]);

  const grade = () => gradeTyping(userAnswer, card.front);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isAnswered) return;
    const quality = grade();
    setIsAnswered(true);
    setIsCorrect(quality >= 4);
    onAnsweredChange?.(true);
  };

  // 听写「显示答案」按钮：揭示正确答案（按已输入内容打分）
  const handleReveal = () => {
    if (isAnswered) return;
    handleSubmit();
  };

  const handleNext = () => {
    onSubmit(grade(), userAnswer);
  };

  const isDictation = variant === 'dictation';

  return (
    <div className="rounded-xl border border-theme bg-theme-card p-6">
      <div className="text-xs text-theme-muted mb-3">
        {isDictation
          ? '听写：听录音后输入正面（front）'
          : '拼写：根据背面输入正面（front）'}
      </div>

      {isDictation && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={() => lang && speak(card.front, lang)}
            className="inline-flex items-center px-3 py-2 text-sm rounded-md border border-theme text-theme-secondary hover:bg-theme-hover"
          >
            <Volume2 className="w-4 h-4 mr-1.5" />
            重听
          </button>
          {audioMeta.audio && (
            <AudioPlayer
              deckId={deckId}
              filename={audioMeta.audio}
              size="sm"
              className="inline-flex"
            />
          )}
          <button
            type="button"
            onClick={handleReveal}
            disabled={isAnswered}
            className="inline-flex items-center px-3 py-2 text-sm rounded-md border border-theme text-theme-secondary hover:bg-theme-hover disabled:opacity-50"
          >
            <Eye className="w-4 h-4 mr-1.5" />
            显示答案
          </button>
        </div>
      )}

      {!isDictation && (
        <div className="mb-4">
          <div className="text-xs text-theme-muted mb-1">提示（背面）</div>
          <div className="text-xl md:text-2xl text-theme-primary leading-relaxed whitespace-pre-wrap break-all">
            {card.back}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
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
              正确答案：<span className="font-medium">{card.front}</span>
            </span>
            {!isDictation && audioMeta.reading && (
              <span className="text-theme-muted">[{audioMeta.reading}]</span>
            )}
            {!isDictation && audioMeta.audio && (
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
              onClick={handleNext}
              className="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-500 text-white"
            >
              下一题
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
