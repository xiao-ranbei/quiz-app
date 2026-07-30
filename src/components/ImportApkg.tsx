import { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import {
  importApkg,
  type ApkgImportResult,
  type ImportStage,
} from '../lib/apkg-import';
import { useRequireAuth } from '../store/useRequireAuth';
import { toast } from '../store/toastStore';

const STAGE_LABEL: Record<ImportStage, string> = {
  idle: '准备中',
  uploading: '上传中...',
  parsing: '解析导入中...',
  done: '导入完成',
  error: '导入失败',
};

interface ImportApkgProps {
  /** 导入成功后的回调（通常用于刷新牌组列表） */
  onImported?: () => void;
}

export default function ImportApkg({ onImported }: ImportApkgProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<ImportStage>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ApkgImportResult | null>(null);
  const requireAuth = useRequireAuth();

  const handleFile = async (file: File) => {
    if (!requireAuth('请登录后导入 .apkg 文件')) return;

    if (!file.name.toLowerCase().endsWith('.apkg')) {
      toast.error('请选择 .apkg 格式的文件');
      return;
    }

    setStage('uploading');
    setMessage(`正在上传 ${file.name}...`);
    setResult(null);

    try {
      const res = await importApkg(file, undefined, (s, m) => {
        setStage(s);
        if (m) setMessage(m);
      });
      setResult(res);
      setStage('done');
      toast.success(`导入成功：${res.decks.length} 个牌组，${res.totalCards} 张卡片`);
      onImported?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage(msg);
      setStage('error');
      toast.error('导入失败：' + msg);
    }
  };

  const reset = () => {
    setStage('idle');
    setMessage(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const isWorking = stage === 'uploading' || stage === 'parsing';

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".apkg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={isWorking}
        className="px-4 py-2 text-sm bg-theme-card border border-theme text-theme-secondary hover:bg-theme-hover rounded-md flex items-center gap-1.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isWorking ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Upload className="w-4 h-4" />
        )}
        导入 .apkg
      </button>

      {/* 进度弹窗 */}
      {stage !== 'idle' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={isWorking ? undefined : reset}
        >
          <div
            className="w-full max-w-md rounded-xl bg-theme-card border border-theme shadow-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 关闭按钮（仅非工作状态显示） */}
            {!isWorking && (
              <button
                onClick={reset}
                className="absolute top-3 right-3 p-1.5 text-theme-muted hover:text-theme-secondary"
                aria-label="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {isWorking && (
              <div className="flex flex-col items-center gap-3 py-2">
                <Loader2 className="w-10 h-10 text-brand-500 animate-spin" />
                <div className="text-sm font-medium text-theme-primary">
                  {STAGE_LABEL[stage]}
                </div>
                {message && (
                  <div className="text-xs text-theme-muted text-center">
                    {message}
                  </div>
                )}
              </div>
            )}

            {stage === 'done' && result && (
              <div className="flex flex-col items-center gap-3 py-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                <div className="text-base font-semibold text-theme-primary">
                  导入成功
                </div>
                <div className="text-sm text-theme-secondary text-center">
                  共 {result.decks.length} 个牌组，{result.totalCards} 张卡片
                </div>
                {result.mediaCount > 0 && (
                  <div className="text-xs text-theme-muted">
                    包含 {result.mediaCount} 个音频文件（懒加载播放）
                  </div>
                )}
                {result.decks.length > 0 && (
                  <div className="w-full mt-2 space-y-1">
                    {result.decks.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between text-xs bg-theme-input rounded px-2 py-1.5"
                      >
                        <span className="text-theme-secondary line-clamp-1">
                          {d.name}
                        </span>
                        <span className="text-theme-muted shrink-0 ml-2">
                          {d.cardCount} 卡
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={reset}
                  className="mt-2 px-4 py-1.5 text-sm bg-brand-600 hover:bg-brand-500 text-white rounded-md"
                >
                  完成
                </button>
              </div>
            )}

            {stage === 'error' && (
              <div className="flex flex-col items-center gap-3 py-2">
                <AlertCircle className="w-10 h-10 text-rose-500" />
                <div className="text-base font-semibold text-theme-primary">
                  导入失败
                </div>
                {message && (
                  <div className="text-xs text-rose-500 text-center break-all">
                    {message}
                  </div>
                )}
                <button
                  onClick={reset}
                  className="mt-2 px-4 py-1.5 text-sm bg-brand-600 hover:bg-brand-500 text-white rounded-md"
                >
                  关闭
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
