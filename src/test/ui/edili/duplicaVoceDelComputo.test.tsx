/// <reference types="node" />
/**
 * «Duplica» una voce del computo, negli otto moduli edili (06/10/2026): la copia nasce
 * accanto all'originale con gli stessi dati di lavoro — descrizione, unità, quantità,
 * prezzo, sconto, costi, provenienza dal listino e foto del prodotto. In Ristrutturazione
 * anche l'ambiente (la stanza): la copia lo perdeva, e nel «Riepilogo per ambiente»
 * finiva tra le voci «Non assegnato». Si prova l'editor vero di ogni modulo.
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
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

const VOCE = {
  id: "v1", progetto_id: "p1", company_id: "c1", capitolo_nome: "Lavorazioni", descrizione: "Piatto doccia in resina",
  unita_misura: "cad", quantita: 3, prezzo_unitario: 235, costo_materiali: 130, costo_manodopera: 20, sconto_pct: 10,
  importo: 634.5, margine_eur: 0, margine_pct: 0, listino_voce_id: "l1" as string | null, fonte: "Prezzario Lombardia 2026" as string | null,
  famiglia_id: "f-piatto" as string | null, immagine_url: "/templates/bagno/products/piatto-doccia.webp" as string | null,
  descrizione_estesa: "Antiscivolo, finitura pietra." as string | null, ordine: 0, ambiente: "Cucina" as string | null,
};

afterEach(() => cleanup());

describe.each(MODULI)("computo di $slug: duplica voce", ({ slug, editor }) => {
  it("la copia sta subito dopo l'originale con gli stessi dati di lavoro (e l'ambiente, dove c'è)", async () => {
    const Editor = (await editor()).default as Editor;
    const onChange = vi.fn();
    const { container } = render(
      <TooltipProvider>
        <Editor value={[VOCE]} onChange={onChange} progettoId="p1" companyId="c1" />
      </TooltipProvider>,
    );
    const duplica = container.querySelector("button svg.lucide-copy")?.closest("button");
    expect(duplica, "il pulsante Duplica non c'è").toBeTruthy();
    fireEvent.click(duplica as HTMLElement);
    expect(onChange).toHaveBeenCalledTimes(1);
    const voci = onChange.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(voci).toHaveLength(2);
    // L'originale non cambia; la copia ha un id nuovo e l'ordine subito dopo.
    expect(voci[0]).toMatchObject({ id: "v1", descrizione: "Piatto doccia in resina", ordine: 0 });
    expect(voci[1].id).not.toBe("v1");
    expect(voci[1]).toMatchObject({
      capitolo_nome: "Lavorazioni", descrizione: "Piatto doccia in resina", unita_misura: "cad", quantita: 3, prezzo_unitario: 235,
      sconto_pct: 10, costo_materiali: 130, costo_manodopera: 20, listino_voce_id: "l1", fonte: "Prezzario Lombardia 2026",
      famiglia_id: "f-piatto", immagine_url: "/templates/bagno/products/piatto-doccia.webp", descrizione_estesa: "Antiscivolo, finitura pietra.", ordine: 1,
    });
    // L'ambiente (la stanza) esiste solo in Ristrutturazione: lì la copia resta nella stessa stanza.
    if (slug === "ristrutturazione") expect(voci[1].ambiente).toBe("Cucina");
  });
});
