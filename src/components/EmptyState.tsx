export default function EmptyState({ title = '暂无数据', hint }: { title?: string; hint?: string }) {
  return (
    <div className="py-16 text-center text-theme-muted">
      <div className="text-lg text-theme-secondary mb-1">{title}</div>
      {hint && <div className="text-sm text-theme-muted opacity-70">{hint}</div>}
    </div>
  );
}
