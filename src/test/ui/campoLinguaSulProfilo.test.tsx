/**
 * La lingua scelta va sul profilo (vale su ogni dispositivo) e gira la pagina per l'arabo.
 * Piano 2026-11-23-lingua-piattaforma, punti 2 e 4.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({
  profilo: null as null | { id: string; lingua: string | null; updated_at: string },
  aggiornamenti: [] as Array<{ valori: Record<string, unknown>; id: unknown }>,
  falliscono: false,
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ profile: stato.profilo }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (valori: Record<string, unknown>) => ({
        eq: async (_c: string, id: unknown) => {
          if (stato.falliscono) throw new TypeError("Failed to fetch");
          stato.aggiornamenti.push({ valori, id });
          return { error: null as null };
        },
      }),
    }),
  },
}));

import { format } from "date-fns";
import { dateFnsCampo, intlCampo, LinguaCampoProvider, useFormatiCampo, useLinguaCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

/** Come scrivono le schermate: funzioni di modulo dentro il disegno, solo useT() come aggancio. */
function MeseComeLeSchermate() {
  useT();
  return <p data-testid="mese">{format(new Date(2026, 10, 23), "MMMM", { locale: dateFnsCampo() })} · {(1234.5).toLocaleString(intlCampo())}</p>;
}

function Prova() {
  const { lingua, t, scegli } = useLinguaCampo();
  const formati = useFormatiCampo();
  return (
    <div>
      <p data-testid="lingua">{lingua.codice}</p>
      <p data-testid="testo">{t("Rapportino del {data}", { data: formati.data(new Date("2026-11-23T10:00:00Z")) })}</p>
      <button onClick={() => scegli("ar-MA")}>arabo</button>
      <button onClick={() => scegli("ro")}>rumeno</button>
      <MeseComeLeSchermate />
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  stato.profilo = { id: "op-1", lingua: null, updated_at: "2026-11-01T00:00:00Z" };
  stato.aggiornamenti = [];
  stato.falliscono = false;
  document.documentElement.lang = "it";
  document.documentElement.dir = "";
});
afterEach(() => { localStorage.clear(); });

describe("lingua dell'area operai sul profilo", () => {
  it("senza scelta resta tutto in italiano e non scrive niente", async () => {
    render(<LinguaCampoProvider><Prova /></LinguaCampoProvider>);
    expect(screen.getByTestId("lingua").textContent).toBe("it");
    expect(screen.getByTestId("testo").textContent).toBe("Rapportino del 23/11/2026");
    expect(document.documentElement.dir).toBe("ltr");
    await new Promise(r => setTimeout(r, 20));
    expect(stato.aggiornamenti).toEqual([]);
  });

  it("la lingua del profilo si applica appena entra", async () => {
    stato.profilo = { id: "op-1", lingua: "ro", updated_at: "2026-11-23T00:00:00Z" };
    render(<LinguaCampoProvider><Prova /></LinguaCampoProvider>);
    await waitFor(() => expect(screen.getByTestId("lingua").textContent).toBe("ro"));
    expect(document.documentElement.lang).toBe("ro");
    expect(stato.aggiornamenti).toEqual([]);
  });

  it("scegliere l'arabo: pagina da destra a sinistra, scelta salvata sul profilo e sul telefono", async () => {
    const { unmount } = render(<LinguaCampoProvider><Prova /></LinguaCampoProvider>);
    act(() => { screen.getByText("arabo").click(); });
    expect(screen.getByTestId("lingua").textContent).toBe("ar-MA");
    expect(document.documentElement.dir).toBe("rtl");
    await waitFor(() => expect(stato.aggiornamenti).toEqual([{ valori: { lingua: "ar-MA" }, id: "op-1" }]));
    await waitFor(() => expect(JSON.parse(localStorage.getItem("campo-lingua-scelta")!)).toMatchObject({ codice: "ar-MA", salvata: true }));
    // Una sola scrittura: la copia del profilo in memoria resta vecchia, ma non si risalva in giro.
    await new Promise(r => setTimeout(r, 50));
    expect(stato.aggiornamenti).toHaveLength(1);
    // Uscendo dall'area operai la pagina torna come prima.
    unmount();
    expect(document.documentElement.dir).toBe("");
    expect(document.documentElement.lang).toBe("it");
  });

  it("senza rete: la lingua cambia subito e si salva sul profilo quando torna la rete", async () => {
    stato.falliscono = true;
    render(<LinguaCampoProvider><Prova /></LinguaCampoProvider>);
    act(() => { screen.getByText("rumeno").click(); });
    expect(screen.getByTestId("lingua").textContent).toBe("ro");
    await new Promise(r => setTimeout(r, 20));
    expect(stato.aggiornamenti).toEqual([]);
    expect(JSON.parse(localStorage.getItem("campo-lingua-scelta")!)).toMatchObject({ codice: "ro", salvata: false });
    stato.falliscono = false;
    act(() => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(stato.aggiornamenti).toEqual([{ valori: { lingua: "ro" }, id: "op-1" }]));
  });

  it("le schermate che formattano fuori dagli hook seguono la lingua, e fuori dal campo torna l'italiano", async () => {
    const { unmount } = render(<LinguaCampoProvider><Prova /></LinguaCampoProvider>);
    expect(screen.getByTestId("mese").textContent).toBe("novembre · 1234,5");
    act(() => { screen.getByText("rumeno").click(); });
    await waitFor(() => expect(screen.getByTestId("mese").textContent).toBe("noiembrie · 1.234,5"));
    act(() => { screen.getByText("arabo").click(); });
    expect(intlCampo()).toBe("ar-MA-u-nu-latn");
    await waitFor(() => expect(screen.getByTestId("mese").textContent).toMatch(/^نونبر · 1.?234.5$/));
    unmount();
    expect(intlCampo()).toBe("it-IT");
    expect(dateFnsCampo().code).toBe("it");
  });
});
