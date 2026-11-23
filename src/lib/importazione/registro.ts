/**
 * Il registro delle importazioni (23/11/2026): cosa ha creato ogni importazione,
 * per poterla annullare entro 7 giorni. Annullare sposta nel cestino solo quello che
 * l'importazione ha creato; i contatti già presenti, solo aggiornati, non si toccano.
 * Il registro non deve mai fermare un'importazione: se non si riesce a scriverlo,
 * l'importazione va avanti e si dice soltanto che non si potrà annullare.
 */
import { aLotti } from "@/lib/lottiDiId";
import { userErrorMessage } from "@/lib/userErrorMessage";

interface Db {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (tabella: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (nome: string, argomenti: Record<string, unknown>) => any;
}

export type OggettoImport = "contatti" | "opportunita";

/** Apre il registro di un'importazione: l'id, o null se non si è potuto. */
export async function apriRegistro(db: Db, dati: { id?: string; companyId: string; oggetto: OggettoImport; nomeFile?: string; programmata?: boolean }): Promise<string | null> {
  try {
    const { data, error } = await db.from("importazioni_registro").insert({
      ...(dati.id ? { id: dati.id } : {}),
      company_id: dati.companyId, oggetto: dati.oggetto, nome_file: dati.nomeFile ?? null, programmata: !!dati.programmata,
    }).select("id").single();
    if (error || !data) return null;
    return data.id as string;
  } catch {
    return null;
  }
}

/**
 * Segna cosa ha creato. Passa dal database (registra_creati_importazione), che accetta solo
 * elementi appena creati da chi importa: l'annullamento non può togliere il lavoro di altri.
 * Ritorna false se qualcosa non è stato segnato.
 */
export async function segnaCreati(db: Db, registroId: string | null, tipo: "contatto" | "opportunita", ids: string[]): Promise<boolean> {
  if (!registroId || !ids.length) return true;
  let tutto = true;
  for (const lotto of aLotti(ids, 500)) {
    try {
      const { error } = await db.rpc("registra_creati_importazione", { p_registro: registroId, p_tipo: tipo, p_ids: lotto });
      if (error) tutto = false;
    } catch {
      tutto = false;
    }
  }
  return tutto;
}

export interface EsitoAnnullamento { contatti: number; opportunita: number; tenuti: number }

export async function annullaImportazione(db: Db, registroId: string): Promise<EsitoAnnullamento> {
  const { data, error } = await db.rpc("annulla_importazione", { p_id: registroId });
  if (error) throw error;
  const d = (data ?? {}) as Partial<EsitoAnnullamento>;
  return { contatti: d.contatti ?? 0, opportunita: d.opportunita ?? 0, tenuti: d.tenuti ?? 0 };
}

/**
 * Perché non si è potuta annullare. I messaggi scritti apposta dal database (già annullata,
 * oltre i 7 giorni) sono già in italiano semplice e si mostrano così; il resto passa dal
 * traduttore degli errori.
 */
export function motivoAnnullamentoFallito(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === "P0001" && err.message) return err.message;
  return userErrorMessage(e, "Non sono riuscito ad annullare l'importazione. Riprova.");
}

/** «Spostati nel cestino 120 contatti…», detto in modo semplice. */
export function testoAnnullamento(e: EsitoAnnullamento): string {
  const parti: string[] = [];
  if (e.opportunita) parti.push(`${e.opportunita} opportunità`);
  if (e.contatti) parti.push(`${e.contatti} ${e.contatti === 1 ? "contatto" : "contatti"}`);
  let t = parti.length ? `Importazione annullata: spostati nel cestino ${parti.join(" e ")}.` : "Importazione annullata: non c'era niente da togliere.";
  if (e.tenuti) t += ` ${e.tenuti === 1 ? "1 contatto è rimasto" : `${e.tenuti} contatti sono rimasti`} perché nel frattempo ha${e.tenuti === 1 ? "" : "nno"} altre opportunità.`;
  return t;
}
