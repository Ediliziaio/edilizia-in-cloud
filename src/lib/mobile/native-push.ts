import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";
import { getItem, removeItem, setItem } from "./native-storage";
import { isNative } from "./platform";
import { withAbortableClientTimeout } from "@/lib/query-timeout";

const CHIAVE_DISPOSITIVO = "push.dispositivo.v1";
const UTENTE_ABILITATO = "push.utente.v1";
let operazioni = Promise.resolve();

function inOrdine<T>(operazione: () => Promise<T>) {
  const esito = operazioni.then(operazione);
  operazioni = esito.then((): void => undefined, (): void => undefined);
  return esito;
}

export function piattaformaPushNativa() {
  const piattaforma = Capacitor.getPlatform();
  return isNative && Capacitor.isPluginAvailable("PushNotifications") && (piattaforma === "android" || piattaforma === "ios")
    ? piattaforma : null;
}

export async function permessoPushNativo(richiedi = false) {
  const permesso = richiedi ? await PushNotifications.requestPermissions() : await PushNotifications.checkPermissions();
  return permesso.receive === "granted" || permesso.receive === "denied" ? permesso.receive : "default";
}

export const pushNativaAbilitata = async (userId: string) => (await getItem(UTENTE_ABILITATO)) === userId;

async function chiaveDispositivo() {
  const esistente = await getItem(CHIAVE_DISPOSITIVO);
  if (esistente) return esistente;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const chiave = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  await setItem(CHIAVE_DISPOSITIVO, chiave);
  return chiave;
}

async function riceviToken() {
  const ascoltatori: PluginListenerHandle[] = [];
  let risolvi: (token: string) => void;
  let rifiuta: (errore: Error) => void;
  const registrazione = new Promise<string>((resolve, reject) => { risolvi = resolve; rifiuta = reject; });
  const timer = setTimeout(() => rifiuta(new Error("Il telefono non ha confermato la registrazione. Riprova.")), 10_000);
  // I callback possono arrivare prima che register() abbia risposto.
  void registrazione.catch((): void => undefined);
  try {
    ascoltatori.push(await PushNotifications.addListener("registration", token => risolvi(token.value)));
    ascoltatori.push(await PushNotifications.addListener("registrationError", () => rifiuta(new Error("Registrazione delle notifiche non riuscita."))));
    void PushNotifications.register().catch(() => rifiuta(new Error("Il telefono non ha registrato le notifiche.")));
    return await registrazione;
  } finally {
    clearTimeout(timer);
    await Promise.allSettled(ascoltatori.map(listener => listener.remove()));
  }
}

async function collega(userId: string) {
  const piattaforma = piattaformaPushNativa();
  if (!piattaforma) throw new Error("Notifiche su questo telefono non disponibili.");
  const chiave = await chiaveDispositivo();
  if (piattaforma === "android") {
    await PushNotifications.createChannel({ id: "campo", name: "Avvisi EdiliziaInCloud", importance: 4 }).catch((): void => undefined);
  }
  const token = await riceviToken();
  const { error } = await withAbortableClientTimeout(signal => supabase.rpc("registra_dispositivo_push", {
    p_utente: userId, p_chiave: chiave, p_token: token, p_piattaforma: piattaforma,
  }).abortSignal(signal), "Registrazione notifiche");
  if (error) throw new Error("Non riesco a collegare questo dispositivo. Riprova.");
}

export function attivaPushNativa(userId: string) {
  return inOrdine(async () => {
    const permesso = await permessoPushNativo(true);
    if (permesso === "granted") {
      await collega(userId);
      await setItem(UTENTE_ABILITATO, userId);
    }
    return permesso;
  });
}

export function aggiornaPushNativa(userId: string) {
  return inOrdine(async () => {
    if (piattaformaPushNativa() && await pushNativaAbilitata(userId) && await permessoPushNativo() === "granted") {
      await collega(userId);
    }
  });
}

export function disattivaPushNativa(userId: string, uscita = false) {
  return inOrdine(async () => {
    if (!piattaformaPushNativa() || !await pushNativaAbilitata(userId)) return;
    const chiave = await getItem(CHIAVE_DISPOSITIVO);
    try {
      if (chiave) {
        const { error } = await withAbortableClientTimeout(signal => supabase.rpc("disattiva_dispositivo_push", {
          p_utente: userId, p_chiave: chiave,
        }).abortSignal(signal), "Disattivazione notifiche", 5_000);
        if (error) throw error;
      }
    } catch {
      if (!uscita) throw new Error("Non riesco a disattivare le notifiche. Riprova con la rete attiva.");
    }
    await removeItem(UTENTE_ABILITATO);
    await Promise.allSettled([PushNotifications.unregister(), PushNotifications.removeAllDeliveredNotifications()]);
  });
}

export function ascoltaPushNative(alTocco: (data: Record<string, unknown>) => void, allaRicezione: () => void) {
  if (!piattaformaPushNativa()) return () => {};
  const ascoltatori = [
    PushNotifications.addListener("pushNotificationActionPerformed", evento => {
      alTocco(evento.notification.data ?? {});
    }),
    PushNotifications.addListener("pushNotificationReceived", allaRicezione),
  ];
  for (const ascoltatore of ascoltatori) void ascoltatore.catch((): void => undefined);
  return () => {
    for (const ascoltatore of ascoltatori) void ascoltatore.then(listener => listener.remove()).catch((): void => undefined);
  };
}
