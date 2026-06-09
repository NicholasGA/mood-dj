import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// 纯逻辑单测跑 node 环境；少量 UI 冒烟测试用 jsdom（文件内 `// @vitest-environment jsdom` 覆盖）。
// react 插件用于把 JSX（App/组件）正确转译，让冒烟测试能真正 mount。
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,mjs,jsx}'],
  },
})
