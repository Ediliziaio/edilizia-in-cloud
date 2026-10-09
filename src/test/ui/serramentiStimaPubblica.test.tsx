import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// La pagina /stima la apre chi ha il link del preventivo, non per forza il
// firmatario. Il pulsante «Firma con il codice» compare solo se il server dà il
// token di firma (richiesta in attesa del codice); con il codice già inserito la
// pagina dice di riaprire il link ricevuto, invece di mandare a chiedere un link
// che il cliente ha già.

type Risposta = Record<string, unknown>;

const stima = (extra: Risposta = {}): Risposta => ({
  ok: true,
  firma_token: null,
  firma_in_corso: false,
  progetto: {
    code: "SR-2026-001", stato: "consegnato", cliente_nome: "Marta", cliente_cognome: "Rossi", cliente_citta: null, cantiere_citta: null,
    tipo_intervento: "sostituzione", intervento_titolo: "Infissi nuovi", intervento_sintesi: null, totale_serramenti: 8,
    totale_min: 8000, totale_max: 9000, iva_inclusa: true, risparmio_eur_anno: null, detrazione_eur_totale: null, payback_anni: null,
    co2_risparmiata_t_anno: null, consulenza_at: null, consulenza_luogo: null, valido_fino_data: null, allow_self_signing: false, firmato_il: null,
  },
  pdf_url: null,
  azienda: { nome: "Azienda Prova", indirizzo: null, telefono: null, email: null, partita_iva: null, logo_url: null, colore_primario: "#2D7D5C" },
  consulente: null,
  ...extra,
});

const invoke = vi.fn(async (_nome: string, _opzioni: unknown): Promise<{ data: Risposta; error: null }> => ({ data: stima(), error: null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (nome: string, opzioni: unknown) => invoke(nome, opzioni) } } }));

import SerramentiStimaPubblica from "@/pages/public/SerramentiStimaPubblica";

async function apri(risposta: Risposta) {
  invoke.mockResolvedValue({ data: risposta, error: null });
  render(
    <MemoryRouter initialEntries={["/stima/token-pubblico-della-stima"]}>
      <Routes>
        <Route path="/stima/:token" element={<SerramentiStimaPubblica />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText("Sei pronto a procedere?");
}

afterEach(cleanup);

describe("pagina /stima: il pulsante di firma", () => {
  it("con il token di firma porta alla firma con il codice, partendo dal codice", async () => {
    await apri(stima({ firma_token: "tokenDiFirma1234" }));
    const link = screen.getByRole("link", { name: /Firma con il codice/ });
    expect(link).toHaveAttribute("href", "/firma-fea/tokenDiFirma1234?avvia=1");
  });

  it("col codice già inserito niente pulsante: si dice di riaprire il link ricevuto per email", async () => {
    await apri(stima({ firma_in_corso: true }));
    expect(screen.queryByRole("link", { name: /Firma con il codice/ })).toBeNull();
    expect(screen.getByText(/Hai già inserito il codice di verifica/)).toBeInTheDocument();
    expect(screen.getByText(/Riapri il link che ti abbiamo mandato per email/)).toBeInTheDocument();
    expect(screen.queryByText(/ti serve il link di firma che ti manda l'azienda/)).toBeNull();
  });

  it("senza richiesta di firma: il link lo manda l'azienda, e si può contattare il consulente", async () => {
    await apri(stima());
    expect(screen.queryByRole("link", { name: /Firma con il codice/ })).toBeNull();
    expect(screen.getByText(/ti serve il link di firma che ti manda l'azienda/)).toBeInTheDocument();
  });
});
