# Homepage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the vsite homepage to match the visual style of `home.html` and display all 13 sections from `src/components/home/HOMEPAGE_CONTENT.md`, targeted at Tamil Nadu F&B owners.

**Architecture:** Each homepage section is a standalone React component in `src/components/home/`. The `page.tsx` assembles them in order. Dark (#101922) and light sections alternate for visual rhythm, following the `home.html` reference. All design tokens from `tailwind.config.ts` are used (primary=#5452F6, Outfit font, background-dark=#101922).

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Outfit font (already configured)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/home/Navbar.tsx` | Rewrite | vsite logo, How It Works / Features / Pricing links, Start Free Trial CTA |
| `src/components/home/HeroSection.tsx` | Rewrite | Dark hero, badge pill, H1, sub-headline, 2 CTAs, trust strip, phone mockup |
| `src/components/home/CategoryStrip.tsx` | Create | Scrolling F&B business type marquee |
| `src/components/home/PainSection.tsx` | Create | Before/After comparison table, CTA |
| `src/components/home/ProductCards.tsx` | Create | QR Menu + Pay & Eat cards |
| `src/components/home/HowItWorks.tsx` | Rewrite | 3-step setup flow |
| `src/components/home/CustomerExperience.tsx` | Create | 5-step customer journey |
| `src/components/home/AIFeatures.tsx` | Create | 3 AI feature tiles |
| `src/components/home/LossAversion.tsx` | Create | 4 stat blocks + callout card |
| `src/components/home/Pricing.tsx` | Create | 2 pricing cards |
| `src/components/home/SocialProof.tsx` | Rewrite | 3 Tamil Nadu testimonials |
| `src/components/home/FinalCTA.tsx` | Rewrite | Final CTA banner + micro-trust icons |
| `src/components/home/FooterCTA.tsx` | Rewrite | Full 4-column footer |
| `src/app/page.tsx` | Update | Import and assemble all 13 sections |

## Section Order in page.tsx
1. Navbar
2. HeroSection
3. CategoryStrip
4. PainSection
5. ProductCards
6. HowItWorks
7. CustomerExperience
8. AIFeatures
9. LossAversion
10. Pricing
11. SocialProof
12. FinalCTA
13. Footer (FooterCTA)

---

## Tasks

### Task 1: Navbar
- [ ] Rewrite `src/components/home/Navbar.tsx` — vsite text logo, 3 nav links, Start Free Trial CTA with sub-label

### Task 2: HeroSection
- [ ] Rewrite `src/components/home/HeroSection.tsx` — dark bg, animated orbs, badge pill, H1, sub-headline, 2 CTAs, 4-item trust strip, phone mockup with floating UI cards

### Task 3: CategoryStrip
- [ ] Create `src/components/home/CategoryStrip.tsx` — CSS marquee of F&B types with emoji + label pairs

### Task 4: PainSection
- [ ] Create `src/components/home/PainSection.tsx` — 7-row before/after table, section label, H2, CTA

### Task 5: ProductCards
- [ ] Create `src/components/home/ProductCards.tsx` — 2 side-by-side cards with full feature lists

### Task 6: HowItWorks
- [ ] Rewrite `src/components/home/HowItWorks.tsx` — 3 steps: Enter Business Details, Upload Menu Photo, Put Card on Table

### Task 7: CustomerExperience
- [ ] Create `src/components/home/CustomerExperience.tsx` — 5-step customer journey cards

### Task 8: AIFeatures
- [ ] Create `src/components/home/AIFeatures.tsx` — 3 tiles: Food Photos, Menu Engineering, AI Descriptions

### Task 9: LossAversion
- [ ] Create `src/components/home/LossAversion.tsx` — 4 stat blocks, callout card, CTA

### Task 10: Pricing
- [ ] Create `src/components/home/Pricing.tsx` — 2 pricing cards with feature lists and CTAs

### Task 11: SocialProof
- [ ] Rewrite `src/components/home/SocialProof.tsx` — 3 Tamil Nadu testimonials with star ratings

### Task 12: FinalCTA
- [ ] Rewrite `src/components/home/FinalCTA.tsx` — dark bg CTA banner with 4 micro-trust icons

### Task 13: Footer
- [ ] Rewrite `src/components/home/FooterCTA.tsx` — 4 columns: Brand, Product, Company, Language & Support

### Task 14: Wire page.tsx
- [ ] Update `src/app/page.tsx` — import and assemble all sections in correct order
