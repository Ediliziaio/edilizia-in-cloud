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

export type PushPermissionState = "default" | "granted" | "denied" | "unsupported";

interface UsePushNotificationsReturn {
  permission: PushPermissionState;
  /** Il browser supporta le push (serviceWorker + PushManager + Notification). */
  supported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
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
function urlBase64ToUint8Array(base64String: string): Uint8Array {
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

/** Rifiuta dopo `ms`: niente attese infinite se il service worker non arriva. */
function entro<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promessa,
    new Promise<T>((_, rifiuta) => setTimeout(() => rifiuta(new Error("Il service worker non risponde")), ms)),
  ]);
}

/**
 * La registrazione del service worker, creandola se manca. /sw.js lo genera la
 * build di produzione (vite-plugin-pwa): in sviluppo non esiste e si torna null.
 */
async function registrazione(): Promise<ServiceWorkerRegistration | null> {
  const esistente = await navigator.serviceWorker.getRegistration("/");
  if (esistente) return entro(navigator.serviceWorker.ready, 10_000);
  if (!import.meta.env.PROD) return null;
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return entro(navigator.serviceWorker.ready, 10_000);
}

/** L'iscrizione è stata fatta con questa chiave? */
function stessaChiave(sub: PushSubscription, chiave: string): boolean {
  const usata = sub.options?.applicationServerKey;
  if (!usata) return true; // il browser non lo dice: la si tiene
  return arrayBufferToBase64url(usata) === chiave.replace(/=+$/, "");
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const { user, profile } = useAuth();
  const [permission, setPermission] = useState<PushPermissionState>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Nell'app nativa (Capacitor) le Web Push non esistono: lì servono le push
  // native, che passano da push_tokens.
  const supported =
    typeof window !== "undefined" &&
    !isNative &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  // Lo staff di piattaforma (super_admin, ruoli platform_*) non ha un'azienda:
  // profile.company_id e' NULL. Prima il subscribe usciva subito e in SILENZIO,
  // quindi il super-admin non poteva iscriversi alle notifiche nemmeno
  // premendo il pulsante. Le sue iscrizioni si intestano alla company della
  // piattaforma, che e' esattamente cosa sono.
  const companyIdIscrizione = profile?.company_id ?? PLATFORM_ADMIN_COMPANY_ID;

  const salva = useCallback(
    async (sub: PushSubscription) => {
      if (!user) return;
      const rawKey = sub.getKey("p256dh");
      const rawAuth = sub.getKey("auth");
      if (!rawKey || !rawAuth) throw new Error("Chiavi subscription mancanti");
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          company_id: companyIdIscrizione,
          endpoint: sub.endpoint,
          p256dh: arrayBufferToBase64url(rawKey),
          auth_key: arrayBufferToBase64url(rawAuth),
          user_agent: navigator.userAgent.slice(0, 200),
        },
        { onConflict: "user_id,endpoint" },
      );
      if (error) throw error;
    },
    [user, companyIdIscrizione],
  );

  // Stato permesso corrente
  useEffect(() => {
    if (!supported) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as PushPermissionState);
  }, [supported]);

  // Iscrizione esistente: se il browser è iscritto, la riga nel database si
  // rimette (poteva essere stata cancellata come «scaduta»).
  useEffect(() => {
    if (!supported || !user || Notification.permission !== "granted") return;
    let annullato = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (!sub) return;
        if (!stessaChiave(sub, await chiavePubblica())) return; // la rifà subscribe()
        await salva(sub);
        if (!annullato) setIsSubscribed(true);
      } catch {
        // Silenzioso: al primo tocco su «attiva» si riprova da capo.
      }
    })();
    return () => { annullato = true; };
  }, [supported, user, salva]);

  const subscribe = useCallback(async () => {
    if (!supported || !user) return;
    setIsLoading(true);
    try {
      // 1. Richiedi permesso
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermissionState);
      if (perm !== "granted") return;

      // 2. Service worker (registrato qui se manca)
      const reg = await registrazione();
      if (!reg) throw new Error("Service worker non disponibile");

      // 3. Crea subscription (rifatta se era con un'altra chiave)
      const chiave = await chiavePubblica();
      let sub = await reg.pushManager.getSubscription();
      if (sub && !stessaChiave(sub, chiave)) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(chiave),
      });

      // 4. Salva in DB (upsert per endpoint)
      await salva(sub);
      setIsSubscribed(true);
    } catch (err) {
      console.error("Push subscribe error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [supported, user, salva]);

  const unsubscribe = useCallback(async () => {
    if (!supported || !user) return;
    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        // 1. Rimuovi da DB
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", user.id)
          .eq("endpoint", sub.endpoint);
        // 2. Revoca subscription lato browser
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error("Push unsubscribe error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [supported, user]);

  return {
    supported,
    permission, isSubscribed, isLoading, subscribe, unsubscribe };
}
