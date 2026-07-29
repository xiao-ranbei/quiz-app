import { SM2State, SM2Result } from '../types';

/**
 * SuperMemo-2 间隔重复算法
 * 根据用户回答质量（0-5）更新卡片的调度状态
 *
 * quality 含义：
 * 0 - 完全不记得
 * 1 - 答错了，但看到答案时觉得熟悉
 * 2 - 答错了，但看到答案时觉得很简单
 * 3 - 答对了，但很费力
 * 4 - 答对了，有一些犹豫
 * 5 - 答对了，毫不费力
 */
export function sm2(state: SM2State, quality: number): SM2Result {
  // 限制 quality 在 0-5 之间
  const q = Math.max(0, Math.min(5, Math.round(quality)));

  let { ease, interval, repetitions } = state;

  if (q < 3) {
    // 答错：重置 repetitions，interval 设为 0（今天重做）
    repetitions = 0;
    interval = 0;
  } else {
    // 答对：根据 repetitions 计算 interval
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * ease);
    }
    repetitions += 1;
  }

  // 更新 ease 因子
  ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ease < 1.3) {
    ease = 1.3;
  }

  // 计算 due 日期
  const now = new Date();
  const due = new Date(now);
  due.setDate(due.getDate() + interval);

  return {
    ease,
    interval,
    repetitions,
    lastReviewed: now,
    due,
  };
}
