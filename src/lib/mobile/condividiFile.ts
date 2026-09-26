import { Share } from "@capacitor/share";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { isNative } from "./platform";

/**
 * - `serve-un-tocco`: il browser ha rifiutato perché il PDF ha impiegato troppo
 *   a generarsi e il tocco dell'utente è «scaduto»: basta un secondo tocco.
 * - `non-supportato`: nessun foglio di condivisione per i file (browser del computer).
 */
export type EsitoCondivisione = "condiviso" | "annullato" | "serve-un-tocco" | "non-supportato";

function inBase64(blob: Blob): Promise<string> {
  return new Promise((risolvi, rifiuta) => {
    const lettore = new FileReader();
    lettore.onload = () => risolvi(String(lettore.result).split(",")[1] ?? "");
    lettore.onerror = () => rifiuta(lettore.error);
    lettore.readAsDataURL(blob);
  });
}

/**
 * Manda un file (il PDF del preventivo) col foglio di condivisione del
 * telefono: WhatsApp, Mail, AirDrop… Nell'app passa da Filesystem + Share,
 * nel browser dalla Web Share API con i file.
 */
export async function condividiFile(blob: Blob, nome: string, titolo: string): Promise<EsitoCondivisione> {
  if (isNative) {
    const { uri } = await Filesystem.writeFile({ path: nome, data: await inBase64(blob), directory: Directory.Cache });
    try {
      await Share.share({ title: titolo, files: [uri], dialogTitle: titolo });
      return "condiviso";
    } catch {
      return "annullato";
    }
  }
  const file = new File([blob], nome, { type: blob.type || "application/pdf" });
  if (!navigator.canShare?.({ files: [file] })) return "non-supportato";
  try {
    await navigator.share({ files: [file], title: titolo });
    return "condiviso";
  } catch (e) {
    return e instanceof DOMException && e.name === "NotAllowedError" ? "serve-un-tocco" : "annullato";
  }
}

/** Come `condividiFile`, per un link (la pagina di firma): WhatsApp in un tocco. */
export async function condividiLink(url: string, titolo: string): Promise<EsitoCondivisione> {
  if (isNative) {
    try {
      await Share.share({ title: titolo, text: titolo, url, dialogTitle: titolo });
      return "condiviso";
    } catch {
      return "annullato";
    }
  }
  if (!navigator.share) return "non-supportato";
  try {
    await navigator.share({ title: titolo, text: titolo, url });
    return "condiviso";
  } catch (e) {
    return e instanceof DOMException && e.name === "NotAllowedError" ? "serve-un-tocco" : "annullato";
  }
}
