import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    env: {
      VIBEOS_AUTH_DISABLED: 'true',
    },
    // drvfs(/mnt) 慢盘 + 全量并行下，动态 import app 与 openssl/ssh-keygen
    // 子进程启动可能超过默认 10s，放宽钩子与用例超时
    hookTimeout: 60000,
    testTimeout: 60000,
    // WSL drvfs 并发 IO 瓶颈：限制 worker 数避免文件级超时
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 4,
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/__tests__/**',
        'src/server.ts',
        'src/**/*.types.ts',
        'vitest.config.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
