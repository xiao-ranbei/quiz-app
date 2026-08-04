import { useState } from 'react';
import type { Card } from '../../../types';
import { getCardAudioMeta } from './studyUtils';
import AudioPlayer from '../../../components/AudioPlayer';

interface ChoiceModeProps {
  card: Card;
  deckId: string;
  options: Array<{ back: string; isCorrect: boolean }>;
  onSubmit: (quality: number, answer?: string) => void;
  onAnsweredChange?: (answered: boolean) => void;
}

export default function ChoiceMode({
  card,
  deckId,
  options,
  onSubmit,
  onAnsweredChange,
}: ChoiceModeProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const audioMeta = getCardAudioMeta(card);

  const handleSelect = (option: string, correct: boolean) => {
    if (isAnswered) return;
    setSelectedOption(option);
    setIsAnswered(true);
    setIsCorrect(correct);
    onAnsweredChange?.(true);
  };

  const handleNext = () => {
    onSubmit(isCorrect ? 5 : 2, selectedOption ?? undefined);
  };

  return (
    <div className="rounded-xl border border-theme bg-theme-card p-6">
      <div className="text-xs text-theme-muted mb-3">
        根据正面选择正确的背面
      </div>
      <div className="flex items-start gap-3 mb-5">
        <h2 className="flex-1 text-xl md:text-2xl text-theme-primary leading-relaxed whitespace-pre-wrap break-all">
          {card.front}
        </h2>
        {audioMeta.reading && (
          <span className="text-sm text-theme-secondary shrink-0 mt-1">
            {audioMeta.reading}
          </span>
        )}
        {audioMeta.audio && (
          <AudioPlayer
            deckId={deckId}
            filename={audioMeta.audio}
            size="md"
            className="shrink-0 mt-1"
          />
        )}
      </div>
      <div className="space-y-2">
        {options.map((opt, idx) => {
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
              onClick={() => handleSelect(opt.back, opt.isCorrect)}
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
            onClick={handleNext}
            className="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-500 text-white"
          >
            下一题
          </button>
        </div>
      )}
    </div>
  );
}
