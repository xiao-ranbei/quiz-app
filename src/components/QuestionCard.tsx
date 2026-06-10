import { useEffect, useState } from 'react';
import { DIFFICULTY_LABEL, TYPE_LABEL } from '../types';
import type { Question } from '../types';

interface Props {
  question: Question;
  mode: 'practice' | 'exam' | 'review';
  userAnswer?: string;
  onAnswerChange?: (answer: string) => void;
  showAnswer?: boolean;
  onReveal?: () => void;
  showAIBtn?: boolean;
  onAskAI?: () => void;
  aiResolution?: string;
  aiLoading?: boolean;
}

export default function QuestionCard({
  question,
  mode,
  userAnswer = '',
  onAnswerChange,
  showAnswer = false,
  onReveal,
  showAIBtn = true,
  onAskAI,
  aiResolution = '',
  aiLoading = false,
}: Props) {
  const [fillValue, setFillValue] = useState(userAnswer);

  useEffect(() => {
    setFillValue(userAnswer);
  }, [userAnswer, question.id]);

  const isRevealed = showAnswer || mode === 'review';
  const isCorrect = (() => {
    if (!isRevealed) return null;
    const a = userAnswer.trim().toLowerCase().replace(/\s+/g, '');
    const b = question.answer.trim().toLowerCase().replace(/\s+/g, '');
    return a === b;
  })();

  const handleChoice = (key: string) => {
    if (isRevealed) return;
    onAnswerChange?.(key);
  };

  const handleFillSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isRevealed || !onAnswerChange) return;
    onAnswerChange(fillValue);
  };

  return (
    <div className="rounded-xl border border-theme bg-theme-card p-6">
      <div className="flex flex-wrap items-center gap-2 text-xs text-theme-muted mb-3">
        <span className="px-2 py-1 rounded-md bg-theme-input text-theme-secondary">
          {TYPE_LABEL[question.type]}
        </span>
        <span className="px-2 py-1 rounded-md bg-theme-input text-theme-secondary">
          {DIFFICULTY_LABEL[question.difficulty]}
        </span>
        {question.reference_url && (
          <a
            href={question.reference_url}
            target="_blank"
            rel="noreferrer"
            className="text-brand-500 hover:underline"
          >
            参考资料
          </a>
        )}
      </div>

      <h2 className="text-lg md:text-xl text-theme-primary leading-relaxed whitespace-pre-wrap">
        {question.question}
      </h2>

      {question.type === 'choice' && question.options && (
        <div className="mt-5 space-y-2">
          {Object.entries(question.options).map(([key, value]) => {
            const isUser = userAnswer === key;
            const isRight = key.toLowerCase() === question.answer.toLowerCase();
            let extra = 'border-theme text-theme-secondary';
            if (isRevealed) {
              if (isRight) extra = 'bg-emerald-700/20 border-emerald-500 text-emerald-800 dark:text-emerald-100';
              else if (isUser) extra = 'bg-rose-700/20 border-rose-500 text-rose-800 dark:text-rose-100';
            } else if (isUser) {
              extra = 'bg-brand-600/20 border-brand-500 text-brand-700 dark:text-brand-200';
            }
            return (
              <button
                key={key}
                type="button"
                className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${extra}`}
                onClick={() => handleChoice(key)}
              >
                <span className="inline-block w-7 h-7 mr-2 text-center font-semibold">
                  {key}.
                </span>
                {value}
              </button>
            );
          })}
        </div>
      )}

      {question.type === 'fill' && (
        <form onSubmit={handleFillSubmit} className="mt-5">
          <input
            type="text"
            value={fillValue}
            onChange={(e) => {
              setFillValue(e.target.value);
              onAnswerChange?.(e.target.value);
            }}
            disabled={isRevealed}
            placeholder="请输入答案..."
            className="input-theme w-full"
          />
        </form>
      )}

      {isRevealed && (
        <div className="mt-5 space-y-3">
          <div
            className={`rounded-lg p-4 border ${
              isCorrect
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-rose-500 bg-rose-500/10'
            }`}
          >
            <div
              className={`text-sm font-semibold mb-1 ${
                isCorrect ? 'text-emerald-700 dark:text-emerald-200' : 'text-rose-700 dark:text-rose-200'
              }`}
            >
              {isCorrect ? '✓ 回答正确' : '✗ 回答错误'}
            </div>
            <div className="text-sm text-theme-secondary">正确答案：{question.answer}</div>
            {question.explanation && (
              <div className="mt-2 text-sm text-theme-secondary">解析：{question.explanation}</div>
            )}
          </div>

          {aiResolution && (
            <div className="rounded-lg p-4 border border-brand-500/60 bg-brand-500/10">
              <div className="text-sm font-semibold text-brand-700 dark:text-brand-200 mb-1">
                AI 智能解析
              </div>
              <div className="text-sm text-theme-secondary whitespace-pre-wrap leading-relaxed">
                {aiResolution}
              </div>
            </div>
          )}
        </div>
      )}

      {!isRevealed && mode === 'practice' && (
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onReveal}
            disabled={!userAnswer}
            className="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            查看答案
          </button>
          {showAIBtn && onAskAI && (
            <button
              type="button"
              onClick={onAskAI}
              disabled={aiLoading}
              className="px-4 py-2 text-sm rounded-md border border-theme text-theme-secondary hover:bg-theme-hover disabled:opacity-50"
            >
              {aiLoading ? 'AI 解析中...' : '问 AI 解析'}
            </button>
          )}
        </div>
      )}

      {aiResolution && isRevealed && showAIBtn && onAskAI && !aiResolution && (
        <div className="mt-3">
          <button
            type="button"
            onClick={onAskAI}
            disabled={aiLoading}
            className="px-4 py-2 text-sm rounded-md border border-theme text-theme-secondary hover:bg-theme-hover"
          >
            {aiLoading ? 'AI 解析中...' : '问 AI 解析'}
          </button>
        </div>
      )}
    </div>
  );
}
