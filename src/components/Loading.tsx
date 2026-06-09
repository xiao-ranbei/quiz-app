export default function Loading({ label = '加载中...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
      <span className="inline-block w-4 h-4 border-2 border-slate-500 border-t-brand-400 rounded-full animate-spin mr-2"></span>
      {label}
    </div>
  );
}
