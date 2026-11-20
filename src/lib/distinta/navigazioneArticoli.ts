import type { FaseMateriali, MaterialeFase } from "@/hooks/useMaterialiPerFase";
import type { VoceMagazzino } from "./collegaArticoli";
import { normalizzaTesto, normalizzaUnita } from "./generaDistinta";
import { eMateriale } from "./elencoArticoli";
import { verificaDelMateriale } from "./verificaAcquisto";

export type VistaArticoli = "fasi" | "fornitori" | "magazzino";
export interface GruppoArticoli { id: string; nome: string; articoli: string[] }

/** Cerca anche nei codici e nelle misure che l'utente vede aprendo la fonte. */
export function corrispondeRicercaArticolo(m: Pick<MaterialeFase, "name" | "description" | "specifiche" | "origini" | "posizioni" | "locale"> & { riferimento?: string | null }, ricerca: string) {
  const termini = normalizzaTesto(ricerca).split(" ").filter(Boolean);
  if (!termini.length) return true;
  const fonti = m.origini?.flatMap(o => [o.tipo === "planimetria" ? o.documento : o.descrizione, o.tipo === "computo" ? o.codice : o.tipo === "contratto" ? o.posizione_ref : o.simbolo,
    ...("dati_documentali" in o ? o.dati_documentali?.fonti.flatMap(f => [f.numero, f.descrizione]) ?? [] : [])]);
  const testo = normalizzaTesto([m.name, m.description, m.specifiche, m.riferimento, m.locale, ...(fonti ?? []),
    ...(m.posizioni?.flatMap(p => [p.descrizione, p.misure]) ?? [])].join(" "));
  return termini.every(t => testo.includes(t));
}

const unita = (u: string | null | undefined) => ["cad", "pz", "nr", "n"].includes(normalizzaUnita(u)) ? "pz" : normalizzaUnita(u);
export function gruppoMagazzino(m: MaterialeFase, stock: VoceMagazzino[] | null | undefined, codici: Record<string, string | null | undefined> = {}): string {
  if (m.stock_item_id) return "associati";
  if (!stock || !m.unita_misura || verificaDelMateriale(m)?.stato === "da_verificare") return "verificare";
  const codice = m.article_template_id ? normalizzaTesto(codici[m.article_template_id]) : "";
  const nome = normalizzaTesto(m.name);
  const candidati = stock.filter(s => (codice && codice === normalizzaTesto(s.internal_code)) || nome === normalizzaTesto(s.name));
  if (candidati.length > 1 || candidati.some(s => unita(s.unita_misura) !== unita(m.unita_misura))) return "verificare";
  return candidati.length === 1 && Number(candidati[0].quantity_available) > 0 ? "disponibili" : "assenti";
}
export function gruppiNavigazioneArticoli(fasi: FaseMateriali[], vista: VistaArticoli, fornitori: { id: string; name: string }[], stock?: VoceMagazzino[] | null, codici?: Record<string, string | null | undefined>): GruppoArticoli[] {
  if (vista === "fasi") return fasi.map(f => ({ id: f.id ?? "_senza", nome: f.nome, articoli: f.materiali.map(m => m.id) }));
  const gruppi = new Map<string, GruppoArticoli>();
  for (const m of fasi.flatMap(f => f.materiali).filter(eMateriale)) {
    const id = vista === "fornitori" ? m.supplier_id ?? "_senza_fornitore" : gruppoMagazzino(m, stock, codici);
    const nome = vista === "fornitori" ? fornitori.find(f => f.id === id)?.name ?? (m.supplier_id ? "Fornitore non disponibile" : "Fornitore da scegliere")
      : ({ associati: "Già associati al magazzino", disponibili: "Con disponibilità", assenti: "Nessuna disponibilità trovata", verificare: "Disponibilità da verificare" }[id] ?? id);
    const g = gruppi.get(id) ?? { id, nome, articoli: [] };
    if (!g.articoli.includes(m.id)) g.articoli.push(m.id);
    gruppi.set(id, g);
  }
  return [...gruppi.values()].sort((a, b) => a.nome.localeCompare(b.nome, "it"));
}
