import { idWhatsAppValido, magazziniPerBolla, type DomandaDestinazioneBolla, type SceltaDestinazioneBolla } from "./bolleInConversazione.ts";
import { buildInteractivePayload, type InteractiveOption, type InteractivePayload } from "./interactive.ts";
import { cantieriInOrdine, commesseAperte, oggiARoma } from "./tools/shared/cantieriAperti.ts";
import type { ToolCtx } from "./tools/shared/types.ts";

type Sezione = "cantieri" | "depositi";
type PaginaBolla = { sezione: Sezione; pagina: number };
type RispostaBolla = { fotoId: string; invio?: true } & ({ scelta: SceltaDestinazioneBolla } | { pagina: PaginaBolla });

export function rispostaDestinazioneBolla(meta: unknown, tipo: string): RispostaBolla | null {
  if (tipo !== "interactive") return null;
  const record = meta as { interactive?: { button_reply?: { id?: string }; list_reply?: { id?: string } } } | null;
  const id = record?.interactive?.button_reply?.id ?? record?.interactive?.list_reply?.id;
  if (typeof id !== "string") return null;
  const [prefisso, azione, fotoId, valore, extra] = id.split(":");
  if (!["ddt", "ddt-invio"].includes(prefisso) || extra !== undefined || !idWhatsAppValido(fotoId)) return null;
  const origine = { fotoId, ...(prefisso === "ddt-invio" ? { invio: true as const } : {}) };
  if ((azione === "cantiere" || azione === "magazzino") && idWhatsAppValido(valore)) {
    return { ...origine, scelta: { tipo: azione, id: valore } };
  }
  if ((azione === "cantieri" || azione === "depositi") && /^\d{1,3}$/.test(valore ?? "")) {
    return { ...origine, pagina: { sezione: azione, pagina: Number(valore) } };
  }
  return null;
}

export function elencoDestinazioniBolla(
  domanda: DomandaDestinazioneBolla,
  destinazioni: InteractiveOption[],
  sezione: Sezione,
  pagina: number,
  introduzione?: string,
): InteractivePayload {
  const prefisso = domanda.invio ? "ddt-invio" : "ddt";
  const capacita = sezione === "cantieri" ? 9 : 10;
  const perPagina = destinazioni.length > capacita ? capacita - 2 : capacita;
  const totalePagine = Math.ceil(destinazioni.length / perPagina);
  const corrente = Math.min(pagina, totalePagine - 1);
  const righe = destinazioni.slice(corrente * perPagina, (corrente + 1) * perPagina);
  if (corrente > 0) righe.push({ id: `${prefisso}:${sezione}:${domanda.fotoId}:${corrente - 1}`, title: "Pagina precedente" });
  if (corrente + 1 < totalePagine) righe.push({ id: `${prefisso}:${sezione}:${domanda.fotoId}:${corrente + 1}`, title: "Altri risultati" });
  if (sezione === "cantieri") righe.push({ id: `${prefisso}:depositi:${domanda.fotoId}:0`, title: "Magazzino" });
  const nome = sezione === "cantieri" ? "cantieri" : "magazzini";
  const pagine = totalePagine > 1 ? ` · Pagina ${corrente + 1} di ${totalePagine}` : "";
  const testo = introduzione ?? (sezione === "cantieri" ? "Scegli dove è arrivata la merce." : "Scegli il magazzino di arrivo.");
  return buildInteractivePayload(`${testo}\n${destinazioni.length} ${nome}${pagine}`,
    righe, sezione === "cantieri" ? "Scegli destinazione" : "Scegli magazzino", true);
}

export async function propostaDestinazioneBolla(
  ctx: ToolCtx,
  domanda: DomandaDestinazioneBolla,
  pagina?: PaginaBolla,
): Promise<InteractivePayload | string> {
  const prefisso = domanda.invio ? "ddt-invio" : "ddt";
  const salvata = domanda.invio ? `Ho salvato ${domanda.etichetta} in DDT → Documenti in ingresso.`
    : `${domanda.etichetta} salvata in DDT → Documenti in ingresso.`;
  const primaDomanda = `${salvata} Dove è arrivata la merce?`;
  if (pagina?.sezione === "depositi") {
    const magazzini = await magazziniPerBolla(ctx);
    if (!magazzini.length) return "Per indicare il magazzino di arrivo, chiedi all’ufficio.";
    return elencoDestinazioniBolla(domanda, magazzini.map(m => ({ id: `${prefisso}:magazzino:${domanda.fotoId}:${m.id}`, title: m.name })), "depositi", pagina.pagina);
  }

  const oggi = oggiARoma();
  const cantieri = (await commesseAperte(ctx)).filter(c => !c.work_start_date || c.work_start_date <= oggi);
  const ordinati = await cantieriInOrdine(ctx, cantieri);
  const righe = ordinati.map(c => ({ id: `${prefisso}:cantiere:${domanda.fotoId}:${c.id}`, title: c.titolo, description: c.dettaglio }));
  if (!righe.length) {
    const magazzini = await magazziniPerBolla(ctx);
    if (!magazzini.length) return pagina
      ? "L’ufficio può indicare la destinazione in «Documenti in ingresso»."
      : `${salvata} L’ufficio può indicare la destinazione.`;
    const opzioni = magazzini.map(m => ({ id: `${prefisso}:magazzino:${domanda.fotoId}:${m.id}`, title: m.name }));
    return elencoDestinazioniBolla(domanda, opzioni, "depositi", 0, pagina ? undefined : primaDomanda);
  }
  if (pagina) return elencoDestinazioniBolla(domanda, righe, "cantieri", pagina.pagina);
  const [primo, secondo] = ordinati;
  if (secondo) {
    const suggerito = primo.punteggio > secondo.punteggio
      ? `\nCantiere suggerito · ${[primo.titolo, primo.dettaglio].filter(Boolean).join(" · ")}` : "";
    return elencoDestinazioniBolla(domanda, righe, "cantieri", 0, primaDomanda + suggerito);
  }
  return buildInteractivePayload(`${salvata} La merce è arrivata qui?\n${[primo.titolo, primo.dettaglio].filter(Boolean).join(" · ")}`, [
    { id: righe[0].id, title: "Assegna qui" },
    { id: `${prefisso}:depositi:${domanda.fotoId}:0`, title: "Magazzino" },
  ]);
}
