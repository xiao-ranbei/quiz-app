import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { BookOpen, LogIn, LogOut, Menu, X, User } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const navItems = [
  { to: '/', label: '首页' },
  { to: '/questions', label: '题库' },
  { to: '/practice', label: '练习' },
  { to: '/exam', label: '考试' },
  { to: '/wrong', label: '错题本' },
  { to: '/submit', label: '贡献题目' },
  { to: '/me', label: '我的' },
];

export default function Navbar() {
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <header className="bg-slate-900/80 border-b border-slate-700 sticky top-0 z-40 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-brand-300 hover:text-white">
          <BookOpen className="w-6 h-6" />
          <span className="font-semibold text-lg">刷题平台</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `px-3 py-2 rounded-md text-sm transition-colors ${
                isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`
            }
          >
            {item.label}
          </NavLink>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          {user ? (
            <>
              <span className="text-sm text-slate-300 flex items-center gap-1">
              <User className="w-4 h-4" />
              {user.email?.split('@')[0]}
            </span>
              <button
                onClick={handleSignOut}
                className="px-3 py-1.5 text-sm rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700"
              >
                <span className="inline-flex items-center gap-1">
                  <LogOut className="w-4 h-4" /> 退出
                </span>
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="px-3 py-1.5 text-sm rounded-md bg-brand-600 hover:bg-brand-500 text-white"
            >
              <span className="inline-flex items-center gap-1">
                <LogIn className="w-4 h-4" /> 登录
              </span>
            </Link>
          )}
        </div>

        <button
          className="md:hidden text-slate-300"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="切换菜单"
        >
          {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-slate-700">
          <nav className="flex flex-col p-3 gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm ${
                    isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <div className="mt-2 pt-2 border-t border-slate-800">
              {user ? (
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-3 py-2 text-sm rounded-md bg-slate-800 text-slate-200"
                >
                  退出登录
                </button>
              ) : (
                <Link
                  to="/login"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-2 text-sm rounded-md bg-brand-600 text-white"
                >
                  登录 / 注册
                </Link>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
