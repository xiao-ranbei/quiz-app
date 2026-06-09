import { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Questions from './pages/Questions';
import Practice from './pages/Practice';
import Exam from './pages/Exam';
import WrongBook from './pages/WrongBook';
import SubmitQuestion from './pages/SubmitQuestion';
import Profile from './pages/Profile';
import Login from './pages/Login';
import { initAuth } from './store/authStore';

export default function App() {
  useEffect(() => {
    initAuth();
  }, []);

  return (
    <HashRouter>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <Navbar />
        <main className="px-4">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/questions" element={<Questions />} />
            <Route path="/practice" element={<Practice />} />
            <Route path="/exam" element={<Exam />} />
            <Route path="/wrong" element={<WrongBook />} />
            <Route path="/submit" element={<SubmitQuestion />} />
            <Route path="/me" element={<Profile />} />
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </main>
        <footer className="py-10 text-center text-xs text-slate-600">
          © {new Date().getFullYear()} Quiz App
        </footer>
      </div>
    </HashRouter>
  );
}
