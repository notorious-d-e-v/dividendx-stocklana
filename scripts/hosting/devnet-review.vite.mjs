import base from '../../apps/web/vite.config.ts';
import { createDevnetReviewBridge } from './devnet-review-bridge.mjs';

export default {
  ...base,
  cacheDir: '/tmp/dividendx-devnet-review-vite-cache',
  server: { ...base.server, host: '127.0.0.1', port: 4184, strictPort: true },
  plugins: [...base.plugins, {
    name: 'local-devnet-review',
    configureServer(server) { server.middlewares.use(createDevnetReviewBridge()); },
  }],
};
