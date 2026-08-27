import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",

        // ── Homepage: warm neutral ramp ("Grounded Bento") ───────
        // Replaces Tailwind's cold `slate` ramp on marketing surfaces.
        // Every value is AA-checked against the surface it sits on —
        // slate-400 (#94A3B8) was 2.56:1 on white and failed for BOTH
        // normal and large text. Contrast ratios noted per token.
        "ink":            "#12100E",   // headings          — 17.6:1 on paper
        "ink-70":         "#4A443E",   // body              —  8.9:1 on paper
        "ink-45":         "#6B635A",   // captions, eyebrow —  5.2:1 on paper
        "paper":          "#FDFCFA",   // page surface
        "paper-2":        "#F5F2ED",   // alternating band
        "line":           "#E6E1D8",   // hairline borders
        "night":          "#0E0E2C",   // hero / pricing / footer band
        "night-deep":     "#0A0A22",   // footer
        "accent-text":    "#4340D4",   // primary as TEXT   —  6.4:1 on paper
        "on-night":       "#FDFCFA",
        "on-night-70":    "rgba(253,252,250,0.80)",
        "on-night-45":    "rgba(253,252,250,0.62)",

        // ── Design System: Primary (Purple/Violet) ──────────────
        "primary":        "#5452F6",   // main CTA, active states
        "primary-dark":   "#3D3BDE",   // hover / pressed
        "primary-light":  "#EEEEFF",   // tint surface (hover bg, selected bg)

        // ── Design System: Neutral ───────────────────────────────
        "neutral-50":     "#F8F9FA",
        "neutral-100":    "#F1F3F5",
        "neutral-200":    "#E9ECEF",
        "neutral-300":    "#DEE2E6",
        "neutral-400":    "#ADB5BD",
        "neutral-500":    "#6C757D",
        "neutral-600":    "#495057",
        "neutral-700":    "#343A40",
        "neutral-800":    "#212529",
        "neutral-900":    "#111418",

        // ── Design System: Semantic ──────────────────────────────
        "success":        "#1DB954",   // green
        "success-light":  "#E8F8EE",
        "info":           "#2D9CDB",   // blue
        "info-light":     "#E8F4FB",
        "warning":        "#F5A623",   // amber
        "warning-light":  "#FEF6E7",
        "error":          "#E53935",   // red
        "error-light":    "#FDECEC",

        // ── Surfaces ─────────────────────────────────────────────
        "background-light": "#F6F7F8",
        "background-dark":  "#101922",
        "neutral-surface":  "#FFFFFF",
      },

      fontFamily: {
        // Outfit is the design system typeface
        "sans":    ["var(--font-outfit)", "sans-serif"],
        "display": ["var(--font-outfit)", "sans-serif"],
        // QR Menu template fonts
        "poppins": ["var(--font-poppins)", "sans-serif"],
        "manrope": ["var(--font-manrope)", "sans-serif"],
      },

      borderRadius: {
        // Design system border radii
        "btn":    "10px",   // buttons & inputs
        "card":   "12px",   // cards
        "card-lg":"16px",   // large cards / graphs
      },

      fontSize: {
        // Homepage modular scale, ratio 1.25. Fluid so the phone and the
        // 1440 desktop share one ramp instead of ad-hoc `text-[1.75rem]`.
        "display":  ["clamp(2.25rem, 6vw, 4.875rem)", { lineHeight: "0.98", letterSpacing: "-0.042em" }],
        "h2":       ["clamp(1.75rem, 4vw, 3.25rem)",  { lineHeight: "1.06", letterSpacing: "-0.03em"  }],
        "h3":       ["1.375rem",                      { lineHeight: "1.25", letterSpacing: "-0.02em"  }],
        // 17px body, raised from the old 14px — the reader is a 45-year-old
        // shop owner on a phone, not a developer on a 27" monitor.
        "body":     ["1.0625rem",                     { lineHeight: "1.6"  }],
        // 13px is the FLOOR. The old design had 18 text nodes below 12px.
        "caption":  ["0.8125rem",                     { lineHeight: "1.5"  }],
      },

      spacing: {
        // One section rhythm, replacing stacked py-14/py-20/py-28 + mb-14 + mt-16.
        "section":    "3.5rem", // 56px  — mobile
        "section-lg": "5.25rem",// 84px  — desktop
      },

      transitionTimingFunction: {
        // The two curves the whole page uses. `out-expo` for entrances
        // (fast start, long settle — reads as "arrived", not "floated in"),
        // `spring-soft` for anything that should feel physical (badges, chips).
        "out-expo":    "cubic-bezier(0.22, 1, 0.36, 1)",
        "spring-soft": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },

      animation: {
        'blob':       'blob 7s infinite',
        'spin-slow':  'spin 3s linear infinite',
        'float':      'float 6s ease-in-out infinite',
        'shimmer':    'shimmer 1.5s infinite',
      },
      keyframes: {
        blob: {
          '0%':   { transform: 'translate(0px, 0px) scale(1)' },
          '33%':  { transform: 'translate(30px, -50px) scale(1.1)' },
          '66%':  { transform: 'translate(-20px, 20px) scale(0.9)' },
          '100%': { transform: 'translate(0px, 0px) scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-20px)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
    },
  },
  plugins: [],
};
export default config;
