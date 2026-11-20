import { catenaDellaFattura, type FatturaPerCatenaServer } from "./catenaFatturaServer.ts";
import { commessaFinale, decidiRiferimentiCommessa, type CommessaDaRegole } from "./regolePrimaDellAi.ts";
import { corpoXmlFattura } from "../../../shared/acquisti/riferimentiFattura.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

type FatturaDaCollegare = FatturaPerCatenaServer & { righe?: unknown };

async function commessaDaCodici(db: Db, fattura: FatturaDaCollegare): Promise<CommessaDaRegole | null> {
  const { data, error } = await db.rpc("commessa_da_codici", {
    p_company_id: fattura.company_id,
    p_xml: fattura.xml_raw ? corpoXmlFattura(fattura.xml_raw, fattura.indice_corpo ?? 0) : null,
    p_righe: fattura.righe ?? null, p_escludi: fattura.id,
  });
  if (error) throw error;
  const r = Array.isArray(data) ? data[0] : data;
  return r?.order_id ? { order_id: String(r.order_id), motivo: String(r.motivo ?? "codice") } : null;
}

/** Usato all'ingresso della fattura e dalla classificazione richiesta dall'utente. */
export async function commessaDaRegole(db: Db, fattura: FatturaDaCollegare) {
  const [catena, codici] = await Promise.all([
    catenaDellaFattura(db, fattura),
    commessaDaCodici(db, fattura),
  ]);
  const scelta = decidiRiferimentiCommessa(codici, catena);
  const commessa = scelta.regola ?? scelta.proposta;
  if (commessa) {
    const certa = !!scelta.regola && !!catena.commessa;
    const { error } = await db.rpc("acquisti_commessa_della_fattura", {
      p_fattura: fattura.id, p_order: commessa.order_id,
      p_regola: certa ? "catena_documenti" : scelta.regola ? "codici_commessa" : "riferimenti_testuali",
      p_esito: certa ? "automatico" : "proposta",
      p_motivo: commessa.motivo,
      p_percorso: catena.catena?.allocazioni.flatMap(a => a.percorsi) ?? null,
    });
    if (error) throw error;
  }
  return scelta;
}

/** Ricalcola dopo il salvataggio, con i riferimenti e il fornitore effettivi della riga. */
export async function verificaRiferimentiRicevuta(db: Db, companyId: string, id: string) {
  try {
    const { data: fattura, error } = await db.from("fatture_ricevute")
      .select("id, company_id, fornitore_id, data_fattura, xml_raw, indice_corpo, note, righe, aggancio_oda_manuale")
      .eq("company_id", companyId).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!fattura?.xml_raw || fattura.aggancio_oda_manuale) return;
    const { regola, proposta, conflitto } = await commessaDaRegole(db, fattura);
    if (!regola && !proposta && !conflitto) return;
    const finale = commessaFinale(regola, { orderId: null, confidenza: 0 }, conflitto, proposta);
    const query = db.from("fatture_ricevute").update({
      order_id_suggerito: finale.orderId, order_match_confidenza: finale.confidenza,
      order_suggerito_motivo: finale.motivo,
    }).eq("company_id", companyId).eq("id", id).eq("aggancio_oda_manuale", false);
    const { error: salvataggio } = await (finale.orderId
      ? query.or(`order_id_suggerito.is.null,order_id_suggerito.eq.${finale.orderId}`)
      : query.is("order_id_suggerito", null));
    if (salvataggio) throw salvataggio;
  } catch (error) {
    console.warn("[riferimenti fattura] verifica da riprovare", id, error);
  }
}
