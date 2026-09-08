import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DIREZIONI_SYNC,
  direzioneDaModo,
  etichettaDirezione,
  modoDaDirezione,
} from "@/lib/calendar/direzioneSync";

/**
 * La direzione della sincronizzazione con il calendario esterno viveva in due
 * tabelle e in due schede, e per meta' delle voci non la leggeva nessuno: si
 * sceglieva "Solo → Google" e il sistema continuava a fare quello che voleva.
 * Questi test tengono ferme le due cose che lo impedivano di nuovo: il
 * vocabolario unico e il fatto che il server la legga davvero.
 */
describe("Direzione della sincronizzazione calendario", () => {
  it("offre le tre direzioni, senza doppioni", () => {
    expect(DIREZIONI_SYNC.map((d) => d.value)).toEqual(["both", "to_google", "from_google"]);
    expect(new Set(DIREZIONI_SYNC.map((d) => d.label)).size).toBe(3);
    for (const d of DIREZIONI_SYNC) expect(d.descrizione.length).toBeGreaterThan(30);
  });

  it("il riflesso su sync_mode conserva la bidirezionalita'", () => {
    expect(modoDaDirezione("both")).toBe("two_way");
    expect(modoDaDirezione("to_google")).toBe("one_way");
    expect(modoDaDirezione("from_google")).toBe("one_way");
  });

  it("chi non ha preferenze eredita quello che diceva la scheda del collegamento", () => {
    expect(direzioneDaModo("two_way")).toBe("both");
    // "one_way" ha sempre significato "EiC scrive su Google", non il contrario:
    // la scheda del profilo lo raccontava al rovescio.
    expect(direzioneDaModo("one_way")).toBe("to_google");
    expect(direzioneDaModo(null)).toBe("to_google");
    expect(direzioneDaModo(undefined)).toBe("to_google");
  });

  it("ogni direzione ha un'etichetta leggibile", () => {
    expect(etichettaDirezione("both")).toBe("Bidirezionale");
    expect(etichettaDirezione("to_google")).toBe("Solo verso il calendario");
    expect(etichettaDirezione("from_google")).toBe("Solo dal calendario");
  });
});

describe("La sincronizzazione Google rispetta le preferenze", () => {
  const sync = readFileSync(
    resolve(process.cwd(), "supabase/functions/google-calendar-sync/index.ts"),
    "utf8",
  );

  it("legge le preferenze dell'utente prima di scrivere o leggere", () => {
    expect(sync).toContain("async function preferenzeSync(");
    // push, update e il giro notturno passano tutti di li'
    expect(sync.match(/await preferenzeSync\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("mette in pausa chi ha spento la sincronizzazione", () => {
    expect(sync).toContain("if (!pref.attiva)");
  });

  it("non uccide la connessione per un intoppo passeggero di Google", () => {
    expect(sync).toContain("invalid_grant|invalid_client|unauthorized_client");
    expect(sync).toContain('status: permanente ? "token_expired" : conn.status');
  });

  it("recupera gli appuntamenti rimasti fuori mentre il collegamento era rotto", () => {
    expect(sync).toContain("async function recuperaAppuntamentiSenzaEvento(");
    // niente recuperi se l'utente ha chiesto di non scrivere su Google
    expect(sync).toContain('pref.direzione === "from_google"');
  });

  it("avvisa il titolare quando la connessione e' davvero finita", () => {
    expect(sync).toContain("async function avvisaConnessioneScaduta(");
    expect(sync).toContain('entity_type: "google_calendar_connection"');
  });
});

describe("Scollegare un calendario non lascia pezzi in giro", () => {
  const auth = readFileSync(
    resolve(process.cwd(), "supabase/functions/google-calendar-auth/index.ts"),
    "utf8",
  );

  it("stacca squadre, calendari e canali dalla connessione cancellata", () => {
    expect(auth).toContain('from("google_calendar_watches").delete()');
    expect(auth).toContain('from("external_teams")');
    expect(auth).toContain("google_sync_enabled: false");
    expect(auth).toContain("external_connection_id: null");
  });
});
