import { describe, expect, it } from "vitest";
import {
  MODELLI_DOSSIER, componiDossier, leggiDestinatari, livelloDossier, nomeFileDossier, presenzaDati,
  sezioniDelModello, sezioniDisponibili,
} from "@/lib/orders/generali/rendiconto";
import { OGGI, inputAppalto, inputSviluppo, riepilogoAppalto, riepilogoSviluppo } from "@/test/fixtures/generaleRendiconto";

/**
 * Il dossier di rendicontazione della commessa generale: cosa entra (modello, sezioni,
 * permessi di chi lo genera) e i semafori della sintesi. I numeri vengono dai moduli: qui si
 * controlla che arrivino, che non arrivi niente di più e che i colori dicano il vero.
 */

describe("quali sezioni si possono mettere", () => {
  it("lo sviluppo non ha il contratto, l'appalto non ha unità né investitori", () => {
    const sv = sezioniDisponibili({ modello: "sviluppo", permessi: riepilogoSviluppo().permessi, dati: presenzaDati(inputSviluppo()) });
    expect(sv.find((x) => x.sezione === "contratto")?.motivo).toBe("Questo tipo di operazione non lo usa.");
    expect(sv.find((x) => x.sezione === "investitori")?.disponibile).toBe(true);
    const ap = sezioniDisponibili({ modello: "appalto", permessi: riepilogoAppalto().permessi, dati: presenzaDati(inputAppalto()) });
    expect(ap.find((x) => x.sezione === "unita")?.disponibile).toBe(false);
    expect(ap.find((x) => x.sezione === "fonti")?.disponibile).toBe(false);
    expect(ap.find((x) => x.sezione === "contratto")?.disponibile).toBe(true);
  });

  it("senza il permesso sui margini: niente piano, cassa, fonti né investitori, e si dice perché", () => {
    const permessi = { importi: true, costi: false, margini: false };
    const d = sezioniDisponibili({ modello: "sviluppo", permessi, dati: presenzaDati(inputSviluppo()) });
    for (const s of ["piano", "andamento", "cassa", "fonti", "investitori"] as const) {
      expect(d.find((x) => x.sezione === s)?.motivo).toBe("Serve il permesso di vedere i margini.");
    }
    expect(d.find((x) => x.sezione === "unita")?.disponibile).toBe(true);
  });

  it("una sezione vuota non si sceglie: il motivo lo dice", () => {
    const d = sezioniDisponibili({ modello: "sviluppo", permessi: riepilogoSviluppo().permessi, dati: presenzaDati(inputSviluppo({ foto: [] })) });
    expect(d.find((x) => x.sezione === "foto")?.motivo).toBe("Nessuna foto nei rapportini e nel diario.");
  });

  it("i modelli pronti: alla banca non va la posizione dei soci, ai soci non vanno i documenti", () => {
    const d = sezioniDisponibili({ modello: "sviluppo", permessi: riepilogoSviluppo().permessi, dati: presenzaDati(inputSviluppo()) });
    expect(sezioniDelModello("banca", d)).not.toContain("investitori");
    expect(sezioniDelModello("banca", d)).toContain("fonti");
    expect(sezioniDelModello("soci", d)).toContain("investitori");
    expect(sezioniDelModello("soci", d)).not.toContain("documenti");
    expect(MODELLI_DOSSIER.completo.sezioni).toHaveLength(12);
  });
});

describe("il dossier composto", () => {
  it("per la banca: fonti e debito sì, nomi e quote dei soci no", () => {
    const d = componiDossier(inputSviluppo({ modello: "banca", sezioni: MODELLI_DOSSIER.banca.sezioni }));
    expect(d.investitori).toBeNull();
    expect(d.fonti?.debito.map((x) => x.nome)).toEqual(["Banca Locale"]);
    expect(d.fonti?.debito[0].forma).toBe("Mutuo fondiario");
    expect(JSON.stringify(d)).not.toContain("Mario Rossi");
    expect(d.titolo).toBe("Rendiconto dell'operazione · per la banca");
  });

  it("per i soci: ognuno col suo capitale e quanto gli spetta", () => {
    const d = componiDossier(inputSviluppo({ modello: "soci", sezioni: MODELLI_DOSSIER.soci.sezioni }));
    expect(d.investitori?.map((x) => x.nome)).toEqual(["Edil Srl", "Mario Rossi"]);
    const mario = d.investitori!.find((x) => x.nome === "Mario Rossi")!;
    expect(mario.dentro).toBe(200_000);
    expect(mario.rendimentoNome).toBe("Utile");
    expect(mario.spettaAFine).toBeGreaterThan(200_000);
    expect(d.documenti).toBeNull();
  });

  it("i numeri sono quelli dei moduli, non rifatti", () => {
    const i = inputSviluppo();
    const d = componiDossier(i);
    expect(d.piano?.totali).toEqual(i.piano!.confronto.totali);
    expect(d.cassa?.capitaleMassimo).toBe(i.piano!.capitale.massimoStima);
    expect(d.fonti?.rendimenti?.roi).toBe(i.conti!.rendimenti.progetto.roi);
    expect(d.unita?.conteggi.compromesso).toBe(1);
    expect(d.unita?.incassato).toBe(74_000);
    expect(d.andamento).toHaveLength(3);
  });

  it("chi non vede i margini non li ritrova nel dossier, nemmeno nella sintesi", () => {
    const riepilogo = riepilogoSviluppo({ importi: true, costi: false, margini: false });
    const d = componiDossier(inputSviluppo({ riepilogo }));
    expect(d.sezioni).not.toContain("piano");
    expect(d.piano).toBeNull();
    expect(d.cassa).toBeNull();
    expect(d.fonti).toBeNull();
    expect(d.investitori).toBeNull();
    expect(d.sintesi!.numeri.map((n) => n.etichetta)).not.toContain("Margine a fine operazione");
    expect(d.livello).toBe("importi");
    expect(d.avanzamento?.figlie[0].importo).toBe(400_000);
  });

  it("chi non vede gli importi: avanzamento sì, euro no", () => {
    const riepilogo = riepilogoSviluppo({ importi: false, costi: false, margini: false });
    const d = componiDossier(inputSviluppo({ riepilogo, sezioni: ["sintesi", "avanzamento", "documenti"] }));
    expect(d.avanzamento?.scala).toBeNull();
    expect(d.avanzamento?.figlie.every((f) => f.importo === null && f.incassato === null)).toBe(true);
    expect(d.livello).toBe("base");
  });

  it("le note vuote non fanno una sezione; il periodo filtra le foto e i mesi dell'andamento", () => {
    const d = componiDossier(inputSviluppo({
      note: "   ",
      periodo: { dal: "2027-04-01", al: OGGI },
      foto: [
        { src: "data:image/jpeg;base64,AAAA", didascalia: "Getto del solaio", data: "2027-05-10" },
        { src: "data:image/jpeg;base64,BBBB", didascalia: "Scavo", data: "2027-02-01" },
      ],
    }));
    expect(d.sezioni).not.toContain("note");
    expect(d.foto.map((f) => f.didascalia)).toEqual(["Getto del solaio"]);
    expect(d.andamento?.map((x) => x.mese)).toEqual(["2027-04", "2027-05"]);
  });

  it("l'appalto: contratto con atti, SAL, ritenute, anticipazione e garanzie", () => {
    const d = componiDossier(inputAppalto());
    expect(d.contratto?.valore?.aggiornato).toBe(980_000);
    expect(d.contratto?.aSal).toBe(300_000);
    expect(d.contratto?.ritenute.daSvincolare).toBe(1_500);
    expect(d.contratto?.anticipazione.daRecuperare).toBe(126_000);
    expect(d.contratto?.fineAggiornata).toBe("2028-01-30");
    expect(d.contratto?.fatture).toEqual({ emesso: 238_500, incassato: 0 });
    expect(d.operazione.cliente).toBe("Comune di Asti");
  });
});

describe("la sintesi e i semafori", () => {
  it("lo sviluppo: margine, costi, copertura, vendite, documenti", () => {
    const d = componiDossier(inputSviluppo());
    const tono = Object.fromEntries(d.sintesi!.semafori.map((s) => [s.id, s.tono]));
    expect(Object.keys(tono)).toEqual(["margine", "costi", "copertura", "vendite", "incassi", "documenti"]);
    // Nel piano di prova nessuno scostamento: margine e costi in linea.
    expect(tono.margine).toBe("verde");
    expect(tono.costi).toBe("verde");
    // Una unità su due a compromesso con i lavori al 40%: va bene.
    expect(tono.vendite).toBe("verde");
    // I documenti obbligatori dello sviluppo non ci sono tutti.
    expect(tono.documenti).toBe("giallo");
    expect(d.sintesi!.numeri[0]).toMatchObject({ etichetta: "Avanzamento lavori", valore: 0.4, formato: "percento" });
  });

  it("l'appalto: garanzia che scade entro 60 giorni in giallo, incassi in rosso", () => {
    const d = componiDossier(inputAppalto());
    const s = Object.fromEntries(d.sintesi!.semafori.map((x) => [x.id, x]));
    expect(s.garanzie.tono).toBe("giallo");
    expect(s.tempi.tono).toBe("verde");
    expect(s.tempi.testo).toBe("Fine dei lavori il 30/01/2028.");
    expect(s.incassi.tono).toBe("rosso");
  });

  it("tempi scaduti con la penale: rosso", () => {
    const i = inputAppalto();
    i.contratto!.contratto!.penaleGiornaliera = 500;
    const d = componiDossier({ ...i, oggi: "2028-02-09" });
    const tempi = d.sintesi!.semafori.find((x) => x.id === "tempi")!;
    expect(tempi.tono).toBe("rosso");
    expect(tempi.testo).toContain("10 giorni oltre la fine");
  });
});

describe("livello, nome del file e destinatari", () => {
  it("il livello è quello della sezione più riservata", () => {
    const p = { importi: true, costi: true, margini: true };
    expect(livelloDossier(["avanzamento", "documenti"], p)).toBe("importi");
    expect(livelloDossier(["documenti", "foto"], p)).toBe("base");
    expect(livelloDossier(["cassa"], p)).toBe("margini");
  });

  it("nome del file pulito", () => {
    const d = componiDossier(inputAppalto({ riepilogo: { ...riepilogoAppalto(), generale: { ...riepilogoAppalto().generale, nome: "Scuole: lotto 2/3 «Asti»" } } }));
    expect(nomeFileDossier(d)).toBe("Rendiconto Scuole lotto 2 3 Asti 2027-06-15.pdf");
    expect(nomeFileDossier(d, "xlsx")).toMatch(/\.xlsx$/);
  });

  it("destinatari: separatori qualsiasi, doppioni tolti, sbagliati a parte", () => {
    expect(leggiDestinatari("Banca@Esempio.it; soci@edil.it\nbanca@esempio.it, nonvalida")).toEqual({
      validi: ["banca@esempio.it", "soci@edil.it"],
      sbagliati: ["nonvalida"],
    });
  });
});
