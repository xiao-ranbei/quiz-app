import type { Card } from '../../../types';
import { normalizeAnswer } from '../../../lib/utils';

// Fisher-Yates 打乱
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 用时格式化 mm:ss
export function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 拼写/听写模式打分
// 完全匹配 → 5；归一化后相等（仅大小写/空格差异）→ 4；其他 → 2
export function gradeTyping(userAnswer: string, correctAnswer: string): number {
  if (userAnswer === correctAnswer) return 5;
  if (normalizeAnswer(userAnswer) === normalizeAnswer(correctAnswer)) return 4;
  return 2;
}

// 从卡片 metadata 中提取音频文件名和读音信息（apkg 导入的卡片）
export function getCardAudioMeta(card: Card): {
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
