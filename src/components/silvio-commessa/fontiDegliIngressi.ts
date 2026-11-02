/**
 * Le fonti che le porte del popup gli passano (31/10/2026, fase 3, lotto 3.3): funzioni pure,
 * accanto ai pulsanti (PulsantiIngressi.tsx), che le provano i test senza interfaccia.
 */
import { riconosciDocumento } from "../../../shared/silvio-commessa/riconoscitore.ts";
import { stimaLettura } from "./presentazione";
import type { FonteDaAggiungere } from "./useBozzaSilvio";

export interface AllegatoEmail {
  filename?: string | null;
  mime?: string | null;
  mime_type?: string | null;
  size?: number | null;
  storage_path?: string | null;
}

/** Gli allegati che Silvio sa leggere: salvati nello storage, non XML/firmati (fatture SDI), un formato che conosce. */
export function fontiDallEmail(emailId: string, allegati: readonly AllegatoEmail[]): FonteDaAggiungere[] {
  return allegati.flatMap((a, indice): FonteDaAggiungere[] => {
    const nome = a.filename?.trim() || `allegato-${indice + 1}`;
    const mime = a.mime ?? a.mime_type ?? null;
    if (!a.storage_path || /\.(xml|p7m)$/i.test(nome) || /xml|pkcs7/i.test(mime ?? "")) return [];
    const r = riconosciDocumento({ nome, mime: mime ?? "" });
    if (r.lettore !== "silvio_commessa" && r.lettore !== "computo_primus") return [];
    return [{
      tipo: "documento", documento: { tipo: "allegato_email", email_id: emailId, indice }, nome, mime, dimensione: a.size ?? null, confermata: true,
    }];
  });
}

/** La stima di leggere tutte queste fonti, per il pulsante. */
export function stimaDelleFonti(fonti: readonly FonteDaAggiungere[]): number {
  return fonti.reduce((t, f) => (f.tipo === "documento"
    ? t + stimaLettura(riconosciDocumento({ nome: f.nome, mime: f.mime ?? "" }), f.dimensione ?? 0) : t), 0);
}
