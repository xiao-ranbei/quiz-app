import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function Login() {
  const navigate = useNavigate();
  const { signIn, signUp, error, loading, user } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') {
      try {
        await signIn(email, password);
      } catch {
        // 错误会由 authStore.error 展示
      }
    } else {
      try {
        await signUp(email, password);
      } catch {
        // 错误会由 authStore.error 展示
      }
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-theme bg-theme-card p-6"
      >
        <h1 className="text-2xl font-bold text-theme-primary mb-1">
          {mode === 'login' ? '登录' : '注册'}
        </h1>
        <p className="text-sm text-theme-muted mb-5">
          使用邮箱与密码登录，无需邮箱验证。
        </p>

        <label className="block text-sm text-theme-secondary mb-1.5">邮箱</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          className="input-theme w-full mb-3"
        />

        <label className="block text-sm text-theme-secondary mb-1.5">密码</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="至少 6 位"
          minLength={6}
          required
          className="input-theme w-full mb-3"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium disabled:opacity-60"
        >
          {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
        </button>

        {error && (
          <div className="mt-3 text-sm text-rose-600 dark:text-rose-300 whitespace-pre-wrap">
            {error}
          </div>
        )}

        <div className="mt-5 text-sm text-theme-muted text-center">
          {mode === 'login' ? (
            <>
              还没有账号？
              <button
                type="button"
                onClick={() => setMode('register')}
                className="text-brand-600 dark:text-brand-300 hover:underline ml-1"
              >
                去注册
              </button>
            </>
          ) : (
            <>
              已有账号？
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-brand-600 dark:text-brand-300 hover:underline ml-1"
              >
                去登录
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
