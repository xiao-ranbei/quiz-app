import { getCached, invalidate, clearAll } from './cache';

// 简单断言工具
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// 延迟工具
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 测试用例 1：缓存命中
async function testCacheHit() {
  clearAll();
  let callCount = 0;
  const fetcher = async () => {
    callCount += 1;
    return 'value-1';
  };

  const r1 = await getCached('k1', fetcher, 1000);
  const r2 = await getCached('k1', fetcher, 1000);

  assert(callCount === 1, `fetcher 应只被调用 1 次，实际 ${callCount} 次`);
  assert(r1 === r2, `两次返回值应相同，r1=${r1}, r2=${r2}`);
  console.log('✓ Test 1: 缓存命中通过');
}

// 测试用例 2：过期重拉
async function testExpireRefetch() {
  clearAll();
  let callCount = 0;
  const fetcher = async () => {
    callCount += 1;
    return `value-${callCount}`;
  };

  await getCached('k2', fetcher, 50);
  await delay(80);
  await getCached('k2', fetcher, 50);

  assert(callCount === 2, `过期后 fetcher 应被调用 2 次，实际 ${callCount} 次`);
  console.log('✓ Test 2: 过期重拉通过');
}

// 测试用例 3：主动失效
async function testInvalidate() {
  clearAll();
  let callCount = 0;
  const fetcher = async () => {
    callCount += 1;
    return `value-${callCount}`;
  };

  await getCached('k3', fetcher, 1000);
  invalidate('k3');
  await getCached('k3', fetcher, 1000);

  assert(callCount === 2, `invalidate 后 fetcher 应被调用 2 次，实际 ${callCount} 次`);
  console.log('✓ Test 3: 主动失效通过');
}

// 测试用例 4：并发去重
async function testConcurrentDedup() {
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

  assert(callCount === 1, `并发时 fetcher 应只被调用 1 次，实际 ${callCount} 次`);
  assert(r1 === r2 && r2 === r3, '三个并发结果应相同');
  console.log('✓ Test 4: 并发去重通过');
}

// 运行所有测试
async function runAllTests() {
  console.log('开始运行缓存工具测试...\n');
  await testCacheHit();
  await testExpireRefetch();
  await testInvalidate();
  await testConcurrentDedup();
  console.log('\n所有测试通过！');
}

runAllTests();
