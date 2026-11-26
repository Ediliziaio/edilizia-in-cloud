import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  nativo: true, disponibile: true, scan: vi.fn(), recognizePage: vi.fn(), readFile: vi.fn(), rmdir: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => mock.nativo, isPluginAvailable: () => mock.disponibile },
  registerPlugin: () => ({ scan: mock.scan, recognizePage: mock.recognizePage }),
}));
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Cache: "CACHE" },
  Filesystem: { readFile: mock.readFile, rmdir: mock.rmdir },
}));
import { leggiScansioneBolla, scannerBolleDisponibile, scansionaBolla } from "@/lib/mobile/scannerBolle";

const id = "00000000-0000-4000-8000-000000000014";
beforeEach(() => {
  mock.nativo = true;
  mock.disponibile = true;
  mock.scan.mockReset().mockResolvedValue({ scanId: id, pageCount: 2 });
  mock.readFile.mockReset().mockResolvedValue({ data: "Zm90bw==" });
  mock.recognizePage.mockReset().mockResolvedValue({ text: "DDT n. 42" });
  mock.rmdir.mockReset().mockResolvedValue(undefined);
});

describe("Scanner DDT e cache del telefono", () => {
  it("abilita lo scanner solo nelle app installate che lo includono", () => {
    expect(scannerBolleDisponibile()).toBe(true);
    mock.disponibile = false;
    expect(scannerBolleDisponibile()).toBe(false);
    mock.disponibile = true;
    mock.nativo = false;
    expect(scannerBolleDisponibile()).toBe(false);
  });

  it("mantiene in ordine le pagine e libera la cache dopo la lettura anche se una pagina è illeggibile", async () => {
    const scansione = await scansionaBolla(2, 20);
    expect(mock.scan).toHaveBeenCalledWith({ pageLimit: 2, byteBudget: 20 });
    expect(scansione?.pagine.map(p => p.file.name)).toEqual(["pagina-1.jpg", "pagina-2.jpg"]);
    expect(new TextDecoder().decode(scansione!.pagine[0].byte)).toBe("foto");
    expect(mock.rmdir).not.toHaveBeenCalled();
    mock.recognizePage.mockRejectedValueOnce(new Error("Testo illeggibile"));
    expect((await leggiScansioneBolla(scansione!)).map(p => p.testo)).toEqual(["", "DDT n. 42"]);
    expect(mock.rmdir).toHaveBeenCalledWith({ path: `scanner-ddt/${id}`, directory: "CACHE", recursive: true });
  });

  it("annulla senza leggere i file e rimuove le copie incomplete se il lotto eccede il limite", async () => {
    mock.scan.mockResolvedValueOnce({ cancelled: true });
    await expect(scansionaBolla(2, 20)).resolves.toBeNull();
    expect(mock.readFile).not.toHaveBeenCalled();
    await expect(scansionaBolla(2, 7)).rejects.toThrow(/troppo grande|spazio disponibile/);
    expect(mock.rmdir).toHaveBeenCalledOnce();
  });

  it("non si fida di quello che risponde il plugin: id e numero di pagine fuori contratto", async () => {
    mock.scan.mockResolvedValueOnce({ scanId: "../../etc/passwd", pageCount: 1 });
    await expect(scansionaBolla(2, 20)).rejects.toThrow(/non disponibile/);
    mock.scan.mockResolvedValueOnce({ scanId: id, pageCount: 99 });
    await expect(scansionaBolla(2, 20)).rejects.toThrow(/pagine/);
    expect(mock.readFile).not.toHaveBeenCalled();
    mock.scan.mockResolvedValueOnce({ scanId: id, pageCount: 1 });
    mock.readFile.mockResolvedValueOnce({ data: "" });
    await expect(scansionaBolla(2, 20)).rejects.toThrow(/vuota|troppo grande/);
  });
});
