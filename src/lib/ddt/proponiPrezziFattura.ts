import { leggiFatturaPA } from '../../../supabase/functions/_shared/fatturapaReader';
import { numeroDocumento, righeFatturaConfronto, stessaVoce, unitaConfronto, type RigaConfronto } from '../../../supabase/functions/_shared/confrontoFatture';

export interface RigaPrezzoDDT {
  id: string;
  descrizione: string;
  codice_articolo?: string | null;
  quantita: number | null;
  unita_misura: string | null;
}
export interface PropostaPrezzo { q: string; prezzo: string }

/** Usa il lettore XML comune, sul corpo della fattura selezionata. L'XML conserva anche UM e codici. */
export function righeDocumentoFattura(f: { righe: unknown; xml_raw?: string | null; indice_corpo?: number | null }): RigaConfronto[] {
  if (f.xml_raw) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(f.xml_raw, 'application/xml');
    if (!doc.getElementsByTagName('parsererror').length) {
      const letta = leggiFatturaPA(f.xml_raw, parser, f.indice_corpo ?? 0);
      const nodes = Array.from(doc.getElementsByTagName('FatturaElettronicaBody')[f.indice_corpo ?? 0]?.getElementsByTagName('DettaglioLinee') ?? []);
      if (letta?.righe.length && nodes.length === letta.righe.length) {
        const fields = letta.righe.map((r, i) => ({
          numero_linea: i + 1, descrizione: r.description, codice_articolo: r.product_code,
          quantita: numeroDocumento(nodes[i].getElementsByTagName('Quantita')[0]?.textContent),
          prezzo_unitario: numeroDocumento(nodes[i].getElementsByTagName('PrezzoUnitario')[0]?.textContent),
          imponibile: numeroDocumento(nodes[i].getElementsByTagName('PrezzoTotale')[0]?.textContent),
          // Il lettore generico usa pz come default; qui l'unità assente deve restare da verificare.
          unita_misura: nodes[i].getElementsByTagName('UnitaMisura')[0]?.textContent?.trim() || null,
        }));
        return righeFatturaConfronto(fields);
      }
    }
  }
  return righeFatturaConfronto(f.righe);
}

/** Solo corrispondenze univoche con UM compatibili. I casi ambigui restano manuali. */
export function proponiPrezziFattura(bolle: RigaPrezzoDDT[], fattura: RigaConfronto[]): Record<string, PropostaPrezzo> {
  const candidati = bolle.map(b => {
    const voce: RigaConfronto = { id: b.id, descrizione: b.descrizione, codice: b.codice_articolo ?? null, um: b.unita_misura, quantita: b.quantita, prezzo: null, importo: null };
    const match = fattura.filter(f => stessaVoce(voce, f) && !!unitaConfronto(f.um) && unitaConfronto(f.um) === unitaConfronto(b.unita_misura));
    return { b, match };
  });
  const proposte: Record<string, PropostaPrezzo> = {};
  for (const { b, match } of candidati) {
    if (match.length !== 1) continue;
    const f = match[0];
    if (candidati.filter(c => c.match.some(r => r.id === f.id)).length !== 1) continue;
    if (f.quantita == null || f.quantita <= 0 || b.quantita == null || b.quantita <= 0 || f.prezzo == null || f.prezzo < 0) continue;
    if (![f.quantita, b.quantita, f.prezzo].every(Number.isFinite)) continue;
    proposte[b.id] = { q: String(Math.min(b.quantita, f.quantita)), prezzo: String(Math.round(f.prezzo * 10_000) / 10_000) };
  }
  return proposte;
}
