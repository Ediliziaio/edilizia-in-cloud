import { Capacitor } from "@capacitor/core";

export const isNative = Capacitor.isNativePlatform();
export const isMobileAppBuild = import.meta.env.VITE_APP_MODE === "mobile";
export const isMobileAppRuntime = isNative || isMobileAppBuild;
export const isIOS = Capacitor.getPlatform() === "ios";
export const isAndroid = Capacitor.getPlatform() === "android";
export const isWeb = Capacitor.getPlatform() === "web";

export function isPluginAvailable(pluginName: string): boolean {
  return Capacitor.isPluginAvailable(pluginName);
}

export function getSafeAreaInsets() {
  return {
    top: "env(safe-area-inset-top, 0px)",
    bottom: "env(safe-area-inset-bottom, 0px)",
    left: "env(safe-area-inset-left, 0px)",
    right: "env(safe-area-inset-right, 0px)",
  };
}
