import { useEffect, useRef, useState } from 'react';
import { Loader2, Volume2, VolumeX } from 'lucide-react';
import { extractAudio } from '../lib/apkg-import';

interface AudioPlayerProps {
  /** 牌组 ID（用于从 deck.metadata.media_map 查找音频索引） */
  deckId: string;
  /** 音频文件名，如 "eggrolls_JLPT10k_v3-0001.mp3" */
  filename: string;
  /** 可选：自定义按钮大小 */
  size?: 'sm' | 'md';
  /** 可选：自定义按钮样式 */
  className?: string;
}

/**
 * 音频懒加载播放组件
 *
 * 首次点击播放时调用 extract-audio Edge Function 提取音频并缓存到 Storage，
 * 后续播放直接使用缓存的公开 URL。
 */
export default function AudioPlayer({
  deckId,
  filename,
  size = 'sm',
  className = '',
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 组件卸载时重置
  useEffect(() => {
    return () => {
      setUrl(null);
      setLoading(false);
      setPlaying(false);
      setError(null);
    };
  }, [filename]);

  const handleClick = async () => {
    // 已有 URL：直接播放/暂停
    if (url) {
      const audio = audioRef.current;
      if (!audio) return;
      if (playing) {
        audio.pause();
      } else {
        await audio.play().catch(() => {
          setError('播放失败，请重试');
        });
      }
      return;
    }

    // 无 URL：懒加载提取
    setLoading(true);
    setError(null);
    try {
      const audioUrl = await extractAudio(deckId, filename);
      setUrl(audioUrl);
      // URL 设置后等待 audio 元素加载，然后播放
      setTimeout(() => {
        audioRef.current?.play().catch(() => {
          setError('播放失败，请重试');
        });
      }, 100);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const sizeClass = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9';
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <span className={`inline-flex flex-col ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        title={error ?? `播放音频: ${filename}`}
        className={`${sizeClass} rounded-full flex items-center justify-center transition shrink-0 disabled:opacity-50 ${
          error
            ? 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20'
            : playing
              ? 'bg-brand-500/15 text-brand-600 dark:text-brand-300 hover:bg-brand-500/25'
              : 'bg-theme-input text-theme-secondary hover:bg-theme-hover'
        }`}
      >
        {loading ? (
          <Loader2 className={`${iconSize} animate-spin`} />
        ) : error ? (
          <VolumeX className={iconSize} />
        ) : (
          <Volume2 className={iconSize} />
        )}
      </button>
      {error && (
        <span className="text-[10px] text-rose-500 mt-0.5 max-w-[80px] truncate">
          {error}
        </span>
      )}
      {url && (
        <audio
          ref={audioRef}
          src={url}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => {
            setError('音频加载失败');
            setPlaying(false);
          }}
          preload="none"
          className="hidden"
        />
      )}
    </span>
  );
}
