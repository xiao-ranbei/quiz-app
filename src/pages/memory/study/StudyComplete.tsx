import { formatDuration } from './studyUtils';

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: 'emerald' | 'rose' | 'brand' | 'amber';
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    rose: 'text-rose-600 dark:text-rose-400',
    brand: 'text-brand-600 dark:text-brand-400',
    amber: 'text-amber-600 dark:text-amber-400',
  };
  return (
    <div className="rounded-lg border border-theme bg-theme-input p-4">
      <div className="text-xs text-theme-muted mb-1">{label}</div>
      <div className={`text-xl font-bold ${colorMap[color]}`}>{value}</div>
    </div>
  );
}

interface StudyCompleteProps {
  correctCount: number;
  wrongCount: number;
  startTime: number | null;
  onBack: () => void;
  onRestart: () => void;
}

export default function StudyComplete({
  correctCount,
  wrongCount,
  startTime,
  onBack,
  onRestart,
}: StudyCompleteProps) {
  const duration = startTime ? Date.now() - startTime : 0;
  const total = correctCount + wrongCount;
  const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  return (
    <div className="rounded-xl border border-theme bg-theme-card p-8 text-center">
      <div className="text-2xl font-bold text-theme-primary mb-2">
        本轮完成 🎉
      </div>
      <div className="text-sm text-theme-muted mb-6">
        共复习 {total} 张卡片
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatBox label="答对" value={String(correctCount)} color="emerald" />
        <StatBox label="答错" value={String(wrongCount)} color="rose" />
        <StatBox label="用时" value={formatDuration(duration)} color="brand" />
        <StatBox label="正确率" value={`${accuracy}%`} color="amber" />
      </div>
      <div className="flex justify-center gap-3">
        <button
          onClick={onBack}
          className="px-5 py-2.5 text-sm rounded-md border border-theme text-theme-secondary hover:bg-theme-hover"
        >
          返回牌组
        </button>
        <button
          onClick={onRestart}
          className="px-5 py-2.5 text-sm rounded-md bg-brand-600 hover:bg-brand-500 text-white"
        >
          再来一轮
        </button>
      </div>
    </div>
  );
}
