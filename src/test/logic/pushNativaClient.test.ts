import { beforeEach, expect, it, vi } from "vitest";
import { aggiornaPushNativa, ascoltaPushNative, attivaPushNativa, disattivaPushNativa } from "@/lib/mobile/native-push";

const stato = vi.hoisted(() => ({
  preferenze: new Map<string, string>(),
  eventi: new Map<string, (payload?: unknown) => void>(),
  plugin: vi.fn(), rpc: vi.fn(), chiudiAvvisi: vi.fn(), permesso: "granted",
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => "ios", isPluginAvailable: () => true } }));
vi.mock("@/lib/mobile/platform", () => ({ isNative: true }));
vi.mock("@/lib/mobile/native-storage", () => ({
  getItem: (key: string) => Promise.resolve(stato.preferenze.get(key) ?? null),
  setItem: async (key: string, value: string) => { stato.preferenze.set(key, value); },
  removeItem: async (key: string) => { stato.preferenze.delete(key); },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: stato.rpc } }));
vi.mock("@capacitor/push-notifications", () => ({ PushNotifications: {
  checkPermissions: async () => ({ receive: stato.permesso }),
  requestPermissions: async () => ({ receive: stato.permesso }),
  addListener: async (evento: string, fn: (payload?: unknown) => void) => {
    stato.eventi.set(evento, fn);
    return { remove: async () => { stato.eventi.delete(evento); } };
  },
  register: stato.plugin,
  unregister: async () => {},
  removeAllDeliveredNotifications: stato.chiudiAvvisi,
} }));

beforeEach(() => {
  vi.clearAllMocks();
  stato.preferenze.clear();
  stato.eventi.clear();
  stato.permesso = "granted";
  stato.rpc.mockReturnValue({ abortSignal: async (): Promise<{ error: null }> => ({ error: null }) });
  stato.plugin.mockImplementation(async () => {
    // Il sistema può consegnare il token prima di risolvere register().
    stato.eventi.get("registration")?.({ value: "a".repeat(64) });
  });
});

it("aggancia il token al profilo dopo il consenso e rimuove i listener della registrazione", async () => {
  await aggiornaPushNativa("u1");
  expect(stato.plugin).not.toHaveBeenCalled();
  await expect(attivaPushNativa("u1")).resolves.toBe("granted");
  expect(stato.rpc).toHaveBeenCalledWith("registra_dispositivo_push", {
    p_utente: "u1", p_chiave: expect.stringMatching(/^[0-9a-f]{64}$/), p_token: "a".repeat(64), p_piattaforma: "ios",
  });
  expect(stato.eventi.size).toBe(0);
  await aggiornaPushNativa("u2");
  expect(stato.plugin).toHaveBeenCalledOnce();
  await disattivaPushNativa("u1");
  expect(stato.rpc).toHaveBeenLastCalledWith("disattiva_dispositivo_push", expect.objectContaining({ p_utente: "u1" }));
  expect(stato.chiudiAvvisi).toHaveBeenCalledOnce();
});

it("ascolta il tap e la ricezione con un solo listener ciascuno e li scollega", async () => {
  const apri = vi.fn();
  const aggiorna = vi.fn();
  const scollega = ascoltaPushNative(apri, aggiorna);
  stato.eventi.get("pushNotificationActionPerformed")?.({ notification: { data: { url: "/azienda/scadenzario" } } });
  stato.eventi.get("pushNotificationReceived")?.();
  expect(apri).toHaveBeenCalledWith({ url: "/azienda/scadenzario" });
  expect(aggiorna).toHaveBeenCalledOnce();
  scollega();
  await Promise.resolve();
  expect(stato.eventi.size).toBe(0);
});
