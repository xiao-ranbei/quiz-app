import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Questions from './pages/Questions';
import Practice from './pages/Practice';
import Exam from './pages/Exam';
import WrongBook from './pages/WrongBook';
import SubmitQuestion from './pages/SubmitQuestion';
import Profile from './pages/Profile';
import Login from './pages/Login';
import Welcome from './pages/Welcome';
import MemoryHome from './pages/memory/MemoryHome';
import DeckDetail from './pages/memory/DeckDetail';
import MemoryStudy from './pages/memory/MemoryStudy';
import AddCard from './pages/memory/AddCard';
import { initAuth } from './store/authStore';
import ToastContainer from './components/Toast';
import { useModeStore } from './store/modeStore';
import { applyModeToDocument } from './lib/theme';

// 落地页路径：这些页面不显示 Navbar 和 footer，作为独立的全屏落地体验
const LANDING_PATHS = new Set(['/welcome', '/login']);

function AppShell() {
  const { mode } = useModeStore();
  const location = useLocation();
  const isLanding = LANDING_PATHS.has(location.pathname);

  // 模式变化时同步全局色系（覆盖 Welcome 选择与 ModeSwitch 切换）
  useEffect(() => {
    applyModeToDocument(mode);
  }, [mode]);

  return (
    <div className="min-h-screen bg-theme-primary text-theme-primary">
      {!isLanding && <Navbar />}
      <main className={isLanding ? '' : 'px-4'}>
        <Routes>
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="*"
            element={mode === null ? <Navigate to="/welcome" replace /> : (
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/questions" element={<Questions />} />
                <Route path="/practice" element={<Practice />} />
                <Route path="/exam" element={<Exam />} />
                <Route path="/wrong" element={<WrongBook />} />
                <Route path="/submit" element={<SubmitQuestion />} />
                <Route path="/me" element={<Profile />} />
                {/* 背诵模块路由 */}
                <Route path="/memory" element={<MemoryHome />} />
                <Route path="/memory/deck/:id" element={<DeckDetail />} />
                <Route path="/memory/study/:deckId" element={<MemoryStudy />} />
                <Route path="/memory/add" element={<AddCard />} />
                <Route path="*" element={<Home />} />
              </Routes>
            )}
          />
        </Routes>
      </main>
      {!isLanding && (
        <footer className="py-10 text-center text-xs text-theme-muted">
          © {new Date().getFullYear()} Quiz App
        </footer>
      )}
      <ToastContainer />
    </div>
  );
}

export default function App() {
  useEffect(() => {
    initAuth();
  }, []);

  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  );
}
