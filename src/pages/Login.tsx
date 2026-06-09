import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface FormData {
  email: string;
  password: string;
}

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: FormData) => {
    setMsg(null);
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: data.email,
          password: data.password,
        });
        if (error) throw error;
        setMsg({ ok: true, text: '注册成功，已自动登录。' });
        setTimeout(() => navigate('/'), 800);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });
        if (error) throw error;
        navigate('/');
      }
    } catch (e) {
      setMsg({
        ok: false,
        text: e instanceof Error ? e.message : '操作失败',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="py-16 max-w-md mx-auto">
      <div className="rounded-2xl bg-slate-800/40 border border-slate-700 p-8">
        <h1 className="text-2xl font-bold text-slate-100 text-center mb-1">
          {mode === 'signin' ? '登录' : '注册'}
        </h1>
        <p className="text-sm text-slate-400 text-center mb-6">刷题平台</p>

        <div className="flex gap-2 mb-5">
          <button
            type="button"
            onClick={() => setMode('signin')}
            className={`flex-1 px-4 py-2 text-sm rounded-md border ${
              mode === 'signin'
                ? 'bg-brand-600 text-white border-brand-500'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 px-4 py-2 text-sm rounded-md border ${
              mode === 'signup'
                ? 'bg-brand-600 text-white border-brand-500'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            注册
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">邮箱</label>
            <input
              type="email"
              {...register('email', { required: true })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-100 text-sm"
            />
            {errors.email && (
              <div className="text-xs text-rose-400 mt-1">请填写邮箱</div>
            )}
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">密码（至少 6 位）</label>
            <input
              type="password"
              {...register('password', { required: true, minLength: 6 })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-100 text-sm"
            />
            {errors.password && (
              <div className="text-xs text-rose-400 mt-1">密码至少 6 位</div>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-md text-sm disabled:opacity-60"
          >
            {loading ? '处理中...' : mode === 'signin' ? '登录' : '注册'}
          </button>
        </form>

        {msg && (
          <div
            className={`mt-4 text-sm rounded-md p-3 border ${
              msg.ok
                ? 'border-emerald-600/60 bg-emerald-900/30 text-emerald-200'
                : 'border-rose-600/60 bg-rose-900/30 text-rose-200'
            }`}
          >
            {msg.text}
          </div>
        )}

        <div className="mt-5 text-xs text-slate-500 text-center">
          返回 <Link to="/" className="text-brand-300 hover:underline">首页</Link>
        </div>
      </div>
    </div>
  );
}
