import { describe, expect, it } from "vitest";
import { azioneAttivita, durataPassaggio, nomeAttivita, raggruppaAttivita, statoAttivita } from "@/lib/ai/attivita";
import type { AttivitaAi, RichiestaAi } from "../../../shared/aiAttivita";

const adesso = Date.parse("2026-11-21T10:01:00Z");
const iso = (secondiFa: number) => new Date(adesso - secondiFa * 1000).toISOString();
const bollaId = "10000000-0000-4000-8000-000000000011";
const riga = (parziale: Partial<AttivitaAi>): AttivitaAi => ({
  id: "foto", company_id: "co", actor_user_id: "u", attore: "Andrea", assistente: null,
  bolla_id: bollaId, flusso: "whatsapp", stato: "completata", fase: "destinazione_ddt",
  modello: null, started_at: iso(35), updated_at: iso(29), finished_at: iso(29),
  passaggi: [{ fase: "foto_ricevuta", at: iso(35) }, { fase: "bolla_accodata", at: iso(29) }],
  ...parziale,
});
const foto = riga({});
const voce = riga({
  id: "voce", fase: "risposta_inviata", started_at: iso(28), updated_at: iso(17), finished_at: iso(17),
  passaggi: [{ fase: "vocale_ricevuto", at: iso(28) }, { fase: "risposta_inviata", at: iso(17) }],
});
const lettura = riga({
  id: "lettura", flusso: "ddt", assistente: "WhatsApp", attore: null, fase: "lettura_pronta", stato: "in_attesa",
  started_at: iso(25), updated_at: iso(15), finished_at: iso(15),
  passaggi: [{ fase: "documento_in_lettura", at: iso(25) }, { fase: "lettura_pronta", at: iso(15) }],
});

describe("Attività delle bolle", () => {
  it("mostra una richiesta con foto, vocale, lettura e risposta in ordine cronologico", () => {
    const gruppi = raggruppaAttivita([lettura, foto, voce], adesso);
    expect(gruppi).toHaveLength(1);
    const [gruppo] = gruppi;
    expect(nomeAttivita(gruppo)).toBe("Bolla da WhatsApp");
    expect(gruppo).toMatchObject({ attore: "Andrea", bolla_id: bollaId, flussi: ["ddt", "whatsapp"], fase: "lettura_pronta" });
    expect(gruppo.passaggi.map(p => p.fase)).toEqual([
      "foto_ricevuta", "bolla_accodata", "vocale_ricevuto", "documento_in_lettura", "risposta_inviata", "lettura_pronta",
    ]);
  });

  it("mantiene visibili una lettura in corso e un errore nell’invio della risposta", () => {
    const [attiva] = raggruppaAttivita([foto, voce, { ...lettura, stato: "in_corso", fase: "documento_in_lettura", finished_at: null }], adesso);
    expect(statoAttivita(attiva, adesso)).toBe("in_corso");
    const [errore] = raggruppaAttivita([foto, { ...voce, stato: "errore", fase: "errore" }, lettura], adesso);
    expect(statoAttivita(errore, adesso)).toBe("errore");
  });

  it("tiene separate altre bolle, altre aziende o messaggi senza un abbinamento verificato", () => {
    const righe = [
      foto, voce, riga({ id: "altra", bolla_id: null }),
      riga({ id: "azienda", company_id: "altra-azienda" }),
      riga({ id: "nuova", bolla_id: "10000000-0000-4000-8000-000000000012" }),
    ];
    expect(raggruppaAttivita(righe, adesso)).toHaveLength(4);
  });

  it("chiude l’attività solo dopo la registrazione della bolla in ufficio", () => {
    const esiti = { bolle: [{ id: bollaId, status: "review", updated_at: iso(10) }] };
    const [daRivedere] = raggruppaAttivita([foto, voce, lettura], adesso, esiti);
    expect(daRivedere.stato).toBe("in_attesa");
    const [registrata] = raggruppaAttivita([foto, voce, lettura], adesso, {
      bolle: [{ id: bollaId, status: "registered", updated_at: iso(5) }],
    });
    expect(registrata).toMatchObject({ stato: "completata", fase: "bolla_registrata", finished_at: iso(5) });
    expect(registrata.passaggi.at(-1)).toEqual({ fase: "bolla_registrata", at: iso(5) });
    expect(azioneAttivita(registrata)?.to).toBe(`/azienda/ordini?tab=ddt&ddt_documento=${bollaId}`);
  });
});

describe("Attività di preventivi e riconciliazioni", () => {
  const richiestaId = "10000000-0000-4000-8000-000000000021";
  const risorsaId = "10000000-0000-4000-8000-000000000022";
  const analisiId = "10000000-0000-4000-8000-000000000023";
  const preventivo: RichiestaAi = { tipo: "preventivo", id: richiestaId };
  const proposta = riga({
    id: "proposta", bolla_id: null, flusso: "preventivo", richiesta: preventivo,
    fase: "bozza_pronta", stato: "in_attesa", started_at: iso(35), finished_at: iso(21), updated_at: iso(21),
    passaggi: [{ fase: "bozza_pronta", at: iso(21) }],
  });

  it("passa dalle voci pronte al preventivo salvato quando trova il documento collegato", () => {
    const [daRivedere] = raggruppaAttivita([proposta], adesso);
    expect(daRivedere.stato).toBe("in_attesa");
    expect(azioneAttivita(daRivedere)).toBeUndefined();
    const [salvato] = raggruppaAttivita([proposta], adesso, {
      preventivi: [{ id: risorsaId, ai_richiesta_id: richiestaId, ai_richiesta_salvata_il: iso(15) }],
    });
    expect(salvato).toMatchObject({ fase: "preventivo_salvato", stato: "completata", finished_at: iso(15) });
    expect(salvato.passaggi.at(-1)).toEqual({ fase: "preventivo_salvato", at: iso(15) });
    expect(azioneAttivita(salvato)?.to).toBe(`/azienda/marketing/preventivi/${risorsaId}`);
  });

  it("mantiene l’esito del PDF anche se il messaggio di conferma finisce dopo", () => {
    const riferimento = { ...preventivo, risorsa_id: risorsaId };
    const conferma = riga({
      id: "conferma", bolla_id: null, richiesta: riferimento, fase: "risposta_inviata",
      started_at: iso(18), updated_at: iso(4), finished_at: iso(4),
      passaggi: [{ fase: "preventivo_salvato", at: iso(16) }, { fase: "risposta_inviata", at: iso(4) }],
    });
    const pdf = riga({
      id: "pdf", bolla_id: null, flusso: "preventivo", richiesta: riferimento, fase: "pdf_inviato",
      started_at: iso(14), updated_at: iso(6), finished_at: iso(6),
      passaggi: [
        { fase: "pdf_in_preparazione", at: iso(14) },
        { fase: "compone_pdf", at: iso(12), durata_ms: 3412 },
        { fase: "pdf_inviato", at: iso(6) },
      ],
    });
    const [gruppo] = raggruppaAttivita([proposta, conferma, pdf], adesso);
    expect(gruppo).toMatchObject({ fase: "pdf_inviato", stato: "completata", richiesta: riferimento });
    expect(nomeAttivita(gruppo)).toBe("Preventivo da WhatsApp");
    const durata = gruppo.passaggi.find(p => p.fase === "compone_pdf")?.durata_ms;
    expect(durata).toBe(3412);
    expect(durataPassaggio(durata!)).toBe("3,4 s");
  });

  it("mantiene il progresso dei lotti e apre il confronto dell’analisi salvata", () => {
    const richiesta: RichiestaAi = { tipo: "riconciliazione", id: richiestaId, risorsa_id: risorsaId };
    const parziale = riga({
      id: "lotto-1", bolla_id: null, flusso: "riconciliazione", richiesta,
      fase: "prossimo_lotto", stato: "in_attesa", lotti: { completati: 1, totale: 2 },
    });
    const [inCoda] = raggruppaAttivita([parziale], adesso);
    expect(statoAttivita(inCoda, adesso)).toBe("in_coda");
    const finita: AttivitaAi = {
      ...parziale, id: "lotto-2", richiesta: { ...richiesta, esito_id: analisiId },
      fase: "analisi_salvata", updated_at: iso(5), finished_at: iso(5), lotti: { completati: 2, totale: 2 },
    };
    const gruppi = raggruppaAttivita([parziale, finita], adesso);
    expect(gruppi).toHaveLength(1);
    expect(gruppi[0]).toMatchObject({ fase: "analisi_salvata", lotti: { completati: 2, totale: 2 } });
    expect(azioneAttivita(gruppi[0])?.to)
      .toBe(`/azienda/documenti/fatture-ricevute?fattura=${risorsaId}&confronto=1&analisi=${analisiId}`);
    expect(raggruppaAttivita([parziale, { ...finita, company_id: "altra" }], adesso)).toHaveLength(2);
    expect(raggruppaAttivita([parziale, { ...finita, actor_user_id: "collega" }], adesso)).toHaveLength(2);
  });
});
