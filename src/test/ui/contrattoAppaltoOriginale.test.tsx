import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { calcolaChecklist, vociDelModello, type AllegatoCommessa } from "@/lib/orders/generali/documenti";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";

const m = vi.hoisted(() => ({ carica: vi.fn(), apri: vi.fn().mockResolvedValue(undefined), refetch: vi.fn(), errore: false }));
const r: RiepilogoGenerale = { generale: { id: "g", codice: "O-2", nome: "Accordo quadro", cliente: "ANAS", clienteId: "c", modello: "appalto", creataIl: null, valore: null }, figlie: [{ id: "f", codice: "O-3", nome: "Applicativo 19", stato: null, statoNome: null, statoColore: null, indirizzo: null, inizio: null, fine: null, avanzamento: 0, importo: 778505, eseguito: 0, fatturato: 0, incassato: 0, costo: 0, margine: 0 }], permessi: { importi: true, costi: true, margini: true } };
const a: AllegatoCommessa = { id: "originale", order_id: "f", file_name: "Contratto registrato.pdf", file_url: "orders/f/contratto.pdf", file_type: "application/pdf", created_at: "2026-11-20" };
const voci = vociDelModello("appalto");
vi.mock("@/hooks/useGeneraleDocumenti", () => ({
  useChecklistGenerale: () => ({ checklist: calcolaChecklist({ voci, generaleId: "g", figlie: r.figlie, allegati: [a], segni: [], oggi: "2026-11-20" }), allegatiPer: new Map([["f", [a]]]), isLoading: false, isError: m.errore, refetch: m.refetch }),
  useAzioneDocumento: () => ({ mutate: vi.fn(), isPending: false }), useCaricaDocumentoVoce: () => ({ mutateAsync: m.carica, isPending: false }), messaggioDocumenti: (e: Error) => e.message,
}));
vi.mock("@/components/orders/filePreviewUtils", () => ({ openAttachmentInTab: m.apri }));
import { DocumentoContrattoAppalto } from "@/components/orders/generali/contratto/DocumentoContrattoAppalto";
const disegna = (modifica = true, riepilogo = r) => render(<MemoryRouter><DocumentoContrattoAppalto riepilogo={riepilogo} puoModificare={modifica} /></MemoryRouter>);
beforeEach(() => { vi.clearAllMocks(); m.errore = false; m.apri.mockResolvedValue(undefined); });
afterEach(cleanup);
it("mostra l'applicativo sulla madre senza spacciarlo per contratto principale", () => {
  disegna();
  expect(screen.getByText("Originale da caricare")).toBeVisible();
  expect(screen.getByText("Contratti degli applicativi")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Contratto registrato.pdf" }));
  expect(m.apri).toHaveBeenCalledWith(a.file_url);
  expect(screen.getByRole("link", { name: "Apri applicativo" })).toHaveAttribute("href", "/azienda/ordini/f?tab=panoramica&section=section-documenti");
});
it("in sola lettura resta consultabile; senza permesso importi non rivela gli originali", () => {
  disegna(false); expect(screen.getByRole("button", { name: "Contratto registrato.pdf" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Carica file" })).not.toBeInTheDocument();
  cleanup(); disegna(true, { ...r, permessi: { ...r.permessi, importi: false } });
  expect(screen.queryByText("Contratto registrato.pdf")).not.toBeInTheDocument();
});
it("l'errore non sembra un contratto mancante e offre Riprova", () => {
  m.errore = true; disegna(); expect(within(screen.getByRole("alert")).getByText(/Non riesco a leggere/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Riprova" })); expect(m.refetch).toHaveBeenCalled();
});
