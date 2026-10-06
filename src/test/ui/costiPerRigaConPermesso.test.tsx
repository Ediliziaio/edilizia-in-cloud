/// <reference types="node" />
/**
 * Costi e margine di ogni riga del computo, negli otto moduli edili (06/10/2026): li
 * vede, e li scrive, solo chi ha il permesso (`canViewMargins || canViewCosts`, la
 * regola della vista «Impresa» dell'anteprima e di Economia). Prima la riga mostrava
 * «Costo unitario … · margine X%» a chiunque aprisse il preventivo, e il bottone
 * «Margini» in cima al computo era libero.
 *
 * Si prova l'editor vero di ogni modulo (capitoli e righe comprese): cambia solo il
 * permesso. Lo standard per chi ha il permesso resta quello di prima.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/formatters";

const { stato } = vi.hoisted(() => ({ stato: { costi: false, margini: false } }));

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canViewCosts: stato.costi, canViewMargins: stato.margini }),
}));
// Il selettore di voci dal listino interroga il database: qui non serve.
vi.mock("@/components/bagni/ComputoEditor/AddVocePicker", () => ({ default: (): null => null }));
vi.mock("@/components/tetti/ComputoEditor/AddVocePicker", () => ({ default: (): null => null }));
vi.mock("@/components/climatizzazione/ComputoEditor/AddVocePicker", () => ({ default: (): null => null }));
vi.mock("@/components/elettrico/ComputoEditor/AddVocePicker", () => ({ default: (): null => null }));
vi.mock("@/components/termoidraulico/ComputoEditor/AddVocePicker", () => ({ default: (): null => null }));
vi.mock("@/components/pavimenti/ComputoEditor/AddVocePicker", () => ({ default: (): null => null }));
vi.mock("@/components/piscine/ComputoEditor/AddVocePicker", () => ({ default: (): null => null }));
vi.mock("@/components/ristrutturazione/ComputoEditor/AddVocePicker", () => ({ default: (): null => null }));
// Ristrutturazione confronta i prezzi col prezzario regionale: dati e riepilogo non c'entrano con i costi.
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

// 2 pezzi a 500 € = 1.000 €; costo 200 + 100 al pezzo = 600 €: margine 400 €, 40%.
const VOCE = {
  id: "v1", progetto_id: "p1", company_id: "c1", capitolo_nome: "Lavorazioni", descrizione: "Posa e fornitura del materiale",
  unita_misura: "cad", quantita: 2, prezzo_unitario: 500, costo_materiali: 200, costo_manodopera: 100, sconto_pct: 0,
  importo: 1000, margine_eur: 400, margine_pct: 40, listino_voce_id: null as string | null, fonte: null as string | null,
  ordine: 0, ambiente: "Cucina",
};
const VOCE_SENZA_COSTO = { ...VOCE, id: "v2", descrizione: "Voce scritta a mano", costo_materiali: 0, costo_manodopera: 0, importo: 1000 };

// Testing Library confronta il testo con gli spazi normalizzati: l'euro all'italiana ha uno spazio che non va a capo.
const normale = (testo: string) => testo.replace(/\s/g, " ");
const COSTO_UNITARIO = new RegExp(`Costo unitario ${normale(formatCurrency(300)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} · margine 40%`);
const BADGE_MARGINE = `${normale(formatCurrency(400))} · 40%`;

async function monta(slug: string, voci: unknown[] = [VOCE]) {
  const modulo = MODULI.find((m) => m.slug === slug)!;
  const Editor = (await modulo.editor()).default as Editor;
  // Un elemento nuovo a ogni giro: con lo stesso elemento React salterebbe il ridisegno e il permesso nuovo non si leggerebbe.
  const albero = () => (
    <TooltipProvider>
      <Editor value={voci} onChange={() => {}} progettoId="p1" companyId="c1" />
    </TooltipProvider>
  );
  const vista = render(albero());
  return { ...vista, ririenderizza: () => vista.rerender(albero()) };
}

beforeEach(() => { stato.costi = false; stato.margini = false; });
afterEach(() => cleanup());

describe.each(MODULI)("computo di $slug: costi e margine per riga", ({ slug }) => {
  it("senza permesso la riga non mostra costi né margine e non li fa scrivere, e il bottone «Margini» non c'è", async () => {
    await monta(slug, [VOCE, VOCE_SENZA_COSTO]);
    // La riga c'è, con quello che serve a comporre il preventivo.
    expect(screen.getByDisplayValue("Posa e fornitura del materiale")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Voce scritta a mano")).toBeInTheDocument();
    // Nessuna traccia di costi o margini.
    expect(screen.queryByRole("button", { name: /Margini/ })).toBeNull();
    expect(screen.queryByText(/Costo unitario/)).toBeNull();
    expect(screen.queryByText(/aggiungi il costo/i)).toBeNull();
    expect(screen.queryByText(/margine/i)).toBeNull();
    expect(screen.queryByText("Materiali")).toBeNull();
    expect(screen.queryByText("Manodopera")).toBeNull();
    expect(screen.queryByTitle("Materiali")).toBeNull();
    expect(document.body.textContent).not.toContain(formatCurrency(300));
    expect(document.body.textContent).not.toContain(formatCurrency(600));
    expect(document.body.textContent).not.toContain(formatCurrency(400));
  });

  it("con il permesso sui costi: il bottone «Margini», il costo unitario, i campi di materiali e manodopera", async () => {
    stato.costi = true;
    await monta(slug);
    expect(screen.getByRole("button", { name: /Margini/ })).toBeInTheDocument();
    const apri = screen.getByText(COSTO_UNITARIO);
    expect(screen.queryByText("Materiali")).toBeNull(); // chiuso finché non lo si apre
    fireEvent.click(apri);
    expect(screen.getByText("Materiali")).toBeInTheDocument();
    expect(screen.getByText("Manodopera")).toBeInTheDocument();
    expect(screen.getByDisplayValue("200")).toBeInTheDocument();
    expect(screen.getByDisplayValue("100")).toBeInTheDocument();
  });

  it("con il permesso sui margini (anche solo quello): lo stesso", async () => {
    stato.margini = true;
    await monta(slug);
    expect(screen.getByRole("button", { name: /Margini/ })).toBeInTheDocument();
    expect(screen.getByText(COSTO_UNITARIO)).toBeInTheDocument();
  });

  it("il badge del margine di riga compare solo accendendo «Margini»", async () => {
    stato.costi = true;
    await monta(slug);
    expect(screen.queryByText(BADGE_MARGINE)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Margini/ }));
    expect(screen.getByText(BADGE_MARGINE)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Margini/ }));
    expect(screen.queryByText(BADGE_MARGINE)).toBeNull();
  });

  it("se il permesso sparisce con i margini accesi, spariscono anche loro (non basta nascondere il bottone)", async () => {
    stato.costi = true;
    const { ririenderizza } = await monta(slug);
    fireEvent.click(screen.getByRole("button", { name: /Margini/ }));
    expect(screen.getByText(BADGE_MARGINE)).toBeInTheDocument();

    stato.costi = false;
    ririenderizza();
    expect(screen.queryByText(BADGE_MARGINE)).toBeNull();
    expect(screen.queryByRole("button", { name: /Margini/ })).toBeNull();
    expect(screen.queryByText(/Costo unitario/)).toBeNull();
  });

  it("una voce senza costo propone di aggiungerlo, ma solo a chi può vederlo", async () => {
    stato.costi = true;
    await monta(slug, [VOCE_SENZA_COSTO]);
    expect(screen.getByText(/aggiungi il costo: serve al margine/i)).toBeInTheDocument();
    cleanup();
    stato.costi = false;
    await monta(slug, [VOCE_SENZA_COSTO]);
    expect(screen.queryByText(/aggiungi il costo/i)).toBeNull();
  });
});

describe("Ristrutturazione: l'ambiente della voce non è un costo e resta per tutti", () => {
  it("senza permesso il riquadro «Dettagli voce» c'è, con l'ambiente e senza costi", async () => {
    await monta("ristrutturazione");
    const apri = screen.getByText(/Dettagli voce/);
    expect(apri.textContent).toContain("Cucina");
    expect(apri.textContent).not.toMatch(/Costo|margine/i);
    fireEvent.click(apri);
    expect(screen.getByText("Ambiente")).toBeInTheDocument();
    const riquadro = screen.getByText("Ambiente").closest("div") as HTMLElement;
    expect(within(riquadro).getByDisplayValue("Cucina")).toBeInTheDocument();
    expect(screen.queryByText("Materiali")).toBeNull();
    expect(screen.queryByText("Manodopera")).toBeNull();
  });

  it("con il permesso: ambiente e costi nello stesso riquadro, come prima", async () => {
    stato.costi = true;
    await monta("ristrutturazione");
    const apri = screen.getByText(COSTO_UNITARIO);
    expect(apri.textContent).toContain("Cucina");
    fireEvent.click(apri);
    expect(screen.getByText("Ambiente")).toBeInTheDocument();
    expect(screen.getByText("Materiali")).toBeInTheDocument();
    expect(screen.getByText("Manodopera")).toBeInTheDocument();
  });
});

describe("ogni modulo a computo, anche uno futuro, passa dal permesso", () => {
  const COMPONENTI = resolve(__dirname, "../../components");
  const cartelle = readdirSync(COMPONENTI, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((nome) => {
      try { return readdirSync(join(COMPONENTI, nome, "ComputoEditor")).includes("VoceRow.tsx"); } catch { return false; }
    });
  const leggi = (cartella: string, file: string) => readFileSync(join(COMPONENTI, cartella, "ComputoEditor", file), "utf8");

  it("trova gli otto moduli (il controllo non guarda il vuoto)", () => {
    expect(cartelle.sort()).toEqual(MODULI.map((m) => m.slug).sort());
  });

  it.each(cartelle)("%s: l'editor chiede il permesso, il capitolo e la riga lo ricevono", (cartella) => {
    expect(leggi(cartella, "ComputoEditor.tsx")).toContain("usePuoVedereImpresa()");
    expect(leggi(cartella, "ComputoEditor.tsx")).toContain("conCosti={puoVedereImpresa}");
    expect(leggi(cartella, "CapitoloSection.tsx")).toContain("conCosti={conCosti}");
    const riga = leggi(cartella, "VoceRow.tsx");
    expect(riga).toContain("conCosti: boolean;");
    expect(riga).toContain("{conCosti && showMargine && hasCosto && (");
    expect(riga).toContain("{conCosti && (");
  });
});
