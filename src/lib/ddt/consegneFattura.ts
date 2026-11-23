/**
 * Confermare con un clic le consegne in cantiere delle bolle di una fattura (23/11/2026).
 * Le bolle registrate dalla fattura (o a mano) nascono con la consegna da confermare: finché nessuno
 * apre la bolla, la merce non è fra i materiali della commessa. Qui la stessa `ddt_conferma_consegna`
 * della pagina della bolla, bolla per bolla, con le righe che possono entrare senza domande:
 *   · solo bolle in cantiere con la commessa, senza ordine d'acquisto (lì si sceglie l'abbinamento);
 *   · per ogni riga la quantità ancora aperta, con quantità e unità scritte;
 *   · servizi (pompaggio, chiamata autopompa, trasporto, soste, noli…) come «servizio»: non sono
 *     materiali della commessa; il resto come materiale nuovo della commessa, col prezzo della bolla.
 * Una bolla che non va resta com'era e si dice quale: le altre si confermano lo stesso.
 */
import { documentiDb } from "@/lib/ddt/documentiPersistenti";
import { unitaDdt } from "@/lib/ddt/caricoAlSalvataggio";

const SERVIZIO = /\b(pompaggio|autopompa|chiamata|trasport\w*|integrazione\s+viaggio|viaggio|sost[ae]|nol[oi]|noleggio|manodopera|servizio|diritto\s+fisso|spese?\s+di\s+consegna)\b/i;

export interface RigaPerConsegna {
  id: string;
  descrizione: string;
  quantita: number | null;
  unita_misura: string | null;
  order_item_id: string | null;
  purchase_order_item_id?: string | null;
}

export interface RigaDaConfermare {
  riga_id: string;
  quantita: number;
  destinazione: "cantiere";
  order_id: string;
  tipo: "ingresso" | "servizio";
  crea_articolo: boolean;
  order_item_id: string | null;
}

export function eServizio(descrizione: string): boolean {
  return SERVIZIO.test(descrizione);
}

/** Le righe di una bolla in cantiere che si possono confermare senza domande. */
export function righeDaConfermare(
  bolla: { destinazione: string; order_id: string | null; purchase_order_id: string | null },
  righe: RigaPerConsegna[],
  giaConfermato: ReadonlyMap<string, number>,
): RigaDaConfermare[] {
  if (bolla.destinazione !== "cantiere" || !bolla.order_id || bolla.purchase_order_id) return [];
  return righe.flatMap((r): RigaDaConfermare[] => {
    if (r.purchase_order_item_id || r.quantita == null || !(r.quantita > 0) || !unitaDdt(r.unita_misura)) return [];
    const aperta = Math.round((r.quantita - (giaConfermato.get(r.id) ?? 0)) * 10000) / 10000;
    if (!(aperta > 0)) return [];
    const servizio = eServizio(r.descrizione);
    return [{
      riga_id: r.id, quantita: aperta, destinazione: "cantiere", order_id: bolla.order_id!,
      tipo: servizio ? "servizio" : "ingresso",
      crea_articolo: !servizio && !r.order_item_id,
      order_item_id: servizio ? null : r.order_item_id,
    }];
  });
}

export interface EsitoConsegneFattura {
  confermate: number;
  righe: number;
  saltate: Array<{ numero: string; motivo: string }>;
}

type Db = Pick<typeof documentiDb, "from" | "rpc">;

/** Conferma bolla per bolla. Non lancia: una bolla che non va non ferma le altre. */
export async function confermaConsegneFattura(ddtIds: string[], db: Db = documentiDb): Promise<EsitoConsegneFattura> {
  const esito: EsitoConsegneFattura = { confermate: 0, righe: 0, saltate: [] };
  for (const id of [...new Set(ddtIds)]) {
    let numero = "";
    try {
      const { data: d, error } = await db.from("ddt_ricezione").select("id, numero_ddt, destinazione, order_id, purchase_order_id").eq("id", id).single();
      if (error || !d) throw error ?? new Error("Bolla non trovata");
      numero = d.numero_ddt ?? "";
      if (d.destinazione !== "cantiere") continue;
      if (!d.order_id) { esito.saltate.push({ numero, motivo: "in cantiere senza commessa: scegli la commessa sulla bolla" }); continue; }
      if (d.purchase_order_id) { esito.saltate.push({ numero, motivo: "legata a un ordine d'acquisto: conferma dalla bolla" }); continue; }
      const [righe, consegne] = await Promise.all([
        db.from("ddt_righe").select("id, descrizione, quantita, unita_misura, order_item_id, purchase_order_item_id").eq("ddt_ricezione_id", id).order("posizione"),
        db.from("ddt_consegne").select("riga_id, quantita, tipo").eq("ddt_id", id),
      ]);
      if (righe.error) throw righe.error;
      if (consegne.error) throw consegne.error;
      const gia = new Map<string, number>();
      for (const c of (consegne.data ?? []) as Array<{ riga_id: string; quantita: number; tipo: string }>)
        gia.set(c.riga_id, (gia.get(c.riga_id) ?? 0) + (c.tipo === "reso" ? -1 : 1) * Number(c.quantita));
      const invio = righeDaConfermare(d, (righe.data ?? []) as RigaPerConsegna[], gia);
      if (!invio.length) continue;
      const { error: err } = await db.rpc("ddt_conferma_consegna", { p_id: crypto.randomUUID(), p_ddt: id, p_righe: invio });
      if (err) throw err;
      esito.confermate += 1;
      esito.righe += invio.length;
    } catch (e) {
      esito.saltate.push({ numero, motivo: e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "errore" });
    }
  }
  return esito;
}
