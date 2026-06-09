export default function EmptyState({ title = '暂无数据', hint }: { title?: string; hint?: string }) {
  return (
    <div className="py-16 text-center text-slate-400">
      <div className="text-lg text-slate-300 mb-1">{title}</div>
      {hint && <div className="text-sm text-slate-500">{hint}</div>}
    </div>
  );
}
