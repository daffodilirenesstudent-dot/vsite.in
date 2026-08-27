// HTML-escape an arbitrary value for safe interpolation into an HTML template.
// Use at RENDER time, never at storage time — storing pre-escaped values
// double-encodes when re-rendered and corrupts non-HTML outputs (thermal
// printers, plain-text emails, SMS).
//
// Covers the OWASP "rule #1" character set:
//   &  → &amp;     <  → &lt;       >  → &gt;
//   "  → &quot;    '  → &#x27;
//
// Numbers, booleans, null, undefined are stringified and escaped uniformly so
// callers can interpolate any value type without guarding the call site.

export function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}
