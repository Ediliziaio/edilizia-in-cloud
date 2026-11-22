import { changeFormControl } from "@/test/helpers/changeFormControl";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const fake = vi.hoisted(() => ({ firma: vi.fn(), allegati: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => ({
      select: () => ({
        eq: (_: string, azienda: string) => ({
          eq: (_: string, email: string) => ({
            order: () => fake.allegati(tabella, azienda, email),
          }),
        }),
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: (path: string, seconds: number) =>
          fake.firma(bucket, path, seconds),
      }),
    },
  },
}));
vi.mock("@/components/fatturazione/PdfRigaConfronto", () => ({
  PdfRigaConfronto: ({ url, nome }: { url: string; nome: string }) => (
    <canvas title={`Originale ${nome}`} data-source={url} />
  ),
}));
import {
  originaleDaRiferimento,
  originaliBolla,
} from "@/lib/fatturazione/originaliConfronto";
import { OriginaliConfronto } from "@/components/fatturazione/OriginaliConfronto";
import { ConfrontoDocumentiLayout, PannelloDocumento } from "@/components/shared/ConfrontoDocumentiLayout";
import { OriginaliOfferteDialog } from "@/components/rdo/OriginaliOfferteDialog";
import type { RfqSupplier } from "@/hooks/useSupplierRfqs";
function monta(files: Parameters<typeof OriginaliConfronto>[0]["files"]) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <OriginaliConfronto files={files} companyId="azienda" />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  fake.firma.mockReset();
  fake.allegati.mockReset();
  fake.firma.mockImplementation(async (_b: string, p: string) => ({
    data: { signedUrl: `https://files.example.test/${p}` },
    error: null,
  }));
});
describe("originali PDF e foto del confronto", () => {
  it("mantiene attivi i comandi condivisi e li rimuove passando dalle foto alle righe", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const files = [originaleDaRiferimento("azienda/foto.png", "ddt_attachments")!];
    const Confronto = ({ originale }: { originale: boolean }) => (
      <QueryClientProvider client={client}>
        <ConfrontoDocumentiLayout>
          <PannelloDocumento nome="Bolla" lato="sinistra" attivo testata="DDT" viste="Viste">
            {originale ? <OriginaliConfronto files={files} companyId="azienda" /> : <p>Righe della bolla</p>}
          </PannelloDocumento>
        </ConfrontoDocumentiLayout>
      </QueryClientProvider>
    );
    const view = render(<Confronto originale />);
    await screen.findByAltText("Originale foto.png");
    expect(screen.getAllByRole("link", { name: "Apri originale" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Ingrandisci foto" }));
    expect(screen.getByRole("button", { name: "Adatta alla pagina" })).toHaveAttribute("aria-pressed", "false");
    view.rerender(<Confronto originale={false} />);
    expect(screen.getByText("Righe della bolla")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Apri originale" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adatta alla pagina" })).not.toBeInTheDocument();
    view.rerender(<Confronto originale />);
    await screen.findByAltText("Originale foto.png");
    expect(screen.getAllByRole("link", { name: "Apri originale" })).toHaveLength(1);
  });
  it("rinnova un URL firmato scaduto dal percorso salvato", async () => {
    const f = originaleDaRiferimento(
      "https://example.supabase.co/storage/v1/object/sign/order-attachments/oda/id/ordine.pdf?token=scaduto",
      "order-attachments",
    )!;
    monta([f]);
    const iframe = await screen.findByTitle("Originale ordine.pdf");
    expect(iframe.getAttribute("data-source")).toBe(
      "https://files.example.test/oda/id/ordine.pdf",
    );
    expect(fake.firma).toHaveBeenCalledWith(
      "order-attachments",
      "oda/id/ordine.pdf",
      3600,
    );
    expect(
      screen.getByRole("link", { name: "Apri originale" }).getAttribute("href"),
    ).toContain("ordine.pdf");
  });
  it("mostra la foto JPEG dell’importazione", async () => {
    monta([originaleDaRiferimento("azienda/foto.png", "ddt_attachments")!]);
    expect(
      (await screen.findByAltText("Originale foto.png")).getAttribute("src"),
    ).toContain("azienda/foto.png");
    fireEvent.click(screen.getByRole("button", { name: "Ingrandisci foto" }));
    expect(screen.getByLabelText("Zoom relativo alla vista")).toHaveTextContent("125%");
    fireEvent.click(screen.getByRole("button", { name: "Adatta alla larghezza" }));
    expect(screen.getByLabelText("Zoom relativo alla vista")).toHaveTextContent("100%");
    expect(screen.getByRole("button", { name: "Adatta alla larghezza" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Adatta alla pagina" }));
    expect(screen.getByRole("button", { name: "Adatta alla pagina" })).toHaveAttribute("aria-pressed", "true");
  });
  it("mantiene HEIC originale e usa l’anteprima convertita", async () => {
    const files = originaliBolla("azienda", {}, [
      {
        files: [
          {
            path: "azienda/uno.heic",
            name: "uno.heic",
            mime: "image/heic",
            prepared_path: "azienda/uno.jpg",
            prepared_mime: "image/jpeg",
          },
        ],
      },
    ]);
    monta(files);
    expect(
      (await screen.findByAltText("Originale uno.heic")).getAttribute("src"),
    ).toContain("uno.jpg");
    expect(
      screen.getByRole("link", { name: "Apri originale" }).getAttribute("href"),
    ).toContain("uno.heic");
  });
  it("non usa l’anteprima di un’altra azienda e conserva il download HEIC", async () => {
    const files = originaliBolla("azienda", {}, [
      {
        files: [
          {
            path: "azienda/uno.heic",
            name: "uno.heic",
            mime: "image/heic",
            prepared_path: "altra/uno.jpg",
            prepared_mime: "image/jpeg",
          },
        ],
      },
    ]);
    expect(files[0].previewPath).toBeUndefined();
    monta(files);
    expect(
      await screen.findByText(/Foto HEIC originale conservata/),
    ).toBeTruthy();
    expect(fake.firma).not.toHaveBeenCalledWith(
      "ddt-documenti",
      "altra/uno.jpg",
      3600,
    );
  });
  it("rende selezionabili più file della stessa bolla", async () => {
    monta([
      originaleDaRiferimento("azienda/prima.pdf", "ddt_attachments")!,
      originaleDaRiferimento("azienda/seconda.jpg", "ddt_attachments")!,
    ]);
    await screen.findByTitle("Originale prima.pdf");
    changeFormControl(screen.getByLabelText("Scegli il file originale"), {
      target: { value: "ddt_attachments/azienda/seconda.jpg" },
    });
    expect(await screen.findByAltText("Originale seconda.jpg")).toBeTruthy();
  });
  it("mostra gli errori di autorizzazione senza presentare un documento vuoto", async () => {
    fake.firma.mockResolvedValue({
      data: null,
      error: { message: "File non leggibile" },
    });
    monta([originaleDaRiferimento("azienda/f.pdf", "ddt_attachments")!]);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "File non leggibile",
    );
    expect(screen.getByRole("button", { name: "Riprova" })).toBeTruthy();
  });
  it("non accetta schemi eseguibili e deduplica originali legacy", () => {
    expect(
      originaleDaRiferimento("javascript:alert(1)", "order-attachments"),
    ).toBeNull();
    expect(
      originaleDaRiferimento("//untrusted.example/f.pdf", "order-attachments"),
    ).toBeNull();
    const files = originaliBolla(
      "azienda",
      {
        ddt_file_url: "azienda/uno.pdf",
        attachments: [{ path: "azienda/uno.pdf", name: "uno.pdf" }],
      },
      [],
    );
    expect(files).toHaveLength(1);
    expect(
      originaliBolla("azienda", {}, [
        { files: [{ path: "altra/a.pdf", name: "a.pdf" }] },
      ]),
    ).toHaveLength(0);
  });
});

it("affianca il preventivo archiviato e quello dell’email abbinata a un altro fornitore", async () => {
  const offerta = (id: string, allegato_url: string | null, email_inbox_id: string | null): RfqSupplier => ({
    id, rfq_id: "rdo", supplier_id: id, status: "risposta", inviata_at: null, inviata_via: null,
    risposta_at: null, totale_offerto: null, giorni_consegna: null, validita_offerta: null,
    condizioni_pagamento: null, note: null, allegato_url, email_inbox_id, aggancio_da: null,
    aggancio_confidenza: null, aggancio_da_confermare: false, suppliers: { name: id, email: null },
  });
  fake.allegati.mockResolvedValue({
    data: [
      { filename: "preventivo-email.pdf", mime_type: "application/pdf", storage_path: "azienda/mail/offerta.pdf" },
      { filename: "testo.txt", mime_type: "text/plain", storage_path: "azienda/mail/testo.txt" },
    ],
    error: null,
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <OriginaliOfferteDialog companyId="azienda" numero="RDO-01" iniziale="Alfa" onClose={vi.fn()}
        offerte={[offerta("Alfa", "order-attachments/azienda/rdo/alfa.pdf", null), offerta("Beta", null, "mail")]} />
    </QueryClientProvider>,
  );

  const sinistra = within(screen.getByRole("region", { name: "Offerta 1" }));
  const destra = within(screen.getByRole("region", { name: "Offerta 2" }));
  expect(await sinistra.findByTitle("Originale alfa.pdf")).toBeInTheDocument();
  expect(await destra.findByTitle("Originale preventivo-email.pdf")).toBeInTheDocument();
  expect(fake.allegati).toHaveBeenCalledWith("email_attachments", "azienda", "mail");
  expect(fake.firma).toHaveBeenCalledWith("order-attachments", "azienda/rdo/alfa.pdf", 3600);
  expect(fake.firma).toHaveBeenCalledWith("email-attachments", "azienda/mail/offerta.pdf", 3600);
  expect(fake.firma).not.toHaveBeenCalledWith("email-attachments", "azienda/mail/testo.txt", 3600);
  changeFormControl(sinistra.getByLabelText("Offerta 1"), { target: { value: "Beta" } });
  expect(await sinistra.findByTitle("Originale preventivo-email.pdf")).toBeInTheDocument();
  expect(await destra.findByTitle("Originale alfa.pdf")).toBeInTheDocument();
});
