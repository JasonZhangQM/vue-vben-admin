import { defineConfig } from '@vben/vite-config';

export default defineConfig(async () => {
  return {
    application: {},
    vite: {
      server: {
        proxy: {
          '/api': {
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, ''),
            // FastAPI 后端（uvicorn）
            target: 'http://127.0.0.1:8100/api/v1',
            ws: true,
          },
        },
      },
    },
  };
});
