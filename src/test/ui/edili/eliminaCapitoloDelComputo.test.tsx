/// <reference types="node" />
/**
 * Eliminare un capitolo del computo, negli otto moduli edili (06/10/2026): il dialogo dice la
 * verità. Diceva «L'operazione è reversibile finché non salvi il computo», ma il computo si
 * salva da solo 1,2 secondi dopo l'ultima modifica e non c'è un «annulla»: chi si fidava
 * confermava e perdeva le voci. Si prova l'editor vero di ogni modulo.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.setConfig({ testTimeout: 60_000 });

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewCosts: true, canViewMargins: true }) }));
vi.mock("@/components/bagni/ComputoEditor/AddVocePicker", () => ({ default: (): null => null }));
vi.mock("@/components/tetti/ComputoEditor/AddVocePicker", () => ({ default: (): null => null }));
vi.mock("@/components/climatizzazione/ComputoEditor/AddVocePicker", () => ({ default: (): null => null }));
vi.mock("@/components/elettrico/ComputoEditor/AddVocePicker", () => ({ default: (): null => null }));
vi.mock("@/components/termoidraulico/ComputoEditor/AddVocePicker", () => ({ default: (): null => null }));
vi.mock("@/components/pavimenti/ComputoEditor/AddVocePicker", () => ({ default: (): null => null }));
vi.mock("@/components/piscine/ComputoEditor/AddVocePicker", () => ({ default: (): null => null }));
vi.mock("@/components/ristrutturazione/ComputoEditor/AddVocePicker", () => ({ default: (): null => null }));
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

const voce = (id: string, n: number) => ({
  id, progetto_id: "p1", company_id: "c1", capitolo_nome: "Demolizioni", descrizione: `Voce ${n}`, unita_misura: "mq", quantita: 2, prezzo_unitario: 50,
  costo_materiali: 0, costo_manodopera: 0, sconto_pct: 0, importo: 100, margine_eur: 0, margine_pct: 0, listino_voce_id: null as string | null,
  fonte: null as string | null, ordine: n, ambiente: null as string | null,
});

afterEach(() => cleanup());

describe.each(MODULI)("computo di $slug: elimina capitolo", ({ editor }) => {
  it("il dialogo conta le voci che si perdono e non promette un «annulla» che non c'è", async () => {
    const Editor = (await editor()).default as Editor;
    const onChange = vi.fn();
    const { container } = render(
      <TooltipProvider>
        <Editor value={[voce("v1", 0), voce("v2", 1), voce("v3", 2)]} onChange={onChange} progettoId="p1" companyId="c1" />
      </TooltipProvider>,
    );
    // Il primo cestino del documento è quello del capitolo (la testata viene prima delle righe).
    const cestino = container.querySelector("button svg[class*='lucide-trash']")?.closest("button");
    expect(cestino, "il cestino del capitolo non c'è").toBeTruthy();
    fireEvent.click(cestino as HTMLElement);
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo.textContent).toContain("Verranno rimosse anche le 3 voci contenute");
    // Il computo si salva da solo: dopo la conferma non c'è modo di tornare indietro, e il dialogo lo dice.
    expect(dialogo.textContent).not.toMatch(/reversibile/i);
    expect(dialogo.textContent).toMatch(/si salva da solo/);
    expect(dialogo.textContent).toMatch(/non si può annullare/);
    expect(onChange).not.toHaveBeenCalled(); // solo aprire il dialogo non toglie niente
  });
});
