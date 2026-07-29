import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useToastStore, type ToastType } from '../store/toastStore';

// 类型 → 图标 + 配色映射（兼容亮/暗主题）
const TYPE_STYLES: Record<
  ToastType,
  { icon: typeof Info; ring: string; iconColor: string }
> = {
  success: {
    icon: CheckCircle2,
    ring: 'border-emerald-500/40',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  error: {
    icon: AlertCircle,
    ring: 'border-rose-500/40',
    iconColor: 'text-rose-600 dark:text-rose-400',
  },
  warning: {
    icon: AlertTriangle,
    ring: 'border-amber-500/40',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  info: {
    icon: Info,
    ring: 'border-brand-500/40',
    iconColor: 'text-brand-600 dark:text-brand-300',
  },
};

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.remove);

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} id={t.id} type={t.type} message={t.message} onClose={remove} />
      ))}
    </div>
  );
}

function ToastItem({
  id,
  type,
  message,
  onClose,
}: {
  id: string;
  type: ToastType;
  message: string;
  onClose: (id: string) => void;
}) {
  const { icon: Icon, ring, iconColor } = TYPE_STYLES[type];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`animate-toast-in pointer-events-auto flex items-start gap-2 min-w-[260px] max-w-sm rounded-lg border ${ring} bg-theme-card shadow-lg px-3.5 py-2.5 text-sm text-theme-primary`}
    >
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
      <span className="flex-1 break-words">{message}</span>
      <button
        onClick={() => onClose(id)}
        className="p-0.5 text-theme-muted hover:text-theme-primary shrink-0"
        aria-label="关闭"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
