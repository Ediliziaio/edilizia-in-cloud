/**
 * Notifiche della campanella nella lingua dell'operaio (lib/campo/lingua/notifiche.ts).
 * Gli esempi sono notifiche vere (Demo 2, 23/11/2026) come le scrive il database.
 */
import { describe, expect, it } from "vitest";
import { MODELLI_NOTIFICA, traduciTestoNotifica } from "@/lib/campo/lingua/notifiche";
import { italiano, type Traduttore } from "@/lib/campo/lingua/traduttore";
import { traduci } from "@/lib/campo/lingua/LinguaCampo";
import en from "@/lib/campo/lingua/dizionari/en?dizionario";
import arMA from "@/lib/campo/lingua/dizionari/arMA?dizionario";

const inglese: Traduttore = (testo, valori) => traduci(en, testo, valori);

const ESEMPI = [
  "Rapportino del 21/11 approvato",
  "Rapportino del 20/11 rifiutato",
  "Cantiere DEMO-APP-2810-A. Le ore sono passate in commessa.",
  "Cantiere ORD-2026-001. Motivo: Mancano le foto",
  "Rifallo e rimandalo.",
  "Nuovo cantiere: O-2026-014",
  "Nuovo cantiere: un cantiere",
  "Sei capocantiere di ORD-2026-001",
  "[DEMO] Impianti e finiture — appalto Aurora · dal 26/10",
  "Manca il rapportino di oggi",
  "Domani sei a ORD-2026-001 · Ristrutturazione bagno e cucina +1",
  "Documento in scadenza: Visita medica",
  "Il materiale che hai chiesto è arrivato",
  "Scade il 12/12/2026. Rinnovalo e caricalo dall'app.",
  "Due minuti: cosa hai fatto, quante ore, una foto. Anche a voce.",
  "Non hai timbrato l'uscita",
  "Sei entrato alle 09:41. Se hai finito, timbra l'uscita.",
  "Nuova attività assegnata",
  "Allaccio rete + collaudo — Scadenza: 08/11/2026",
  "Allaccio rete + collaudo — scaduta il 08/11/2026",
  "Scadenza passata: assicurazione · Fiat Doblò FT123JJ (FT123JJ)",
  "In scadenza: verifica periodica · Miniescavatore Kubota",
  "Verifica periodica macchina · scade il 03/11/2026",
  "Correzione timbratura approvata",
  "Uscita del 17/10 17:30",
  "Entrata del 18/10 07:45: va bene",
  "Nuovo ticket: si è rotto il lavandino",
  "Da Cliente",
];

describe("notifiche nella lingua dell'operaio", () => {
  it("in italiano il testo resta identico, lettera per lettera", () => {
    for (const e of ESEMPI) expect(traduciTestoNotifica(e, italiano), e).toBe(e);
  });

  it("ogni esempio vero è riconosciuto da un modello e tradotto (inglese)", () => {
    for (const e of ESEMPI) expect(traduciTestoNotifica(e, inglese), e).not.toBe(e);
  });

  it("i dati restano al loro posto, le parole fisse si traducono", () => {
    const r = traduciTestoNotifica("Scadenza passata: assicurazione · Fiat Doblò FT123JJ (FT123JJ)", inglese);
    expect(r).toContain("Fiat Doblò FT123JJ (FT123JJ)");
    expect(r).not.toContain("assicurazione");
    expect(traduciTestoNotifica("Cantiere ORD-2026-001. Motivo: Mancano le foto", inglese)).toContain("ORD-2026-001");
    expect(traduciTestoNotifica("Cantiere ORD-2026-001. Motivo: Mancano le foto", inglese)).toContain("Mancano le foto");
  });

  it("una notifica che non corrisponde a nessun modello resta com'è", () => {
    expect(traduciTestoNotifica("Messaggio libero dell'ufficio", inglese)).toBe("Messaggio libero dell'ufficio");
    expect(traduciTestoNotifica(null, inglese)).toBe("");
  });

  it("ogni modello è tradotto in arabo marocchino con gli stessi segnaposto", () => {
    const seg = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const m of MODELLI_NOTIFICA) {
      expect(arMA[m], m).toBeTruthy();
      expect(seg(arMA[m]), m).toBe(seg(m));
    }
  });
});
