import type { Lang } from '../../../types';

export const supportsSpeech =
  typeof window !== 'undefined' && 'speechSynthesis' in window;

// 朗读函数（用于听写模式）
export function speak(text: string, lang: Lang) {
  if (!supportsSpeech) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === 'ja' ? 'ja-JP' : 'en-US';
  utterance.rate = 0.8; // 稍慢便于学习
  window.speechSynthesis.speak(utterance);
}

export function cancelSpeech() {
  if (!supportsSpeech) return;
  window.speechSynthesis.cancel();
}
