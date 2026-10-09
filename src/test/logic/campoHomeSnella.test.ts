import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * La Home e il menu dell'operaio sul telefono: niente blocchi nascosti col CSS ma montati (ognuno faceva le sue
 * richieste a vuoto a ogni apertura), niente voci già presenti nella barra in basso.
 */
const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("Home: i blocchi che il telefono non mostra non si montano", () => {
  const home = leggi("src/pages/campo/CampoHome.tsx");

  it("assistente e mini calendario solo da tablet in su", () => {
    expect(home).toContain("{!isMobile && isOperaio && <AssistenteCampoOperaio />}");
    expect(home).toContain("{!isMobile && <MiniCalendarioCampo />}");
    expect(home).not.toMatch(/<div className="hidden md:block"><(?:AssistenteCampoOperaio|MiniCalendarioCampo)/);
  });

  it("l'elenco dei cantieri si monta solo se serve: sul telefono, con «Oggi» presente, no", () => {
    expect(home).toContain("{!(isMobile && oggiVisibile) && (");
  });

  it("il badge del ruolo c'è solo per il capocantiere (il resto lo dice già la testata)", () => {
    expect(home).toContain("{isOperaio && isCapocantiere && (");
    expect(home).not.toContain('{isOperaio ? (isCapocantiere ? "Capocantiere" : "Operaio") : "Sub"}');
  });

  it("i due promemoria dei rapportini vengono dal loro file, con la gestione dell'errore", () => {
    expect(home).toContain('from "@/components/campo/RapportiniDaFare"');
    expect(home).not.toContain("function RapportiniDaCompilareOggi");
  });
});

describe("Menu App: senza le voci già in barra e senza ricerca", () => {
  const menu = leggi("src/pages/campo/CampoMenu.tsx");

  it("Dashboard, Calendario, Timbratura, Chat e Impostazioni stanno in barra o in testata", () => {
    for (const voce of ['label: "Dashboard"', 'label: "Calendario"', 'label: "Timbratura"', 'label: "Chat"', 'label: "Impostazioni"']) {
      expect(menu, voce).not.toContain(voce);
    }
  });

  it("non c'è la ricerca delle app (una dozzina di icone si leggono)", () => {
    expect(menu).not.toContain("Cerca app");
  });

  it("il subappaltatore apre i documenti dal percorso unico (che sceglie la pagina per ruolo)", () => {
    expect(menu).not.toContain("/campo/sub/documenti");
    expect(menu).toContain('url: "/campo/documenti"');
  });

  it("le voci che servono ci sono ancora", () => {
    for (const voce of ["Attività", "Rapportino vocale", "Sicurezza", "Avanzamento", "Presenze", "Cedolini", "Documenti", "Apri Ticket"]) {
      expect(menu, voce).toContain(`label: "${voce}"`);
    }
  });
});
