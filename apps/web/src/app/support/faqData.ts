import { TRIAL_RULE } from '@/content/policy';

export const FAQ_GROUPS = [
  {
    id: 'setup',
    label: 'Getting started',
    items: [
      {
        id: 'q1',
        q: 'How long does it take to set up my digital menu?',
        a: 'About 3 minutes. Take a photo of your existing paper menu, upload it to vsite, and our AI reads it, matches professional food photos, writes item descriptions, and builds your complete digital storefront automatically. No design skills needed.',
      },
      {
        id: 'q2',
        q: 'Do my customers need to download an app?',
        a: 'No. Customers simply tap the NFC card or scan the QR sticker with their phone camera. The menu opens instantly in their browser — no app download, no sign-up, no friction of any kind.',
      },
      {
        id: 'q3',
        q: 'Is there a setup fee?',
        a: 'There is no setup fee. Your ₹299/month covers store creation, AI menu scanning, professional food photo matching, NFC card, QR stickers, and onboarding support.',
      },
    ],
  },
  {
    id: 'menu',
    label: 'Managing your menu',
    items: [
      {
        id: 'q4',
        q: 'How do I update my menu prices or add new items?',
        a: 'Log in to your vsite dashboard and go to Product Inventory. You can change prices, add or remove dishes, mark items as sold out, or post a daily special. All changes go live instantly — your customers see the updated menu within seconds.',
      },
      {
        id: 'q5',
        q: 'Can I add photos to my menu items?',
        a: 'Yes. vsite automatically generates professional food photos using AI when you set up your menu. You can also upload your own photos for any item from the dashboard at any time.',
      },
    ],
  },
  {
    id: 'orders',
    label: 'Orders & commission',
    items: [
      {
        id: 'q6',
        q: 'How do customers place orders through the QR menu?',
        a: 'Customers scan your QR code and browse your full menu on their phone — photos, prices, descriptions, and live sold-out status. They then order with your staff as usual. In-app ordering and payment are not part of vsite today.',
      },
      {
        id: 'q7',
        q: 'Is there a commission on orders?',
        a: 'Zero. vsite charges a flat monthly subscription only. Every rupee your customer pays goes directly to you — no per-order commission, no aggregator fee, no deductions. Your revenue is 100% yours.',
      },
      {
        id: 'q8',
        q: 'Does vsite handle customer payments?',
        a: 'No. vsite shows your menu — your customers pay you exactly as they do today, by cash, card or your own UPI QR. Nothing is routed through vsite, so there is no commission and no settlement delay.',
      },
    ],
  },
  {
    id: 'account',
    label: 'Account & billing',
    items: [
      {
        id: 'q9',
        q: 'What happens after the 7-day free trial?',
        a: 'After your trial ends, you choose a plan to continue. No credit card is needed to start — there is no automatic charge at the end of your trial. Your menu data stays safe and we will remind you before anything changes.',
      },
      {
        id: 'q11',
        q: 'Do I get a free trial for every store I add?',
        a: TRIAL_RULE,
      },
      {
        id: 'q10',
        q: 'Is vsite available outside Tamil Nadu?',
        a: 'vsite is built for restaurants across South India, starting with Tamil Nadu. The platform supports English and Tamil and is designed for the local F&B context — tiffin centres, cafés, hotels, food trucks, and more. We are expanding to other South Indian cities soon.',
      },
    ],
  },
];
