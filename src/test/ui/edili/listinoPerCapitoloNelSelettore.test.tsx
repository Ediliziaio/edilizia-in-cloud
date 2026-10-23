/**
 * Il listino delle lavorazioni si sfoglia per capitolo, negli otto preventivatori edili
 * (23/10/2026, Dimora Torino: «nel prezziario non è possibile averlo già diviso in
 * categorie?»). Sotto la ricerca ci sono i capitoli del listino: senza sceglierne uno le
 * voci escono divise per capitolo; scelto un capitolo, escono tutte e solo le sue.
 * Si provano gli editor veri; il database finto risponde per tabella e per filtro.
 */
import { useState, type ComponentType } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.setConfig({ testTimeout: 30_000 });

const { db } = vi.hoisted(() => ({
  db: {
    capitoli: [
      { id: "cap-dem", nome: "Demolizioni", ordine: 1 },
      { id: "cap-pav", nome: "Pavimenti e rivestimenti", ordine: 2 },
    ],
    voci: [
      { id: "v1", descrizione: "Demolizione tramezzi", codice: null as string | null, unita_misura: "mq", prezzo_unitario: 18, costo_materiali: 0, costo_manodopera: 12, fonte: null as string | null, capitolo_id: "cap-dem", capitolo: { nome: "Demolizioni" } },
      { id: "v2", descrizione: "Rimozione pavimento", codice: null as string | null, unita_misura: "mq", prezzo_unitario: 14, costo_materiali: 0, costo_manodopera: 9, fonte: null as string | null, capitolo_id: "cap-dem", capitolo: { nome: "Demolizioni" } },
      { id: "v3", descrizione: "Posa gres porcellanato", codice: null as string | null, unita_misura: "mq", prezzo_unitario: 35, costo_materiali: 4, costo_manodopera: 20, fonte: null as string | null, capitolo_id: "cap-pav", capitolo: { nome: "Pavimenti e rivestimenti" } },
    ],
    /** Le richieste alle voci, coi filtri: per vedere che il capitolo arriva al database. */
    richiesteVoci: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewCosts: true, canViewMargins: true }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/hooks/useProdottiListino", () => ({ useProdottiListino: () => ({ data: [] as unknown[], isFetching: false }) }));
vi.mock("@/integrations/supabase/client", () => {
  const query = (tabella: string) => {
    const filtri: Record<string, unknown> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const catena: any = new Proxy({}, {
      get: (_t, nome) => {
        if (nome === "then") {
          let data: unknown[] = [];
          if (tabella.endsWith("_listino_capitoli")) data = db.capitoli;
          if (tabella.endsWith("_listino_voci")) {
            db.richiesteVoci.push({ ...filtri });
            data = filtri.capitolo_id ? db.voci.filter((v) => v.capitolo_id === filtri.capitolo_id) : db.voci;
          }
          return (ok: (v: unknown) => unknown) => Promise.resolve({ data, error: null as null }).then(ok);
        }
        if (nome === "eq") return (col: string, val: unknown) => { filtri[col] = val; return catena; };
        return () => catena;
      },
    });
    return catena;
  };
  return { supabase: { from: query, rpc: () => query("rpc") } };
});
vi.mock("@/hooks/usePrezzoDiZona", () => ({
  usePrezzoDiZona: () => ({ confronti: [] as unknown[], riepilogo: null as unknown, regione: null as string | null, fonteLabel: null as string | null, isLoading: false, indisponibile: "regione-mancante" }),
}));
vi.mock("@/hooks/useCodiciPrezzarioListino", () => ({ useCodiciPrezzarioListino: () => ({}) }));
vi.mock("@/components/prezzario/PrezzoDiZonaRiepilogo", () => ({ PrezzoDiZonaRiepilogo: (): null => null }));

type Editor = ComponentType<{ value: unknown[]; onChange: (voci: unknown[]) => void; progettoId: string; companyId: string }>;
const MODULI: Array<{ slug: string; editor: () => Promise<{ default: unknown }> }> = [
  { slug: "bagni", editor: () => import("@/components/bagni/ComputoEditor/ComputoEditor") },
  { slug: "tetti", editor: () => import("@/components/tetti/ComputoEditor/ComputoEditor") },
  { slug: "climatizzazione", editor: () => import("@/components/climatizzazione/ComputoEditor/ComputoEditor") },
  { slug: "elettrico", editor: () => import("@/components/elettrico/ComputoEditor/ComputoEditor") },
  { slug: "termoidraulico", editor: () => import("@/components/termoidraulico/ComputoEditor/ComputoEditor") },
  { slug: "pavimenti", editor: () => import("@/components/pavimenti/ComputoEditor/ComputoEditor") },
  { slug: "piscine", editor: () => import("@/components/piscine/ComputoEditor/ComputoEditor") },
  { slug: "ristrutturazione", editor: () => import("@/components/ristrutturazione/ComputoEditor/ComputoEditor") },
];

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  globalThis.ResizeObserver = globalThis.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => { cleanup(); db.richiesteVoci = []; });

async function monta(slug: string) {
  const Editor = (await MODULI.find((m) => m.slug === slug)!.editor()).default as Editor;
  const cambi: unknown[][] = [];
  function Prova() {
    const [voci, setVoci] = useState<unknown[]>([]);
    return <Editor value={voci} onChange={(n) => { cambi.push(n); setVoci(n); }} progettoId="p1" companyId="c1" />;
  }
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider><Prova /></TooltipProvider>
    </QueryClientProvider>,
  );
  return { voci: () => (cambi.at(-1) ?? []) as Array<Record<string, unknown>> };
}

const apriSelettore = async () => {
  fireEvent.click(screen.getByRole("button", { name: /Cerca voce/ }));
  return screen.findByRole("dialog");
};

describe.each(MODULI)("computo di $slug: il listino per capitolo", ({ slug }) => {
  it("senza scegliere, le voci escono divise per capitolo", async () => {
    await monta(slug);
    const dialogo = await apriSelettore();
    expect(await within(dialogo).findByText("Demolizioni (2)")).toBeInTheDocument();
    expect(within(dialogo).getByText("Pavimenti e rivestimenti (1)")).toBeInTheDocument();
    const capitoli = within(dialogo).getByRole("group", { name: "Capitoli del listino" });
    expect(within(capitoli).getAllByRole("button").map((b) => b.textContent)).toEqual(["Tutto", "Demolizioni", "Pavimenti e rivestimenti"]);
    expect(within(capitoli).getByRole("button", { name: "Tutto" })).toHaveAttribute("aria-pressed", "true");
  });

  it("scelto un capitolo, si chiedono al database solo le sue voci, e si vedono solo quelle", async () => {
    const m = await monta(slug);
    const dialogo = await apriSelettore();
    const capitoli = await within(dialogo).findByRole("group", { name: "Capitoli del listino" });
    fireEvent.click(within(capitoli).getByRole("button", { name: "Pavimenti e rivestimenti" }));

    expect(await within(dialogo).findByText("Pavimenti e rivestimenti (1)")).toBeInTheDocument();
    await waitFor(() => expect(within(dialogo).queryByText("Demolizione tramezzi")).toBeNull());
    expect(db.richiesteVoci.some((f) => f.capitolo_id === "cap-pav")).toBe(true);

    // La voce scelta entra nel computo nel suo capitolo, coi suoi prezzi.
    fireEvent.click(within(dialogo).getByText("Posa gres porcellanato").closest("[cmdk-item]") as HTMLElement);
    await waitFor(() => expect(m.voci()).toHaveLength(1));
    expect(m.voci()[0]).toMatchObject({ descrizione: "Posa gres porcellanato", capitolo_nome: "Pavimenti e rivestimenti", prezzo_unitario: 35, costo_manodopera: 20 });
  });

  it("«Tutto» torna a tutte le voci", async () => {
    await monta(slug);
    const dialogo = await apriSelettore();
    const capitoli = await within(dialogo).findByRole("group", { name: "Capitoli del listino" });
    fireEvent.click(within(capitoli).getByRole("button", { name: "Demolizioni" }));
    await waitFor(() => expect(within(dialogo).queryByText("Posa gres porcellanato")).toBeNull());
    fireEvent.click(within(capitoli).getByRole("button", { name: "Tutto" }));
    expect(await within(dialogo).findByText("Posa gres porcellanato")).toBeInTheDocument();
  });
});
