/**
 * Triggers haptic feedback on supported devices.
 * Uses the Vibration API which is supported on most Android browsers and some iOS versions.
 * Fails silently on unsupported devices.
 */
export function hapticFeedback(type: 'light' | 'medium' | 'heavy' = 'light') {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return;

    const patterns: Record<string, number | number[]> = {
        light: 10,
        medium: 25,
        heavy: 50,
    };

    try {
        navigator.vibrate(patterns[type]);
    } catch {
        // Silently fail — vibration is a nice-to-have
    }
}
