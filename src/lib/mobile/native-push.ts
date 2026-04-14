import { PushNotifications, type Token, type PushNotificationSchema, type ActionPerformed } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import { isNative } from "./platform";
import { supabase } from "@/integrations/supabase/client";

type NotificationTapHandler = (data: Record<string, unknown>) => void;
let tapHandler: NotificationTapHandler | null = null;

export function onNotificationTap(handler: NotificationTapHandler) { tapHandler = handler; }

export async function initPushNotifications(userId: string, companyId?: string): Promise<string | null> {
  if (!isNative) return null;
  try {
    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== "granted") return null;
    await PushNotifications.register();
    return new Promise<string | null>((resolve) => {
      PushNotifications.addListener("registration", async (token: Token) => {
        try {
          await supabase.from("push_tokens").upsert(
            { user_id: userId, company_id: companyId || null, token: token.value,
              platform: Capacitor.getPlatform() as "ios" | "android", updated_at: new Date().toISOString() },
            { onConflict: "user_id,token" }
          );
        } catch (err) { console.error("[Push] Errore salvataggio token:", err); }
        resolve(token.value);
      });
      PushNotifications.addListener("registrationError", () => resolve(null));
    });
  } catch { return null; }
}

export function setupNotificationListeners() {
  if (!isNative) return;
  PushNotifications.addListener("pushNotificationReceived", (_n: PushNotificationSchema) => {});
  PushNotifications.addListener("pushNotificationActionPerformed", (action: ActionPerformed) => {
    if (tapHandler) tapHandler(action.notification.data || {});
  });
}

export async function teardownPushNotifications() {
  if (!isNative) return;
  await PushNotifications.removeAllListeners();
  tapHandler = null;
}
