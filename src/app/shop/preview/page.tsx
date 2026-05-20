'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import QRMenuTemplate, { type Tier } from '@/components/templates/QRMenuTemplate';

const SAMPLE_PRODUCTS = [
  { id: '1', name: 'The Matilda Cake', selling_price: 280, description: 'One serve includes 100ml of milk added sugar and coffee powder', category: 'Signature Cakes', food_type: 'veg', is_live: true, image_url: null },
  { id: '2', name: 'Heaven Cake', selling_price: 399, description: 'One serve includes 100ml of milk added sugar and coffee powder', category: 'Signature Cakes', food_type: 'egg', is_live: true, image_url: null },
  { id: '3', name: 'Milk Cake', selling_price: 200, description: 'One serve includes 100ml of milk added sugar and coffee powder', category: 'Signature Cakes', food_type: 'veg', is_live: true, image_url: null },
  { id: '4', name: 'Chocolate Milk Shake', selling_price: 195, description: 'One serve includes 100ml of milk added sugar and coffee powder', category: 'Milk Shake', food_type: 'veg', is_live: true, image_url: null },
  { id: '5', name: 'Oreo Milk Shake', selling_price: 180, description: 'One serve includes 100ml of milk added sugar and coffee powder', category: 'Milk Shake', food_type: 'veg', is_live: true, image_url: null },
  { id: '6', name: 'Smoothy Waffle', selling_price: 200, description: 'One serve includes 100ml of milk added sugar and coffee powder', category: 'Waffles', food_type: 'veg', is_live: true, image_url: null },
];

function PreviewContent() {
  const params = useSearchParams();
  const tier = (params.get('tier') === 'order' ? 'order' : 'view') as Tier;

  return (
    <div style={{ minHeight: '100dvh', background: '#F0F0F0', display: 'flex', flexDirection: 'column' }}>
      {/* Preview banner */}
      <div style={{
        background: '#1A1A2E', color: '#FFFFFF',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', gap: 12, flexWrap: 'wrap',
        fontFamily: "'Outfit', 'Inter', sans-serif", fontSize: 12,
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>👁</span>
          <span style={{ fontWeight: 600 }}>Store Preview</span>
          <span style={{
            padding: '1px 8px', borderRadius: 99,
            background: tier === 'order' ? '#16A34A20' : '#5452F620',
            color: tier === 'order' ? '#4ADE80' : '#A5B4FC',
            fontSize: 11, fontWeight: 600,
          }}>
            {tier === 'order' ? 'Pay & Eat plan' : 'QR Menu plan'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/shop/preview?tier=view" style={{
            padding: '4px 10px', borderRadius: 6, textDecoration: 'none',
            background: tier === 'view' ? '#5452F6' : 'transparent',
            border: `1px solid ${tier === 'view' ? '#5452F6' : '#444'}`,
            color: '#FFFFFF', fontSize: 11, fontWeight: 500,
          }}>view</a>
          <a href="/shop/preview?tier=order" style={{
            padding: '4px 10px', borderRadius: 6, textDecoration: 'none',
            background: tier === 'order' ? '#5452F6' : 'transparent',
            border: `1px solid ${tier === 'order' ? '#5452F6' : '#444'}`,
            color: '#FFFFFF', fontSize: 11, fontWeight: 500,
          }}>order</a>
          <a href="/manage/dashboard" style={{
            padding: '4px 10px', borderRadius: 6, textDecoration: 'none',
            border: '1px solid #444', color: '#FFFFFF', fontSize: 11, fontWeight: 500,
          }}>← Dashboard</a>
        </div>
      </div>

      {/* Template */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <QRMenuTemplate
          shopName="Cream Story"
          shopTagline="An artisan story of dreams"
          menuProducts={SAMPLE_PRODUCTS}
          banners={[]}
          tier={tier}
          shopId="preview"
          shopSlug="preview"
        />
      </div>
    </div>
  );
}

export default function PreviewPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', color: '#71717A' }}>
        Loading preview…
      </div>
    }>
      <PreviewContent />
    </Suspense>
  );
}
