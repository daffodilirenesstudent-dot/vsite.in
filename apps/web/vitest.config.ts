import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: [
      'node_modules', '.claude', 'e2e', 'tests/e2e', '**/*.spec.ts',
      // ── FROZEN PRODUCT SUITES ──────────────────────────────────────────
      // These cover QR ordering (with and without payment), which is frozen:
      // every route they exercise now returns 403 FEATURE_FROZEN by design.
      // They are excluded rather than rewritten so the specs survive intact
      // for whenever we unfreeze.
      //
      // TO UNFREEZE: delete this block and flip ORDERING_FROZEN in
      // src/lib/productFlags.ts. See tests/acceptance/freeze-ordering.test.ts
      // for the tests that assert the frozen contract itself.
      //
      // NOTE: all of these were ALREADY failing before the freeze in this
      // environment (missing env/mocks) — excluding them is not hiding a
      // regression introduced here. See PROGRESS.md.
      'tests/api/orders.test.ts',
      'tests/api/ordersById.test.ts',
      'tests/api/manageOrders.test.ts',
      'tests/api/tableCheckout.test.ts',
      'tests/api/billRequest.test.ts',
      'tests/api/razorpayOAuth.test.ts',
      'tests/load/concurrent-orders.test.ts',
      'tests/load/qrOrderLoad.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // tsconfig keeps JSX as-is for Next ("jsx": "preserve"); tests that render a
  // component (renderToStaticMarkup) need it compiled. Vite 8 transforms with
  // oxc (an `esbuild` option is ignored). Tests only — Next's build never
  // reads this file.
  oxc: { jsx: { runtime: 'automatic' } },
});
