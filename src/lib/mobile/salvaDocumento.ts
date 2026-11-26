import { Capacitor } from "@capacitor/core";
import { condividiFile } from "./condividiFile";

/** Nell'app consegna il file a Salva/Condividi del sistema; sul web usa il download del browser. */
export async function salvaDocumento(blob: Blob, nome: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    return await condividiFile(blob, nome, nome) === "condiviso";
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = nome; link.rel = "noopener";
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
