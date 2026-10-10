/**
 * Sicurezza & Privacy → Esporta i dati, 10/10/2026.
 *
 *  - Il pulsante dice cosa scarica («Scarica i 17 elenchi (zip)») e la pagina dice
 *    cosa NON c'è ancora (costi, scadenze, prima nota, movimenti bancari,
 *    dipendenti): prima prometteva «tutto» e «consegnare tutto al commercialista».
 *  - Il titolo morto (visibile solo sotto 768 px, dove la pagina mostra un altro
 *    avviso) è sparito.
 *  - Il motivo per cui un elenco non è stato scaricato arriva in italiano, nella
 *    pagina e nel LEGGIMI.txt dentro l'archivio.
 *  - Il registro scritto prima di consegnare il file resta (esportazioniCrm.test).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const stato = vi.hoisted(() => ({
  mobile: false,
  canExportClients: true,
  tabellaInErrore: null as string | null,
  fileNelloZip: {} as Record<string, string>,
  registrate: [] as Array<Record<string, unknown>>,
  toasts: [] as Array<{ tipo: string; testo: string; descrizione?: string }>,
}));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => stato.mobile }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canExportClients: stato.canExportClients }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1", name: "Demo Srl" } }) }));
vi.mock("@/utils/logger", () => ({ logger: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} } }));
vi.mock("sonner", () => ({
  toast: Object.assign(
    (testo: string) => stato.toasts.push({ tipo: "neutro", testo }),
    {
      success: (testo: string) => stato.toasts.push({ tipo: "ok", testo }),
      warning: (testo: string, o?: { description?: string }) => stato.toasts.push({ tipo: "avviso", testo, descrizione: o?.description }),
      error: (testo: string, o?: { description?: string }) => stato.toasts.push({ tipo: "errore", testo, descrizione: o?.description }),
    },
  ),
}));
vi.mock("@/lib/export/esportazioniCrm", () => ({
  registraEsportazioneCrm: async (e: Record<string, unknown>) => { stato.registrate.push(e); },
  messaggioEsportazioneNonRiuscita: () => "Esportazione non riuscita",
}));
vi.mock("@/lib/export/esportaDatiAzienda", async () => {
  const vero = await vi.importActual<typeof import("@/lib/export/esportaDatiAzienda")>("@/lib/export/esportaDatiAzienda");
  return {
    ...vero,
    scaricaTabella: async (tabella: string) => {
      if (tabella === stato.tabellaInErrore) throw new Error('permission denied for table "tickets"');
      return [{ id: `${tabella}-1` }];
    },
  };
});
vi.mock("jszip", () => ({
  default: class {
    file(nome: string, contenuto: string) { stato.fileNelloZip[nome] = contenuto; }
    async generateAsync() { return new Blob(["zip"]); }
  },
}));

import SettingsEsportaDati from "@/pages/azienda/settings/SettingsEsportaDati";
import { TABELLE_EXPORT } from "@/lib/export/esportaDatiAzienda";

beforeEach(() => {
  stato.mobile = false;
  stato.canExportClients = true;
  stato.tabellaInErrore = null;
  stato.fileNelloZip = {};
  stato.registrate = [];
  stato.toasts = [];
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:finto";
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Esporta i dati: testi onesti", () => {
  it("il pulsante dice cosa scarica; niente «Esporta tutto»", () => {
    render(<SettingsEsportaDati />);
    expect(screen.getByRole("button", { name: `Scarica i ${TABELLE_EXPORT.length} elenchi (zip)` })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Esporta tutto/ })).toBeNull();
  });

  it("dice cosa non c'è ancora e non promette «tutto al commercialista»", () => {
    render(<SettingsEsportaDati />);
    expect(screen.getByText(/Non ci sono ancora costi, scadenze, prima nota, movimenti bancari e dipendenti/)).toBeVisible();
    expect(screen.queryByText(/per consegnare tutto al commercialista\./)).toBeNull();
    expect(screen.getByText(/una copia di sicurezza o per passare a un altro gestionale/)).toBeVisible();
  });

  it("niente titolo morto e niente «così come sono nel database»", () => {
    render(<SettingsEsportaDati />);
    expect(screen.queryByRole("heading", { name: "Esporta i dati dell'azienda" })).toBeNull();
    expect(screen.queryByText(/così come sono/)).toBeNull();
    expect(screen.getByText(/con tutte le colonne, anche quelle tecniche/)).toBeVisible();
  });

  it("senza «Esporta Clienti» non c'è il pulsante e la spiegazione dice cosa serve", () => {
    stato.canExportClients = false;
    render(<SettingsEsportaDati />);
    expect(screen.queryByRole("button", { name: /Scarica i \d+ elenchi/ })).toBeNull();
    expect(screen.getByText(/serve anche il permesso «Esporta Clienti»/)).toBeVisible();
  });

  it("su telefono c'è solo l'avviso «Da computer»", () => {
    stato.mobile = true;
    render(<SettingsEsportaDati />);
    expect(screen.getByText("Da computer")).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("Esporta i dati: l'archivio", () => {
  it("scarica gli elenchi, scrive il registro prima e mette nel LEGGIMI.txt cosa non c'è", async () => {
    render(<SettingsEsportaDati />);
    fireEvent.click(screen.getByRole("button", { name: /Scarica i \d+ elenchi/ }));
    await waitFor(() => expect(stato.toasts.some((t) => t.tipo === "ok")).toBe(true));
    expect(stato.toasts.find((t) => t.tipo === "ok")!.testo).toBe("Archivio scaricato");
    expect(stato.registrate).toHaveLength(1);
    expect(stato.registrate[0]).toMatchObject({ companyId: "c1", oggetto: "archivio_azienda", formato: "zip", righe: TABELLE_EXPORT.length });
    expect(Object.keys(stato.fileNelloZip)).toContain("commesse.csv");
    // I file CSV partono col BOM (senza, Excel rompe gli accenti).
    expect(stato.fileNelloZip["commesse.csv"].charCodeAt(0)).toBe(0xfeff);
    expect(stato.fileNelloZip["LEGGIMI.txt"]).toContain("NON COMPRESI (per ora): costi, scadenze, prima nota, movimenti bancari e dipendenti.");
    expect(await screen.findByText("Ultimo archivio")).toBeVisible();
    // «Commesse» sta fra i riquadri dell'elenco e nel riepilogo dell'ultimo archivio.
    expect(screen.getAllByText("Commesse").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("1 riga").length).toBe(TABELLE_EXPORT.length);
  });

  it("un elenco che non si legge finisce nel riepilogo con il motivo in italiano, non in inglese", async () => {
    stato.tabellaInErrore = "tickets";
    render(<SettingsEsportaDati />);
    fireEvent.click(screen.getByRole("button", { name: /Scarica i \d+ elenchi/ }));
    await waitFor(() => expect(stato.toasts.some((t) => t.tipo === "avviso")).toBe(true));
    expect(stato.toasts.find((t) => t.tipo === "avviso")!.testo).toBe("Archivio scaricato, ma incompleto");
    const leggimi = stato.fileNelloZip["LEGGIMI.txt"];
    expect(leggimi).toContain("NON ESPORTATO");
    expect(leggimi).toContain("Ticket di assistenza");
    expect(leggimi).not.toMatch(/permission denied/i);
    expect(await screen.findByText(/non esportato — /)).toBeVisible();
    expect(document.body.textContent).not.toMatch(/permission denied/i);
  });

  it("non parte nulla senza il permesso", async () => {
    stato.canExportClients = false;
    render(<SettingsEsportaDati />);
    expect(screen.queryByRole("button", { name: /Scarica i \d+ elenchi/ })).toBeNull();
    expect(stato.registrate).toHaveLength(0);
  });
});
