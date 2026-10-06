/// <reference types="node" />
/**
 * Validità dell'offerta e stati del preventivo (controllo del 06/10/2026): la
 * scadenza si scrive e si conta allo stesso modo ovunque, e uno stato vale lo
 * stesso in elenco, nella scheda dell'opportunità e nel badge.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fraseValiditaChiusura, giorniDiValidita, testoValiditaCondizioni } from "@/lib/preventivi/validitaOfferta";
import { gruppoPreventivo, riepilogoPreventivi, scadenzaPreventivo, valoreProposto } from "@/lib/quotes/riepilogoPreventivi";
import { mapClassicoStato, type UnifiedStato } from "@/lib/preventivi/statoUnificato";
import { QUOTE_STATUS_CONFIG } from "@/lib/quoteStatus";
import { etichettaTipoPreventivo, linkPreventivo } from "@/lib/preventivi/linkPreventivo";

describe("validità dell'offerta: i giorni", () => {
  it.each([[30, 30], ["45", 45], [30.9, 30], [1, 1]])("%s → %s giorni", (v, atteso) => expect(giorniDiValidita(v)).toBe(atteso));
  it.each([0, -5, "", null, undefined, "abc", Number.NaN, Number.POSITIVE_INFINITY])("%s non è una validità", (v) => expect(giorniDiValidita(v)).toBeNull());

  it("la frase con i giorni dice «giorno» al singolare e non inventa un numero senza", () => {
    expect(fraseValiditaChiusura(null, 1)).toBe("Questo preventivo è valido 1 giorno dalla data di emissione.");
    expect(fraseValiditaChiusura("", 30)).toBe("Questo preventivo è valido 30 giorni dalla data di emissione.");
    expect(fraseValiditaChiusura(undefined, null)).toBe("Questo preventivo ha una validità limitata dalla data di emissione.");
    expect(testoValiditaCondizioni(null, 15)).toBe("Preventivo valido 15 giorni dalla data di emissione, salvo diversa indicazione scritta.");
    expect(testoValiditaCondizioni("", 0)).toMatch(/periodo limitato/);
  });

  it("il testo scelto dall'azienda vince, e un frammento di durata prende il prefisso senza doppioni", () => {
    expect(fraseValiditaChiusura("Offerta valida 30 giorni dalla data di emissione.", 60)).toBe("Offerta valida 30 giorni dalla data di emissione.");
    expect(fraseValiditaChiusura("30 giorni", 60)).toBe("Questo preventivo è valido 30 giorni.");
    expect(fraseValiditaChiusura("per tre settimane", 60)).toBe("Questo preventivo è valido per tre settimane.");
    expect(fraseValiditaChiusura("fino al 31/12/2026", 60)).toBe("Questo preventivo è valido fino al 31/12/2026.");
    expect(fraseValiditaChiusura("Grazie!", 60)).toBe("Grazie!");
    expect(testoValiditaCondizioni("Valido fino a esaurimento scorte", 60)).toBe("Valido fino a esaurimento scorte");
  });
});

describe("scadenza in elenco (scadenzaPreventivo): giorni di calendario, non blocchi di 24 ore", () => {
  // Date costruite con i componenti LOCALI: il conto è lo stesso in ogni fuso.
  const adesso = new Date(2026, 9, 6, 23, 30);
  const q = (scadenza: Date, status = "inviata") => ({ id: "q", status, total: 100, created_at: "2026-09-01T10:00:00Z", expires_at: scadenza.toISOString() });

  it("un'ora dopo mezzanotte è già «domani»; la sera stessa è «oggi»", () => {
    expect(scadenzaPreventivo(q(new Date(2026, 9, 7, 0, 30)), adesso)).toEqual({ testo: "Scade domani", urgente: true });
    expect(scadenzaPreventivo(q(new Date(2026, 9, 6, 23, 59)), adesso)).toEqual({ testo: "Scade oggi", urgente: true });
  });

  it("fra tre e quattro giorni: urgente solo entro tre", () => {
    expect(scadenzaPreventivo(q(new Date(2026, 9, 9, 10, 0)), adesso)).toEqual({ testo: "Scade tra 3 giorni", urgente: true });
    expect(scadenzaPreventivo(q(new Date(2026, 9, 10, 10, 0)), adesso)).toEqual({ testo: "Scade tra 4 giorni", urgente: false });
  });

  it("scaduto da un giorno / da più giorni, ancora aperto: urgente", () => {
    expect(scadenzaPreventivo(q(new Date(2026, 9, 5, 12, 0)), adesso)).toEqual({ testo: "Scaduto da 1 giorno", urgente: true });
    expect(scadenzaPreventivo(q(new Date(2026, 9, 1, 12, 0)), adesso)).toEqual({ testo: "Scaduto da 5 giorni", urgente: true });
  });

  it("accettato, rifiutato, scaduto o senza data: nessuna scadenza da dire", () => {
    for (const stato of ["accettata", "convertita", "rifiutata", "scaduta"]) expect(scadenzaPreventivo(q(new Date(2026, 9, 9), stato), adesso)).toBeNull();
    expect(scadenzaPreventivo({ id: "q", status: "inviata", total: 1, created_at: "2026-09-01", expires_at: null }, adesso)).toBeNull();
    expect(scadenzaPreventivo({ id: "q", status: "inviata", total: 1, created_at: "2026-09-01", expires_at: "boh" }, adesso)).toBeNull();
  });
});

describe("stati: un solo vocabolario", () => {
  // La vista v_preventivi_unificati nel database (letta il 06/10/2026): il lato `quotes`.
  const VISTA: Record<string, UnifiedStato> = {
    bozza: "bozza", draft: "bozza",
    inviata: "in_corso", sent: "in_corso", viewed: "in_corso", visualizzata: "in_corso", pending: "in_corso",
    accettata: "vinto", accepted: "vinto", firmata: "vinto", signed: "vinto", convertita: "vinto",
    rifiutata: "perso", rejected: "perso", scaduta: "perso", expired: "perso",
  };

  it("mapClassicoStato fa quello che fa la vista del database", () => {
    for (const [stato, atteso] of Object.entries(VISTA)) expect(mapClassicoStato(stato), stato).toBe(atteso);
    for (const stato of ["annullata", "accettato", "boh", "", null, undefined]) expect(mapClassicoStato(stato as string | null | undefined)).toBe("altro");
  });

  it("ogni stato che l'app scrive ha il suo badge (etichetta e colore)", () => {
    for (const stato of ["bozza", "inviata", "accettata", "rifiutata", "scaduta", "convertita"] as const) {
      expect(QUOTE_STATUS_CONFIG[stato].label.length).toBeGreaterThan(2);
      expect(QUOTE_STATUS_CONFIG[stato].className).toMatch(/bg-/);
    }
  });

  it("la scheda dell'opportunità raggruppa come l'elenco: vinto → accettati, perso → chiusi, il resto aperti", () => {
    const aperti = new Set<UnifiedStato>(["bozza", "in_corso", "altro"]);
    for (const stato of Object.keys(VISTA)) {
      const gruppo = gruppoPreventivo(stato);
      const unificato = mapClassicoStato(stato);
      expect(gruppo, stato).toBe(aperti.has(unificato) ? "aperti" : unificato === "vinto" ? "accettati" : "chiusi");
    }
    // Maiuscole e vuoti: come prima.
    expect(gruppoPreventivo("ACCETTATA")).toBe("accettati");
    expect(gruppoPreventivo(null)).toBe("aperti");
    expect(gruppoPreventivo("annullata")).toBe("aperti");
  });

  it("il riepilogo conta ogni preventivo una volta e il valore proposto è l'accettato più recente", () => {
    const righe = [
      { id: "1", status: "bozza", total: 100, created_at: "2026-10-01T10:00:00Z" },
      { id: "2", status: "inviata", total: 200, created_at: "2026-10-02T10:00:00Z" },
      { id: "3", status: "firmata", total: 300, created_at: "2026-10-03T10:00:00Z" },
      { id: "4", status: "rifiutata", total: 400, created_at: "2026-10-04T10:00:00Z" },
      { id: "5", status: "convertita", total: 500, created_at: "2026-10-05T10:00:00Z" },
    ];
    const r = riepilogoPreventivi(righe);
    expect(r.aperti).toEqual({ n: 2, valore: 300 });
    expect(r.accettati).toEqual({ n: 2, valore: 800 });
    expect(r.chiusi).toEqual({ n: 1, valore: 400 });
    expect(r.aperti.n + r.accettati.n + r.chiusi.n).toBe(r.totale);
    expect(valoreProposto(righe)).toEqual({ valore: 500, da: "accettato" });
  });
});

describe("collegamenti ai preventivi: ogni tipo porta a una pagina che esiste", () => {
  const rotte = readFileSync("src/routes/companyRoutes.tsx", "utf8");
  const tipi = ["classico", "serramenti", "fotovoltaico", "ristrutturazione", "bagni", "tetti", "climatizzazione", "elettrico", "termoidraulico", "pavimenti", "piscine"];

  it.each(tipi)("%s", (tipo) => {
    const link = linkPreventivo(tipo, "ID")!;
    expect(link).toMatch(/^\/azienda\/.+ID/);
    // /azienda/<resto> con ID al posto di :id deve combaciare con una <Route path="…"> dell'area azienda.
    const percorso = link.replace(/^\/azienda\//, "").replace("ID", ":id");
    expect(rotte.includes(`path="${percorso}"`), percorso).toBe(true);
    expect(etichettaTipoPreventivo(tipo)).toBeTruthy();
  });

  it("un tipo sconosciuto non è cliccabile", () => {
    expect(linkPreventivo("boh", "ID")).toBeNull();
    expect(linkPreventivo(null, "ID")).toBeNull();
    expect(etichettaTipoPreventivo("boh")).toBe("boh");
  });
});
