import { useEffect, useState } from 'react';
import type { AIConfig, ExamSession } from '../types';
import { getAIConfig, saveAIConfig, testAIConnection } from '../lib/ai';
import { getExamSessions, getUserStats } from '../lib/questions';
import { useAuthStore } from '../store/authStore';
import Loading from '../components/Loading';

export default function Profile() {
  const { user, signOut } = useAuthStore();
  const [stats, setStats] = useState<{
    totalAnswered: number;
    correct: number;
    wrongCount: number;
    examCount: number;
  } | null>(null);
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [aiCfg, setAiCfg] = useState<AIConfig>({
    api_base_url: '',
    api_key: '',
    model: '',
  });
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message?: string;
    error?: string;
  } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([getUserStats(user.id), getExamSessions(user.id), getAIConfig(user.id)]).then(
      ([stats, sessions, ai]) => {
        setStats(stats);
        setSessions(sessions);
        if (ai) setAiCfg(ai);
      },
    );
  }, [user]);

  if (!user) {
    return (
      <div className="py-16 text-center">
        <div className="text-lg text-theme-secondary mb-2">请先登录</div>
      </div>
    );
  }

  if (!stats) return <Loading />;

  const accuracy = stats.totalAnswered > 0
    ? Math.round((stats.correct / stats.totalAnswered) * 100)
    : 0;

  const handleSaveAI = async () => {
    try {
      await saveAIConfig(user.id, aiCfg);
      setMsg('AI 配置已保存');
      setTimeout(() => setMsg(null), 3000);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '保存失败');
    }
  };

  const handleTest = async () => {
    const res = await testAIConnection(aiCfg);
    setTestResult(res);
  };

  return (
    <div className="py-8 max-w-4xl mx-auto">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-theme-primary mb-1">个人中心</h1>
          <div className="text-sm text-theme-muted">{user.email}</div>
        </div>
        <button
          onClick={() => signOut()}
          className="px-4 py-2 text-sm rounded-md border border-theme text-theme-secondary hover:bg-theme-hover"
        >
          退出登录
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <div className="rounded-xl border border-theme bg-theme-card p-4">
          <div className="text-2xl font-bold text-theme-primary">{stats.totalAnswered}</div>
          <div className="text-sm text-theme-muted">累计答题</div>
        </div>
        <div className="rounded-xl border border-theme bg-theme-card p-4">
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-300">{accuracy}%</div>
          <div className="text-sm text-theme-muted">正确率</div>
        </div>
        <div className="rounded-xl border border-theme bg-theme-card p-4">
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-300">{stats.wrongCount}</div>
          <div className="text-sm text-theme-muted">错题总数</div>
        </div>
        <div className="rounded-xl border border-theme bg-theme-card p-4">
          <div className="text-2xl font-bold text-brand-600 dark:text-brand-300">{stats.examCount}</div>
          <div className="text-sm text-theme-muted">考试次数</div>
        </div>
      </div>

      <section className="rounded-xl border border-theme bg-theme-card p-5 mb-8">
        <h2 className="text-lg font-semibold text-theme-primary mb-3">AI API 配置</h2>
        <p className="text-sm text-theme-muted mb-4">
          配置后可在做题时请求 AI 解析，也可借助 AI 辅助出题。使用 OpenAI 兼容的接口格式。Key 仅在你的账号下可见。
        </p>
        <div className="grid md:grid-cols-3 gap-3">
          <input
            value={aiCfg.api_base_url}
            onChange={(e) => setAiCfg({ ...aiCfg, api_base_url: e.target.value })}
            placeholder="API Base URL（如 https://api.openai.com/v1）"
            className="input-theme"
          />
          <input
            value={aiCfg.api_key}
            type="password"
            onChange={(e) => setAiCfg({ ...aiCfg, api_key: e.target.value })}
            placeholder="API Key"
            className="input-theme"
          />
          <input
            value={aiCfg.model}
            onChange={(e) => setAiCfg({ ...aiCfg, model: e.target.value })}
            placeholder="Model（如 gpt-4o-mini）"
            className="input-theme"
          />
        </div>
        <div className="flex gap-2 mt-4 items-center">
          <button
            onClick={handleSaveAI}
            className="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-500 text-white"
          >
            保存
          </button>
          <button
            onClick={handleTest}
            className="px-4 py-2 text-sm rounded-md border border-theme text-theme-secondary hover:bg-theme-hover"
          >
            测试连接
          </button>
          {msg && <span className="text-sm text-theme-muted ml-3">{msg}</span>}
          {testResult && (
            <span
              className={`text-sm ml-3 ${
                testResult.ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'
              }`}
            >
              {testResult.message || testResult.error || (testResult.ok ? '连接成功' : '失败')}
            </span>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-theme-primary mb-3">最近考试记录</h2>
        {sessions.length === 0 ? (
          <div className="text-sm text-theme-muted rounded-xl border border-theme bg-theme-card p-5">
            暂无考试记录。去模拟考试试试吧。
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const score = typeof s.score === 'number' ? s.score : 0;
              const pct = Math.round((score / s.total_questions) * 100);
              return (
                <div
                  key={s.id}
                  className="rounded-lg border border-theme bg-theme-card p-4 flex items-center justify-between"
                >
                  <div>
                    <div className="text-sm text-theme-secondary">{s.title}</div>
                    <div className="text-xs text-theme-muted mt-1">
                      {new Date(s.started_at).toLocaleString('zh-CN')} · {s.total_questions} 题 ·
                      {' '}
                      {Math.round(s.time_limit_sec / 60)} 分钟
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-300">
                      {score}/{s.total_questions}
                    </div>
                    <div className="text-xs text-theme-muted">{pct}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
