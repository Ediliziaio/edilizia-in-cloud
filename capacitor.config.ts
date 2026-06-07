import type { CapacitorConfig } from "@capacitor/cli";

// Remote debugging della WebView SOLO se richiesto esplicitamente (CAPACITOR_DEBUG=1).
// In produzione deve restare DISATTIVO: con webContentsDebuggingEnabled=true la
// WebView (e quindi token/sessione) è ispezionabile via DevTools sul device — rischio
// sicurezza e possibile rilievo in review. (Prima era forzato a `|| true`.)
const isNativeDebugEnabled = process.env.CAPACITOR_DEBUG === "1";

const config: CapacitorConfig = {
  appId: "com.ediliziaincloud.app",
  appName: "Edilizia in Cloud",
  webDir: "dist",
  server: {
    // Use https + localhost so BrowserRouter works correctly on iOS/Android
    androidScheme: "https",
    iosScheme: "https",
    hostname: "localhost",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#0a0a0f",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: "dark",
      backgroundColor: "#0a0a0f",
    },
  },
  ios: {
    contentInset: "automatic",
    backgroundColor: "#0a0a0f",
    preferredContentMode: "mobile",
    allowsLinkPreview: true,
    scrollEnabled: true,
  },
  android: {
    backgroundColor: "#0a0a0f",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: isNativeDebugEnabled,
    minSdkVersion: 24,
  },
};

export default config;
