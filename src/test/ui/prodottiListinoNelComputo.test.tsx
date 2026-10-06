/// <reference types="node" />
/**
 * Il prodotto del listino prodotti nel computo, negli otto preventivatori edili (06/10/2026):
 * chi sceglie un prodotto ritrova la sua foto e la sua descrizione, nel selettore, sulla riga
 * e (negli altri test) nell'anteprima e nel PDF. Senza foto o senza descrizione non compare
 * niente. Si provano gli editor veri, con il selettore vero: cambia solo l'elenco dei prodotti.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { useState, type ComponentType } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ProdottoListino } from "@/lib/moduli/prodottiListino";

// Il primo test importa l'editor (e il suo mondo): con la macchina carica supera i 5 secondi di partenza.
vi.setConfig({ testTimeout: 30_000 });

const { stato } = vi.hoisted(() => ({ stato: { prodotti: [] as unknown[] } }));

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewCosts: true, canViewMargins: true }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/hooks/useProdottiListino", () => ({ useProdottiListino: () => ({ data: stato.prodotti, isFetching: false }) }));
vi.mock("@/integrations/supabase/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catena: any = new Proxy({}, {
    get: (_t, nome) => (nome === "then"
      ? (ok: (v: unknown) => unknown) => Promise.resolve({ data: [] as unknown[], error: null as null }).then(ok)
      : () => catena),
  });
  return { supabase: { from: () => catena, rpc: () => catena } };
});
// Ristrutturazione confronta i prezzi col prezzario regionale: qui non serve.
vi.mock("@/hooks/usePrezzoDiZona", () => ({
  usePrezzoDiZona: () => ({ confronti: [] as unknown[], riepilogo: null as unknown, regione: null as string | null, fonteLabel: null as string | null, isLoading: false, indisponibile: "regione-mancante" }),
}));
vi.mock("@/hooks/useCodiciPrezzarioListino", () => ({ useCodiciPrezzarioListino: () => ({}) }));
vi.mock("@/components/prezzario/PrezzoDiZonaRiepilogo", () => ({ PrezzoDiZonaRiepilogo: (): null => null }));

type Editor = ComponentType<{ value: unknown[]; onChange: (voci: unknown[]) => void; progettoId: string; companyId: string }>;
const MODULI: Array<{ slug: string; verticale: string; editor: () => Promise<{ default: unknown }> }> = [
  { slug: "bagni", verticale: "bagno", editor: () => import("@/components/bagni/ComputoEditor/ComputoEditor") },
  { slug: "tetti", verticale: "tetti", editor: () => import("@/components/tetti/ComputoEditor/ComputoEditor") },
  { slug: "climatizzazione", verticale: "climatizzazione", editor: () => import("@/components/climatizzazione/ComputoEditor/ComputoEditor") },
  { slug: "elettrico", verticale: "elettrico", editor: () => import("@/components/elettrico/ComputoEditor/ComputoEditor") },
  { slug: "termoidraulico", verticale: "termoidraulico", editor: () => import("@/components/termoidraulico/ComputoEditor/ComputoEditor") },
  { slug: "pavimenti", verticale: "pavimenti", editor: () => import("@/components/pavimenti/ComputoEditor/ComputoEditor") },
  { slug: "piscine", verticale: "piscine", editor: () => import("@/components/piscine/ComputoEditor/ComputoEditor") },
  { slug: "ristrutturazione", verticale: "ristrutturazione", editor: () => import("@/components/ristrutturazione/ComputoEditor/ComputoEditor") },
];

const FOTO = "/templates/bagno/products/piatto-doccia.webp";
const prodotto = (extra: Partial<ProdottoListino>): ProdottoListino => ({
  id: "f-piatto", nome: "Piatto doccia in resina 120x80", codice: "PD-12080", descrizione: "Antiscivolo, finitura pietra.", immagine_url: FOTO,
  vertical: "bagno", modo: "pz", unita: "pz", prezzo_vendita: 235, prezzo_acquisto: 130, con_varianti: false, ...extra,
});

beforeAll(() => {
  // cmdk (il selettore) usa due cose che jsdom non ha.
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  globalThis.ResizeObserver = globalThis.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => { stato.prodotti = []; });
afterEach(() => cleanup());

interface Montato { cambi: unknown[][]; voci: () => Array<Record<string, unknown>> }

async function monta(slug: string): Promise<Montato> {
  const modulo = MODULI.find((m) => m.slug === slug)!;
  const Editor = (await modulo.editor()).default as Editor;
  const cambi: unknown[][] = [];
  function Prova() {
    const [voci, setVoci] = useState<unknown[]>([]);
    return (
      <Editor
        value={voci}
        onChange={(n) => { cambi.push(n); setVoci(n); }}
        progettoId="p1"
        companyId="c1"
      />
    );
  }
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider><Prova /></TooltipProvider>
    </QueryClientProvider>,
  );
  return { cambi, voci: () => (cambi.at(-1) ?? []) as Array<Record<string, unknown>> };
}

const apriSelettore = async () => {
  fireEvent.click(screen.getByRole("button", { name: /Cerca voce/ }));
  return screen.findByRole("dialog");
};
const riga = (dialogo: HTMLElement, nome: string) => within(dialogo).getByText(nome).closest("[cmdk-item]") as HTMLElement;
const fotoNellaPagina = () => Array.from(document.querySelectorAll("img")).map((i) => i.getAttribute("src"));

describe.each(MODULI)("computo di $slug: i prodotti del listino prodotti", ({ slug, verticale }) => {
  it("nel selettore compaiono con la foto (se c'è) al posto dell'icona, e col prezzo del listino", async () => {
    stato.prodotti = [
      prodotto({ vertical: verticale }),
      prodotto({ id: "f-senza", nome: "Rubinetto monocomando", codice: null, descrizione: null, immagine_url: null, vertical: verticale, prezzo_vendita: 89, prezzo_acquisto: 51 }),
    ];
    await monta(slug);
    const dialogo = await apriSelettore();
    expect(within(dialogo).getByText("Prodotti (2)")).toBeInTheDocument();

    const conFoto = riga(dialogo, "Piatto doccia in resina 120x80");
    expect(conFoto.querySelector(`img[src="${FOTO}"]`)).not.toBeNull();
    expect(within(conFoto).getByText("PD-12080")).toBeInTheDocument();
    expect(within(conFoto).getByText(/235/)).toBeInTheDocument();

    // Senza foto non c'è nessuna immagine, né segnaposto: resta l'icona del tipo di voce.
    const senzaFoto = riga(dialogo, "Rubinetto monocomando");
    expect(senzaFoto.querySelector("img")).toBeNull();
    expect(senzaFoto.querySelector("svg")).not.toBeNull();
  });

  it("un prodotto di un'altra area dice di quale area è", async () => {
    stato.prodotti = [prodotto({ id: "f-altra", nome: "Pergola bioclimatica", vertical: "pergole", codice: "PG-1", immagine_url: null, descrizione: null })];
    await monta(slug);
    const dialogo = await apriSelettore();
    expect(within(riga(dialogo, "Pergola bioclimatica")).getByText("Pergole · PG-1")).toBeInTheDocument();
  });

  it("scelto, entra nel computo con prezzo, costo, foto e descrizione del listino; il selettore si chiude", async () => {
    stato.prodotti = [prodotto({ vertical: verticale })];
    const m = await monta(slug);
    const dialogo = await apriSelettore();
    fireEvent.click(riga(dialogo, "Piatto doccia in resina 120x80"));

    await waitFor(() => expect(m.voci()).toHaveLength(1));
    expect(m.voci()[0]).toMatchObject({
      descrizione: "Piatto doccia in resina 120x80", unita_misura: "cad", quantita: 1,
      prezzo_unitario: 235, costo_materiali: 130, costo_manodopera: 0,
      famiglia_id: "f-piatto", immagine_url: FOTO, descrizione_estesa: "Antiscivolo, finitura pietra.",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("scelto, la sua foto si vede sulla riga; senza foto la riga è quella di sempre", async () => {
    stato.prodotti = [
      prodotto({ vertical: verticale }),
      prodotto({ id: "f-senza", nome: "Rubinetto monocomando", descrizione: null, immagine_url: null, vertical: verticale }),
    ];
    const m = await monta(slug);
    let dialogo = await apriSelettore();
    fireEvent.click(riga(dialogo, "Piatto doccia in resina 120x80"));
    await waitFor(() => expect(m.voci()).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fotoNellaPagina()).toEqual([FOTO]);

    dialogo = await apriSelettore();
    fireEvent.click(riga(dialogo, "Rubinetto monocomando"));
    await waitFor(() => expect(m.voci()).toHaveLength(2));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(m.voci()[1]).toMatchObject({ famiglia_id: "f-senza", immagine_url: null, descrizione_estesa: null });
    expect(fotoNellaPagina()).toEqual([FOTO]); // la seconda riga non ha aggiunto niente
  });

  it("al metro quadro la riga è in «mq»", async () => {
    stato.prodotti = [prodotto({ vertical: verticale, nome: "Gres porcellanato 60x60", modo: "mq", unita: "mq", prezzo_vendita: 48, prezzo_acquisto: 26 })];
    const m = await monta(slug);
    const dialogo = await apriSelettore();
    fireEvent.click(riga(dialogo, "Gres porcellanato 60x60"));
    await waitFor(() => expect(m.voci()).toHaveLength(1));
    expect(m.voci()[0]).toMatchObject({ unita_misura: "mq", prezzo_unitario: 48, costo_materiali: 26 });
  });

  it("duplicando la riga, la copia porta la stessa foto e la stessa descrizione", async () => {
    stato.prodotti = [prodotto({ vertical: verticale })];
    const m = await monta(slug);
    const dialogo = await apriSelettore();
    fireEvent.click(riga(dialogo, "Piatto doccia in resina 120x80"));
    await waitFor(() => expect(m.voci()).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const duplica = document.querySelector("button svg.lucide-copy")?.closest("button") as HTMLButtonElement;
    expect(duplica).toBeTruthy();
    fireEvent.click(duplica);
    await waitFor(() => expect(m.voci()).toHaveLength(2));
    expect(m.voci()[1]).toMatchObject({ famiglia_id: "f-piatto", immagine_url: FOTO, descrizione_estesa: "Antiscivolo, finitura pietra." });
    expect(fotoNellaPagina()).toEqual([FOTO, FOTO]);
  });

  it("una foto che non si carica non lascia un riquadro rotto", async () => {
    stato.prodotti = [prodotto({ vertical: verticale })];
    const m = await monta(slug);
    const dialogo = await apriSelettore();
    fireEvent.click(riga(dialogo, "Piatto doccia in resina 120x80"));
    await waitFor(() => expect(m.voci()).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const img = document.querySelector("img") as HTMLImageElement;
    fireEvent.error(img);
    await waitFor(() => expect(document.querySelector("img")).toBeNull());
  });
});

describe("ogni modulo a computo, anche uno futuro, usa il listino prodotti", () => {
  const COMPONENTI = resolve(__dirname, "../../components");
  const cartelle = readdirSync(COMPONENTI, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((nome) => {
      try { return readdirSync(join(COMPONENTI, nome, "ComputoEditor")).includes("AddVocePicker.tsx"); } catch { return false; }
    });
  const leggi = (cartella: string, file: string) => readFileSync(join(COMPONENTI, cartella, "ComputoEditor", file), "utf8");

  it("trova gli otto moduli (il controllo non guarda il vuoto)", () => {
    expect([...cartelle].sort()).toEqual(MODULI.map((m) => m.slug).sort());
  });

  it.each(cartelle)("%s: il selettore ha il listino prodotti e porta foto e descrizione nella riga", (cartella) => {
    const picker = leggi(cartella, "AddVocePicker.tsx");
    const verticale = MODULI.find((m) => m.slug === cartella)!.verticale;
    expect(picker).toContain("useProdottiListino(debounced, VERTICALE_LISTINO, azOn)");
    expect(picker).toContain(`const VERTICALE_LISTINO: VerticaleModulo = "${verticale}";`);
    expect(picker).toContain("famiglia_id: p.id,");
    expect(picker).toContain("immagine_url: p.immagine_url,");
    expect(picker).toContain("descrizione_estesa: p.descrizione,");
    const tipi = leggi(cartella, "types.ts");
    expect(tipi).toContain("descrizione_estesa: picked.descrizione_estesa ?? null,");
    expect(leggi(cartella, "CapitoloSection.tsx")).toContain("immagine_url: voci[idx].immagine_url,");
    expect(leggi(cartella, "VoceRow.tsx")).toContain("<MiniaturaProdotto src={voce.immagine_url}");
  });
});
