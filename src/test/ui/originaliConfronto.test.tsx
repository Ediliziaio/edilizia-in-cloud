import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const fake = vi.hoisted(() => ({ firma: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
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
  fake.firma.mockImplementation(async (_b: string, p: string) => ({
    data: { signedUrl: `https://files.example.test/${p}` },
    error: null,
  }));
});
describe("originali PDF e foto del confronto", () => {
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
    expect(screen.getByRole("button", { name: "Adatta foto" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Adatta foto" }));
    expect(
      screen.getByRole("button", { name: "Ingrandisci foto" }),
    ).toBeTruthy();
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
    fireEvent.change(screen.getByLabelText("Scegli il file originale"), {
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
