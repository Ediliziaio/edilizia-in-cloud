/**
 * Fase 3 di «Silvio crea la commessa», senza interfaccia:
 * - gli strumenti della chat (shared/silvio-commessa/chat.ts) diventano `Modifica` e passano
 *   da `applica`; «sposta tutto di una settimana e togli la ditta» sono due modifiche che un
 *   annulla toglie insieme; quello che la commessa ha già si rifiuta;
 * - tre fonti insieme danno i conflitti giusti, risolti con un tocco;
 * - le fasi della commessa senza date ricevono le date come proposta (fusione, scrittura, RPC);
 * - la ⓘ: pagina e citazione; le porte: link, email, contratto, strumento della chat.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Frammento, PianoCommessa } from "../../../shared/silvio-commessa/piano.ts";
import { annulla, applica, fondi, pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";
import {
  eAnnulla, eseguiRisposta, eseguiStrumento, pianoPerLaChat, rispostaDelModello, STRUMENTI_CHAT,
} from "../../../shared/silvio-commessa/chat.ts";
import { fontiDalLink, linkCreaCommessa } from "../../../shared/silvio-commessa/ingressi.ts";
import { scritturaDalPiano } from "@/lib/silvio-commessa/scrittura";
import { frammentiPerCompletare } from "@/lib/silvio-commessa/lettori/commessa";
import { frammentoDaContratto } from "@/lib/silvio-commessa/lettori/contratto";
import { comeSiApre, paginaCitata, trovaCitazione } from "@/components/silvio-commessa/documentoCitato";
import { fontiDallEmail } from "@/components/silvio-commessa/fontiDegliIngressi";
import { fontiDaLink } from "@/components/silvio-commessa/useBozzaSilvio";
import { SILVIO_TOOLS } from "../../../supabase/functions/_shared/silvioTools";

const AZIENDA = "d2000000-0000-4000-a000-000000000002";
const COMMESSA = "0a000000-0000-4000-a000-000000000034";

const pianoDa = (frammenti: Frammento[], orderId: string | null = null): PianoCommessa =>
  frammenti.reduce((p, f) => fondi(p, f), pianoVuoto(AZIENDA, orderId));

const preventivo: Frammento = {
  fonte: { tipo: "preventivo", id: "q1", etichetta: "preventivo PR-0142" },
  aree: {
    cliente: { "cliente.nome": { valore: { client_name: "Mario Rossi" }, fiducia: 1, stato: "fatto" } },
    economia: { "economia.total_amount": { valore: 47900, fiducia: 1, stato: "fatto", fonte: { tipo: "preventivo", id: "q1", etichetta: "preventivo PR-0142", dove: "totale" } } },
    fasi: {
      "fasi.order_work_phases": {
        valore: [
          { name: "Demolizioni", start_date: "2026-11-09", end_date: "2026-11-11" },
          { name: "Impianti", start_date: "2026-11-12", end_date: "2026-11-18" },
        ],
        fiducia: 1, stato: "fatto",
      },
      "fasi.work_start_date": { valore: "2026-11-09", fiducia: 1, stato: "fatto" },
      "fasi.work_end_date": { valore: "2026-11-18", fiducia: 1, stato: "fatto" },
    },
    costi: { "costi.previsti": { valore: [{ fase: "Impianti", importo: 9000, vociSenzaCosto: 0 }], fiducia: 1, stato: "fatto" } },
  },
};
const contratto: Frammento = {
  fonte: { tipo: "contratto", id: "org/u/commessa-1-Contratto.pdf", etichetta: "Contratto.pdf" },
  aree: {
    cliente: { "cliente.nome": { valore: { client_name: "Mario Rossi" }, fiducia: 0.95, stato: "fatto" } },
    economia: {
      "economia.total_amount": {
        valore: 48500, fiducia: 0.95, stato: "fatto",
        fonte: { tipo: "contratto", id: "org/u/commessa-1-Contratto.pdf", etichetta: "Contratto.pdf", dove: "pagina 4", citazione: "corrispettivo di € 48.500,00" },
      },
    },
  },
};
const offerta: Frammento = {
  fonte: { tipo: "offerta", id: "rfq-1", etichetta: "offerta Idraulica Bianchi" },
  aree: {
    ditte: { "ditte.assegnate": { valore: [{ name: "Idraulica Bianchi", fase: "Impianti" }], fiducia: 0.9, stato: "proposta" } },
    costi: { "costi.previsti": { valore: [{ fase: "Impianti", importo: 8200, vociSenzaCosto: 0 }], fiducia: 0.9, stato: "proposta" } },
  },
};

describe("gli strumenti della chat", () => {
  const piano = pianoDa([preventivo, offerta]);

  it("sono i sei della sezione 5.4", () => {
    expect(STRUMENTI_CHAT.map((s) => s.function.name)).toEqual(["cambia_valore", "sposta_date", "aggiungi_fase", "togli", "scegli_fonte", "spiega"]);
  });

  it("cambia_valore: controlla chiave e forma, la data va AAAA-MM-GG, l'importo diventa un numero", () => {
    const ok = eseguiStrumento(piano, { nome: "cambia_valore", argomenti: { chiave: "economia.vat_rate", valore: "10" } });
    expect(ok).toMatchObject({ tipo: "modifica", modifiche: [{ tipo: "cambia_valore", area: "economia", chiave: "economia.vat_rate", valore: 10 }] });
    expect(eseguiStrumento(piano, { nome: "cambia_valore", argomenti: { chiave: "fasi.work_start_date", valore: "lunedì" } }).tipo).toBe("rifiuto");
    expect(eseguiStrumento(piano, { nome: "cambia_valore", argomenti: { chiave: "orders.drop_table", valore: 1 } }).testo).toMatch(/Non so cosa sia/);
  });

  it("revisione 1/11, L2: il punto decimale non moltiplica per cento; importi negativi e IVA inventate no", () => {
    const valore = (chiave: string, v: unknown) => {
      const e = eseguiStrumento(piano, { nome: "cambia_valore", argomenti: { chiave, valore: v } });
      return e.tipo === "modifica" ? (e.modifiche[0] as { valore: unknown }).valore : e.testo;
    };
    expect(valore("economia.total_amount", "1250.50")).toBe(1250.5);
    expect(valore("economia.total_amount", "1.250,50")).toBe(1250.5);
    expect(valore("economia.total_amount", "12.500")).toBe(12500);
    expect(valore("economia.total_amount", -500)).toMatch(/maggiore di zero/);
    expect(valore("economia.vat_rate", 23)).toMatch(/0, 4, 5, 10 o 22/);
    expect(valore("economia.vat_rate", "10%")).toBe(10);
  });

  it("sposta_date: in giorni lavorativi o settimane, tutto o da una fase; senza date da spostare lo dice", () => {
    const tutto = eseguiStrumento(piano, { nome: "sposta_date", argomenti: { settimane: 1 } });
    expect(tutto).toMatchObject({ tipo: "modifica", modifiche: [{ tipo: "sposta_date", giorniLavorativi: 5, daFase: null }] });
    expect(tutto.testo).toBe("Ho spostato le date avanti di 5 giorni lavorativi (1 settimana).");
    const daImpianti = eseguiStrumento(piano, { nome: "sposta_date", argomenti: { giorni_lavorativi: 2, da_fase: "impianti" } });
    expect(daImpianti).toMatchObject({ modifiche: [{ giorniLavorativi: 2, daFase: "Impianti" }] });
    // Revisione 1/11, L8: indietro fin sopra la fase precedente no (Demolizioni finisce l'11/11).
    const sopra = eseguiStrumento(piano, { nome: "sposta_date", argomenti: { giorni_lavorativi: -2, da_fase: "impianti" } });
    expect(sopra.tipo).toBe("rifiuto");
    expect(sopra.testo).toMatch(/partirebbe prima che finisca la fase precedente/);
    // Dalla prima fase si sposta anche l'inizio lavori.
    const daPrima = eseguiStrumento(piano, { nome: "sposta_date", argomenti: { giorni_lavorativi: 1, da_fase: "demolizioni" } }) as Extract<ReturnType<typeof eseguiStrumento>, { tipo: "modifica" }>;
    const spostato = applica(piano, daPrima.modifiche[0]).piano;
    expect(spostato.aree.fasi!["fasi.work_start_date"].valore).toBe("2026-11-10");
    expect(eseguiStrumento(piano, { nome: "sposta_date", argomenti: { da_fase: "Tetto", giorni_lavorativi: 1 } }).tipo).toBe("rifiuto");
    expect(eseguiStrumento(pianoVuoto(AZIENDA), { nome: "sposta_date", argomenti: { giorni_lavorativi: 3 } }).testo).toMatch(/non ci sono ancora date/);
  });

  it("aggiungi_fase: dopo un'altra fase, con le date che seguono", () => {
    const e = eseguiStrumento(piano, { nome: "aggiungi_fase", argomenti: { nome: "Massetti", giorni: 2, dopo_fase: "Demolizioni" } });
    expect(e.tipo).toBe("modifica");
    const dopo = applica(piano, (e as Extract<typeof e, { tipo: "modifica" }>).modifiche[0]).piano;
    const fasi = dopo.aree.fasi!["fasi.order_work_phases"].valore as { name: string; start_date?: string; end_date?: string }[];
    expect(fasi.map((f) => f.name)).toEqual(["Demolizioni", "Massetti", "Impianti"]);
    expect(fasi[1]).toMatchObject({ start_date: "2026-11-12", end_date: "2026-11-13" });
    // Revisione 1/11, L7: «Impianti» slitta di due giorni lavorativi, e la fine dei lavori con lei.
    expect(fasi[2]).toMatchObject({ start_date: "2026-11-16", end_date: "2026-11-20" });
    const fine = (e as Extract<typeof e, { tipo: "modifica" }>).modifiche.find((m) => m.tipo === "cambia_valore" && m.chiave === "fasi.work_end_date");
    expect(fine).toMatchObject({ valore: "2026-11-20" });
    expect(e.testo).toBe("Ho aggiunto la fase «Massetti» dopo «Demolizioni» dal 12/11/2026; le fasi dopo slittano di 2 giorni lavorativi, e la fine dei lavori con loro.");
  });

  it("togli: una variabile intera, o un elemento di un elenco per nome", () => {
    expect(eseguiStrumento(piano, { nome: "togli", argomenti: { chiave: "ditte.assegnate" } }))
      .toMatchObject({ tipo: "modifica", modifiche: [{ tipo: "togli", area: "ditte", chiave: "ditte.assegnate" }], testo: "Ho tolto «Ditte»." });
    expect(eseguiStrumento(piano, { nome: "togli", argomenti: { chiave: "fasi.order_work_phases", elemento: "impianti" } }))
      .toMatchObject({ modifiche: [{ tipo: "togli", indice: 1 }] });
    expect(eseguiStrumento(piano, { nome: "togli", argomenti: { chiave: "fasi.expected_date" } }).tipo).toBe("rifiuto");
  });

  it("scegli_fonte risolve un conflitto; spiega dice fonte, pagina e citazione", () => {
    const conConflitto = pianoDa([preventivo, contratto]);
    const e = eseguiStrumento(conConflitto, { nome: "scegli_fonte", argomenti: { chiave: "economia.total_amount", fonte: "preventivo" } });
    expect(e).toMatchObject({ tipo: "modifica", modifiche: [{ tipo: "scegli_fonte", fonte: "preventivo", idFonte: "q1" }] });
    expect(eseguiStrumento(piano, { nome: "scegli_fonte", argomenti: { chiave: "cliente.nome", fonte: "contratto" } }).tipo).toBe("rifiuto");

    const spiega = eseguiStrumento(pianoDa([contratto]), { nome: "spiega", argomenti: { chiave: "economia.total_amount" } });
    expect(spiega).toEqual({ tipo: "spiegazione", testo: "«Importo» viene dal Contratto.pdf, pagina 4: «corrispettivo di € 48.500,00»." });
    expect(eseguiStrumento(conConflitto, { nome: "spiega", argomenti: { chiave: "economia.total_amount" } }).testo).toMatch(/non sono d'accordo.*48500.*47900/);
  });

  it("«sposta tutto di una settimana e togli la ditta»: due modifiche, e un annulla le toglie insieme", () => {
    const { strumenti } = rispostaDelModello({
      content: "Fatto!",
      tool_calls: [
        { function: { name: "sposta_date", arguments: "{\"settimane\":1}" } },
        { function: { name: "togli", arguments: { chiave: "ditte.assegnate" } } },
      ],
    });
    const esito = eseguiRisposta(piano, strumenti);
    expect(esito.modifiche.map((m) => m.tipo)).toEqual(["sposta_date", "togli"]);
    expect(esito.righe).toEqual(["Ho spostato le date avanti di 5 giorni lavorativi (1 settimana).", "Ho tolto «Ditte»."]);

    let bozza = { piano, storia: [] as ReturnType<typeof applica>["storia"] };
    for (const m of esito.modifiche) bozza = applica(bozza.piano, m, bozza.storia, "g1");
    expect(bozza.piano.aree.fasi!["fasi.work_start_date"].valore).toBe("2026-11-16");
    expect(bozza.piano.aree.ditte!["ditte.assegnate"].valore).toBeNull();

    const indietro = annulla(bozza.piano, bozza.storia);
    expect(indietro.storia).toEqual([]);
    expect(indietro.piano.aree.fasi!["fasi.work_start_date"].valore).toBe("2026-11-09");
    expect(indietro.piano.aree.ditte!["ditte.assegnate"].valore).toEqual([{ name: "Idraulica Bianchi", fase: "Impianti" }]);
  });

  it("le risposte del modello: solo strumenti conosciuti, argomenti illeggibili vuoti, al massimo otto", () => {
    const r = rispostaDelModello({ content: "  ok ", tool_calls: [
      { function: { name: "elimina_commessa", arguments: "{}" } },
      { function: { name: "spiega", arguments: "{non json" } },
      ...Array.from({ length: 12 }, () => ({ function: { name: "spiega", arguments: "{}" } })),
    ] });
    expect(r.testo).toBe("ok");
    expect(r.strumenti).toHaveLength(8);
    expect(r.strumenti[0]).toEqual({ nome: "spiega", argomenti: {} });
  });

  it("«annulla» si riconosce senza AI", () => {
    for (const t of ["annulla", "Annulla l'ultima", "annulla l'ultima modifica.", "torna indietro"]) expect(eAnnulla(t)).toBe(true);
    for (const t of ["annulla la rata di saldo", "togli la ditta"]) expect(eAnnulla(t)).toBe(false);
  });
});

describe("i valori chiusi (modo completa)", () => {
  const commessa = frammentiPerCompletare({
    order: { id: COMMESSA, order_code: "ORD-2026-034", total_amount: 30000, work_start_date: "2026-11-02", description: "Ristrutturazione" },
    fasi: [{ id: "f1", name: "Demolizioni", position: 0, start_date: "2026-11-02", end_date: "2026-11-04" }],
  });
  const piano = pianoDa(commessa, COMMESSA);

  it("cambia_valore, sposta_date, aggiungi_fase e togli su quello che la commessa ha già sono rifiutati, col motivo", () => {
    for (const s of [
      { nome: "cambia_valore" as const, argomenti: { chiave: "economia.total_amount", valore: 32000 } },
      { nome: "sposta_date" as const, argomenti: { settimane: 1 } },
      { nome: "aggiungi_fase" as const, argomenti: { nome: "Tinteggiatura" } },
      { nome: "togli" as const, argomenti: { chiave: "fasi.order_work_phases" } },
    ]) {
      const e = eseguiStrumento(piano, s);
      expect(e.tipo, s.nome).toBe("rifiuto");
      expect(e.testo, s.nome).toMatch(/già nella commessa/);
    }
    // Quello che manca si scrive.
    expect(eseguiStrumento(piano, { nome: "cambia_valore", argomenti: { chiave: "economia.vat_rate", valore: 10 } }).tipo).toBe("modifica");
  });

  it("il modello vede cosa è chiuso", () => {
    const c = pianoPerLaChat(piano, "2026-10-31");
    expect(c.modo).toBe("completa");
    expect(c.variabili.find((v) => v.chiave === "economia.total_amount")).toMatchObject({ chiusa: true, valore: 30000 });
    expect(c.altre.some((v) => v.chiave === "pagamenti.rate")).toBe(true);
  });
});

describe("più fonti insieme (lotto 3.2)", () => {
  it("preventivo + contratto + offerta: conflitti su importo e costi, non sul cliente che dicono uguale; il contratto è il primo candidato", () => {
    const piano = pianoDa([preventivo, contratto, offerta]);
    expect(piano.conflitti.map((c) => c.chiave).sort()).toEqual(["costi.previsti", "economia.total_amount"]);
    const importo = piano.conflitti.find((c) => c.chiave === "economia.total_amount")!;
    expect(importo.candidati.map((c) => [c.fonte.tipo, c.valore])).toEqual([["contratto", 48500], ["preventivo", 47900]]);
    expect(piano.aree.economia!["economia.total_amount"]).toMatchObject({ valore: 48500, stato: "attenzione" });
    expect(piano.aree.cliente!["cliente.nome"].fonte.tipo).toBe("contratto");
    // La ditta la dice solo l'offerta: niente conflitto.
    expect(piano.aree.ditte!["ditte.assegnate"].fonte.tipo).toBe("offerta");
    expect(scritturaDalPiano(piano).conflitti).toBe(2);
  });

  it("ogni conflitto si risolve con un tocco, e una rilettura non lo riapre", () => {
    let p = pianoDa([preventivo, contratto, offerta]);
    p = applica(p, { tipo: "scegli_fonte", area: "economia", chiave: "economia.total_amount", fonte: "contratto", idFonte: contratto.fonte.id }).piano;
    p = applica(p, { tipo: "scegli_fonte", area: "costi", chiave: "costi.previsti", fonte: "offerta", idFonte: "rfq-1" }).piano;
    expect(p.conflitti).toEqual([]);
    expect(p.aree.economia!["economia.total_amount"]).toMatchObject({ valore: 48500, stato: "fatto" });
    // La ⓘ porta ancora al contratto, alla pagina citata.
    expect(p.aree.economia!["economia.total_amount"].fonte).toMatchObject({ dove: "pagina 4", citazione: "corrispettivo di € 48.500,00" });
    p = fondi(p, preventivo);
    expect(p.conflitti).toEqual([]);
    expect(scritturaDalPiano(p).ordine.total_amount).toBe(48500);
  });
});

describe("le fasi della commessa senza date (buco della fase 2)", () => {
  const dati = {
    order: { id: COMMESSA, order_code: "ORD-2026-034", tipo_lavoro: "bagno", description: "Rifacimento bagno 6 mq", work_start_date: "2026-11-09" },
    fasi: [
      { id: "f1", name: "Demolizioni", position: 0 },
      { id: "f2", name: "Impianti", position: 1 },
      { id: "f3", name: "Posa rivestimenti", position: 2, start_date: "2026-12-01", end_date: "2026-12-03" },
    ],
  };

  it("il modello dà le date alle fasi che non le hanno, come proposta: le fasi restano della commessa", () => {
    const frammenti = frammentiPerCompletare(dati);
    expect(frammenti).toHaveLength(2);
    const piano = pianoDa(frammenti, COMMESSA);
    expect(piano.aree.fasi!["fasi.order_work_phases"].fonte).toMatchObject({ tipo: "persona", id: COMMESSA });
    const date = piano.aree.fasi!["fasi.date_fasi"];
    expect(date.stato).toBe("proposta");
    expect((date.valore as { id: string; name: string; start_date: string }[]).map((f) => [f.id, f.name, f.start_date]))
      .toEqual([["f1", "Demolizioni", "2026-11-09"], ["f2", "Impianti", expect.stringMatching(/^2026-11-/)]]);
    // Una proposta 🟡: in scrittura solo dopo «Va bene».
    expect(scritturaDalPiano(piano).date_fasi).toEqual([]);
    const accettata = applica(piano, { tipo: "cambia_valore", area: "fasi", chiave: "fasi.date_fasi", valore: date.valore }).piano;
    const s = scritturaDalPiano(accettata);
    expect(s.date_fasi.map((d) => d.nome)).toEqual(["Demolizioni", "Impianti"]);
    expect(s.fasi).toEqual([]); // nessuna fase nuova
  });

  it("dal cronoprogramma di un preventivo, per nome; «sposta» sposta la proposta, non le fasi della commessa", () => {
    const solo = frammentiPerCompletare({ ...dati, order: { ...dati.order, tipo_lavoro: null, description: "Lavori vari" } });
    expect(solo).toHaveLength(1);
    const piano = pianoDa([...solo, preventivo], COMMESSA);
    const date = piano.aree.fasi!["fasi.date_fasi"].valore as { name: string; start_date: string; end_date: string }[];
    expect(date).toEqual([
      { id: "f1", name: "Demolizioni", start_date: "2026-11-09", end_date: "2026-11-11" },
      { id: "f2", name: "Impianti", start_date: "2026-11-12", end_date: "2026-11-18" },
    ]);
    const e = eseguiStrumento(piano, { nome: "sposta_date", argomenti: { settimane: 1 } });
    expect(e.tipo).toBe("modifica");
    const dopo = applica(piano, (e as Extract<typeof e, { tipo: "modifica" }>).modifiche[0]).piano;
    expect((dopo.aree.fasi!["fasi.date_fasi"].valore as { start_date: string }[])[0].start_date).toBe("2026-11-16");
    expect(dopo.aree.fasi!["fasi.order_work_phases"]).toBe(piano.aree.fasi!["fasi.order_work_phases"]);
  });

  it("la RPC passa date_fasi a commessa_pianifica_fasi, che data solo le fasi senza date", () => {
    const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/20281106100000_commessa_bozze_silvio.sql"), "utf8");
    const aggiungi = sql.slice(sql.indexOf("create or replace function public._silvio_aggiungi"), sql.indexOf("revoke all on function public._silvio_aggiungi"));
    expect(aggiungi).toMatch(/jsonb_array_elements\(coalesce\(s->'date_fasi', '\[\]'::jsonb\)\)/);
    expect(aggiungi).toMatch(/perform public\.commessa_pianifica_fasi\(p_order, v_date, false\)/);
  });
});

describe("la ⓘ che apre il documento", () => {
  it("la pagina dal «dove» e la citazione tra i pezzi di testo della pagina", () => {
    expect(paginaCitata("pagina 4")).toBe(4);
    expect(paginaCitata("Pag. 12 di 40")).toBe(12);
    expect(paginaCitata("p.3")).toBe(3);
    expect(paginaCitata("riga 3")).toBeNull();
    const pezzi = ["Art. 5 — Corrispettivo", "L'importo è il corrispettivo di € 48.500,00", "oltre IVA", "Art. 6"];
    expect(trovaCitazione(pezzi, "corrispettivo di € 48.500,00 oltre IVA")).toEqual([1, 2]);
    expect(trovaCitazione(pezzi, "penale di 100 euro")).toEqual([]);
  });

  it("come si riapre: il file del popup, il percorso della lettura, l'allegato dell'email; non preventivi né testo", () => {
    const pdf = new File(["%PDF"], "Contratto.pdf", { type: "application/pdf" });
    const f = contratto.aree.economia!["economia.total_amount"].fonte!;
    expect(comeSiApre(f, AZIENDA, { file: pdf })).toEqual({ tipo: "file", file: pdf });
    expect(comeSiApre({ ...f, id: `${AZIENDA}/u/commessa-1-Contratto.pdf` }, AZIENDA)).toMatchObject({ tipo: "caricato", path: `${AZIENDA}/u/commessa-1-Contratto.pdf` });
    expect(comeSiApre({ ...f, id: `orders/${COMMESSA}/1-c.pdf` }, AZIENDA)).toMatchObject({ tipo: "allegato_commessa" });
    expect(comeSiApre({ ...f, id: "email:0c000000-0000-4000-a000-000000000001:2" }, AZIENDA)).toMatchObject({ tipo: "email", indice: 2 });
    expect(comeSiApre(preventivo.fonte, AZIENDA)).toBeNull();
    expect(comeSiApre({ tipo: "testo", etichetta: "testo scritto" }, AZIENDA)).toBeNull();
  });
});

describe("le porte (lotto 3.3)", () => {
  it("il link della chat e di WhatsApp porta le fonti al popup, e scarta quelle con una forma sbagliata", () => {
    const link = linkCreaCommessa([
      { tipo: "caricato", path: `${AZIENDA}/u/1-contratto.pdf`, nome: "contratto.pdf", mime: "application/pdf" },
      { tipo: "testo", testo: "rifare bagno 6 mq a Monza, 12k", daLink: true },
    ]);
    expect(link.startsWith("/azienda/ordini/nuovo?silvio=1&fonte=")).toBe(true);
    const params = new URLSearchParams(link.split("?")[1]);
    params.append("fonte", JSON.stringify({ tipo: "caricato", path: `${AZIENDA}/../../segreti`, nome: "x" }));
    params.append("fonte", "{non json");
    const fonti = fontiDalLink(params)!;
    expect(fonti).toHaveLength(2);
    expect(fontiDaLink(fonti)).toEqual([
      { tipo: "caricato", path: `${AZIENDA}/u/1-contratto.pdf`, nome: "contratto.pdf", mime: "application/pdf" },
      { tipo: "testo", testo: "rifare bagno 6 mq a Monza, 12k", daLink: true },
    ]);
    expect(fontiDalLink(new URLSearchParams("quote_id=1"))).toBeNull();
  });

  it("«Fanne una commessa»: solo gli allegati salvati che Silvio legge, già confermati (la stima è sul pulsante)", () => {
    const fonti = fontiDallEmail("0c000000-0000-4000-a000-000000000001", [
      { filename: "Contratto.pdf", mime: "application/pdf", size: 120000, storage_path: `${AZIENDA}/m/c.pdf` },
      { filename: "fattura.xml", mime: "application/xml", storage_path: `${AZIENDA}/m/f.xml` },
      { filename: "foto.jpg", mime: "image/jpeg", storage_path: null },
      { filename: "Piantina.png", mime: "image/png", storage_path: `${AZIENDA}/m/p.png` },
    ]);
    expect(fonti).toEqual([
      expect.objectContaining({ tipo: "documento", nome: "Contratto.pdf", documento: { tipo: "allegato_email", email_id: "0c000000-0000-4000-a000-000000000001", indice: 0 }, confermata: true }),
      expect.objectContaining({ nome: "Piantina.png", documento: expect.objectContaining({ indice: 3 }) }),
    ]);
  });

  it("il contratto dell'app diventa un frammento a regole, senza costo", () => {
    const fr = frammentoDaContratto({
      id: "c1", numero_contratto: "CT-2026-007", status: "firmato", committente_nome: "Condominio Tigli", oggetto_lavori: "Rifacimento facciata",
      ubicazione_cantiere: "Via dei Tigli 4, Monza", importo_totale_eur: 184500, data_inizio_lavori: "2026-11-16", durata_giorni: 120,
      penale_ritardo_eur_giorno: 150, garanzia_anni: 10,
    });
    expect(fr.fonte).toMatchObject({ tipo: "contratto", id: "c1", etichetta: "contratto CT-2026-007" });
    expect(fr.costoEur).toBe(0);
    expect(fr.aree.economia!["economia.total_amount"]).toMatchObject({ valore: 184500, stato: "fatto" });
    expect(fr.aree.economia!["economia.condizioni_contratto"].valore).toEqual({ numero_contratto: "CT-2026-007", durata_giorni: 120, penale_giorno_eur: 150, garanzia_anni: 10 });
    expect(fr.aree.fasi!["fasi.work_start_date"].valore).toBe("2026-11-16");
    const bozza = frammentoDaContratto({ id: "c2", status: "bozza", importo_totale_eur: 1000 });
    expect(bozza.aree.economia!["economia.total_amount"].stato).toBe("proposta");
  });

  it("lo strumento della chat «commessa_da_documento» risponde col link e gli allegati del messaggio, senza scrivere", async () => {
    vi.stubGlobal("Deno", { env: { get: (k: string) => (k === "SITE_URL" ? "https://app.esempio.it/" : undefined) } });
    const t = SILVIO_TOOLS.commessa_da_documento;
    expect(t.riskLevel).toBe("safe");
    // Revisione 1/11, E5: WhatsApp allo strumento non passa gli allegati, il link aprirebbe un popup vuoto.
    expect(t.allowedChannels).not.toContain("whatsapp");
    const ctx = {
      companyId: AZIENDA, userId: "u1", primaryRole: "company_admin", supabase: {} as never,
      attachments: [
        { storage_path: `${AZIENDA}/u1/1-Contratto.pdf`, mime_type: "application/pdf", file_name: "Contratto.pdf", kind: "pdf" },
        { storage_path: "altra/u1/2-x.pdf", mime_type: "application/pdf", file_name: "x.pdf", kind: "pdf" },
      ],
    };
    const r = await t.executor({}, ctx as never) as { link: string; url: string; fonti: number };
    expect(r.fonti).toBe(1);
    expect(r.url).toBe(`https://app.esempio.it${r.link}`);
    const fonti = fontiDalLink(new URLSearchParams(r.link.split("?")[1]))!;
    expect(fonti).toEqual([{ tipo: "caricato", path: `${AZIENDA}/u1/1-Contratto.pdf`, nome: "Contratto.pdf", mime: "application/pdf" }]);
    const senza = await t.executor({ descrizione: "bagno 6 mq" }, { ...ctx, attachments: [] } as never) as { link: string };
    expect(fontiDalLink(new URLSearchParams(senza.link.split("?")[1]))).toEqual([{ tipo: "testo", testo: "bagno 6 mq" }]);

    // Revisione 1/11, E2: in un'azienda con «Crea con Silvio» spento niente link al popup.
    const { DbFinto } = await import("../helpers/dbFinto");
    const spenta = await t.executor({ descrizione: "bagno" }, {
      ...ctx, companyId: "0d000000-0000-4000-a000-000000000001",
      supabase: new DbFinto({ companies: [{ id: "0d000000-0000-4000-a000-000000000001", subscription_plan_id: null }] }).client,
    } as never) as { error?: string; link?: string };
    expect(spenta.link).toBeUndefined();
    expect(spenta.error).toMatch(/non è attivo/);
    vi.unstubAllGlobals();
  });
});
