import { Brain, ClipboardList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useModeStore } from '../store/modeStore';

export default function ModeSwitch() {
  const { mode, setMode } = useModeStore();
  const navigate = useNavigate();

  if (!mode) return null;

  const handleToggle = () => {
    if (mode === 'quiz') {
      setMode('memory');
      navigate('/memory');
    } else {
      setMode('quiz');
      navigate('/');
    }
  };

  return (
    <button
      onClick={handleToggle}
      className="p-2 rounded-md transition-colors text-brand-600 dark:text-brand-300 hover:bg-theme-hover"
      title={mode === 'quiz' ? '切换到背诵模式' : '切换到刷题模式'}
    >
      {mode === 'quiz' ? <Brain className="w-5 h-5" /> : <ClipboardList className="w-5 h-5" />}
    </button>
  );
}
