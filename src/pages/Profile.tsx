import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AIConfig, ExamSession } from '../types';
import { getAIConfig, saveAIConfig, testAIConnection } from '../lib/ai';
import { getExamSessions, getUserStats } from '../lib/questions';
import { useAuthStore } from '../store/authStore';
import Loading from '../components/Loading';

export default function Profile() {
  const { user, signOut } = useAuthStore();
  const [stats, setStats] = useState<{ totalAnswered: number; correct: number; wrongCount: number; examCount: number } | null>(null);
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [aiCfg, setAiCfg] = useState<AIConfig>({ api_base_url: '', api_key: '', model: '' });
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
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
        <div className="text-lg text-slate-200 mb-2">请先登录</div>
        <Link to="/login" className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm">
          去登录
        </Link>
      </div>
    );
  }

  if (!stats) return <Loading />;

  const accuracy = stats.totalAnswered > 0 ? Math.round((stats.correct / stats.totalAnswered) * 100) : 0;

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 mb-1">个人中心</h1>
          <div className="text-sm text-slate-400">{user.email}</div>
        </div>
        <button
          onClick={() => signOut()}
          className="px-4 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700"
        >
          退出登录
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-4">
          <div className="text-2xl font-bold text-slate-100">{stats.totalAnswered}</div>
          <div className="text-sm text-slate-400">累计答题</div>
        </div>
        <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-4">
          <div className="text-2xl font-bold text-emerald-300">{accuracy}%</div>
          <div className="text-sm text-slate-400">正确率</div>
        </div>
        <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-4">
          <div className="text-2xl font-bold text-rose-300">{stats.wrongCount}</div>
          <div className="text-sm text-slate-400">错题总数</div>
        </div>
        <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-4">
          <div className="text-2xl font-bold text-brand-300">{stats.examCount}</div>
          <div className="text-sm text-slate-400">考试次数</div>
        </div>
      </div>

      <section className="rounded-xl bg-slate-800/40 border border-slate-700 p-5 mb-8">
        <h2 className="text-lg font-semibold text-slate-100 mb-3">AI API 配置</h2>
        <p className="text-sm text-slate-400 mb-4">
          配置后可在做题后请求 AI 解析，也可借助 AI 辅助出题。使用 OpenAI 兼容的接口格式。Key 仅在你的账号下可见。
        </p>
        <div className="grid md:grid-cols-3 gap-3">
          <input
            value={aiCfg.api_base_url}
            onChange={(e) => setAiCfg({ ...aiCfg, api_base_url: e.target.value })}
            placeholder="API Base URL（如 https://api.openai.com/v1）"
            className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-100 text-sm"
          />
          <input
            value={aiCfg.api_key}
            type="password"
            onChange={(e) => setAiCfg({ ...aiCfg, api_key: e.target.value })}
            placeholder="API Key"
            className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-100 text-sm"
          />
          <input
            value={aiCfg.model}
            onChange={(e) => setAiCfg({ ...aiCfg, model: e.target.value })}
            placeholder="Model（如 gpt-4o-mini）"
            className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-100 text-sm"
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
            className="px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200"
          >
            测试连接
          </button>
          {msg && <span className="text-sm text-emerald-300 ml-3">{msg}</span>}
          {testResult && (
            <span className={`text-sm ml-3 ${testResult.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
              {testResult.msg}
            </span>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-100 mb-3">最近考试记录</h2>
        {sessions.length === 0 ? (
          <div className="text-sm text-slate-400 rounded-xl bg-slate-800/40 border border-slate-700 p-5">
            暂无考试记录。去 <Link to="/exam" className="text-brand-300 hover:underline">模拟考试</Link> 试试吧。
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="rounded-lg bg-slate-800/60 border border-slate-700 p-4 flex items-center justify-between"
              >
                <div>
                  <div className="text-sm text-slate-200">{s.title}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {new Date(s.started_at).toLocaleString('zh-CN')} · {s.total_questions} 题 ·{' '}
                    {Math.round(s.time_limit_sec / 60)} 分钟
                  </div>
                </div>
                <div className="text-right">
                  {typeof s.score === 'number' ? (
                    <>
                      <div className="text-lg font-semibold text-emerald-300">
                        {s.score}/{s.total_questions}
                      </div>
                      <div className="text-xs text-slate-500">
                        {Math.round((s.score / s.total_questions) * 100)}%
                      </div>
                    </>
                  ) : (
                    <span className="text-sm text-slate-400">未完成</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
