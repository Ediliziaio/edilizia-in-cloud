import { leggiPianoRisorse, type PianoRisorse, type PropostaRisorsa } from "./proposteRisorseComputo";

export interface ArchivioRisorse {
  leggi: () => Promise<{ raw: unknown; updated_at: string | null }>;
  scrivi: (raw: Record<string, unknown>, updatedAt: string | null) => Promise<boolean>;
}
export async function salvaPianoRisorse(archivio: ArchivioRisorse, ambito: {
  companyId: string; orderId: string; computoId: string; userId: string;
}, revisioneAttesa: number, proposte: PropostaRisorsa[]): Promise<PianoRisorse> {
  if (new Set(proposte.map(p => p.id)).size !== proposte.length) throw new Error("Proposte duplicate: aggiorna il piano prima di salvare.");
  for (const p of proposte) {
    const quantita = p.scelta.quantita;
    if (quantita != null && (!Number.isFinite(quantita) || quantita <= 0)) throw new Error("Inserisci quantità positive.");
    if (p.scelta.periodi?.some(x => !Number.isFinite(x.quantita) || x.quantita <= 0 || !Number.isFinite(x.mesi) || x.mesi <= 0 || !x.unita.trim())) throw new Error("Completa quantità, unità e durata dei periodi.");
    if ((p.scelta.dal && !/^\d{4}-\d{2}-\d{2}$/.test(p.scelta.dal)) || (p.scelta.al && !/^\d{4}-\d{2}-\d{2}$/.test(p.scelta.al))
      || (p.scelta.dal && p.scelta.al && p.scelta.al < p.scelta.dal)) throw new Error("Controlla le date della proposta.");
  }
  const piano: PianoRisorse = { versione: 1, revisione: revisioneAttesa + 1, company_id: ambito.companyId,
    order_id: ambito.orderId, computo_id: ambito.computoId, salvato_da: ambito.userId, salvato_il: new Date().toISOString(), proposte };
  for (let tentativo = 0; tentativo < 3; tentativo++) {
    const attuale = await archivio.leggi();
    const precedente = leggiPianoRisorse(attuale.raw, ambito);
    if ((precedente?.revisione ?? 0) !== revisioneAttesa) throw new Error("Il piano è stato modificato da un'altra sessione. Riaprilo prima di salvare: le sue scelte non sono state sovrascritte.");
    if (attuale.raw != null && (typeof attuale.raw !== "object" || Array.isArray(attuale.raw))) throw new Error("L'archivio di questo computo richiede un aggiornamento del formato prima del salvataggio del piano.");
    const raw = { ...(attuale.raw as Record<string, unknown> | null ?? {}), _piano_risorse_v1: piano };
    if (await archivio.scrivi(raw, attuale.updated_at)) return piano;
  }
  throw new Error("Il computo sta cambiando. Le proposte non sono state salvate: riprova dopo l'aggiornamento.");
}
