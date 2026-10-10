/**
 * Impostazioni → Firma e condizioni → Firma elettronica: il testo del diritto di ripensamento (10/10/2026).
 *
 * Il campo si chiamava «Testo consenso B2C» e si riempiva da solo con una frase sull'OTP che non parla di recesso; a
 * ogni salvataggio, anche toccando solo l'interruttore, la pagina la scriveva nel database. Il cliente privato legge quel
 * campo nella pagina di firma, sotto il titolo «Diritto di recesso», al posto dell'informativa dei 14 giorni.
 * Oggi: il campo parte vuoto, un campo vuoto resta `null` (vale il testo di legge), si scrive solo ciò che è cambiato.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import SettingsFirmaElettronica from "@/pages/azienda/settings/SettingsFirmaElettronica";
import { FRASE_SALVATA_PER_SBAGLIO, TESTO_RECESSO_DI_LEGGE } from "@/lib/fea/testoRecessoDiLegge";

type Riga = Record<string, unknown> | null;
const state = vi.hoisted(() => ({
  puoModificare: true,
  rows: { fea_configurazione: null, preventivo_impostazioni: null } as Record<string, Riga>,
  errors: {} as Record<string, unknown>,
  writes: [] as { table: string; value: Record<string, unknown> }[],
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditSettingsIntegrations: state.puoModificare }) }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: state.rows[table] ?? null, error: null as unknown }),
        upsert: (value: Record<string, unknown>) => ({
          then: (resolver: (r: { data: unknown; error: unknown }) => unknown) => {
            const errore = state.errors[table] ?? null;
            state.writes.push({ table, value });
            if (!errore) state.rows[table] = { ...(state.rows[table] ?? {}), ...value };
            return Promise.resolve({ data: null as unknown, error: errore }).then(resolver);
          },
        }),
      };
      return builder;
    },
  },
}));

function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/azienda/impostazioni/firma-elettronica"]}>
        <SettingsFirmaElettronica />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const campo = () => screen.getByRole("textbox", { name: "Informativa sul diritto di ripensamento" });
const interruttore = () => screen.getByRole("switch", { name: "Firma elettronica sui preventivi" });
async function caricata() {
  await waitFor(() => expect(interruttore()).toBeEnabled());
}
const pulsanteSalva = () => screen.getByRole("button", { name: /Salva impostazioni|Impostazioni salvate/ });

beforeEach(() => {
  state.puoModificare = true;
  state.rows = { fea_configurazione: null, preventivo_impostazioni: null };
  state.errors = {};
  state.writes.length = 0;
  state.success.mockClear();
  state.error.mockClear();
});
afterEach(() => cleanup());

describe("Firma elettronica: informativa sul diritto di ripensamento", () => {
  it("il campo parte vuoto e il testo di legge sta a disposizione: nessuna frase sull'OTP", async () => {
    open(); await caricata();
    expect(campo()).toHaveValue("");
    expect(screen.getByText(TESTO_RECESSO_DI_LEGGE)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("autorizzare l'uso della firma elettronica avanzata");
    expect(pulsanteSalva()).toBeDisabled();
  });

  it("dice chi la legge e dove: il cliente privato, nella pagina di firma, sotto «Diritto di recesso»", async () => {
    open(); await caricata();
    const spiegazione = document.getElementById(campo().getAttribute("aria-describedby")!.split(" ")[0])!.textContent ?? "";
    expect(spiegazione).toContain("cliente privato");
    expect(spiegazione).toContain("«Diritto di recesso»");
    expect(spiegazione).toContain("14 giorni");
    expect(screen.getByRole("link", { name: "Firma e condizioni" })).toHaveAttribute("href", "/azienda/impostazioni/condizioni-firma");
  });

  it("toccare solo l'interruttore salva solo l'interruttore: il testo del recesso non si scrive", async () => {
    state.rows.preventivo_impostazioni = { firma_digitale_abilitata: true };
    open(); await caricata();
    fireEvent.click(interruttore());
    fireEvent.click(pulsanteSalva());
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.writes).toEqual([{ table: "preventivo_impostazioni", value: { company_id: "company-1", firma_digitale_abilitata: false } }]);
  });

  it("alla prima volta di un'azienda senza riga delle impostazioni la colonna di ripiego dei margini si scrive vuota", async () => {
    open(); await caricata();
    fireEvent.click(interruttore());
    fireEvent.click(pulsanteSalva());
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].value).toMatchObject({ company_id: "company-1", firma_digitale_abilitata: false, soglia_margine_visibile: null });
  });

  it("scrivere il testo salva solo il testo, senza spazi in testa e in coda", async () => {
    open(); await caricata();
    fireEvent.change(campo(), { target: { value: "  Hai 14 giorni per ripensarci.  " } });
    expect(screen.getByText("Modifiche non salvate")).toBeInTheDocument();
    fireEvent.click(pulsanteSalva());
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]).toMatchObject({ table: "fea_configurazione", value: { company_id: "company-1", testo_recesso_b2c: "Hai 14 giorni per ripensarci." } });
    await waitFor(() => expect(pulsanteSalva()).toBeDisabled());
  });

  it("svuotare un testo salvato scrive vuoto (null), mai una frase al suo posto", async () => {
    state.rows.fea_configurazione = { testo_recesso_b2c: "Il mio testo di recesso" };
    open(); await caricata();
    await waitFor(() => expect(campo()).toHaveValue("Il mio testo di recesso"));
    fireEvent.change(campo(), { target: { value: "   " } });
    fireEvent.click(pulsanteSalva());
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].value.testo_recesso_b2c).toBeNull();
    await waitFor(() => expect(campo()).toHaveValue(""));
  });

  it("cambiando insieme interruttore e testo, in nessun caso si scrive la vecchia frase sull'OTP", async () => {
    open(); await caricata();
    fireEvent.click(interruttore());
    fireEvent.change(campo(), { target: { value: "Testo mio" } });
    fireEvent.click(pulsanteSalva());
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.writes.map((w) => w.table).sort()).toEqual(["fea_configurazione", "preventivo_impostazioni"]);
    expect(JSON.stringify(state.writes)).not.toContain("autorizzare l'uso");
    expect(JSON.stringify(state.writes)).not.toContain(FRASE_SALVATA_PER_SBAGLIO);
  });

  it("la frase salvata per sbaglio dalla vecchia pagina si riconosce, si avvisa e si può togliere", async () => {
    state.rows.fea_configurazione = { testo_recesso_b2c: FRASE_SALVATA_PER_SBAGLIO };
    open(); await caricata();
    expect(await screen.findByText("Questo testo non è un diritto di ripensamento")).toBeInTheDocument();
    fireEvent.change(campo(), { target: { value: "" } });
    fireEvent.click(pulsanteSalva());
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.writes[0].value.testo_recesso_b2c).toBeNull();
    await waitFor(() => expect(screen.queryByText("Questo testo non è un diritto di ripensamento")).toBeNull());
  });

  it("un testo che parla davvero di recesso non fa comparire l'avviso", async () => {
    state.rows.fea_configurazione = { testo_recesso_b2c: "Puoi recedere entro 14 giorni." };
    open(); await caricata();
    await waitFor(() => expect(campo()).toHaveValue("Puoi recedere entro 14 giorni."));
    expect(screen.queryByText("Questo testo non è un diritto di ripensamento")).toBeNull();
  });

  it("l'errore di salvataggio si legge in italiano e le modifiche restano da salvare", async () => {
    state.errors.fea_configurazione = { message: "Failed to fetch" };
    open(); await caricata();
    fireEvent.change(campo(), { target: { value: "Testo mio" } });
    fireEvent.click(pulsanteSalva());
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(state.error).toHaveBeenCalledWith("Non sono riuscito a salvare", { description: "Connessione persa. Controlla la rete e riprova." });
    expect(state.success).not.toHaveBeenCalled();
    expect(campo()).toHaveValue("Testo mio");
    await waitFor(() => expect(pulsanteSalva()).toBeEnabled());
  });

  it("se una scrittura riesce e l'altra no, resta da salvare solo quella fallita", async () => {
    state.errors.fea_configurazione = { message: "Failed to fetch" };
    open(); await caricata();
    fireEvent.click(interruttore());
    fireEvent.change(campo(), { target: { value: "Testo mio" } });
    fireEvent.click(pulsanteSalva());
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(state.error.mock.calls[0][0]).toBe("Una parte è stata salvata, il resto no");
    expect(state.rows.preventivo_impostazioni).toMatchObject({ firma_digitale_abilitata: false });
    await waitFor(() => expect(interruttore()).toBeEnabled());
    expect(campo()).toHaveValue("Testo mio");
    // un secondo salvataggio riprova soltanto il testo
    state.errors = {};
    state.writes.length = 0;
    fireEvent.click(pulsanteSalva());
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.writes.map((w) => w.table)).toEqual(["fea_configurazione"]);
  });

  it("sola lettura: campo e interruttore spenti, nessun pulsante di salvataggio, e la frase che dice perché", async () => {
    state.puoModificare = false;
    state.rows.fea_configurazione = { testo_recesso_b2c: "Testo già salvato" };
    open();
    // si aspetta che i dati siano arrivati: durante il caricamento i comandi sono spenti per qualunque utente
    await waitFor(() => expect(campo()).toHaveValue("Testo già salvato"));
    expect(campo()).toBeDisabled();
    expect(interruttore()).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Salva impostazioni|Impostazioni salvate/ })).toBeNull();
    expect(screen.getByText(/le cambia chi ha il permesso «Integrazioni» in modifica/)).toBeInTheDocument();
  });
});

describe("Firma elettronica: il testo mostrato è quello che legge il cliente", () => {
  const leggi = (relativo: string) => readFileSync(resolve(process.cwd(), relativo), "utf8");

  it("il testo di legge è identico a quello della pagina di firma del cliente", () => {
    const pagina = leggi("src/pages/public/FirmaDocumento.tsx");
    const trovato = pagina.match(/const RECESSO_FALLBACK =\s*'((?:[^'\\]|\\.)*)'/);
    expect(trovato, "RECESSO_FALLBACK non trovato in FirmaDocumento.tsx").not.toBeNull();
    expect(trovato![1].replace(/\\'/g, "'")).toBe(TESTO_RECESSO_DI_LEGGE);
  });

  it("la pagina di firma usa il testo di legge solo quando il campo è null: per questo un campo vuoto si scrive null", () => {
    expect(leggi("src/pages/public/FirmaDocumento.tsx")).toContain("{sessione.b2c_testo_recesso ?? RECESSO_FALLBACK}");
    expect(leggi("supabase/functions/fea-documento-pubblico/index.ts")).toContain("b2c_testo_recesso = feaConfig.testo_recesso_b2c ?? null;");
  });

  it("nessuno, nella pagina, riempie il campo da solo", () => {
    const pagina = leggi("src/pages/azienda/settings/SettingsFirmaElettronica.tsx");
    expect(pagina).not.toContain("DEFAULT_RECESSO_B2C");
    expect(pagina).not.toContain("autorizzare l'uso della firma elettronica avanzata");
    expect(pagina).not.toContain("Testo consenso B2C");
  });
});
