import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sun, Moon } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useModeStore } from '../store/modeStore';

export default function Login() {
  const navigate = useNavigate();
  const { signIn, signUp, error, loading, user } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    if (user) {
      // 按当前模式跳转到对应首页，保证页面与导航栏一致；
      // 未选过模式则回欢迎页选模式
      const mode = useModeStore.getState().mode;
      const target =
        mode === 'memory' ? '/memory' : mode === 'quiz' ? '/' : '/welcome';
      navigate(target, { replace: true });
    }
  }, [user, navigate]);

  const toggleTheme = () => {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
      html.classList.remove('dark');
      html.classList.add('light');
      localStorage.setItem('theme', 'light');
      setIsDark(false);
    } else {
      html.classList.remove('light');
      html.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setIsDark(true);
    }
  };

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
    <div className="min-h-screen relative">
      {/* 顶部工具栏：返回 + 主题切换 */}
      <div className="absolute top-4 left-4 right-4 md:top-6 md:left-6 md:right-6 z-10 flex items-center justify-between">
        <button
          onClick={() => navigate('/welcome')}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-theme-card/60 backdrop-blur border border-theme text-theme-secondary hover:text-theme-primary hover:bg-theme-hover transition text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> 返回
        </button>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full bg-theme-card/60 backdrop-blur border border-theme text-theme-secondary hover:text-theme-primary hover:bg-theme-hover transition"
          title={isDark ? '切换到浅色模式' : '切换到深色模式'}
        >
          {isDark ? <Sun className="w-4 h-4 md:w-5 md:h-5" /> : <Moon className="w-4 h-4 md:w-5 md:h-5" />}
        </button>
      </div>

      <div className="min-h-screen flex items-center justify-center px-4">
        <form
          onSubmit={submit}
          className="w-full max-w-sm rounded-xl border border-theme bg-theme-card p-6 shadow-lg"
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
    </div>
  );
}
