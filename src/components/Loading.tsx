export default function Loading({ label = '加载中...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-theme-muted text-sm">
      <span className="inline-block w-4 h-4 border-2 border-theme rounded-full animate-spin mr-2 border-t-brand-400"></span>
      {label}
    </div>
  );
}
