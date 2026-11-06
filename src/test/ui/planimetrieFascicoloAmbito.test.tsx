import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bilocale from "../../../shared/planimetrie/esempi/bilocale.json";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";
import { EsportaPiantaDialog } from "@/components/planimetrie/EsportaPiantaDialog";

const mocks = vi.hoisted(() => ({ esporta: vi.fn(async () => ({ dati: new Uint8Array([1]), pagine: 1, immaginiRender: 0 })) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda", name: "Demo" } }) }));
vi.mock("@/hooks/useBranding", () => ({ useBranding: () => ({ branding: null as null }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: queryKey[0].includes("preventivi") ? [] as unknown[] : { name: "Demo" } }) }));
vi.mock("@/components/shared/CampoIndirizzo", () => ({ CampoIndirizzo: () => <input aria-label="Indirizzo del cantiere" /> }));
vi.mock("@/lib/planimetrie/fascicoloDati", () => ({ renderPerFascicolo: async (): Promise<unknown[]> => [], sorgentePerFascicolo: async (): Promise<null> => null, campioniPersonaliPerFascicolo: async (): Promise<unknown[]> => [] }));
vi.mock("@/lib/planimetrie/fascicoloPdf", () => ({ esportaFascicolo: mocks.esporta }));

beforeEach(() => {
  mocks.esporta.mockClear();
  vi.stubGlobal("URL", class extends URL { static createObjectURL() { return "blob:prova"; } static revokeObjectURL() {} });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("stato del progetto conservato fino al fascicolo", () => {
  it.each([
    { ambito: "fatto", haProgetto: true, propostaId: undefined as string | undefined },
    { ambito: "progetto:rinnovo", haProgetto: false, propostaId: "rinnovo" },
  ])("esporta $ambito anche su un piano che non ha opere della proposta", async ({ ambito, haProgetto, propostaId }) => {
    const documento = structuredClone(bilocale) as unknown as Planimetria;
    const primo = documento.livelli[0];
    primo.proposte = [{ ...structuredClone(primo.fatto), id: "rinnovo", nome: "Rinnovo" }];
    const secondo: Planimetria["livelli"][number] = { ...structuredClone(primo), id: "p1", nome: "Piano primo", quota: 300, proposte: [] };
    for (const oggetti of [secondo.fatto.muri, secondo.fatto.aperture, secondo.fatto.locali, secondo.fatto.elementi, secondo.fatto.quote, secondo.fatto.testi]) for (const o of oggetti) o.id = `p1-${o.id}`;
    for (const a of secondo.fatto.aperture) a.muroId = `p1-${a.muroId}`;
    for (const e of secondo.fatto.elementi) if (e.localeId) e.localeId = `p1-${e.localeId}`;
    documento.livelli.push(secondo);
    render(<EsportaPiantaDialog aperto onChiudi={() => undefined} documento={documento} titolo="Casa" versione={3} livelloId={ambito === "fatto" ? primo.id : secondo.id} planimetriaId="casa" haProgetto={haProgetto} ambitoIniziale={ambito} propostaId={propostaId} />);
    fireEvent.click(screen.getByRole("button", { name: "Scarica Fascicolo completo PDF" }));
    await waitFor(() => expect(mocks.esporta).toHaveBeenCalledWith(expect.objectContaining({ ambito, versione: 3 })));
    await waitFor(() => expect(screen.getByRole("button", { name: "Scarica Fascicolo completo PDF" })).toBeEnabled());
  });
});
