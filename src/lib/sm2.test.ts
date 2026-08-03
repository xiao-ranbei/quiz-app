import { describe, expect, it } from 'vitest';
import { sm2 } from './sm2';
import type { SM2State } from '../types';

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

describe('sm2', () => {
  it('首次学习（quality=4）：repetitions=1，interval=1，ease 不变，due 为明天', () => {
    const state: SM2State = {
      ease: 2.5,
      interval: 0,
      repetitions: 0,
      lastReviewed: null,
    };
    const result = sm2(state, 4);

    expect(result.repetitions).toBe(1);
    expect(result.interval).toBe(1);
    expect(result.ease).toBeCloseTo(2.5, 3);
    expect(isSameDay(result.due, addDays(new Date(), 1))).toBe(true);
  });

  it('答错（quality=2）：重置 repetitions，interval=0，due 为今天', () => {
    const state: SM2State = {
      ease: 2.5,
      interval: 6,
      repetitions: 3,
      lastReviewed: new Date(),
    };
    const result = sm2(state, 2);

    expect(result.repetitions).toBe(0);
    expect(result.interval).toBe(0);
    expect(isSameDay(result.due, new Date())).toBe(true);
  });

  it('连续答对 3 次（quality=5）：interval 1 → 6 → 16', () => {
    let state: SM2State = {
      ease: 2.5,
      interval: 0,
      repetitions: 0,
      lastReviewed: null,
    };

    const r1 = sm2(state, 5);
    expect(r1.interval).toBe(1);
    expect(r1.repetitions).toBe(1);
    expect(r1.ease).toBeCloseTo(2.6, 3);

    const r2 = sm2(r1, 5);
    expect(r2.interval).toBe(6);
    expect(r2.repetitions).toBe(2);
    expect(r2.ease).toBeCloseTo(2.7, 3);

    const r3 = sm2(r2, 5);
    expect(r3.interval).toBe(16);
    expect(r3.repetitions).toBe(3);
  });

  it('ease 不低于 1.3（quality=0）', () => {
    const state: SM2State = {
      ease: 1.4,
      interval: 1,
      repetitions: 1,
      lastReviewed: new Date(),
    };
    const result = sm2(state, 0);

    expect(result.ease).toBeGreaterThanOrEqual(1.3);
    expect(result.ease).toBeCloseTo(1.3, 3);
  });
});
