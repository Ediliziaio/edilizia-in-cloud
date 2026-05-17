import { useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { App as CapApp, type URLOpenListenerEvent } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Keyboard } from "@capacitor/keyboard";
import { SplashScreen } from "@capacitor/splash-screen";
import { isNative, isAndroid } from "@/lib/mobile/platform";
import { initNetworkMonitor } from "@/lib/mobile/native-network";
import { setupNotificationListeners, onNotificationTap } from "@/lib/mobile/native-push";

const NATIVE_MARKETING_PATHS = [
  "/",
  "/home",
  "/demo",
  "/prezzi",
  "/confronto",
  "/blog",
  "/chi-siamo",
  "/funzionalita",
  "/software-gestionale-edilizia",
  "/glossario-edilizia",
  "/casi-studio",
  "/formazione",
  "/integrazioni",
  "/landing",
  "/ai-edilizia",
  "/diventa-partner",
  "/pianifica-migrazione",
];

const shouldRedirectNativePathToLogin = (pathname: string) => {
  const normalized = pathname || "/";
  return NATIVE_MARKETING_PATHS.some((path) => normalized === path || normalized.startsWith(`${path}/`));
};

export function useMobileInit() {
  const navigate = useNavigate();
  const location = useLocation();
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
    document.documentElement.classList.add("capacitor");
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: "#0a0a0f" }).catch(() => {});
    Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
    Keyboard.setScroll({ isDisabled: true }).catch(() => {});
    SplashScreen.hide().catch(() => {});
    initNetworkMonitor();
    setupNotificationListeners();
    onNotificationTap(handleDeepLink);

    const urlListener = CapApp.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
      try {
        const url = new URL(event.url);
        const path = url.pathname;
        if (path && path !== "/") navigate(path);
      } catch {
        navigate("/login", { replace: true });
      }
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

  useEffect(() => {
    if (!isNative) return;
    if (shouldRedirectNativePathToLogin(location.pathname)) {
      navigate("/login", { replace: true });
    }
  }, [location.pathname, navigate]);
}
