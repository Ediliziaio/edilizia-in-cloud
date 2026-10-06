import type { MezzoConAssegnazione, MezzoPossesso, MezzoTipo } from "@/types/mezzi";

/**
 * Mezzi e attrezzature raggruppati (06/10/2026), come i subappaltatori: dove
 * sono (cantiere, persona, a bordo di un altro mezzo, magazzino) e cosa manca
 * nei documenti di ogni mezzo.
 */

export interface DocumentoRichiesto {
  /** La categoria di mezzi_documenti. */
  categoria: string;
  /** Come si dice nella pagina. */
  etichetta: string;
}

const ASSICURAZIONE = { categoria: "assicurazione", etichetta: "assicurazione" };
const BOLLO = { categoria: "bollo", etichetta: "bollo" };
const REVISIONE = { categoria: "revisione", etichetta: "revisione" };
const VERIFICA = { categoria: "verifica_periodica", etichetta: "verifica periodica" };
const CONTRATTO = { categoria: "contratto", etichetta: "contratto di noleggio" };

/**
 * I documenti che un mezzo deve avere per girare e lavorare: con la targa
 * assicurazione, bollo e revisione; gru e piattaforme assicurazione e verifica
 * periodica; i mezzi d'opera l'assicurazione. A noleggio lungo assicurazione e
 * bollo sono del noleggiatore: serve il contratto; a noleggio breve niente.
 */
export function documentiRichiesti(m: { tipo: MezzoTipo; possesso?: MezzoPossesso | null }): DocumentoRichiesto[] {
  if (m.possesso === "noleggio_breve") return [];
  if (m.possesso === "noleggio_lungo") return [CONTRATTO];
  const contratto = m.possesso === "leasing" ? [CONTRATTO] : [];
  switch (m.tipo) {
    case "furgone":
    case "autocarro":
    case "autovettura":
      return [ASSICURAZIONE, BOLLO, REVISIONE, ...contratto];
    case "rimorchio":
      return [ASSICURAZIONE, REVISIONE, ...contratto];
    case "sollevamento":
      return [ASSICURAZIONE, VERIFICA, ...contratto];
    case "macchina_movimento_terra":
      return [ASSICURAZIONE, ...contratto];
    default:
      return contratto;
  }
}

/** I documenti che mancano (nessuno registrato di quella categoria). Un mezzo fuori servizio non ne ha bisogno. */
export function mancanzeMezzo(
  m: { tipo: MezzoTipo; possesso?: MezzoPossesso | null; stato?: string | null },
  presenti: ReadonlySet<string> | undefined,
): DocumentoRichiesto[] {
  if (m.stato === "fuori_servizio") return [];
  return documentiRichiesti(m).filter((d) => !presenti?.has(d.categoria));
}

export type TipoPosto = "cantiere" | "luogo" | "mezzo" | "persona" | "magazzino";

export interface Posto {
  chiave: string;
  etichetta: string;
  tipo: TipoPosto;
  /** La commessa, per i cantieri. */
  orderId?: string;
}

/** Chi non è assegnato: «In magazzino» gli attrezzi, «In sede» i mezzi. */
export const IN_MAGAZZINO = "In magazzino";
export const IN_SEDE = "In sede";

/**
 * Dove si trova: sul cantiere se è sulla commessa (anche se lo guida qualcuno),
 * a bordo di un altro mezzo, con una persona, altrimenti in magazzino (o in sede).
 */
export function doveSiTrova(
  m: Pick<MezzoConAssegnazione, "assegnato_order_id" | "assegnato_commessa" | "su_mezzo_id" | "su_mezzo_nome" | "assegnato_hr_profilo_id" | "assegnato_persona">,
  libero: string = IN_MAGAZZINO,
): Posto {
  if (m.assegnato_order_id) {
    return { chiave: `cantiere:${m.assegnato_order_id}`, etichetta: m.assegnato_commessa || "Cantiere", tipo: "cantiere", orderId: m.assegnato_order_id };
  }
  if (m.su_mezzo_id) return { chiave: `mezzo:${m.su_mezzo_id}`, etichetta: `A bordo di ${m.su_mezzo_nome || "un mezzo"}`, tipo: "mezzo" };
  if (m.assegnato_hr_profilo_id) return { chiave: `persona:${m.assegnato_hr_profilo_id}`, etichetta: `Con ${m.assegnato_persona || "una persona"}`, tipo: "persona" };
  return { chiave: "_magazzino", etichetta: libero, tipo: "magazzino" };
}

/** Un montaggio in corso di un'attrezzatura a quantità: tanti m² su quel cantiere (o in quel posto scritto a mano). */
export interface MontaggioInCorso {
  mezzoId: string;
  orderId: string | null;
  /** «ORD-12 · Rossi» per un cantiere, il luogo scritto a mano altrimenti. */
  dove: string;
  quantita: number;
}

/** Una riga in un posto: il mezzo, e per le attrezzature a quantità quanto ce n'è lì. */
export interface VoceNelPosto<T> {
  mezzo: T;
  quantita?: number;
}

const ORDINE_POSTO: Record<TipoPosto, number> = { cantiere: 0, luogo: 1, mezzo: 2, persona: 3, magazzino: 4 };

/**
 * I posti in ordine: i cantieri (i più pieni prima), i posti scritti a mano, a
 * bordo, con le persone, il magazzino in fondo. Un'attrezzatura a quantità
 * (i ponteggi) sta in ogni cantiere dove è montata, con la sua parte, e in
 * magazzino con quello che resta.
 */
export function raggruppaPerPosto<
  T extends Parameters<typeof doveSiTrova>[0] & { id: string; nome: string; gestione?: string | null; quantita_totale?: number | null },
>(
  righe: ReadonlyArray<T>,
  { montaggi = [], libero = IN_MAGAZZINO }: { montaggi?: ReadonlyArray<MontaggioInCorso>; libero?: string } = {},
): Array<Posto & { righe: VoceNelPosto<T>[] }> {
  const mappa = new Map<string, Posto & { righe: VoceNelPosto<T>[] }>();
  const metti = (p: Posto, voce: VoceNelPosto<T>) => {
    const g = mappa.get(p.chiave);
    if (g) g.righe.push(voce);
    else mappa.set(p.chiave, { ...p, righe: [voce] });
  };
  const perMezzo = new Map<string, MontaggioInCorso[]>();
  for (const x of montaggi) perMezzo.set(x.mezzoId, [...(perMezzo.get(x.mezzoId) ?? []), x]);

  for (const r of righe) {
    if (r.gestione !== "quantita") {
      metti(doveSiTrova(r, libero), { mezzo: r });
      continue;
    }
    // Le parti montate, ognuna nel suo posto (due montaggi sullo stesso cantiere si sommano).
    const parti = new Map<string, { posto: Posto; quantita: number }>();
    for (const x of perMezzo.get(r.id) ?? []) {
      const posto: Posto = x.orderId
        ? { chiave: `cantiere:${x.orderId}`, etichetta: x.dove || "Cantiere", tipo: "cantiere", orderId: x.orderId }
        // senza commessa c'è sempre il posto scritto a mano (vincolo della tabella); se manca, un nome comunque
        : { chiave: `luogo:${x.dove.trim().toLowerCase()}`, etichetta: x.dove.trim() || "Posto non indicato", tipo: "luogo" };
      const c = parti.get(posto.chiave);
      if (c) c.quantita += x.quantita;
      else parti.set(posto.chiave, { posto, quantita: x.quantita });
    }
    let montato = 0;
    for (const { posto, quantita } of parti.values()) {
      metti(posto, { mezzo: r, quantita });
      montato += quantita;
    }
    const resto = Number(r.quantita_totale ?? 0) - montato;
    if (resto > 0 || parti.size === 0) {
      metti({ chiave: "_magazzino", etichetta: libero, tipo: "magazzino" }, { mezzo: r, quantita: Math.max(resto, 0) });
    }
  }
  const gruppi = [...mappa.values()];
  for (const g of gruppi) g.righe.sort((a, b) => a.mezzo.nome.localeCompare(b.mezzo.nome, "it"));
  return gruppi.sort((a, b) =>
    ORDINE_POSTO[a.tipo] - ORDINE_POSTO[b.tipo]
    || (a.tipo === "cantiere" ? b.righe.length - a.righe.length : 0)
    || a.etichetta.localeCompare(b.etichetta, "it"));
}
