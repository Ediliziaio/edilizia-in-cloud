import { Capacitor } from "@capacitor/core";
import { apriDocumentoNativo } from "@/lib/mobile/documenti";

/** Riserva la scheda durante il clic, prima di attendere il server (Safari/mobile). */
export async function apriPdfFirmato(recuperaUrl: () => Promise<string>): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const url = new URL(await recuperaUrl());
    if (url.protocol !== "https:") throw new Error("Link alla copia firmata non valido.");
    await apriDocumentoNativo(url.href, "documento-firmato.pdf");
    return;
  }
  const scheda = window.open("", "_blank");
  if (!scheda) throw new Error("Il browser ha bloccato la nuova scheda. Consenti i popup per scaricare la copia firmata.");
  scheda.opener = null;
  try {
    const url = await recuperaUrl();
    const indirizzo = new URL(url);
    if (indirizzo.protocol !== "https:") throw new Error("Link alla copia firmata non valido.");
    if (scheda.closed) throw new Error("La scheda del PDF è stata chiusa. Riprova il download.");
    scheda.location.replace(indirizzo.href);
  } catch (err) {
    scheda.close();
    throw err;
  }
}
