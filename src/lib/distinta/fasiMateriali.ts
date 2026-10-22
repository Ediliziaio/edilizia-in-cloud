/**
 * Materiali per fase di lavoro: in quale fase della commessa va il materiale
 * di una voce di computo, e lo stato dei materiali di ogni fase.
 *
 * La fase si propone dal capitolo/categoria del computo (PriMus:
 * super-categoria › categoria › sotto-categoria) confrontando le parole con i
 * nomi delle fasi della commessa. È una proposta: nell'anteprima l'utente la
 * cambia. Se la commessa non ha fasi, si propone di crearle dalle categorie.
 */
import { normalizzaTesto, type VoceComputo } from "./generaDistinta";

export interface FaseCommessa {
  id: string;
  name: string;
  position?: number | null;
}

/** Il «capitolo» di una voce: la categoria più alta che il computo dà. */
export function capitoloVoce(v: VoceComputo): string {
  return (v.super_categoria || v.categoria || v.capitolo_nome || "").trim() || "Senza capitolo";
}

const PAROLE_VUOTE = new Set(["di", "del", "della", "dei", "delle", "e", "ed", "in", "per", "con", "a", "al", "alla", "lavori", "opere", "fase", "impianto", "impianti"]);

/** Radici delle parole significative (le prime 6 lettere: «elettrico» e «elettrici» coincidono). */
function radici(testo: string): Set<string> {
  return new Set(
    normalizzaTesto(testo)
      .split(" ")
      .filter((p) => p.length >= 3 && !PAROLE_VUOTE.has(p) && !/^\d+$/.test(p))
      .map((p) => p.slice(0, 6)),
  );
}

/** Sinonimi di cantiere: la categoria «FM» o «forza motrice» va nella fase elettrica, ecc. */
const SINONIMI: [RegExp, string][] = [
  [/\b(fm|forza motrice|luci|illuminazion|prese|quadri elettric|cavidott)/, "elettr"],
  [/\b(cdz|condizionament|climatizzazion|riscaldament|termic|idrotermic|vmc|ventilazion)/, "termoi"],
  [/\b(antincendi|rivelazion|rilevazion fumi)/, "antinc"],
  [/\b(idric|sanitari|scarichi|adduzion)/, "idrico"],
  [/\b(fotovoltaic|fv)\b/, "fotovo"],
  [/\b(murari|muratur|tramezz|intonac|massett)/, "murari"],
];

function radiciConSinonimi(testo: string): Set<string> {
  const r = radici(testo);
  const n = normalizzaTesto(testo);
  for (const [re, radice] of SINONIMI) if (re.test(n)) r.add(radice);
  return r;
}

export function somiglianza(a: string, b: string): number {
  const ra = radiciConSinonimi(a);
  const rb = radiciConSinonimi(b);
  if (!ra.size || !rb.size) return 0;
  let comuni = 0;
  for (const x of ra) if (rb.has(x)) comuni++;
  return comuni / Math.min(ra.size, rb.size);
}

/** Per ogni capitolo del computo, la fase più simile (o null se nessuna lo è abbastanza). */
export function propostaFasi(voci: VoceComputo[], fasi: FaseCommessa[], soglia = 0.5): Map<string, string | null> {
  const capitoli = [...new Set(voci.map(capitoloVoce))];
  const out = new Map<string, string | null>();
  for (const c of capitoli) {
    let migliore: FaseCommessa | null = null;
    let max = 0;
    for (const f of fasi) {
      const s = somiglianza(c, f.name);
      if (s > max) { max = s; migliore = f; }
    }
    out.set(c, migliore && max >= soglia ? migliore.id : null);
  }
  return out;
}

/** Nomi di fase da creare per i capitoli che non trovano posto (in ordine di computo). */
export function fasiDaCreare(voci: VoceComputo[], proposta: Map<string, string | null>): string[] {
  const visti = new Set<string>();
  const out: string[] = [];
  for (const v of voci) {
    const c = capitoloVoce(v);
    if (visti.has(c)) continue;
    visti.add(c);
    if (!proposta.get(c) && c !== "Senza capitolo") out.push(c);
  }
  return out;
}

// ─── Avanzamento acquisti della fase ───────────────────────────────────────

export type StatoAcquistoMateriale = "da_ordinare" | "in_offerta" | "in_bozza_oda" | "ordinato" | "consegnato";

export const ETICHETTA_STATO_ACQUISTO: Record<StatoAcquistoMateriale, string> = {
  da_ordinare: "Da ordinare",
  in_offerta: "Offerta richiesta",
  in_bozza_oda: "In bozza d'ordine",
  ordinato: "Ordinato",
  consegnato: "Consegnato",
};

/**
 * Stato d'acquisto di un materiale dalla copertura degli ordini (stesse regole
 * di planMaterial: bozza ≠ ordinato) e dallo stato della riga.
 */
export function statoAcquistoMateriale(m: {
  quantity: number;
  status?: string | null;
  supplier_rfq_item_id?: string | null;
  drafted?: number;
  issued?: number;
  received?: number;
}): StatoAcquistoMateriale {
  const q = Number(m.quantity) || 0;
  if ((m.received ?? 0) >= q && q > 0) return "consegnato";
  if (["in_magazzino", "installato", "disponibile"].includes(m.status ?? "")) return "consegnato";
  if ((m.issued ?? 0) > 0 || ["ordinato", "in_arrivo", "in_produzione"].includes(m.status ?? "")) return "ordinato";
  if ((m.drafted ?? 0) > 0) return "in_bozza_oda";
  if (m.supplier_rfq_item_id) return "in_offerta";
  return "da_ordinare";
}

export interface RiepilogoFase {
  totale: number;
  daOrdinare: number;
  inCorso: number;
  ordinati: number;
  consegnati: number;
  importo: number;
}

export function riepilogoFase(materiali: { stato: StatoAcquistoMateriale; quantity: number; purchase_price?: number | null }[]): RiepilogoFase {
  const r: RiepilogoFase = { totale: materiali.length, daOrdinare: 0, inCorso: 0, ordinati: 0, consegnati: 0, importo: 0 };
  for (const m of materiali) {
    if (m.stato === "da_ordinare") r.daOrdinare++;
    else if (m.stato === "in_offerta" || m.stato === "in_bozza_oda") r.inCorso++;
    else if (m.stato === "ordinato") r.ordinati++;
    else r.consegnati++;
    r.importo += (Number(m.purchase_price) || 0) * (Number(m.quantity) || 0);
  }
  r.importo = Math.round(r.importo * 100) / 100;
  return r;
}
