// Android APK → WebView JavaScript bridge.
// Injected by the KOT Station APK as window.KOTPrint.
// Presence of window.KOTPrint signals the web app is running inside the APK.

interface KOTPrintBridge {
  /** Send a KOT slip to the paired Bluetooth thermal printer. */
  print(kotJson: string): void;
  /** Stable device UUID stored in APK SharedPreferences. */
  getDeviceId(): string;
  /** Human-readable device name set during APK first-run setup. */
  getDeviceName(): string;
  /** Current printer connection status. */
  getPrinterStatus(): 'connected' | 'disconnected' | 'connecting';
}

declare global {
  interface Window {
    KOTPrint?: KOTPrintBridge;
  }
}

export {};
