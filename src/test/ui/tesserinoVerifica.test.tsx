import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import VerificaTesserino from "@/pages/public/VerificaTesserino";
import { indirizzoVerificaTesserino, testoControllo } from "@/lib/campo/tesserino";

const CODICE = "11111111-2222-4333-8444-555555555555";
const fetchFinto = vi.fn();
beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://progetto.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "chiave-pubblica");
  vi.stubGlobal("fetch", fetchFinto);
  fetchFinto.mockReset();
  window.location.hash = `#${CODICE}`;
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); window.location.hash = ""; });

const risposta = (corpo: unknown) => Promise.resolve(new Response(JSON.stringify(corpo), { status: 200 }));
const base = {
  nome: "Marco", cognome: "Verdi", foto: null, azienda: "Edil Rossi Srl", partita_iva: "01234567890", mansione: "Muratore",
  assunto_il: "2024-03-01", verificato_il: "2026-11-23T10:00:00Z",
};

it("il QR porta all'indirizzo della verifica, col codice dopo il cancelletto", () => {
  expect(indirizzoVerificaTesserino("https://lavori.ediliziaincloud.com/", CODICE)).toBe(`https://lavori.ediliziaincloud.com/tesserino#${CODICE}`);
});

it("lavoratore in regola: verde, con le scadenze di formazione e idoneità", async () => {
  fetchFinto.mockReturnValue(risposta({ ...base, esito: "valido", controlli: [
    { voce: "formazione", stato: "ok", scadenza: "2028-01-10" },
    { voce: "idoneita", stato: "ok", scadenza: "2027-05-02" },
    { voce: "personali", stato: "mancante", scadenza: null },
  ] }));
  render(<VerificaTesserino />);
  expect(await screen.findByText("In regola")).toBeInTheDocument();
  expect(screen.getByText("Marco Verdi")).toBeInTheDocument();
  expect(screen.getByText("Edil Rossi Srl")).toBeInTheDocument();
  expect(screen.getByText(/^Valida fino al 10\/0?1\/2028$/)).toBeInTheDocument();
  const [url, init] = fetchFinto.mock.calls[0];
  expect(url).toBe("https://progetto.supabase.co/rest/v1/rpc/verifica_tesserino");
  expect(JSON.parse(String(init.body))).toEqual({ p_token: CODICE });
});

it("visita scaduta: da verificare, e dice cosa manca", async () => {
  fetchFinto.mockReturnValue(risposta({ ...base, esito: "da_verificare", controlli: [
    { voce: "formazione", stato: "ok", scadenza: null },
    { voce: "idoneita", stato: "scaduto", scadenza: "2026-09-30" },
    { voce: "personali", stato: "ok", scadenza: null },
  ] }));
  render(<VerificaTesserino />);
  expect(await screen.findByText("Da verificare")).toBeInTheDocument();
  expect(screen.getByText(/^Scaduta il 30\/0?9\/2026$/)).toBeInTheDocument();
});

it("codice sconosciuto o rigenerato: non riconosciuto", async () => {
  fetchFinto.mockReturnValue(risposta(null));
  render(<VerificaTesserino />);
  expect(await screen.findByText("Tesserino non riconosciuto")).toBeInTheDocument();
});

it("i documenti personali non dicono mai quale documento né la data", () => {
  expect(testoControllo({ voce: "personali", stato: "scaduto", scadenza: "2026-01-01" })).toBe("Un documento è scaduto");
  expect(testoControllo({ voce: "formazione", stato: "mancante", scadenza: null })).toBe("Non registrata dall'impresa");
});
