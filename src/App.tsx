import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
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

export default function App() {
  const { mode } = useModeStore();

  useEffect(() => {
    initAuth();
  }, []);

  return (
    <HashRouter>
      <div className="min-h-screen bg-theme-primary text-theme-primary">
        <Navbar />
        <main className="px-4">
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
        <footer className="py-10 text-center text-xs text-theme-muted">
          © {new Date().getFullYear()} Quiz App
        </footer>
        <ToastContainer />
      </div>
    </HashRouter>
  );
}
