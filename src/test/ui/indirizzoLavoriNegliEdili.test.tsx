/**
 * L'indirizzo dei lavori nel passo Cliente dei preventivi edili (06/10/2026), negli otto moduli: se il contatto
 * del CRM collegato ha un indirizzo, i lavori possono essere «allo stesso indirizzo del contatto»; altrimenti, o se
 * sono altrove, si scrivono i quattro campi. Il passo Cliente vero di ogni modulo, col database finto.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ComponentType } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Il primo test importa il passo (e il suo mondo): sotto carico supera i 5 secondi di partenza.
vi.setConfig({ testTimeout: 30_000 });

const { db } = vi.hoisted(() => ({ db: { contatti: [] as Array<Record<string, unknown>> } }));

vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string): unknown => {
    let id: string | null = null;
    let singolo = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = new Proxy({}, {
      get: (_t, nome) => {
        if (nome === "then") {
          return (ok: (v: unknown) => unknown) => {
            const dati = tabella === "marketing_contacts"
              ? (singolo ? (db.contatti.find((c) => c.id === id) ?? null) : db.contatti)
              : (singolo ? null : []);
            return Promise.resolve({ data: dati, error: null as null }).then(ok);
          };
        }
        if (nome === "eq") return (colonna: string, valore: string) => { if (colonna === "id") id = valore; return p; };
        if (nome === "maybeSingle" || nome === "single") return () => { singolo = true; return p; };
        return () => p;
      },
    });
    return p;
  };
  return { supabase: { from: (t: string) => catena(t) } };
});

type Campi = Record<string, string | null>;
type Scrittura = [chiave: string, valore: string | null];
type PassoCliente = ComponentType<{ form: Campi; onChange: (chiave: string, valore: string | null) => void }>;

const MODULI: Array<{ slug: string; passo: () => Promise<{ default: unknown }> }> = [
  { slug: "bagni", passo: () => import("@/pages/azienda/bagni/BagniWizard/StepCliente") },
  { slug: "tetti", passo: () => import("@/pages/azienda/tetti/TettiWizard/StepCliente") },
  { slug: "climatizzazione", passo: () => import("@/pages/azienda/climatizzazione/ClimatizzazioneWizard/StepCliente") },
  { slug: "elettrico", passo: () => import("@/pages/azienda/elettrico/ElettricoWizard/StepCliente") },
  { slug: "termoidraulico", passo: () => import("@/pages/azienda/termoidraulico/TermoidraulicoWizard/StepCliente") },
  { slug: "pavimenti", passo: () => import("@/pages/azienda/pavimenti/PavimentiWizard/StepCliente") },
  { slug: "piscine", passo: () => import("@/pages/azienda/piscine/PiscineWizard/StepCliente") },
  { slug: "ristrutturazione", passo: () => import("@/pages/azienda/ristrutturazione/RistrutturazioneWizard/StepCliente") },
];

const CAMPI = ["indirizzo", "citta", "cap", "provincia"] as const;
const GIULIA: Campi = { id: "k1", first_name: "Giulia", last_name: "Ferrari", email: null, phone: null, address: "Via Marco Polo 18", city: "Monza", province: "mb", postal_code: "20900" };
const LUCA: Campi = { id: "k2", first_name: "Luca", last_name: "Bianchi", email: null, phone: null, address: "Corso Roma 5", city: "Torino", province: "TO", postal_code: "10121" };
const SENZA_INDIRIZZO: Campi = { id: "k3", first_name: "Paola", last_name: "Neri", email: null, phone: null, address: null, city: null, province: null, postal_code: null };
const ALTROVE: Campi = { cantiere_indirizzo: "Via Roma 12", cantiere_citta: "Torino", cantiere_cap: "10121", cantiere_provincia: "TO" };

function Prova({ Passo, iniziale, scritture }: { Passo: PassoCliente; iniziale: Campi; scritture: Scrittura[] }) {
  const [form, setForm] = useState<Campi>(iniziale);
  const onChange = (chiave: string, valore: string | null) => {
    scritture.push([chiave, valore]);
    setForm((f) => ({ ...f, [chiave]: valore }));
  };
  return (
    <>
      <Passo form={form} onChange={onChange} />
      <output data-testid="cantiere">{JSON.stringify(CAMPI.map((c) => form[`cantiere_${c}`] ?? null))}</output>
    </>
  );
}

const spunta = () => screen.findByRole("checkbox", { name: /Lavori allo stesso indirizzo del contatto/ });
const senzaSpunta = () => screen.queryByRole("checkbox", { name: /Lavori allo stesso indirizzo/ });
const cantiere = () => JSON.parse(screen.getByTestId("cantiere").textContent ?? "[]") as Array<string | null>;
const campi = () => within(screen.getByRole("group", { name: "Indirizzo dei lavori" }));

beforeAll(() => {
  // cmdk (la tendina dei contatti) usa due cose che jsdom non ha.
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  globalThis.ResizeObserver = globalThis.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => { db.contatti = [GIULIA, LUCA, SENZA_INDIRIZZO]; });
afterEach(() => cleanup());

describe.each(MODULI)("$slug: indirizzo dei lavori nel passo Cliente", ({ passo }) => {
  const monta = async (iniziale: Campi) => {
    const Passo = (await passo()).default as PassoCliente;
    const scritture: Scrittura[] = [];
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Prova Passo={Passo} iniziale={iniziale} scritture={scritture} />
      </QueryClientProvider>,
    );
    return scritture;
  };

  it("senza un contatto collegato non c'è la spunta: ci sono i quattro campi, e la provincia va in maiuscolo", async () => {
    await monta({});
    expect(senzaSpunta()).toBeNull();
    expect(screen.getByText("Indirizzo dei lavori")).toBeTruthy();
    fireEvent.change(campi().getByLabelText("Via e numero"), { target: { value: "Via Tortona 33" } });
    fireEvent.change(campi().getByLabelText("Città"), { target: { value: "Milano" } });
    fireEvent.change(campi().getByLabelText("CAP"), { target: { value: "20121" } });
    fireEvent.change(campi().getByLabelText("Provincia"), { target: { value: "mi" } });
    expect(cantiere()).toEqual(["Via Tortona 33", "Milano", "20121", "MI"]);
  });

  it("un preventivo già fatto con il contatto che ha un indirizzo e i lavori vuoti: la spunta c'è, spenta; spuntando i lavori prendono l'indirizzo del contatto", async () => {
    const scritture = await monta({ id: "p1", cliente_id: "k1" });
    const casella = await spunta();
    expect(casella.getAttribute("aria-checked")).toBe("false");
    // Aprirlo non scrive niente.
    expect(scritture).toEqual([]);
    expect(cantiere()).toEqual([null, null, null, null]);

    fireEvent.click(casella);
    expect(casella.getAttribute("aria-checked")).toBe("true");
    // Provincia in maiuscolo anche se il CRM la ha minuscola.
    expect(cantiere()).toEqual(["Via Marco Polo 18", "Monza", "20900", "MB"]);
    expect(screen.getByText("Via Marco Polo 18, 20900 Monza (mb)")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Indirizzo dei lavori" })).toBeNull();
  });

  it("i lavori già uguali all'indirizzo del contatto si aprono con la spunta accesa", async () => {
    await monta({ id: "p1", cliente_id: "k1", cantiere_indirizzo: "Via Marco Polo 18", cantiere_citta: "Monza", cantiere_cap: "20900", cantiere_provincia: "MB" });
    expect((await spunta()).getAttribute("aria-checked")).toBe("true");
  });

  it("i lavori altrove si aprono con la spunta spenta e i campi scritti; togliere e rimettere la spunta non li perde", async () => {
    await monta({ id: "p1", cliente_id: "k1", ...ALTROVE });
    const casella = await spunta();
    expect(casella.getAttribute("aria-checked")).toBe("false");
    expect((campi().getByLabelText("Via e numero") as HTMLInputElement).value).toBe("Via Roma 12");
    fireEvent.click(casella);
    expect(cantiere()).toEqual(["Via Marco Polo 18", "Monza", "20900", "MB"]);
    fireEvent.click(casella);
    expect(cantiere()).toEqual(["Via Roma 12", "Torino", "10121", "TO"]);
  });

  it("un preventivo NUOVO nato da un contatto (?contact_id): i lavori partono dall'indirizzo del contatto, una volta sola", async () => {
    await monta({ cliente_id: "k1" });
    const casella = await spunta();
    await waitFor(() => expect(cantiere()).toEqual(["Via Marco Polo 18", "Monza", "20900", "MB"]));
    expect(casella.getAttribute("aria-checked")).toBe("true");
    // Se poi si sceglie «altrove» e si svuota, non si ricopia da soli.
    fireEvent.click(casella);
    expect(cantiere()).toEqual([null, null, null, null]);
    await new Promise((r) => setTimeout(r, 50));
    expect(cantiere()).toEqual([null, null, null, null]);
  });

  it("scegliendo un contatto dal CRM, i lavori vuoti seguono l'indirizzo del contatto; poi un altro contatto li cambia", async () => {
    await monta({});
    expect(senzaSpunta()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Seleziona da CRM/ }));
    fireEvent.click(await screen.findByText("Giulia Ferrari"));
    expect((await spunta()).getAttribute("aria-checked")).toBe("true");
    expect(cantiere()).toEqual(["Via Marco Polo 18", "Monza", "20900", "MB"]);

    fireEvent.click(screen.getByRole("button", { name: /Cambia/ }));
    fireEvent.click(await screen.findByText("Luca Bianchi"));
    await waitFor(() => expect(cantiere()).toEqual(["Corso Roma 5", "Torino", "10121", "TO"]));
    expect((await spunta()).getAttribute("aria-checked")).toBe("true");
  });

  it("scegliendo un contatto quando i lavori sono già scritti a mano, i lavori restano come sono", async () => {
    await monta({ ...ALTROVE });
    fireEvent.click(screen.getByRole("button", { name: /Seleziona da CRM/ }));
    fireEvent.click(await screen.findByText("Giulia Ferrari"));
    const casella = await spunta();
    expect(casella.getAttribute("aria-checked")).toBe("false");
    expect(cantiere()).toEqual(["Via Roma 12", "Torino", "10121", "TO"]);
  });

  it("un contatto senza indirizzo non offre la spunta e non cancella ciò che è scritto", async () => {
    await monta({ id: "p1", cliente_id: "k3", ...ALTROVE });
    await waitFor(() => expect(screen.getByRole("group", { name: "Indirizzo dei lavori" })).toBeTruthy());
    expect(senzaSpunta()).toBeNull();
    expect(cantiere()).toEqual(["Via Roma 12", "Torino", "10121", "TO"]);
  });
});
