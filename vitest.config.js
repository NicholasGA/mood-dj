import { defineConfig } from 'vitest/config'

// 仅跑纯逻辑单元测试（node 环境）。测试不打真实 QQ/Gemini 接口，外部依赖一律 mock。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,mjs}'],
  },
})
