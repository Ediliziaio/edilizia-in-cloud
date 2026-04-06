/**
 * Hook per la gestione delle notifiche push PWA.
 * Registra la subscription Web Push e la salva in Supabase.
 *
 * Prerequisiti (variabile d'ambiente):
 *   VITE_VAPID_PUBLIC_KEY — chiave pubblica VAPID (Base64url)
 * Generazione chiavi VAPID:
 *   npx web-push generate-vapid-keys
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type PushPermissionState = "default" | "granted" | "denied" | "unsupported";

interface UsePushNotificationsReturn {
  permission: PushPermissionState;
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

export function usePushNotifications(): UsePushNotificationsReturn {
  const { user, profile } = useAuth();
  const [permission, setPermission] = useState<PushPermissionState>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Chiave VAPID pubblica — non è un segreto (viene comunque inclusa nel bundle client).
  // Priorità: variabile d'ambiente (Cloudflare Pages) → fallback hardcoded.
  const vapidKey = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ||
    "BBYjGr2bF2uBtq-GOCPCmMtpVH1rvGNMhldLkA34hmzQlLwTzLb8wKO39Cr51t6aSNhRxl8H5c2qkxpFAzHWunk";
  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    !!vapidKey;

  // Stato permesso corrente
  useEffect(() => {
    if (!supported) {
      setPermission("unsupported");
      return;
    }
    if ("Notification" in window) {
      setPermission(Notification.permission as PushPermissionState);
    }
  }, [supported]);

  // Verifica subscription esistente
  useEffect(() => {
    if (!supported || !user) return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setIsSubscribed(!!sub);
      } catch {
        // Silenzioso — SW potrebbe non essere pronto
      }
    })();
  }, [supported, user]);

  const subscribe = useCallback(async () => {
    if (!supported || !user || !profile?.company_id || !vapidKey) return;
    setIsLoading(true);
    try {
      // 1. Richiedi permesso
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermissionState);
      if (perm !== "granted") return;

      // 2. Ottieni SW registration
      const reg = await navigator.serviceWorker.ready;

      // 3. Crea subscription
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const rawKey = sub.getKey("p256dh");
      const rawAuth = sub.getKey("auth");
      if (!rawKey || !rawAuth) throw new Error("Chiavi subscription mancanti");

      // 4. Salva in DB (upsert per endpoint)
      const { error } = await supabase
        .from("push_subscriptions")
        .upsert(
          {
            user_id: user.id,
            company_id: profile.company_id,
            endpoint: sub.endpoint,
            p256dh: arrayBufferToBase64url(rawKey),
            auth_key: arrayBufferToBase64url(rawAuth),
            user_agent: navigator.userAgent.slice(0, 200),
          },
          { onConflict: "user_id,endpoint" },
        );
      if (error) throw error;

      setIsSubscribed(true);
    } catch (err) {
      console.error("Push subscribe error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [supported, user, profile, vapidKey]);

  const unsubscribe = useCallback(async () => {
    if (!supported || !user) return;
    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
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

  return { permission, isSubscribed, isLoading, subscribe, unsubscribe };
}
