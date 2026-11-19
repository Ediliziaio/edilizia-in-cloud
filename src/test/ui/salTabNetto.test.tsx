// src/test/ui/salTabNetto.test.tsx
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupRadixMenus, scegliNelMenu } from "@/test/helpers/radixMenus";
setupRadixMenus();
import { SalTab } from "@/components/orders/SalTab";

const dati = vi.hoisted(() => ({
  sal: [] as Array<Record<string, unknown>>, importi: true,
  invoca: vi.fn(), disegnaPdf: vi.fn(), scaricaPdf: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/components/shared/PrintPreviewModal", () => ({ PrintPreviewModal: (): null => null }));
vi.mock("@/lib/orders/scaricaVerbaleSal", () => ({ generaVerbaleSalScaricabile: dati.disegnaPdf }));
vi.mock("@/lib/preventivi/quotePdfDownload", () => ({ downloadQuotePdf: dati.scaricaPdf }));
vi.mock("@/hooks/useSalMatura",()=>({useSalMatura:()=>"emesso"}));
vi.mock("@/hooks/usePermissions",()=>({usePermissions:()=>({canEditOrders:true,canViewOrderAmounts:dati.importi,canViewSettingsOrders:false})}));
vi.mock("@/integrations/supabase/client", () => {
  const costruisci = (tabella: string) => {
    // Lettura: l'oggetto si può «attendere» a ogni passo della catena.
    const lettura: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
        Promise.resolve({ data: tabella === "sal_records" ? dati.sal : [], error: null }).then(ok, ko),
    };
    for (const metodo of ["select", "eq", "order"]) lettura[metodo] = () => lettura;
    return lettura;
  };
  return { supabase: { from: costruisci, functions: { invoke: dati.invoca } } };
});

const sal = (numero_sal: number, stato: string, importo_totale: number) => ({
  id: `s${numero_sal}`, numero_sal, data_emissione: `2026-10-0${numero_sal}`, stato, importo_totale, note: null as string | null, installment_id: null as string | null,
  sal_voci: [{ id: `v${numero_sal}`, descrizione: "Opere", importo_contrattuale: 40000, percentuale_avanzamento: 40, importo_sal: importo_totale, note: null as string | null }],
});
const disegna = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SalTab orderId="o1" companyId="c1" orderTotalAmount={100000} installments={[]} />
    </QueryClientProvider>,
  );
beforeEach(() => {
  dati.sal = [];
  dati.importi = true;
  dati.invoca.mockReset();
  dati.disegnaPdf.mockReset();
  dati.scaricaPdf.mockReset();
});
afterEach(cleanup);

describe("SAL: meno SAL precedenti", () => {
  it("il secondo SAL dice quanto era già nei precedenti e quanto fatturare ora", async () => {
    dati.sal = [sal(2, "emesso", 16000), sal(1, "firmato", 10000)];
    disegna();
    const record = await screen.findByRole("article", { name: "SAL #2" });
    const summary = within(record).getByLabelText("Importi SAL 2");
    expect(summary).toHaveTextContent("16.000,00");
    expect(summary).toHaveTextContent("Già riconosciuto nei SAL precedenti10.000,00");
    expect(summary).toHaveTextContent("Quota nuova del SAL6.000,00");
  });

  it("una bozza precedente non conta", async () => {
    dati.sal = [sal(2, "emesso", 16000), sal(1, "bozza", 10000)];
    disegna();
    await screen.findByText("SAL #2");
    expect(screen.queryByText(/Ultimo cumulativo precedente/)).not.toBeInTheDocument();
  });

  it("un netto negativo si chiama «Rettifica»", async () => {
    dati.sal = [sal(2, "emesso", 8000), sal(1, "firmato", 10000)];
    disegna();
    const summary = await screen.findByLabelText("Importi SAL 2");
    expect(summary).toHaveTextContent(/Rettifica da verificare\s*[-−]2\.000,00/);
  });
});


describe("Archivio SAL nella commessa", () => {
  it("cerca per numero e mantiene il precedente anche quando è filtrato", async () => {
    dati.sal = [sal(2, "emesso", 16000), sal(1, "firmato", 10000)];
    disegna(); await screen.findByRole("article", { name: "SAL #2" });
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca verbale SAL" }), { target: { value: "SAL #2" } });
    expect(screen.queryByRole("article", { name: "SAL #1" })).toBeNull();
    expect(screen.getByLabelText("Importi SAL 2")).toHaveTextContent("Quota nuova del SAL6.000,00");
    expect(screen.getByLabelText("Riepilogo dei SAL")).toHaveTextContent("16.000,00");
    fireEvent.click(screen.getByRole("button", { name: "Cancella ricerca SAL" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("il filtro per stato non cambia i conti e un filtro vuoto si azzera", async () => {
    dati.sal = [sal(2, "emesso", 16000), sal(1, "firmato", 10000)];
    disegna(); await screen.findByRole("article", { name: "SAL #2" });
    await scegliNelMenu("Stato dei verbali SAL", "Emesso (1)");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByLabelText("Importi SAL 2")).toHaveTextContent("Quota nuova del SAL6.000,00");
    await scegliNelMenu("Stato dei verbali SAL", "Bozza (0)");
    expect(screen.getByText("Nessun verbale corrisponde ai filtri.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mostra tutti i verbali" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("mostra le lavorazioni della macrofase scelta e mantiene il totale del verbale", async () => {
    const secondo = sal(2, "emesso", 16000);
    const opere = {
      ...secondo.sal_voci[0],
      sal_voci_sottofasi: [{
        id: "d1", posizione: 0, descrizione: "Muratura", quantita_a_oggi: 0, quantita_contratto: 100, unita: "m²",
        importo_contrattuale: 40000, percentuale_avanzamento: 0, importo_sal: 0,
      }],
    };
    dati.sal = [{ ...secondo, sal_voci: [opere, { ...opere, id: "v3", descrizione: "Impianti", sal_voci_sottofasi: null }] }, sal(1, "firmato", 10000)];
    disegna();
    const card = await screen.findByRole("article", { name: "SAL #2" });
    const toggle = within(card).getByRole("button", { name: "Voci del verbale (2)" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(toggle);
    const dialog = screen.getByRole("dialog", { name: "Voci del verbale · SAL n. 2" });
    const nav = within(dialog).getByRole("navigation", { name: "Macrofasi del verbale" });
    expect(within(nav).getByRole("button", { name: /Opere/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("table")).toHaveTextContent("Muratura0 / 100 m²");
    fireEvent.click(within(nav).getByRole("button", { name: /Impianti/ }));
    const table = within(dialog).getByRole("table");
    expect(table).toHaveTextContent("Impianti");
    expect(table).not.toHaveTextContent("Muratura");
    expect(card).not.toContainElement(table);
    fireEvent.click(within(nav).getByRole("button", { name: /Tutte le macrofasi/ }));
    expect(within(dialog).getByRole("table")).toHaveTextContent("Opere");
    expect(within(dialog).getByRole("table")).toHaveTextContent("Impianti");
    expect(within(dialog).getByLabelText("Totali del verbale")).toHaveTextContent("Quota nuova del SAL6.000,00");
    fireEvent.click(within(dialog).getByRole("button", { name: "Chiudi" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(toggle).toBeVisible();
  });

  it("senza permesso importi mostra avanzamenti, ma nasconde le cifre e il PDF", async () => {
    dati.importi = false; dati.sal = [sal(2, "emesso", 16000), sal(1, "firmato", 10000)]; disegna();
    const card = await screen.findByRole("article", { name: "SAL #2" });
    expect(screen.queryByLabelText("Importi SAL 2")).toBeNull();
    expect(card.textContent).not.toMatch(/16\.000|10\.000|6\.000|40\.000/);
    expect(within(card).getByRole("button", { name: "Anteprima e stampa SAL" })).toBeDisabled();
    fireEvent.click(within(card).getByRole("button", { name: "Voci del verbale (1)" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.queryByRole("button", { name: "Scarica PDF" })).toBeNull();
    const table = dialog.getByRole("table");
    expect(within(table).queryByRole("columnheader", { name: "Contrattuale" })).toBeNull();
    expect(table).not.toHaveTextContent(/16\.000|10\.000|6\.000|40\.000/);
    expect(table).toHaveTextContent("40%");
  });

  it("scarica direttamente i due formati selezionati dal popup", async () => {
    dati.sal = [sal(2, "emesso", 16000), sal(1, "firmato", 10000)];
    dati.invoca.mockResolvedValue({ data: { html: "<html>verbale</html>" }, error: null });
    dati.disegnaPdf.mockResolvedValue(new TextEncoder().encode("%PDF-1.7"));
    disegna();
    const card = await screen.findByRole("article", { name: "SAL #2" });
    fireEvent.click(within(card).getByRole("button", { name: "Voci del verbale (1)" }));
    const dialog = within(screen.getByRole("dialog"));

    for (const [vista, formato, nomeFile] of [
      ["Cumulativo", "completo", "SAL-2-cumulativo.pdf"],
      ["Solo questo SAL", "periodo", "SAL-2-solo-periodo.pdf"],
    ]) {
      fireEvent.click(dialog.getByRole("button", { name: vista }));
      fireEvent.click(dialog.getByRole("button", { name: "Scarica PDF" }));
      await waitFor(() => expect(dati.scaricaPdf).toHaveBeenLastCalledWith(expect.objectContaining({ type: "application/pdf" }), nomeFile));
      expect(dati.invoca).toHaveBeenLastCalledWith("generate-sal-pdf", {
        body: { sal_id: "s2", company_id: "c1", prepare_signature: false, foto_ids: [], allegati: [], formato },
      });
      expect(dati.disegnaPdf).toHaveBeenLastCalledWith("<html>verbale</html>", formato);
      expect(dialog.getByRole("button", { name: vista })).toHaveAttribute("aria-pressed", "true");
    }
    expect(dati.scaricaPdf).toHaveBeenCalledTimes(2);
  });

  it("confronta i SAL emessi per voce, filtra gli avanzamenti ed espande le detrazioni", async () => {
    const tramezzi = (misura: number) => ({
      sottofase_id: "tramezzi", posizione: 0, descrizione: "Demolizione tramezzi", unita: "m²",
      quantita_a_oggi: misura, quantita_contratto: 100, percentuale_avanzamento: misura,
      importo_sal: misura * 30, importo_contrattuale: 3000,
    });
    const demolizioni = (n: number, misura: number) => ({
      id: `fase-${n}`, fase_id: "demolizioni", descrizione: "Demolizioni",
      importo_sal: misura * 30 + 300, importo_contrattuale: 3300, percentuale_avanzamento: misura,
      sal_voci_sottofasi: [
        { ...tramezzi(misura), id: `tramezzi-${n}` },
        { ...tramezzi(100), id: `smaltimento-${n}`, sottofase_id: "smaltimento", descrizione: "Smaltimento", importo_sal: 300 },
      ],
    });
    const altreFasi = (n: number, importo: number) => ({
      id: `altre-${n}`, descrizione: "Altre fasi", importo_contrattuale: 100000,
      percentuale_avanzamento: importo / 1000, importo_sal: importo,
    });
    const certificato = {
      lavori_contrattuali: 88200, varianti: 0, ritenuta_pct: 5, ritenuta: 4410,
      recupero_anticipazione: 8820, altre_detrazioni: 0, acconti_precedenti: 26010, rinviato: 60, netto: 48900,
    };
    dati.sal = [
      { ...sal(2, "emesso", 88200), sal_voci: [demolizioni(2, 100), altreFasi(2, 84900)], sal_certificati: certificato },
      { ...sal(1, "firmato", 30600), sal_voci: [demolizioni(1, 69), altreFasi(1, 28230)], sal_certificati: {
        ...certificato, lavori_contrattuali: 30600, ritenuta: 1530, recupero_anticipazione: 3060, acconti_precedenti: 0, rinviato: 0, netto: 26010,
      } },
    ];
    disegna();
    const card = await screen.findByRole("article", { name: "SAL #2" });
    fireEvent.click(within(card).getByRole("button", { name: "Voci del verbale (2)" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("row", { name: /Demolizione tramezzi/ })).toHaveTextContent("100 / 100 m²");
    fireEvent.click(dialog.getByRole("button", { name: "Solo questo SAL" }));
    const riga = dialog.getByRole("row", { name: /Demolizione tramezzi/ });
    expect(riga).toHaveTextContent("31 m²");
    expect(riga).toHaveTextContent("930,00");
    expect(dialog.getByRole("row", { name: /Smaltimento/ })).toBeVisible();
    fireEvent.click(dialog.getByRole("checkbox", { name: "Solo voci avanzate" }));
    expect(dialog.queryByRole("row", { name: /Smaltimento/ })).toBeNull();
    const netto = dialog.getByRole("button", { name: /Netto del certificato/ });
    expect(netto).toHaveTextContent("48.900,00");
    expect(dialog.queryByLabelText("Detrazioni del certificato")).toBeNull();
    fireEvent.click(netto);
    const dettaglio = dialog.getByLabelText("Detrazioni del certificato");
    for (const cifra of ["57.600,00", "-2.880,00", "-5.760,00", "-60,00", "48.900,00"]) {
      expect(dettaglio).toHaveTextContent(cifra);
    }
  });
});
