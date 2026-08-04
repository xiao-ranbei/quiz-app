import type { Card } from '../../../types';
import { getCardAudioMeta } from './studyUtils';
import AudioPlayer from '../../../components/AudioPlayer';

interface FlashcardModeProps {
  card: Card;
  deckId: string;
  isFlipped: boolean;
  onFlip: () => void;
  onGrade: (quality: number) => void;
}

export default function FlashcardMode({
  card,
  deckId,
  isFlipped,
  onFlip,
  onGrade,
}: FlashcardModeProps) {
  const audioMeta = getCardAudioMeta(card);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label="翻转卡片"
        onClick={onFlip}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onFlip();
          }
        }}
        className="w-full text-left rounded-xl border border-theme bg-theme-card p-8 min-h-[280px] flex flex-col items-center justify-center transition-colors hover:bg-theme-hover cursor-pointer"
      >
        <div className="text-xs text-theme-muted mb-4">
          {isFlipped ? '背面（答案）' : '正面'}
        </div>
        <div className="text-2xl md:text-3xl text-theme-primary text-center leading-relaxed whitespace-pre-wrap break-all">
          {isFlipped ? card.back : card.front}
        </div>

        {/* 正面：显示读音 + 音频按钮 */}
        {!isFlipped && (audioMeta.reading || audioMeta.audio) && (
          <div className="mt-3 flex items-center gap-2">
            {audioMeta.reading && (
              <span className="text-base text-theme-secondary">
                {audioMeta.reading}
              </span>
            )}
            {audioMeta.audio && (
              <AudioPlayer deckId={deckId} filename={audioMeta.audio} size="md" />
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
            {audioMeta.exampleAudio && (
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
      </div>

      {isFlipped && (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => onGrade(0)}
            className="px-4 py-2.5 text-sm rounded-md bg-rose-600 hover:bg-rose-500 text-white"
          >
            不记得
          </button>
          <button
            type="button"
            onClick={() => onGrade(3)}
            className="px-4 py-2.5 text-sm rounded-md bg-amber-600 hover:bg-amber-500 text-white"
          >
            困难
          </button>
          <button
            type="button"
            onClick={() => onGrade(4)}
            className="px-4 py-2.5 text-sm rounded-md bg-blue-600 hover:bg-blue-500 text-white"
          >
            良好
          </button>
          <button
            type="button"
            onClick={() => onGrade(5)}
            className="px-4 py-2.5 text-sm rounded-md bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            简单
          </button>
        </div>
      )}
    </>
  );
}
