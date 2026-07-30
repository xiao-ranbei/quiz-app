import { Brain, ClipboardList, BookOpen, Check, Zap, Sparkles, Target, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useModeStore } from '../store/modeStore';

const quizFeatures = [
  '题库练习，按分类刷题',
  '模拟考试，计时答题',
  '错题本，针对性复习',
  'AI 出题，智能生成',
];

const memoryFeatures = [
  '记忆卡片，闪卡翻转',
  'SM-2 间隔重复算法',
  '四种作答模式',
  '学习进度追踪',
];

const highlights = [
  { icon: Zap, title: 'SM-2 算法', desc: '科学间隔重复' },
  { icon: Sparkles, title: 'AI 出题', desc: '智能题目生成' },
  { icon: Target, title: '错题追踪', desc: '针对性复习' },
  { icon: TrendingUp, title: '进度可视', desc: '数据驱动学习' },
];

export default function Welcome() {
  const { setMode } = useModeStore();
  const navigate = useNavigate();

  const handleSelect = (mode: 'quiz' | 'memory') => {
    setMode(mode);
    navigate(mode === 'quiz' ? '/' : '/memory');
  };

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero 区 */}
      <section className="relative overflow-hidden py-20 px-4">
        <div
          className="absolute inset-0 -z-10 opacity-60"
          style={{
            background:
              'radial-gradient(ellipse at 30% 0%, rgba(139,92,246,0.15), transparent 50%), radial-gradient(ellipse at 70% 100%, rgba(16,185,129,0.10), transparent 50%)',
          }}
        />
        <div className="max-w-3xl mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <BookOpen className="w-12 h-12 text-brand-600 dark:text-brand-300" />
            <h1 className="text-5xl font-bold text-brand-600 dark:text-brand-300">Quiz</h1>
          </div>
          <h2 className="text-2xl font-semibold text-theme-primary mb-4">
            刷题与背诵，一站搞定
          </h2>
          <p className="text-base text-theme-muted max-w-2xl mx-auto leading-relaxed">
            无论是对抗遗忘的间隔复习，还是模拟实战的题库练习，Quiz 都能帮你高效记忆、巩固知识。
          </p>
        </div>
      </section>

      {/* 模式选择区 */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 刷题卡片 */}
          <button
            onClick={() => handleSelect('quiz')}
            className="group flex flex-col p-8 rounded-2xl border-2 border-theme bg-theme-card hover:border-brand-500 hover:-translate-y-1 transition-all duration-200 text-left"
          >
            <ClipboardList className="w-16 h-16 text-brand-600 dark:text-brand-300 mb-4" />
            <h3 className="text-2xl font-bold text-theme-primary mb-4">刷题模式</h3>
            <ul className="space-y-2 mb-6 flex-1">
              {quizFeatures.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-theme-secondary">
                  <Check className="w-4 h-4 text-brand-500 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <span className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-brand-600 text-white font-medium group-hover:bg-brand-700 transition-colors">
              进入刷题
            </span>
          </button>

          {/* 背诵卡片 */}
          <button
            onClick={() => handleSelect('memory')}
            className="group flex flex-col p-8 rounded-2xl border-2 border-theme bg-theme-card hover:border-emerald-500 hover:-translate-y-1 transition-all duration-200 text-left"
          >
            <Brain className="w-16 h-16 text-emerald-600 dark:text-emerald-300 mb-4" />
            <h3 className="text-2xl font-bold text-theme-primary mb-4">背诵模式</h3>
            <ul className="space-y-2 mb-6 flex-1">
              {memoryFeatures.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-theme-secondary">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <span className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-emerald-600 text-white font-medium group-hover:bg-emerald-700 transition-colors">
              进入背诵
            </span>
          </button>
        </div>
      </section>

      {/* 特色区 */}
      <section className="max-w-4xl mx-auto px-4 pb-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {highlights.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="flex flex-col items-center text-center p-6 rounded-xl bg-theme-card border border-theme"
            >
              <Icon className="w-8 h-8 text-brand-500 dark:text-brand-300 mb-3" />
              <div className="font-semibold text-theme-primary text-sm mb-1">{title}</div>
              <div className="text-xs text-theme-muted">{desc}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
