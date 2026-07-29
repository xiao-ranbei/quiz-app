// 缓存条目内部结构
interface CacheEntry<T> {
  value: T;
  expireAt: number; // Date.now() + ttlMs
  promise: Promise<T> | null; // 进行中的 fetcher，用于并发去重
}

// 模块级缓存存储
const cache = new Map<string, CacheEntry<unknown>>();

/**
 * 带 TTL 的缓存读取
 * - 命中且未过期：直接返回 value（同步路径，但为了统一签名仍返回 Promise）
 * - 未命中或已过期：调用 fetcher，期间若并发调用同一 key 则共享同一 promise（防击穿）
 * - fetcher 抛错：从缓存移除该 key 的 promise，向上抛出错误（不缓存错误）
 */
export function getCached<T>(key: string, fetcher: () => Promise<T>, ttlMs: number): Promise<T> {
  const entry = cache.get(key);

  // 命中且未过期：直接返回缓存值
  if (entry && Date.now() < entry.expireAt) {
    return Promise.resolve(entry.value as T);
  }

  // entry 存在且有进行中的 promise：共享同一 promise（并发去重）
  if (entry && entry.promise) {
    return entry.promise as Promise<T>;
  }

  // 未命中或已过期：调用 fetcher
  const promise = fetcher()
    .then((value) => {
      // 写回缓存：value + expireAt，清空 promise
      cache.set(key, {
        value,
        expireAt: Date.now() + ttlMs,
        promise: null,
      });
      return value;
    })
    .catch((err) => {
      // fetcher 抛错：删除该 key 的整个 entry，rethrow 错误
      cache.delete(key);
      throw err;
    });

  // 先存 promise，供后续并发调用共享
  cache.set(key, {
    value: undefined,
    expireAt: 0,
    promise: promise as Promise<unknown>,
  });

  return promise;
}

/**
 * 主动失效单个 key
 */
export function invalidate(key: string): void {
  cache.delete(key);
}

/**
 * 主动失效某前缀的所有 key（如 'admin:' 前缀）
 */
export function invalidatePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/**
 * 清空所有缓存（登出时用）
 */
export function clearAll(): void {
  cache.clear();
}
