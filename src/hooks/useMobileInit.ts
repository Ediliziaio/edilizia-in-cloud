import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { App as CapApp, type URLOpenListenerEvent } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Keyboard } from "@capacitor/keyboard";
import { SplashScreen } from "@capacitor/splash-screen";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useIsCampo } from "@/hooks/useIsCampo";
import { queryKeys } from "@/lib/queryKeys";
import { linkPerCampo, linkPerTecnico } from "@/lib/notifiche/linkCampo";
import { percorsoPushNativa } from "@/lib/notifiche/percorsoNotifica";
import { isNative, isAndroid } from "@/lib/mobile/platform";
import { initNetworkMonitor, isOnline, onNetworkChange } from "@/lib/mobile/native-network";
import { aggiornaPushNativa, ascoltaPushNative } from "@/lib/mobile/native-push";

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

const percorsiAccesso = new Set([
  "/login", "/lavori-login", "/admin-login", "/clienti-login", "/commercialista-login",
  "/referral-login", "/produttore-login", "/cambia-password", "/seleziona-azienda",
]);

const shouldRedirectNativePathToLogin = (pathname: string) => {
  const normalized = pathname || "/";
  return NATIVE_MARKETING_PATHS.some((path) => normalized === path || normalized.startsWith(`${path}/`));
};

export function useMobileInit() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, isLoading } = useAuth();
  const { isCampo, isTecnico } = useIsCampo();
  const queryClient = useQueryClient();
  const [notifica, setNotifica] = useState<Record<string, unknown>>();
  const gestita = useRef<Record<string, unknown> | undefined>(undefined);
  const navigatorRef = useRef(navigate);
  useEffect(() => { navigatorRef.current = navigate; }, [navigate]);
  const userId = user?.id;

  useEffect(() => {
    if (!isNative || !userId || isLoading || !notifica || gestita.current === notifica) return;
    // L'ingresso dopo il login può ancora cambiare la schermata e l'azienda attiva.
    if (percorsiAccesso.has(pathname) || shouldRedirectNativePathToLogin(pathname)) return;
    gestita.current = notifica;
    const percorso = percorsoPushNativa(notifica, window.location.origin, userId);
    if (percorso) navigate(isCampo ? linkPerCampo(percorso)
      : isTecnico && pathname.startsWith("/campo") ? linkPerTecnico(percorso) : percorso);
  }, [isCampo, isTecnico, isLoading, navigate, notifica, pathname, userId]);

  useEffect(() => {
    if (!isNative || !userId || isLoading) return;
    let ultimoTentativo = 0;
    const aggiorna = () => {
      if (!isOnline() || document.visibilityState !== "visible" || Date.now() - ultimoTentativo < 10 * 60_000) return;
      ultimoTentativo = Date.now();
      void aggiornaPushNativa(userId).catch(() => { ultimoTentativo = 0; });
    };
    aggiorna();
    const rete = onNetworkChange(aggiorna);
    document.addEventListener("visibilitychange", aggiorna);
    return () => { rete(); document.removeEventListener("visibilitychange", aggiorna); };
  }, [isLoading, userId]);

  useEffect(() => {
    if (!isNative) return;
    document.documentElement.classList.add("capacitor");
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: "#0a0a0f" }).catch(() => {});
    Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
    Keyboard.setScroll({ isDisabled: true }).catch(() => {});
    SplashScreen.hide().catch(() => {});
    void initNetworkMonitor().catch((): void => undefined);
    const scollegaPush = ascoltaPushNative(setNotifica, () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    });

    const urlListener = CapApp.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
      try {
        const url = new URL(event.url);
        const path = url.pathname;
        // Con la query: il QR degli attrezzi porta l'azienda in «?c=».
        if (path && path !== "/") navigatorRef.current(`${path}${url.search}${url.hash}`);
      } catch {
        navigatorRef.current("/login", { replace: true });
      }
    });

    const backListener = isAndroid
      ? CapApp.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) window.history.back(); else CapApp.minimizeApp();
      }) : undefined;

    const stateListener = CapApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) document.dispatchEvent(new Event("visibilitychange"));
    });

    return () => {
      scollegaPush();
      for (const listener of [urlListener, backListener, stateListener]) {
        void listener?.then(l => l.remove()).catch((): void => undefined);
      }
    };
  }, [queryClient]);

  useEffect(() => {
    if (!isNative) return;
    if (shouldRedirectNativePathToLogin(pathname)) {
      navigate("/login", { replace: true });
    }
  }, [navigate, pathname]);
}
