// Template registry — one line per template.
// ShopPageClient resolves the template component from the site type.

import { lazy } from 'react';

export const TEMPLATE_MAP = {
  'qr-menu': lazy(() => import('./QRMenuTemplate')),
  // future: 'kiosk': lazy(() => import('./KioskTemplate')),
} as const;

export type TemplateName = keyof typeof TEMPLATE_MAP;
export const DEFAULT_TEMPLATE: TemplateName = 'qr-menu';
