import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import {
  clearAudioCache,
  collectUsedAudio,
  extractAndUploadAudio,
  extractAudio,
} from './apkg-import';
import { useAuthStore } from '../store/authStore';

const storageFromMock = vi.hoisted(() => ({
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));

const supabaseMock = vi.hoisted(() => ({
  storage: {
    from: vi.fn(() => storageFromMock),
  },
  functions: { invoke: vi.fn() },
  rpc: vi.fn(),
  auth: { getUser: vi.fn() },
}));

const decksMock = vi.hoisted(() => ({
  getDeck: vi.fn(),
}));

vi.mock('./supabase', () => ({ supabase: supabaseMock }));
vi.mock('./memory/decks', () => decksMock);

beforeEach(() => {
  vi.clearAllMocks();
  clearAudioCache();
  useAuthStore.setState({
    user: { id: 'u1', email: 'a@b.com' } as never,
    session: {} as never,
    loading: false,
    error: null,
  });
  storageFromMock.upload.mockResolvedValue({ error: null });
  storageFromMock.getPublicUrl.mockReturnValue({
    data: {
      publicUrl:
        'https://x.supabase.co/storage/v1/object/public/audio-cache/owner1/a.mp3',
    },
  });
});

describe('collectUsedAudio', () => {
  it('从卡片 metadata 收集去重后的音频文件名', () => {
    const decks = [
      {
        cards: [
          { metadata: { audio: 'a.mp3' } },
          { metadata: { audio: 'a.mp3', example_audio: 'b.mp3' } },
          { metadata: { audio: 'c.m4a', example_audio: 'b.mp3' } },
          { metadata: {} },
        ],
      },
    ];
    expect(collectUsedAudio(decks as never)).toEqual(['a.mp3', 'b.mp3', 'c.m4a']);
  });
});

describe('extractAndUploadAudio', () => {
  it('按 media_map 提取 entry 并上传到 audio-cache/{userId}/{filename}', async () => {
    const zip = new JSZip();
    zip.file('0', new Uint8Array([1, 2, 3]));
    const mediaMap = { 'a.mp3': '0' };

    const result = await extractAndUploadAudio(
      zip,
      mediaMap,
      ['a.mp3'],
      'u1',
    );

    expect(supabaseMock.storage.from).toHaveBeenCalledWith('audio-cache');
    expect(storageFromMock.upload).toHaveBeenCalledWith(
      'u1/a.mp3',
      new Uint8Array([1, 2, 3]),
      expect.objectContaining({ contentType: 'audio/mpeg', upsert: false }),
    );
    expect(result).toEqual({ uploaded: 1, skipped: 0, failed: [] });
  });

  it('文件已存在时跳过而不是报错', async () => {
    storageFromMock.upload.mockResolvedValue({
      error: { message: 'The resource already exists' },
    });
    const zip = new JSZip();
    zip.file('0', new Uint8Array([1]));
    const mediaMap = { 'a.mp3': '0' };

    const result = await extractAndUploadAudio(
      zip,
      mediaMap,
      ['a.mp3'],
      'u1',
    );

    expect(result).toEqual({ uploaded: 0, skipped: 1, failed: [] });
  });

  it('上传失败时把文件名记入 failed（供调用方决定中止）', async () => {
    storageFromMock.upload.mockResolvedValue({
      error: { message: 'quota exceeded' },
    });
    const zip = new JSZip();
    zip.file('0', new Uint8Array([1]));
    const mediaMap = { 'a.mp3': '0', 'b.mp3': '1' };
    zip.file('1', new Uint8Array([2]));

    const result = await extractAndUploadAudio(
      zip,
      mediaMap,
      ['a.mp3', 'b.mp3'],
      'u1',
    );

    expect(result).toEqual({
      uploaded: 0,
      skipped: 0,
      failed: ['a.mp3', 'b.mp3'],
    });
  });
});

describe('extractAudio', () => {
  it('直接返回 audio-cache 公开 URL，不再调用 Edge Function', async () => {
    decksMock.getDeck.mockResolvedValue({ creator_id: 'owner1' });

    const url = await extractAudio('deck1', 'a.mp3');

    expect(url).toBe(
      'https://x.supabase.co/storage/v1/object/public/audio-cache/owner1/a.mp3',
    );
    expect(supabaseMock.functions.invoke).not.toHaveBeenCalled();
    expect(supabaseMock.storage.from).toHaveBeenCalledWith('audio-cache');
    expect(storageFromMock.getPublicUrl).toHaveBeenCalledWith('owner1/a.mp3');
  });

  it('同一 deck+filename 只查询一次（模块级缓存）', async () => {
    decksMock.getDeck.mockResolvedValue({ creator_id: 'owner1' });

    await extractAudio('deck1', 'a.mp3');
    await extractAudio('deck1', 'a.mp3');

    expect(decksMock.getDeck).toHaveBeenCalledTimes(1);
    expect(storageFromMock.getPublicUrl).toHaveBeenCalledTimes(1);
  });
});
