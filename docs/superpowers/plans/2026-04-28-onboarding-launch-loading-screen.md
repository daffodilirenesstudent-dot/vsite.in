# Onboarding Launch Loading Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline "Creating your menu…" spinner on the Launch button with a full-screen animated loading overlay that cycles through meaningful status messages in sync with the backend call, then shows a success screen before redirecting to the dashboard.

**Architecture:** A new `LaunchLoadingScreen` component renders as a full-screen overlay when `launching === true`. It runs a timer that advances through 4 status messages (2.5 s each). The API call runs in parallel in `page.tsx`. The success state only triggers when BOTH the API has resolved successfully AND the messages have reached "Almost done." If the API finishes first, the component waits at the last message until it naturally advances. If the API is slow, the component holds at "Almost done." until the promise resolves. On API error, the overlay is dismissed and the error is surfaced back in SummaryPhase.

**Tech Stack:** Next.js 14 App Router, React 18, Tailwind CSS, TypeScript, `material-symbols-outlined` icon font.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/app/onboarding/components/LaunchLoadingScreen.tsx` | Full-screen animated overlay — messages, success state |
| Modify | `src/app/onboarding/page.tsx` | Wire `launchDone` state; render overlay; pass `onSuccess`/`onError` callbacks; remove old inline spinner from Launch button area |
| Modify | `src/app/onboarding/components/SummaryPhase.tsx` | Remove the inline spinner from the button (button just says "Launch My Menu" always — the overlay owns the loading UI) |

---

## Task 1: Create `LaunchLoadingScreen` component

**Files:**
- Create: `src/app/onboarding/components/LaunchLoadingScreen.tsx`

### What it does
- Renders a fixed full-screen overlay (`position: fixed, inset-0`) with a blurred white/violet background
- Cycles through `MESSAGES` on a 2.5 s interval via `setInterval`
- Exposes a `done` prop: when `done` becomes `true`, the component completes the current message (or advances immediately if stuck at the last one) then enters `success` state after 600 ms
- In `success` state: shows a green checkmark animation + "You're live!" heading + item count line
- Calls `onRedirect()` after 1.8 s in success state
- `error` prop: when truthy, the overlay is not shown (parent controls visibility via `show` prop)

### Props interface
```tsx
interface LaunchLoadingScreenProps {
  show: boolean;           // controls whether overlay is mounted
  done: boolean;           // API resolved successfully
  itemCount: number;       // passed into success message
  onRedirect: () => void;  // called after success animation completes
}
```

### Message sequence
```ts
const MESSAGES = [
  { text: 'Analyzing menu…',           icon: 'manage_search' },
  { text: 'Getting ready to publish…', icon: 'cloud_upload'  },
  { text: 'Menu engineering…',         icon: 'auto_awesome'  },
  { text: 'Almost done.',              icon: 'pending'        },
];
```

- [ ] **Step 1: Create the file with the full component**

Create `src/app/onboarding/components/LaunchLoadingScreen.tsx` with this exact content:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';

const MESSAGES = [
  { text: 'Analyzing menu…',           icon: 'manage_search' },
  { text: 'Getting ready to publish…', icon: 'cloud_upload'  },
  { text: 'Menu engineering…',         icon: 'auto_awesome'  },
  { text: 'Almost done.',              icon: 'pending'        },
];

const STEP_MS = 2500;
const LAST_IDX = MESSAGES.length - 1;

interface LaunchLoadingScreenProps {
  show: boolean;
  done: boolean;
  itemCount: number;
  onRedirect: () => void;
}

export default function LaunchLoadingScreen({
  show,
  done,
  itemCount,
  onRedirect,
}: LaunchLoadingScreenProps) {
  const [msgIdx, setMsgIdx]       = useState(0);
  const [success, setSuccess]     = useState(false);
  const [fadeMsg, setFadeMsg]     = useState(true);

  const doneRef    = useRef(done);
  const msgIdxRef  = useRef(0);
  const successRef = useRef(false);

  doneRef.current = done;

  // Reset when overlay is shown
  useEffect(() => {
    if (!show) return;
    setMsgIdx(0);
    setSuccess(false);
    setFadeMsg(true);
    msgIdxRef.current  = 0;
    successRef.current = false;
  }, [show]);

  // Advance messages on timer
  useEffect(() => {
    if (!show || success) return;

    const interval = setInterval(() => {
      const current = msgIdxRef.current;

      // If already at last message AND API is done → trigger success
      if (current === LAST_IDX && doneRef.current) {
        clearInterval(interval);
        if (!successRef.current) {
          successRef.current = true;
          setTimeout(() => setSuccess(true), 600);
        }
        return;
      }

      // Advance to next message (don't go past last)
      if (current < LAST_IDX) {
        const next = current + 1;
        msgIdxRef.current = next;
        setFadeMsg(false);
        setTimeout(() => {
          setMsgIdx(next);
          setFadeMsg(true);
        }, 220);
      }

      // If now at last and API already done
      if (msgIdxRef.current === LAST_IDX && doneRef.current && !successRef.current) {
        clearInterval(interval);
        successRef.current = true;
        setTimeout(() => setSuccess(true), 600);
      }
    }, STEP_MS);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  // When API resolves while stuck at last message
  useEffect(() => {
    if (!done || !show || successRef.current) return;
    if (msgIdxRef.current === LAST_IDX) {
      successRef.current = true;
      setTimeout(() => setSuccess(true), 600);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  // Redirect after success animation
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(onRedirect, 1800);
    return () => clearTimeout(t);
  }, [success, onRedirect]);

  if (!show) return null;

  const msg = MESSAGES[msgIdx];

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm px-6">
      {!success ? (
        <div className="flex flex-col items-center gap-6 text-center">
          {/* Spinning ring */}
          <div className="relative flex h-20 w-20 items-center justify-center">
            <div className="absolute inset-0 rounded-full border-4 border-primary/15" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-primary" />
            <span
              className={`material-symbols-outlined text-primary transition-all duration-220 ${fadeMsg ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}
              style={{ fontSize: 32 }}
            >
              {msg.icon}
            </span>
          </div>

          {/* Message */}
          <p
            className={`text-lg font-semibold text-slate-800 transition-all duration-220 ${fadeMsg ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
          >
            {msg.text}
          </p>

          {/* Step dots */}
          <div className="flex gap-2 mt-1">
            {MESSAGES.map((_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all duration-300 ${
                  i === msgIdx
                    ? 'w-5 h-2 bg-primary'
                    : i < msgIdx
                    ? 'w-2 h-2 bg-primary/40'
                    : 'w-2 h-2 bg-slate-200'
                }`}
              />
            ))}
          </div>

          <p className="text-xs text-slate-400 mt-2">Setting up your store — just a moment</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Success circle */}
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
            <span className="material-symbols-outlined text-emerald-600" style={{ fontSize: 40 }}>
              check_circle
            </span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-slate-800">You're live!</h2>
            <p className="mt-1.5 text-sm text-slate-500">
              {itemCount > 0
                ? `${itemCount} menu item${itemCount !== 1 ? 's' : ''} published successfully.`
                : 'Your store is ready. Add items from the dashboard.'}
            </p>
          </div>

          <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-1.5">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>rocket_launch</span>
            <span className="text-xs font-semibold text-primary">Redirecting to dashboard…</span>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the file exists**

```bash
ls src/app/onboarding/components/LaunchLoadingScreen.tsx
```
Expected: file listed, no error.

---

## Task 2: Wire `LaunchLoadingScreen` into `page.tsx`

**Files:**
- Modify: `src/app/onboarding/page.tsx`

Changes needed:
1. Import `LaunchLoadingScreen`
2. Add `launchDone` and `launchItemCount` state variables
3. Refactor `handleLaunch` to set `launchDone` on success instead of directly calling `router.replace`
4. Add an `onRedirect` callback that calls `router.replace`
5. Render `<LaunchLoadingScreen>` just before the closing `</div>` of the outer wrapper
6. Keep `launching` state as-is (it controls `show` prop)

- [ ] **Step 1: Add import for `LaunchLoadingScreen`**

In `src/app/onboarding/page.tsx`, after the `SummaryPhase` import line, add:

```tsx
import LaunchLoadingScreen from './components/LaunchLoadingScreen';
```

- [ ] **Step 2: Add `launchDone` and `launchItemCount` state**

Inside `OnboardingContent`, after the existing state declarations (near line 85), add:

```tsx
const [launchDone, setLaunchDone]           = useState(false);
const [launchItemCount, setLaunchItemCount] = useState(0);
```

- [ ] **Step 3: Refactor `handleLaunch`**

Replace the entire `handleLaunch` function (lines 188–240 in the original) with:

```tsx
const handleLaunch = async () => {
  if (!user || launching) return;
  setLaunching(true);
  setLaunchDone(false);

  try {
    const firebaseUser = firebaseAuth.currentUser;
    if (!firebaseUser) { setError('Session expired.'); setLaunching(false); return; }
    const token = await firebaseUser.getIdToken();

    const res = await fetch('/api/onboarding/complete', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        shopName: businessName.trim(),
        items: items.map(item => ({
          name: item.name,
          price: item.price,
          description: item.description,
          category: item.category,
          item_type: item.item_type,
          food_type: item.food_type,
          variants: item.variants,
          star_rating: item.star_rating,
          profit_tier: item.profit_tier,
          prep_complexity_tier: item.prep_complexity_tier,
        })),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Something went wrong. Please try again.');
      setLaunching(false);
      return;
    }

    if (data.siteId && firebaseAuth.currentUser) {
      localStorage.setItem(`activeSiteId_${firebaseAuth.currentUser.uid}`, data.siteId);
    }

    photos.forEach(p => URL.revokeObjectURL(p.url));

    // Signal the loading screen that backend is done
    setLaunchItemCount(data.itemCount ?? 0);
    setLaunchDone(true);
  } catch {
    setError('Network error. Please try again.');
    setLaunching(false);
  }
};
```

- [ ] **Step 4: Add `onRedirect` callback**

Directly below `handleLaunch`, add:

```tsx
const handleLaunchRedirect = () => {
  router.replace(`/manage/dashboard?onboarded=true&items=${launchItemCount}`);
};
```

- [ ] **Step 5: Render the overlay**

Inside the return, just before the final closing `</div>` of the outer `<div className="min-h-screen ...">` wrapper (after the `</main>` tag), add:

```tsx
<LaunchLoadingScreen
  show={launching}
  done={launchDone}
  itemCount={launchItemCount}
  onRedirect={handleLaunchRedirect}
/>
```

- [ ] **Step 6: Commit**

```bash
git add src/app/onboarding/page.tsx src/app/onboarding/components/LaunchLoadingScreen.tsx
git commit -m "feat: add launch loading screen overlay to onboarding"
```

---

## Task 3: Clean up SummaryPhase launch button

**Files:**
- Modify: `src/app/onboarding/components/SummaryPhase.tsx`

The button currently shows an inline spinner when `launching` is true. Since the overlay now owns all loading UI, the button should just always say "Launch My Menu" and disable itself (so it can't be double-clicked) while `launching` is true.

- [ ] **Step 1: Simplify the Launch button**

In `src/app/onboarding/components/SummaryPhase.tsx`, replace the entire `<button>` block in the Launch CTA section (the one with the `{launching ? (...) : (...)}` conditional) with:

```tsx
<button
  onClick={onLaunch}
  disabled={launching}
  className="w-full rounded-[10px] bg-primary py-3 text-sm font-bold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
>
  <span className="flex items-center justify-center gap-2">
    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>rocket_launch</span>
    Launch My Menu
  </span>
</button>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/components/SummaryPhase.tsx
git commit -m "refactor: simplify SummaryPhase launch button — overlay owns loading UI"
```

---

## Task 4: Smoke-test the full flow in browser

**Files:** none (manual verification)

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Navigate to onboarding**

Open `http://localhost:3000/onboarding?new=true` in a browser. Complete the wizard steps (setup → popularity → profitability → complexity → summary).

- [ ] **Step 3: Click "Launch My Menu" and verify**

Expected sequence:
1. Overlay appears immediately over the full screen
2. Message 1: "Analyzing menu…" with `manage_search` icon — ~2.5 s
3. Message 2: "Getting ready to publish…" with `cloud_upload` icon — ~2.5 s
4. Message 3: "Menu engineering…" with `auto_awesome` icon — ~2.5 s
5. Message 4: "Almost done." with `pending` icon — holds until API resolves
6. Success screen: green checkmark, "You're live!", item count, "Redirecting…"
7. Auto-redirect to `/manage/dashboard?onboarded=true&items=N`

- [ ] **Step 4: Verify error path**

To test the error path: temporarily modify `handleLaunch` in `page.tsx` to set `launching = true` but never call the API (or return a mocked 500). Confirm the overlay never shows success, and once `setLaunching(false)` is called, the overlay disappears and the error message appears in SummaryPhase. Revert the temporary change after confirming.

---

## Self-Review Notes

- **Spec coverage:** ✅ Timer-paced messages → Task 1 | ✅ API sync (success only after API resolves) → Task 1 `useEffect[done]` + `doneRef` | ✅ Success screen → Task 1 success state | ✅ Redirect → Task 2 `handleLaunchRedirect` | ✅ Error path → Task 2 refactored `handleLaunch`
- **No placeholders:** All code is complete and explicit.
- **Type consistency:** `LaunchLoadingScreenProps` defined in Task 1, used in Task 2 — `show/done/itemCount/onRedirect` match exactly.
- **`animate-in` class:** This uses Tailwind CSS v3 `tailwindcss-animate` plugin (common in Next.js starters). If the project doesn't have it, replace `animate-in fade-in slide-in-from-bottom-4 duration-500` on the success div with `transition-all duration-500 opacity-100 translate-y-0`.
