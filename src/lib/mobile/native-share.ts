import { Share } from "@capacitor/share";
import { isNative } from "./platform";

export interface ShareOptions { title?: string; text?: string; url?: string; dialogTitle?: string; }

export async function shareContent(options: ShareOptions): Promise<boolean> {
  if (isNative) { try { await Share.share({ ...options, dialogTitle: options.dialogTitle || "Condividi" }); return true; } catch { return false; } }
  if (navigator.share) { try { await navigator.share({ title: options.title, text: options.text, url: options.url }); return true; } catch { return false; } }
  try { await navigator.clipboard.writeText(options.url || options.text || ""); return true; } catch { return false; }
}
