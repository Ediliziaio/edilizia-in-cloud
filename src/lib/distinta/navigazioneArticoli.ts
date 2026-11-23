import type { MaterialeFase } from "@/hooks/useMaterialiPerFase";
import type { VoceMagazzino } from "./collegaArticoli";
import { normalizzaTesto, normalizzaUnita } from "./generaDistinta";
import { eMateriale } from "./elencoArticoli";
import { verificaDelMateriale } from "./verificaAcquisto";

export type VistaArticoli = "fasi" | "fornitori" | "magazzino";
export interface GruppoArticoli { id: string; nome: string; articoli: string[] }
export type ArticoloNavigazione = Pick<MaterialeFase, "id" | "name" | "supplier_id" | "stock_item_id" | "unita_misura">
  & Partial<Pick<MaterialeFase, "article_template_id" | "origini" | "natura_riga" | "product_code">>;

/** Cerca anche nei codici e nelle misure che l'utente vede aprendo la fonte. */
export function corrispondeRicercaArticolo(m: Pick<MaterialeFase, "name" | "description" | "specifiche" | "origini" | "posizioni" | "locale" | "riferimento" | "product_code">, ricerca: string) {
  const termini = normalizzaTesto(ricerca).split(" ").filter(Boolean);
  if (!termini.length) return true;
  const fonti = m.origini?.flatMap(o => [o.tipo === "planimetria" ? o.documento : o.descrizione, o.tipo === "computo" ? o.codice : o.tipo === "contratto" ? o.posizione_ref : o.simbolo,
    ...("dati_documentali" in o ? o.dati_documentali?.fonti.flatMap(f => [f.numero, f.descrizione]) ?? [] : [])]);
  const testo = normalizzaTesto([m.name, m.product_code, m.description, m.specifiche, m.riferimento, m.locale, ...(fonti ?? []),
    ...(m.posizioni?.flatMap(p => [p.descrizione, p.misure]) ?? [])].join(" "));
  return termini.every(t => testo.includes(t));
}

const unita = (u: string | null | undefined) => ["cad", "pz", "nr", "n"].includes(normalizzaUnita(u)) ? "pz" : normalizzaUnita(u);
export function abbinaGiacenzaArticoli(stock: VoceMagazzino[] | null | undefined, codici: Record<string, string | null | undefined>) {
  const perCodice = new Map<string, VoceMagazzino[]>();
  const perNome = new Map<string, VoceMagazzino[]>();
  const perId = new Map((stock ?? []).map(r => [r.id, r]));
  const indicizza = (indice: Map<string, VoceMagazzino[]>, chiave: string, riga: VoceMagazzino) => {
    const righe = indice.get(chiave);
    if (righe) righe.push(riga);
    else indice.set(chiave, [riga]);
  };
  for (const riga of stock ?? []) {
    const codice = normalizzaTesto(riga.internal_code);
    if (codice) indicizza(perCodice, codice, riga);
    indicizza(perNome, normalizzaTesto(riga.name), riga);
  }
  return (m: ArticoloNavigazione): VoceMagazzino | "verificare" | null => {
    if (!stock || !m.unita_misura || verificaDelMateriale(m)?.stato === "da_verificare") return "verificare";
    const codice = normalizzaTesto(m.product_code || (m.article_template_id ? codici[m.article_template_id] : null));
    const associato = m.stock_item_id ? perId.get(m.stock_item_id) : undefined;
    const candidati = m.stock_item_id ? new Set(associato ? [associato] : [])
      : new Set([...(perCodice.get(codice) ?? []), ...(perNome.get(normalizzaTesto(m.name)) ?? [])]);
    if (candidati.size > 1) return "verificare";
    const candidato = candidati.values().next().value;
    if (candidato && unita(candidato.unita_misura) !== unita(m.unita_misura)) return "verificare";
    return candidato && Number(candidato.quantity_available) > 0 ? candidato : null;
  };
}
function classificaMagazzino(stock: VoceMagazzino[] | null | undefined, codici: Record<string, string | null | undefined>) {
  const abbina = abbinaGiacenzaArticoli(stock, codici);
  return (m: ArticoloNavigazione) => {
    if (m.stock_item_id) return "associati";
    const candidato = abbina(m);
    return candidato === "verificare" ? candidato : candidato ? "disponibili" : "assenti";
  };
}
export function gruppoMagazzino(m: ArticoloNavigazione, stock: VoceMagazzino[] | null | undefined, codici: Record<string, string | null | undefined> = {}): string {
  return classificaMagazzino(stock, codici)(m);
}
export function gruppiNavigazioneArticoli(fasi: { id: string | null; nome: string; materiali: ArticoloNavigazione[] }[],
  vista: VistaArticoli, fornitori: { id: string; name: string }[], stock?: VoceMagazzino[] | null,
  codici: Record<string, string | null | undefined> = {}, liberoNelPiano?: (id: string) => number): GruppoArticoli[] {
  if (vista === "fasi") return fasi.map(f => ({ id: f.id ?? "_senza", nome: f.nome, articoli: f.materiali.map(m => m.id) }));
  const fornitoreDi = new Map(fornitori.map(f => [f.id, f.name]));
  const inMagazzino = classificaMagazzino(vista === "magazzino" ? stock : null, codici);
  const gruppi = new Map<string, { id: string; nome: string; articoli: Set<string> }>();
  for (const m of fasi.flatMap(f => f.materiali).filter(eMateriale)) {
    const gruppoScorta = vista === "magazzino" ? inMagazzino(m) : null;
    const id = vista === "fornitori" ? m.supplier_id ?? "_senza_fornitore"
      : gruppoScorta === "disponibili" && liberoNelPiano?.(m.id) === 0 ? "pianificati" : gruppoScorta ?? "assenti";
    const nome = vista === "fornitori" ? fornitoreDi.get(id) ?? (m.supplier_id ? "Fornitore non disponibile" : "Fornitore da scegliere")
      : ({ associati: "Già associati al magazzino", disponibili: "Con disponibilità", pianificati: "Nessuna quota suggerita",
        assenti: "Nessuna disponibilità trovata", verificare: "Disponibilità da verificare" }[id] ?? id);
    const g = gruppi.get(id) ?? { id, nome, articoli: new Set<string>() };
    g.articoli.add(m.id);
    gruppi.set(id, g);
  }
  return [...gruppi.values()].sort((a, b) => a.nome.localeCompare(b.nome, "it")).map(g => ({ ...g, articoli: [...g.articoli] }));
}
