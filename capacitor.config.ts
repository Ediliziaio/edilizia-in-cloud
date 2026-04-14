import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.ediliziaincloud.app",
  appName: "Edilizia in Cloud",
  webDir: "dist",
  server: {
    // Use localhost instead of capacitor:// scheme so BrowserRouter works
    androidScheme: "https",
    iosScheme: "https",
    hostname: "app.ediliziaincloud.com",
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
    scheme: "EdiliziaInCloud",
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
    webContentsDebuggingEnabled: false,
    minSdkVersion: 24,
  },
};

export default config;
