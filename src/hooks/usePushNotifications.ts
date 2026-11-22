/**
 * Hook per la gestione delle notifiche push PWA.
 * Registra la subscription Web Push e la salva in Supabase.
 *
 * Chiave VAPID pubblica: la dà il server (GET send-push-notification), così il
 * browser si iscrive con la stessa chiave che firma gli invii; la variabile
 * VITE_VAPID_PUBLIC_KEY e la copia fissa qui sotto restano come riserva.
 * Generazione chiavi VAPID:
 *   npx web-push generate-vapid-keys
 *
 * 26/09/2026 — perché le push non arrivavano a nessuno (0 iscrizioni):
 * - fuori da /campo nessuno registrava il service worker, e `serviceWorker.ready`
 *   restava in attesa per sempre: ora lo registra l'iscrizione stessa;
 * - main.tsx cancellava tutti i service worker a ogni avvio, e con loro le
 *   iscrizioni (corretto lì: il nostro /sw.js resta);
 * - nessuno controllava che l'iscrizione del browser e la riga nel database
 *   fossero la stessa cosa: ora, se il browser è iscritto, la riga si rimette.
 */
import { useState, useEffect, useCallback } from "react";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isNative } from "@/lib/mobile/platform";
import { withClientTimeout } from "@/lib/query-timeout";

export type PushPermissionState = "default" | "granted" | "denied" | "unsupported";

interface UsePushNotificationsReturn {
  permission: PushPermissionState;
  /** Il browser supporta le push (serviceWorker + PushManager + Notification). */
  supported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  nativa: boolean;
  servizioNativo: boolean | null;
  errore: string | null;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
}

// Converte ArrayBuffer in Base64url
function arrayBufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Converte chiave pubblica VAPID (Base64url) in Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

const CHIAVE_DI_RISERVA =
  (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ||
  "BBYjGr2bF2uBtq-GOCPCmMtpVH1rvGNMhldLkA34hmzQlLwTzLb8wKO39Cr51t6aSNhRxl8H5c2qkxpFAzHWunk";

let chiaveDalServer: Promise<string> | null = null;

/** La chiave pubblica con cui il server firma gli invii (una richiesta per sessione). */
function chiavePubblica(): Promise<string> {
  chiaveDalServer ??= supabase.functions
    .invoke<{ publicKey?: string }>("send-push-notification", { method: "GET" })
    .then(({ data }) => data?.publicKey || CHIAVE_DI_RISERVA)
    .catch(() => CHIAVE_DI_RISERVA);
  return chiaveDalServer;
}

/**
 * La registrazione del service worker, creandola se manca. /sw.js lo genera la
 * build di produzione (vite-plugin-pwa): in sviluppo non esiste e si torna null.
 */
async function registrazione(): Promise<ServiceWorkerRegistration | null> {
  const esistente = await navigator.serviceWorker.getRegistration("/");
  if (esistente) return withClientTimeout(navigator.serviceWorker.ready, "Avvio notifiche", 10_000);
  if (!import.meta.env.PROD) return null;
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return withClientTimeout(navigator.serviceWorker.ready, "Avvio notifiche", 10_000);
}

/** L'iscrizione è stata fatta con questa chiave? */
function stessaChiave(sub: PushSubscription, chiave: string): boolean {
  const usata = sub.options?.applicationServerKey;
  if (!usata) return true; // il browser non lo dice: la si tiene
  return arrayBufferToBase64url(usata) === chiave.replace(/=+$/, "");
}

const PROPRIETARIO_WEB = "eic.push.web.v1";
type IscrizioneLocale = { userId: string; endpoint: string };

function iscrizioneLocale(): IscrizioneLocale | null {
  try { return JSON.parse(localStorage.getItem(PROPRIETARIO_WEB) ?? "null"); } catch { return null; }
}

function memorizzaIscrizione(userId: string, endpoint: string) {
  try { localStorage.setItem(PROPRIETARIO_WEB, JSON.stringify({ userId, endpoint })); } catch { /* il server conserva l'iscrizione */ }
}

async function stessoUtente(sub: PushSubscription, userId: string) {
  const locale = iscrizioneLocale();
  if (locale?.endpoint === sub.endpoint) return locale.userId === userId;
  const { data, error } = await supabase.from("push_subscriptions").select("id").eq("user_id", userId).eq("endpoint", sub.endpoint).maybeSingle();
  if (error) throw error;
  return !!data;
}

async function servizioDisponibile(piattaforma: "ios" | "android") {
  const { data, error } = await supabase.functions.invoke<{ native?: { android: boolean; ios: boolean } }>(
    "send-push-notification", { method: "GET" },
  );
  if (error) throw new Error("Non riesco a verificare le notifiche. Riprova.");
  return data?.native?.[piattaforma] === true;
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const { user, profile } = useAuth();
  const userId = user?.id;
  const companyId = profile?.company_id ?? PLATFORM_ADMIN_COMPANY_ID;
  const [permission, setPermission] = useState<PushPermissionState>("default");
  const [attivePer, setAttivePer] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const [servizioNativo, setServizioNativo] = useState<boolean | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const supportedWeb = typeof window !== "undefined" && !isNative && "serviceWorker" in navigator
    && "PushManager" in window && "Notification" in window;
  const supported = isNative ? permission !== "unsupported" : supportedWeb;
  const isSubscribed = !!userId && attivePer === userId && permission === "granted";

  const salvaWeb = useCallback(async (sub: PushSubscription, persona: string) => {
    const rawKey = sub.getKey("p256dh");
    const rawAuth = sub.getKey("auth");
    if (!rawKey || !rawAuth) throw new Error("Iscrizione incompleta. Riprova.");
    const { error } = await supabase.from("push_subscriptions").upsert({
      user_id: persona, company_id: companyId, endpoint: sub.endpoint, p256dh: arrayBufferToBase64url(rawKey),
      auth_key: arrayBufferToBase64url(rawAuth), user_agent: navigator.userAgent.slice(0, 200),
    }, { onConflict: "user_id,endpoint" });
    if (error) throw error;
    memorizzaIscrizione(persona, sub.endpoint);
  }, [companyId]);

  useEffect(() => {
    let annullato = false;
    let controllo = 0;
    async function aggiorna() {
      const versione = ++controllo;
      const attivo = () => !annullato && versione === controllo;
      try {
        if (isNative) {
          const nativa = await import("@/lib/mobile/native-push");
          const piattaforma = nativa.piattaformaPushNativa();
          const permesso = piattaforma ? await nativa.permessoPushNativo() : "unsupported";
          if (!attivo()) return;
          setPermission(permesso);
          if (!piattaforma || !userId) return;
          const abilitata = await nativa.pushNativaAbilitata(userId);
          if (attivo()) setAttivePer(abilitata ? userId : undefined);
          const servizio = await servizioDisponibile(piattaforma);
          if (attivo()) setServizioNativo(servizio);
          return;
        }
        if (!supportedWeb) {
          setPermission("unsupported");
          return;
        }
        setPermission(Notification.permission);
        if (!userId || Notification.permission !== "granted") return;
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = await reg?.pushManager.getSubscription();
        if (!sub || !await stessoUtente(sub, userId) || !stessaChiave(sub, await chiavePubblica()) || !attivo()) return;
        await salvaWeb(sub, userId);
        if (attivo()) setAttivePer(userId);
      } catch { /* si può riprovare dalle impostazioni */ }
    }
    void aggiorna();
    const alRitorno = () => { if (document.visibilityState === "visible") void aggiorna(); };
    document.addEventListener("visibilitychange", alRitorno);
    return () => { annullato = true; document.removeEventListener("visibilitychange", alRitorno); };
  }, [supportedWeb, userId, salvaWeb]);

  const subscribe = useCallback(async () => {
    if (!supported || !userId) return;
    setIsLoading(true);
    setErrore(null);
    try {
      if (isNative) {
        const nativa = await import("@/lib/mobile/native-push");
        const piattaforma = nativa.piattaformaPushNativa();
        if (!piattaforma || !await servizioDisponibile(piattaforma)) {
          setServizioNativo(false);
          return;
        }
        setServizioNativo(true);
        const permesso = await nativa.attivaPushNativa(userId);
        setPermission(permesso);
        if (permesso === "granted") setAttivePer(userId);
        return;
      }
      const permesso = await Notification.requestPermission();
      setPermission(permesso);
      if (permesso !== "granted") return;
      const reg = await registrazione();
      if (!reg) throw new Error("Service worker non disponibile");
      const chiave = await chiavePubblica();
      let sub = await reg.pushManager.getSubscription();
      // L'iscrizione del browser è del dispositivo. Un altro account deve
      // avere un nuovo endpoint invece di ricevere gli avvisi del precedente.
      if (sub && (!stessaChiave(sub, chiave) || !await stessoUtente(sub, userId))) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(chiave) });
      await salvaWeb(sub, userId);
      setAttivePer(userId);
    } catch {
      setErrore("Non riesco ad attivare le notifiche su questo dispositivo. Riprova.");
    } finally {
      setIsLoading(false);
    }
  }, [supported, userId, salvaWeb]);

  const unsubscribe = useCallback(async () => {
    if (!supported || !userId) return;
    setIsLoading(true);
    setErrore(null);
    try {
      if (isNative) {
        const { disattivaPushNativa } = await import("@/lib/mobile/native-push");
        await disattivaPushNativa(userId);
      } else {
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = await reg?.pushManager.getSubscription();
        if (sub && await stessoUtente(sub, userId)) {
          const { error } = await supabase.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", sub.endpoint);
          if (error) throw error;
          await sub.unsubscribe();
          try { localStorage.removeItem(PROPRIETARIO_WEB); } catch { /* storage non disponibile */ }
        }
      }
      setAttivePer(undefined);
    } catch {
      setErrore("Non riesco a disattivare le notifiche. Riprova.");
    } finally {
      setIsLoading(false);
    }
  }, [supported, userId]);

  return { supported, permission, isSubscribed, isLoading, subscribe, unsubscribe, nativa: isNative, servizioNativo, errore };
}
