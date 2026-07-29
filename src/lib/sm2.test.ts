import { sm2 } from './sm2';
import { SM2State } from '../types';

// 简单断言工具
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function approxEqual(a: number, b: number, epsilon = 0.001): boolean {
  return Math.abs(a - b) < epsilon;
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// 测试用例 1：首次学习（quality=4）
function testFirstLearning() {
  const state: SM2State = { ease: 2.5, interval: 0, repetitions: 0, lastReviewed: null };
  const result = sm2(state, 4);

  assert(result.repetitions === 1, '首次学习后 repetitions 应为 1');
  assert(result.interval === 1, '首次学习后 interval 应为 1');
  assert(approxEqual(result.ease, 2.5), 'quality=4 时 ease 不应变化');
  const tomorrow = addDays(new Date(), 1);
  assert(isSameDay(result.due, tomorrow), 'due 应为明天');
  console.log('✓ Test 1: 首次学习（quality=4）通过');
}

// 测试用例 2：答错重置（quality=2）
function testWrongAnswerReset() {
  const state: SM2State = { ease: 2.5, interval: 6, repetitions: 3, lastReviewed: new Date() };
  const result = sm2(state, 2);

  assert(result.repetitions === 0, '答错后 repetitions 应重置为 0');
  assert(result.interval === 0, '答错后 interval 应为 0（今天重做）');
  assert(isSameDay(result.due, new Date()), 'due 应为今天');
  console.log('✓ Test 2: 答错重置（quality=2）通过');
}

// 测试用例 3：连续答对 3 次（quality=5）
function testConsecutiveCorrect() {
  let state: SM2State = { ease: 2.5, interval: 0, repetitions: 0, lastReviewed: null };

  const r1 = sm2(state, 5);
  assert(r1.interval === 1, `第一次答对 interval 应为 1，实际 ${r1.interval}`);
  assert(r1.repetitions === 1, '第一次答对 repetitions 应为 1');
  // quality=5 时 ease 增加 0.1
  assert(approxEqual(r1.ease, 2.6), `第一次答对 ease 应为 2.6，实际 ${r1.ease}`);

  const r2 = sm2(r1, 5);
  assert(r2.interval === 6, `第二次答对 interval 应为 6，实际 ${r2.interval}`);
  assert(r2.repetitions === 2, '第二次答对 repetitions 应为 2');
  assert(approxEqual(r2.ease, 2.7), `第二次答对 ease 应为 2.7，实际 ${r2.ease}`);

  const r3 = sm2(r2, 5);
  // 第三次：interval = round(6 * 2.7) = round(16.2) = 16
  assert(r3.interval === 16, `第三次答对 interval 应为 16，实际 ${r3.interval}`);
  assert(r3.repetitions === 3, '第三次答对 repetitions 应为 3');
  console.log('✓ Test 3: 连续答对 3 次（quality=5）通过');
}

// 测试用例 4：ease 不可低于 1.3
function testEaseFloor() {
  const state: SM2State = { ease: 1.4, interval: 1, repetitions: 1, lastReviewed: new Date() };
  const result = sm2(state, 0);

  assert(result.ease >= 1.3, `ease 不应低于 1.3，实际 ${result.ease}`);
  assert(approxEqual(result.ease, 1.3), `ease 应为 1.3，实际 ${result.ease}`);
  console.log('✓ Test 4: ease 下限保护通过');
}

// 运行所有测试
function runAllTests() {
  console.log('开始运行 SM-2 算法测试...\n');
  testFirstLearning();
  testWrongAnswerReset();
  testConsecutiveCorrect();
  testEaseFloor();
  console.log('\n所有测试通过！');
}

runAllTests();
