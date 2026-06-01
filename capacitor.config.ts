import type { CapacitorConfig } from "@capacitor/cli";

// Durante le test build su Play Store/TestFlight teniamo il remote debugging
// attivo: serve per ispezionare la WebView via Chrome DevTools quando l'app
// gira su dispositivo fisico. Si disattiva quando passiamo a produzione stabile.
const isNativeDebugEnabled = process.env.CAPACITOR_DEBUG === "1" || true;

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
