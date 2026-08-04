import { describe, expect, it } from 'vitest';
import { getCached, invalidate, clearAll } from './cache';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('cache', () => {
  it('命中缓存时 fetcher 只调用一次', async () => {
    clearAll();
    let callCount = 0;
    const fetcher = async () => {
      callCount += 1;
      return 'value-1';
    };

    const r1 = await getCached('k1', fetcher, 1000);
    const r2 = await getCached('k1', fetcher, 1000);

    expect(callCount).toBe(1);
    expect(r1).toBe(r2);
  });

  it('过期后重新拉取', async () => {
    clearAll();
    let callCount = 0;
    const fetcher = async () => {
      callCount += 1;
      return `value-${callCount}`;
    };

    await getCached('k2', fetcher, 50);
    await delay(80);
    await getCached('k2', fetcher, 50);

    expect(callCount).toBe(2);
  });

  it('invalidate 后重新拉取', async () => {
    clearAll();
    let callCount = 0;
    const fetcher = async () => {
      callCount += 1;
      return `value-${callCount}`;
    };

    await getCached('k3', fetcher, 1000);
    invalidate('k3');
    await getCached('k3', fetcher, 1000);

    expect(callCount).toBe(2);
  });

  it('并发调用共享同一 promise（防击穿）', async () => {
    clearAll();
    let callCount = 0;
    const fetcher = async () => {
      callCount += 1;
      await delay(20);
      return `value-${callCount}`;
    };

    const [r1, r2, r3] = await Promise.all([
      getCached('k4', fetcher, 1000),
      getCached('k4', fetcher, 1000),
      getCached('k4', fetcher, 1000),
    ]);

    expect(callCount).toBe(1);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });
});
