import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // 兼容旧的自运行断言脚本（非 vitest 套件）
    exclude: [
      '**/node_modules/**',
      'src/lib/cache.test.ts',
      'src/lib/sm2.test.ts',
    ],
  },
});
