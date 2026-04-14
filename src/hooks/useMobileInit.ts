import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { App as CapApp, type URLOpenListenerEvent } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Keyboard } from "@capacitor/keyboard";
import { isNative, isAndroid } from "@/lib/mobile/platform";
import { initNetworkMonitor } from "@/lib/mobile/native-network";
import { setupNotificationListeners, onNotificationTap } from "@/lib/mobile/native-push";

export function useMobileInit() {
  const navigate = useNavigate();
  const handleDeepLink = useCallback((data: Record<string, unknown>) => {
    const route = data.route as string | undefined;
    if (route) { navigate(route); return; }
    const type = data.type as string | undefined;
    const id = data.id as string | undefined;
    if (type && id) {
      switch (type) {
        case "order": navigate(`/azienda/cantieri/${id}`); break;
        case "invoice": navigate(`/azienda/fatturazione/documenti/${id}`); break;
        case "intervention": navigate(`/tecnico/interventi/${id}`); break;
        case "ticket": navigate(`/azienda/ticket/${id}`); break;
      }
    }
  }, [navigate]);

  useEffect(() => {
    if (!isNative) return;
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: "#0a0a0f" }).catch(() => {});
    Keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => {});
    Keyboard.setScroll({ isDisabled: false }).catch(() => {});
    initNetworkMonitor();
    setupNotificationListeners();
    onNotificationTap(handleDeepLink);

    const urlListener = CapApp.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
      const url = new URL(event.url); const path = url.pathname;
      if (path && path !== "/") navigate(path);
    });

    let backListener: { remove: () => Promise<void> } | undefined;
    if (isAndroid) {
      CapApp.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) window.history.back(); else CapApp.minimizeApp();
      }).then((l) => { backListener = l; });
    }

    const stateListener = CapApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) document.dispatchEvent(new Event("visibilitychange"));
    });

    return () => {
      urlListener.then((l) => l.remove());
      backListener?.remove();
      stateListener.then((l) => l.remove());
    };
  }, [navigate, handleDeepLink]);
}
