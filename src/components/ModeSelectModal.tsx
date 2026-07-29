import { Brain, ClipboardList, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useModeStore } from '../store/modeStore';

export default function ModeSelectModal() {
  const { mode, setMode } = useModeStore();
  const navigate = useNavigate();

  if (mode !== null) return null;

  const handleSelect = (selected: 'quiz' | 'memory') => {
    setMode(selected);
    navigate(selected === 'quiz' ? '/' : '/memory');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-theme-card border border-theme rounded-2xl p-8 max-w-2xl w-full mx-4">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 text-brand-600 dark:text-brand-300 mb-3">
            <BookOpen className="w-8 h-8" />
            <span className="text-2xl font-bold text-theme-primary">Quiz</span>
          </div>
          <h2 className="text-lg text-theme-secondary">选择你想使用的模式</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => handleSelect('quiz')}
            className="flex flex-col items-center gap-3 p-6 rounded-xl border border-theme bg-theme-input hover:border-brand-500 transition-colors"
          >
            <ClipboardList className="w-12 h-12 text-brand-600 dark:text-brand-300" />
            <div className="text-lg font-semibold text-theme-primary">刷题模式</div>
            <div className="text-sm text-theme-muted text-center">
              题库练习、模拟考试、错题本、AI 出题
            </div>
          </button>

          <button
            onClick={() => handleSelect('memory')}
            className="flex flex-col items-center gap-3 p-6 rounded-xl border border-theme bg-theme-input hover:border-brand-500 transition-colors"
          >
            <Brain className="w-12 h-12 text-emerald-600 dark:text-emerald-300" />
            <div className="text-lg font-semibold text-theme-primary">背诵模式</div>
            <div className="text-sm text-theme-muted text-center">
              记忆卡片、间隔复习、SM-2 算法
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
