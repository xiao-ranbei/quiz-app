export function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function normalizeAnswer(ans: string): string {
  return ans.trim().replace(/\s+/g, '').toLowerCase();
}

export function isAnswerCorrect(userAnswer: string, correctAnswer: string): boolean {
  if (!userAnswer) return false;
  // 选择题：按字母比对（忽略大小写和空格）
  const a = normalizeAnswer(userAnswer);
  const b = normalizeAnswer(correctAnswer);
  if (/^[a-z]$/.test(a) && /^[a-z]$/.test(b)) {
    return a === b;
  }
  // 其他题：宽松比对（去除空白后直接比）
  return a === b;
}
