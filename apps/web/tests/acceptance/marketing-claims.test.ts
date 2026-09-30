import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Every public claim must be one vsite can prove.
 *
 * AI engines repeat what they retrieve, and they punish contradictions: a page
 * that says "fastest-growing" next to a price table that shows a cheaper rival,
 * or sells ordering the product does not do, teaches a model the domain is
 * unreliable — and that sticks across answers. This suite is the audit of
 * 2026-09-30 turned into a guard.
 *
 * It scans PUBLIC surfaces only: src/content, marketing pages, the home
 * components and llms.txt. Not the dashboard, onboarding, or api.
 *
 * If a hit is a genuine false positive, say so to the owner — do not loosen
 * the pattern to make it pass.
 */

const WEB = join(__dirname, '..', '..');
const SRC = join(WEB, 'src');

const EXCLUDED_APP_DIRS = new Set(['manage', 'onboarding', 'api', 'login', 'signup', 'auth', 'shop', 'tmp-preview']);

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const rel = relative(SRC, full).split(sep).join('/');
        if (statSync(full).isDirectory()) {
            if (rel.startsWith('app/') && EXCLUDED_APP_DIRS.has(rel.split('/')[1])) continue;
            walk(full, out);
        } else if (/\.(ts|tsx)$/.test(name)) {
            out.push(full);
        }
    }
    return out;
}

/** Drop comments: an explanatory comment that quotes a banned phrase is not a claim. */
function stripComments(code: string): string {
    return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function publicFiles(): { rel: string; text: string }[] {
    const roots = ['content', 'components/home', 'app'];
    const files: string[] = [];
    for (const r of roots) walk(join(SRC, r), files);
    return files
        .map((f) => ({ rel: relative(SRC, f).split(sep).join('/'), text: stripComments(readFileSync(f, 'utf8')) }))
        // roadmap.ts is the one place that states the boundary itself.
        .filter((f) => f.rel !== 'content/roadmap.ts');
}

function hits(pattern: RegExp, files = publicFiles()): string[] {
    const found: string[] = [];
    for (const { rel, text } of files) {
        const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            found.push(`${rel}:${line} → ${m[0]}`);
        }
    }
    return found;
}

describe('claims vsite cannot prove', () => {
    it('never calls itself the fastest-growing, most affordable, or names a customer count it does not have', () => {
        expect(
            hits(/fastest[- ]growing|most affordable|hundreds of (restaurants|caf[eé]s|stores|shops|menus|owners)|thousands of (restaurants|caf[eé]s)/i),
        ).toEqual([]);
    });

    it('never quotes the stale ₹99–₹699 range as if it were the market', () => {
        expect(hits(/₹\s?99\s?[–-]\s?₹\s?699/)).toEqual([]);
    });

    it('never says food photos are AI-generated — they are matched from a curated library', () => {
        expect(
            hits(
                /ai[- ]generated (food )?(photo|image|picture)s?|generates? (a |an |the |your )?(food |ai )?(photo|image)s?|generated (food )?(photo|image)s?|regenerat/i,
            ),
        ).toEqual([]);
    });

    it('publishes no anonymous case study with invented numbers', () => {
        expect(hits(/category:\s*['"]Case Study['"]/)).toEqual([]);
    });
});

describe('ordering and UPI are only ever described as coming soon', () => {
    const CLAIM =
        /accept(s|ing)? (UPI|orders|payments)|UPI (ordering|payments?|checkout)|scan (&|and) order|table ordering|kitchen display|order (and|&) pay|(order|pay)s? (directly )?(from|at) (the |your )?(table|phone)/gi;
    const BOUNDARY =
        /coming soon|not live|not yet|on the roadmap|roadmap|will be|planned|being built|does not|doesn't|do not|not take|no ordering|cannot|can't|isn't|is not|without|rather than|instead of|ORDERING_COMING_SOON|AVAILABLE_TODAY|\$\{/i;

    it('has a boundary statement within 250 characters of every ordering/UPI claim', () => {
        const offenders: string[] = [];
        for (const { rel, text } of publicFiles()) {
            let m: RegExpExecArray | null;
            CLAIM.lastIndex = 0;
            while ((m = CLAIM.exec(text))) {
                const window = text.slice(Math.max(0, m.index - 250), m.index + m[0].length + 250);
                if (!BOUNDARY.test(window)) {
                    offenders.push(`${rel}:${text.slice(0, m.index).split('\n').length} → ${m[0]}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });
});

describe('page titles', () => {
    it('do not author the brand suffix — the root layout template already adds "| Vsite"', () => {
        // app/layout.tsx sets template "%s | Vsite"; an authored "| vsite" renders the brand twice.
        expect(hits(/title\s*[:=][^\n]*[|–—-]\s*vsite\s*['"`]/i, publicFiles().filter((f) => f.rel !== 'app/layout.tsx'))).toEqual([]);
    });
});
