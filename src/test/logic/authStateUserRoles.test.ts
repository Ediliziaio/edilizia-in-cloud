import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guardia contro un guasto già arrivato due volte in produzione.
 *
 * `AuthState.userRoles` è una lista e `ruoloArea` la interroga con
 * `state.userRoles.length`. Ogni `setState({...})` che riscrive lo stato per
 * intero e si dimentica `userRoles` lo lascia `undefined`, e il render
 * successivo muore dentro AuthProvider — cioè sopra a tutto.
 *
 * È successo in due forme diverse:
 *  - dieci percorsi "nessuna sessione" che elencavano user/profile/role/company
 *    e basta → l'app non si apriva affatto, landing e login compresi;
 *  - `setState({ user, ...userData })` in refreshAuth, dove `fetchUserData`
 *    restituiva la lista sotto un altro nome → l'app esplodeva più tardi, al
 *    rinnovo del token, mentre la si stava usando.
 *
 * Il tipo non li ha fermati (il typecheck del progetto ha troppo rumore per
 * essere una barriera), quindi la barriera è questo test: si legge il sorgente
 * e si pretende che ogni riscrittura completa dello stato nomini `userRoles`.
 */

const SORGENTE = resolve(__dirname, "../../contexts/AuthContext.tsx");

/**
 * Via i commenti: la guardia deve leggere il codice, non la prosa. Senza questo
 * bastava che un commento citasse lo schema vietato per far fallire il test.
 */
function soloCodice(codice: string): string {
  return codice
    .split("\n")
    .filter((riga) => {
      const t = riga.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");
}

/** Blocchi `setState({ ... })` con oggetto letterale, con la riga di partenza. */
function riscrittureComplete(codice: string): Array<{ riga: number; corpo: string }> {
  const trovati: Array<{ riga: number; corpo: string }> = [];
  const marcatore = "setState({";
  let i = codice.indexOf(marcatore);
  while (i !== -1) {
    // Bilanciamento delle graffe a partire da quella di apertura.
    let profondita = 0;
    let j = i + marcatore.length - 1;
    for (; j < codice.length; j++) {
      if (codice[j] === "{") profondita++;
      else if (codice[j] === "}") {
        profondita--;
        if (profondita === 0) break;
      }
    }
    trovati.push({
      riga: codice.slice(0, i).split("\n").length,
      corpo: codice.slice(i, j + 1),
    });
    i = codice.indexOf(marcatore, j);
  }
  return trovati;
}

describe("AuthContext — userRoles non può restare undefined", () => {
  const sorgente = readFileSync(SORGENTE, "utf8");
  const codice = soloCodice(sorgente);

  it("il test guarda il file giusto e trova davvero delle riscritture", () => {
    expect(sorgente).toContain("AuthState");
    expect(riscrittureComplete(codice).length).toBeGreaterThan(5);
  });

  it("ogni setState che riscrive lo stato nomina userRoles", () => {
    const senzaUserRoles = riscrittureComplete(codice)
      .filter((b) => !b.corpo.includes("userRoles"))
      .map((b) => `riga ${b.riga}: ${b.corpo.replace(/\s+/g, " ").slice(0, 120)}`);

    expect(
      senzaUserRoles,
      "Un setState riscrive AuthState senza userRoles: diventerà undefined e "
        + "farà esplodere AuthProvider al render successivo. Aggiungi userRoles.",
    ).toEqual([]);
  });

  it("nessuno spread di userData: la mappatura dei ruoli resta esplicita", () => {
    // `...userData` è esattamente il modo in cui il difetto è rientrato una
    // seconda volta, quando le due chiavi si chiamavano diversamente.
    expect(codice).not.toContain("...userData");
  });

  it("lo stato iniziale parte da una lista, non da undefined", () => {
    expect(codice).toMatch(/userRoles:\s*\[\]/);
  });
});
