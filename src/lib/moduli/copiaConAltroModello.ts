/**
 * Copia di un preventivo edile con un altro modello (26/10/2026): si parte da un preventivo già fatto (per esempio
 * «Ristrutturazione completa») e se ne ottiene uno nuovo, in bozza, con un altro modello (per esempio «A computo»):
 * stesso cliente, stesso cantiere, stesso immobile, stesso computo, stesse condizioni economiche; cambiano il modello
 * del PDF e il tipo di intervento. Il preventivo di partenza resta com'è.
 *
 * Un preventivo non cambia modello strada facendo (il PDF già mandato al cliente deve restare quello), quindi si
 * copia. Vale per Bagni, Climatizzazione, Elettrico, Termoidraulico, Pavimenti, Piscine e Ristrutturazione: le
 * tabelle hanno le stesse colonne, e il computo sta in <prefisso>_computo_voci.
 */
import { supabase } from "@/integrations/supabase/client";
import { TABELLA_PREVENTIVI, TIPO_INTERVENTO_DEL_MODELLO, type ModuloConModelli } from "./modelloPreventivo";

/** Le colonne del preventivo che la copia NON porta con sé: sono della copia, o legano all'originale. */
const NON_SI_COPIA = [
  "id", "code", "created_at", "updated_at", "deleted_at", "created_by", "updated_by", "stato", "modello_snapshot",
  // La commessa nata dall'originale e il preventivo da cui l'originale era stato importato.
  "ordine_id", "origine_quote_id", "origine_quote_revision", "origine_quote_impronta", "origine_modello_impronta",
] as const;

/** Il nome della tabella del computo di un preventivatore: rst_progetti → rst_computo_voci. */
export const tabellaComputo = (modulo: ModuloConModelli) => TABELLA_PREVENTIVI[modulo].replace(/_progetti$/, "_computo_voci");

const NON_SI_COPIA_VOCE = ["id", "created_at"] as const;
const toglie = (riga: Record<string, unknown>, chiavi: readonly string[]) =>
  Object.fromEntries(Object.entries(riga).filter(([k]) => !chiavi.includes(k)));

export interface CopiaCreata { id: string; code: string }

export async function copiaConAltroModello(opts: {
  modulo: ModuloConModelli;
  sourceId: string;
  companyId: string;
  nuovoModelId: string;
  /** Il modello dell'azienda per l'intervento, com'è adesso, pronto da congelare (lo costruisce il preventivatore). */
  costruisci: (companyId: string, model: { id: string }) => Promise<unknown>;
}): Promise<CopiaCreata> {
  const { modulo, sourceId, companyId, nuovoModelId, costruisci } = opts;
  // Le tabelle e le funzioni non sono nei tipi generati.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const tabella = TABELLA_PREVENTIVI[modulo];

  const { data: origine, error: eO } = await db.from(tabella).select("*").eq("id", sourceId).eq("company_id", companyId).maybeSingle();
  if (eO) throw new Error(eO.message);
  if (!origine) throw new Error("Preventivo di partenza non trovato.");
  if (origine.deleted_at) throw new Error("Il preventivo di partenza è nel cestino.");

  // Prima il modello: se non si può costruire (l'intervento non ha un modello completo) non si crea niente.
  const snapshot = await costruisci(companyId, { id: nuovoModelId });
  const tipo = TIPO_INTERVENTO_DEL_MODELLO[modulo][nuovoModelId] ?? origine.tipo_intervento ?? null;

  const { data: code, error: eC } = await db.rpc("genera_codice_progetto", { p_company_id: companyId, p_modulo: modulo });
  if (eC || typeof code !== "string") throw new Error(eC?.message || "Numero del preventivo non disponibile: riprova.");

  const { data: nuovo, error: eN } = await db.from(tabella)
    .insert({ ...toglie(origine, NON_SI_COPIA), company_id: companyId, code, stato: "bozza", tipo_intervento: tipo, modello_snapshot: snapshot })
    .select("id, code").single();
  if (eN) throw new Error(eN.message);

  // Il computo, voce per voce, sul preventivo nuovo.
  const { data: voci, error: eV } = await db.from(tabellaComputo(modulo)).select("*").eq("progetto_id", sourceId).eq("company_id", companyId)
    .order("ordine", { ascending: true });
  if (eV) { await db.from(tabella).delete().eq("id", nuovo.id); throw new Error(eV.message); }
  if (voci && voci.length > 0) {
    const righe = (voci as Record<string, unknown>[]).map((v) => ({ ...toglie(v, NON_SI_COPIA_VOCE), progetto_id: nuovo.id, company_id: companyId }));
    const { error: eI } = await db.from(tabellaComputo(modulo)).insert(righe);
    if (eI) {
      // Senza il computo la copia sarebbe un preventivo vuoto: si toglie e si dice.
      await db.from(tabella).delete().eq("id", nuovo.id);
      throw new Error(`Copia non riuscita: ${eI.message}`);
    }
  }
  return { id: nuovo.id as string, code: nuovo.code as string };
}
