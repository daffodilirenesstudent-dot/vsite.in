import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The pause between "OTP accepted" and "I can see the app".
 *
 * Both OTP pages end the same way: verify, then hand off to /auth/continue via
 * a full-document `window.location.replace`. That handoff is not instant.
 * /auth/continue is `force-dynamic` and does four sequential awaits before it
 * can even issue its redirect — verify the Firebase token, COUNT the user's
 * sites, provisionUser, and conditionally repair the profiles flag — and only
 * then does the browser start loading the destination.
 *
 * During all of that the browser is still showing the OTP page, because a full
 * navigation paints nothing until the server responds. So whatever that page
 * looks like at the moment `replace()` is called is what the user stares at for
 * the whole handoff.
 *
 * Both pages called `setLoading(false)` before navigating. The button therefore
 * snapped back to an idle, enabled "Verify" and the screen went quiet — on a
 * mid-range Android on mobile data, for several seconds. The obvious response
 * to a dead button is to press it again, and pressing it again re-enters
 * handleVerify and calls `confirm()` on a ConfirmationResult that Firebase has
 * already consumed. That rejects, so the user gets an "invalid code" error
 * flashed at them moments before the page finally changes — on a signup that
 * actually succeeded.
 *
 * The fix is to stay in the loading state through the navigation: the spinner
 * is the only honest thing to show while the handoff is in flight, and a
 * disabled button is what stops the second press.
 */

const WEB = join(__dirname, '..', '..');
const APP = join(WEB, 'src', 'app');

const read = (p: string) => readFileSync(join(APP, p), 'utf8');

const OTP_PAGES = {
    signup: 'signup/page.tsx',
    login: 'login/page.tsx',
} as const;

/** The body of handleVerify, which is where the ordering bug lives. */
function handleVerifyBody(src: string): string {
    const start = src.indexOf('const handleVerify');
    expect(start, 'handleVerify not found').toBeGreaterThan(-1);
    const end = src.indexOf('\n  };', start);
    return src.slice(start, end);
}

describe.each(Object.entries(OTP_PAGES))('%s post-OTP handoff', (_name, file) => {
    const body = () => handleVerifyBody(read(file));

    it('does not clear the loading state on the success path', () => {
        // The precise defect is an UNCONDITIONAL setLoading(false) between the
        // await and the error check — it fires on success too. The reset
        // inside `if (err)` is correct and must not be flagged, so the window
        // examined is exactly the gap between those two statements.
        const withoutComments = body().replace(/\/\/[^\n]*/g, '');
        const awaitIndex = withoutComments.indexOf('await verifyOTP');
        const errCheck = withoutComments.indexOf('if (err)');

        expect(awaitIndex, 'no await verifyOTP found').toBeGreaterThan(-1);
        expect(errCheck, 'no error check found').toBeGreaterThan(awaitIndex);

        const gap = withoutComments.slice(awaitIndex, errCheck);
        expect(
            gap,
            'setLoading(false) runs unconditionally after verifyOTP, so on SUCCESS the ' +
            'button goes idle and tappable while /auth/continue is still resolving',
        ).not.toMatch(/setLoading\(false\)/);
    });

    it('still re-enables the button when verification fails', () => {
        // Staying in the loading state is only correct on the success path. An
        // error must hand the form back, or a wrong digit locks the user out
        // of their own signup.
        expect(body()).toMatch(/if \(err\)[\s\S]{0,120}setLoading\(false\)/);
    });
});
