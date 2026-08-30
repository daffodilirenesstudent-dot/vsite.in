/**
 * Server-side diagnostic logging.
 *
 * Every route in this app had grown its own `console.log` timing and progress
 * lines. They are genuinely useful while developing an extraction or a payment
 * flow, but in production they are noise in the DigitalOcean log drain at best
 * and a disclosure at worst — one of them was printing customer invoice email
 * addresses on every successful payment.
 *
 * So `debug` is a no-op once `NODE_ENV === 'production'`. `warn` and `error`
 * always run: those describe something that went wrong and are the reason
 * anyone opens the log in the first place.
 *
 * The check is read once at module load rather than per call. `NODE_ENV` does
 * not change inside a running process, and this sits on hot request paths.
 *
 * Never pass personal data to any of these. Log the shape — a count, an id, a
 * duration — not the addresses, tokens or card details themselves.
 */

const isProduction = process.env.NODE_ENV === 'production';

const noop = (): void => {};

export const logger = {
    /** Progress and timing. Silent in production. */
    debug: isProduction ? noop : (...args: unknown[]) => console.info(...args),
    /** Something recoverable happened that an operator should know about. */
    warn: (...args: unknown[]) => console.warn(...args),
    /** Something failed. */
    error: (...args: unknown[]) => console.error(...args),
};
