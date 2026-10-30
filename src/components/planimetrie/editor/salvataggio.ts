/**
 * Salvare la pianta dall'editor: la prima volta si crea (`planimetria_crea`), poi ogni
 * salvataggio è una versione nuova (`planimetria_salva_versione`) con la versione che
 * l'editor aveva aperto. Se nel frattempo qualcun altro ha salvato, non si sovrascrive:
 * lo si dice con parole semplici e si propone di ricaricare.
 *
 * Le scritture vere sono quelle di `src/lib/planimetrie/archivio.ts` (fase 1); qui
 * arrivano come parametro, così la logica si prova senza database.
 */
import {
  messaggioErrorePlanimetria,
  type NuovaPlanimetria,
  type OrigineVersione,
  type SalvataggioVersione,
} from "@/lib/planimetrie/archivio";
import type { Planimetria } from "./adattatore";

export interface ScrittureArchivio {
  crea: (input: NuovaPlanimetria) => Promise<string>;
  salva: (input: SalvataggioVersione) => Promise<number>;
}

export interface DaSalvare {
  companyId: string;
  documento: Planimetria;
  /** Assente: la pianta non esiste ancora e si crea. */
  planimetriaId?: string | null;
  /** Obbligatorio solo per creare. */
  titolo?: string;
  /** La versione aperta nell'editor. */
  versioneAttesa?: number | null;
  origine?: OrigineVersione;
}

export type EsitoSalvataggio =
  | { ok: true; id: string; versione: number; creata: boolean }
  | { ok: false; conflitto: boolean; messaggio: string };

export const MESSAGGIO_CONFLITTO =
  "La pianta è stata salvata da qualcun altro nel frattempo. Le tue modifiche non sono state salvate: ricarica la pagina per vedere le sue.";

/** Il messaggio che l'archivio dà per l'errore 40001 (versione cambiata nel frattempo). */
const MESSAGGIO_40001 = messaggioErrorePlanimetria({ code: "40001" });

export async function salvaPianta(archivio: ScrittureArchivio, dati: DaSalvare): Promise<EsitoSalvataggio> {
  try {
    if (!dati.planimetriaId) {
      const titolo = dati.titolo?.trim() ?? "";
      if (!titolo) return { ok: false, conflitto: false, messaggio: "Dai un nome alla pianta prima di salvarla." };
      const id = await archivio.crea({
        companyId: dati.companyId,
        titolo,
        documento: { ...dati.documento, titolo: dati.documento.titolo ?? titolo },
        origine: dati.origine ?? "manuale",
      });
      return { ok: true, id, versione: 1, creata: true };
    }
    const versione = await archivio.salva({
      planimetriaId: dati.planimetriaId,
      documento: dati.documento,
      versioneAttesa: dati.versioneAttesa ?? null,
      origine: dati.origine ?? "manuale",
    });
    return { ok: true, id: dati.planimetriaId, versione, creata: false };
  } catch (e) {
    const messaggio = e instanceof Error && e.message ? e.message : "Pianta non salvata: riprova tra qualche secondo.";
    const conflitto = messaggio === MESSAGGIO_40001;
    return { ok: false, conflitto, messaggio: conflitto ? MESSAGGIO_CONFLITTO : messaggio };
  }
}
