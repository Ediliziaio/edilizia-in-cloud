import { supabase } from "@/integrations/supabase/client";
import { campoWorkDay } from "@/lib/campo/workDay";
import { leggiDettagliViaggio, unitaChilometro, unitaViaggio, voceTrasporto } from "@/lib/campo/viaggiRapportino";
import type { RapportinoCompleto } from "@/hooks/useRapportiniMese";
import { statoDi } from "@/lib/orders/rapportiniMese";
import { leggiDestinatarioRapporto } from "./destinatarioRapporto";
import type { DocumentoOperativo, RigaDocumentoOperativo } from "./modello";

export interface VocePerRendicontoTrasporti {
  id: string;
  data: string;
  descrizione: string;
  quantita: number;
  unita: string;
  vendita_unitaria: number | null;
  viaggio: unknown;
}

export function viaggiDelRendiconto(voci: readonly VocePerRendicontoTrasporti[]): RigaDocumentoOperativo[] {
  const visti = new Set<string>();
  const righe: RigaDocumentoOperativo[] = [];
  for (const voce of voci) {
    if (visti.has(voce.id) || (!voce.viaggio && !voceTrasporto(voce.descrizione, voce.unita))) continue;
    if (!Number.isFinite(voce.quantita) || voce.quantita <= 0) continue;
    visti.add(voce.id);
    righe.push({
      origineId: voce.id,
      data: voce.data,
      descrizione: voce.descrizione,
      ...leggiDettagliViaggio(voce.viaggio),
      unita: unitaChilometro(voce.unita) ? "km" : unitaViaggio(voce.unita) ? "viaggio" : voce.unita,
      quantita: voce.quantita,
      prezzo: voce.vendita_unitaria,
    });
  }
  return righe.sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""));
}

type LetturaVoci = {
  order: (campo: string) => LetturaVoci;
  range: (da: number, a: number) => LetturaVoci;
  abortSignal: (signal: AbortSignal) => PromiseLike<{ data: VocePerRendicontoTrasporti[] | null; error: unknown }>;
};
type Argomenti = { p_company_id: string; p_order_id: string; p_rapportini: string[]; p_anche_da_approvare?: boolean };

async function leggiVoci(companyId: string, orderId: string, ids: string[], signal: AbortSignal, conDaApprovare = false) {
  const db = supabase as unknown as {
    rpc: (nome: "rapportini_voci_approvate_per_trasporti", argomenti: Argomenti) => LetturaVoci;
  };
  const voci: VocePerRendicontoTrasporti[] = [];
  const pagina = 1000;
  for (let i = 0; i < ids.length; i += 200) {
    const p_rapportini = ids.slice(i, i + 200);
    for (let da = 0; ; da += pagina) {
      signal.throwIfAborted();
      const { data, error } = await db.rpc("rapportini_voci_approvate_per_trasporti", {
        p_company_id: companyId, p_order_id: orderId, p_rapportini,
        ...(conDaApprovare ? { p_anche_da_approvare: true } : {}),
      }).order("data").order("id").range(da, da + pagina - 1).abortSignal(signal);
      if (error) throw new Error("Non riesco a leggere i viaggi approvati. Riprova.");
      voci.push(...(data ?? []));
      if (!data || data.length < pagina) break;
    }
  }
  return voci;
}

export async function preparaRendicontoTrasporti(
  companyId: string,
  orderId: string,
  rapportini: readonly RapportinoCompleto[],
  periodo: string,
  signal: AbortSignal,
  /** Bozza: include anche i rapportini inviati e non ancora approvati (il rifiutato mai). */
  conDaApprovare = false,
): Promise<DocumentoOperativo> {
  const approvati = rapportini.filter((r) => r.order_id === orderId && (statoDi(r) === "approvato" || (conDaApprovare && statoDi(r) === "inviato")));
  const bozza = approvati.some((r) => statoDi(r) !== "approvato");
  if (!approvati.length) throw new Error("Approva almeno un rapportino con viaggi per questa commessa.");
  const ids = [...new Set(approvati.map((r) => r.id))];
  const righe = viaggiDelRendiconto(await leggiVoci(companyId, orderId, ids, signal, bozza));
  signal.throwIfAborted();
  if (!righe.length) throw new Error("Nessun viaggio nei rapportini approvati della commessa per il periodo scelto.");

  const destinatario = await leggiDestinatarioRapporto(companyId, orderId);
  signal.throwIfAborted();
  if (!destinatario.nome) throw new Error("Collega il cliente alla commessa per intestare il rendiconto.");
  const commessa = approvati[0].order?.order_code;
  const primo = righe[0].data!;
  const ultimo = righe[righe.length - 1].data!;
  const mese = /^\d{4}-\d{2}$/.test(periodo) ? periodo : null;
  const periodoPdf = mese
    ? new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${mese}-01T12:00:00Z`))
    : periodo;
  return {
    tipo: "trasporti",
    rendicontoTrasporti: true,
    numero: ["TR", commessa, mese ?? (primo === ultimo ? primo : `${primo}_${ultimo}`)].filter(Boolean).join("-"),
    data: campoWorkDay(),
    periodo: periodoPdf,
    destinatario,
    commessa,
    luogo: approvati[0].order?.work_address,
    righe,
    ...(bozza ? { bozza: true } : {}),
  };
}
