/**
 * Catalogo render (impostazioni): conferma prima di eliminare, correzione di etichetta e categoria, sola lettura,
 * errori che dicono il motivo.
 *
 * - Eliminare partiva dal pulsante, per sempre (riga e file). Ora chiede conferma e, se le regole di accesso non
 *   eliminano niente, lo dice e NON tocca il file (altrimenti restava una riga senza foto, con «Foto eliminata» a schermo).
 * - Per un refuso nell'etichetta si cancellava e si ricaricava: ora si corregge dalla foto.
 * - Chi non ha il permesso «Branding & Template» in modifica vede il catalogo ma non lo cambia, e la pagina dice perché.
 * - I pulsanti della foto non dipendono più dal mouse (prima: `md:opacity-0 md:group-hover:opacity-100`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const stato = vi.hoisted(() => ({
  telefono: false,
  modifica: true,
  assets: [] as Record<string, unknown>[],
  catalogo: { assets: [] as Record<string, unknown>[], urls: {} as Record<string, string>, loading: false, error: null as string | null },
  conferma: vi.fn(async (_opzioni: unknown) => true),
  esito: { data: [{ id: "a1" }] as unknown, error: null as unknown },
  verbo: [] as string[],
  scritture: [] as { verbo: string; valore: unknown; id: unknown }[],
  rimossi: [] as string[][],
  upload: vi.fn(),
  success: vi.fn(), error: vi.fn(), info: vi.fn(),
  azienda: { id: "company-1" },
  utente: { id: "user-1" },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: stato.azienda, user: stato.utente }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => stato.telefono }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditSettingsCustomization: stato.modifica }) }));
vi.mock("@/hooks/useRenderCatalogAssets", () => ({ useRenderCatalogAssets: () => stato.catalogo }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => stato.conferma }));
vi.mock("sonner", () => ({ toast: { success: stato.success, error: stato.error, info: stato.info } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      let verbo = "select";
      let valore: unknown = null;
      let id: unknown = null;
      const b: Record<string, unknown> = {};
      b.update = (v: unknown) => { verbo = "update"; valore = v; return b; };
      b.delete = () => { verbo = "delete"; return b; };
      b.eq = (_colonna: string, v: unknown) => { id = v; return b; };
      b.select = () => b;
      b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => {
        stato.scritture.push({ verbo, valore, id });
        return Promise.resolve(stato.esito).then(ok, ko);
      };
      return b;
    },
    storage: { from: () => ({ remove: async (percorsi: string[]) => { stato.rimossi.push(percorsi); return { error: null as unknown }; } }) },
  },
}));
vi.mock("@/lib/render/renderCatalog", async (importOriginal) => {
  const originale = await importOriginal<typeof import("@/lib/render/renderCatalog")>();
  return { ...originale, uploadRenderCatalogAsset: (...args: unknown[]) => stato.upload(...args) };
});

import SettingsCatalogoRender from "@/pages/azienda/settings/SettingsCatalogoRender";
import { MessaggioPerUtente } from "@/lib/impostazioni/erroriPerUtente";

const LAVABO = {
  id: "a1", company_id: "company-1", verticale: "bagno", categoria: "lavabo", etichetta: "Lavabo rovere",
  descrizione: null as string | null, storage_path: "company-1/a1.jpg", larghezza: 800, altezza: 800, bytes: 1000, attivo: true, created_at: "2026-10-01T00:00:00Z",
};

const imposta = (assets: Record<string, unknown>[]) => {
  stato.catalogo = { assets, urls: Object.fromEntries(assets.map((a) => [a.storage_path as string, `https://x/${a.id}.jpg`])), loading: false, error: null };
};

beforeEach(() => {
  stato.telefono = false; stato.modifica = true;
  imposta([LAVABO]);
  stato.conferma.mockReset(); stato.conferma.mockResolvedValue(true);
  stato.esito = { data: [{ id: "a1" }], error: null };
  stato.scritture.length = 0; stato.rimossi.length = 0;
  stato.upload.mockReset();
  stato.success.mockClear(); stato.error.mockClear(); stato.info.mockClear();
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  URL.createObjectURL = () => "blob:anteprima";
  URL.revokeObjectURL = () => {};
});
afterEach(cleanup);

describe("Catalogo render: sola lettura", () => {
  it("senza il permesso in modifica si vede il catalogo e il perché non si cambia", () => {
    stato.modifica = false;
    render(<SettingsCatalogoRender />);
    expect(screen.getByText(/Stai consultando il catalogo: lo cambia chi ha il permesso «Branding & Template» in modifica\./)).toBeInTheDocument();
    expect(screen.getByText("Lavabo rovere")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Carica foto/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Modifica «/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Elimina «/ })).toBeNull();
  });

  it("senza il permesso un catalogo vuoto non invita a caricare", () => {
    stato.modifica = false;
    imposta([]);
    render(<SettingsCatalogoRender />);
    expect(screen.getByText(/Nessuna foto per bagno\./)).toBeInTheDocument();
    expect(screen.queryByText(/Tocca per caricare/)).toBeNull();
  });

  it("con il permesso: nessun avviso, «Carica foto» e i pulsanti di ogni foto, sempre visibili", () => {
    render(<SettingsCatalogoRender />);
    expect(screen.queryByText(/Stai consultando/)).toBeNull();
    expect(screen.getByRole("button", { name: /Carica foto/ })).toBeInTheDocument();
    const modifica = screen.getByRole("button", { name: "Modifica «Lavabo rovere»" });
    const elimina = screen.getByRole("button", { name: "Elimina «Lavabo rovere»" });
    // Prima comparivano solo passando il mouse: `md:opacity-0 md:group-hover:opacity-100`.
    for (const bottone of [modifica, elimina]) expect(bottone.className).not.toMatch(/opacity-0/);
  });

  it("il testo dice «Quando prepari un render», non «wizard»", () => {
    render(<SettingsCatalogoRender />);
    expect(screen.getByText(/Quando prepari un render potrai sceglierne fino a 4/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/wizard/i);
  });
});

describe("Catalogo render: eliminare", () => {
  it("chiede conferma con il nome della foto, poi elimina riga e file e lo dice", async () => {
    render(<SettingsCatalogoRender />);
    fireEvent.click(screen.getByRole("button", { name: "Elimina «Lavabo rovere»" }));
    await waitFor(() => expect(stato.success).toHaveBeenCalledWith("Foto eliminata"));
    expect(stato.conferma).toHaveBeenCalledTimes(1);
    const opzioni = stato.conferma.mock.calls[0][0] as { title: string; description: string; confirmLabel: string };
    expect(opzioni.title).toBe("Eliminare «Lavabo rovere» dal catalogo?");
    expect(opzioni.description).toMatch(/Non si può annullare/);
    expect(opzioni.confirmLabel).toBe("Elimina");
    expect(stato.scritture).toEqual([{ verbo: "delete", valore: null, id: "a1" }]);
    expect(stato.rimossi).toEqual([["company-1/a1.jpg"]]);
  });

  it("se si risponde di no non succede niente", async () => {
    stato.conferma.mockResolvedValue(false);
    render(<SettingsCatalogoRender />);
    fireEvent.click(screen.getByRole("button", { name: "Elimina «Lavabo rovere»" }));
    await waitFor(() => expect(stato.conferma).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(stato.scritture).toHaveLength(0);
    expect(stato.rimossi).toHaveLength(0);
    expect(stato.success).not.toHaveBeenCalled();
    expect(stato.error).not.toHaveBeenCalled();
  });

  it("se le regole di accesso non eliminano niente: non dice «eliminata» e il file resta dov'è", async () => {
    stato.esito = { data: [], error: null };
    render(<SettingsCatalogoRender />);
    fireEvent.click(screen.getByRole("button", { name: "Elimina «Lavabo rovere»" }));
    await waitFor(() => expect(stato.error).toHaveBeenCalledOnce());
    expect(stato.error).toHaveBeenCalledWith("Non sono riuscito a eliminare «Lavabo rovere»", { description: "Non hai il permesso di eliminare questa foto." });
    expect(stato.success).not.toHaveBeenCalled();
    expect(stato.rimossi).toHaveLength(0);
  });

  it("un rifiuto del database si traduce e anche allora il file non si tocca", async () => {
    stato.esito = { data: null, error: { code: "42501", message: "permission denied for table render_catalog_assets" } };
    render(<SettingsCatalogoRender />);
    fireEvent.click(screen.getByRole("button", { name: "Elimina «Lavabo rovere»" }));
    await waitFor(() => expect(stato.error).toHaveBeenCalledOnce());
    expect(stato.error).toHaveBeenCalledWith("Non sono riuscito a eliminare «Lavabo rovere»", { description: "Non hai i permessi per questa operazione. Contatta l'amministratore." });
    expect(stato.rimossi).toHaveLength(0);
  });
});

describe("Catalogo render: correggere etichetta e categoria", () => {
  const apriFinestra = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Modifica «Lavabo rovere»" }));
    return screen.findByRole("dialog");
  };

  it("si apre con i dati della foto e salva l'etichetta corretta senza ricaricare la foto", async () => {
    render(<SettingsCatalogoRender />);
    const finestra = await apriFinestra();
    expect(within(finestra).getByText("Modifica la foto")).toBeInTheDocument();
    const etichetta = within(finestra).getByLabelText(/Etichetta/);
    expect(etichetta).toHaveValue("Lavabo rovere");
    expect(within(finestra).getByLabelText("Categoria")).toHaveTextContent("Lavabo");
    fireEvent.change(etichetta, { target: { value: "  Lavabo rovere 60 cm " } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(stato.success).toHaveBeenCalledWith("Foto aggiornata"));
    expect(stato.scritture).toEqual([{ verbo: "update", valore: { etichetta: "Lavabo rovere 60 cm", categoria: "lavabo" }, id: "a1" }]);
    expect(stato.rimossi).toHaveLength(0);
  });

  it("con l'etichetta vuota «Salva» è spento", async () => {
    render(<SettingsCatalogoRender />);
    const finestra = await apriFinestra();
    fireEvent.change(within(finestra).getByLabelText(/Etichetta/), { target: { value: "   " } });
    expect(within(finestra).getByRole("button", { name: "Salva" })).toBeDisabled();
  });

  it("se le regole di accesso non toccano niente lo dice, e la finestra resta aperta", async () => {
    stato.esito = { data: [], error: null };
    render(<SettingsCatalogoRender />);
    const finestra = await apriFinestra();
    fireEvent.change(within(finestra).getByLabelText(/Etichetta/), { target: { value: "Lavabo rovere 60 cm" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(stato.error).toHaveBeenCalledOnce());
    expect(stato.error).toHaveBeenCalledWith("Non sono riuscito ad aggiornare «Lavabo rovere»", { description: "Non hai il permesso di modificare questa foto." });
    expect(stato.success).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("Catalogo render: caricare", () => {
  const scegli = (nomi: string[]) => {
    const campo = document.querySelector('input[type="file"]') as HTMLInputElement;
    const files = nomi.map((n) => new File(["x"], n, { type: "image/jpeg" }));
    fireEvent.change(campo, { target: { files } });
  };

  it("ogni foto ha la sua etichetta, già scritta dal nome del file, con il campo collegato", async () => {
    render(<SettingsCatalogoRender />);
    scegli(["lavabo_sospeso-60.jpg", "specchio rotondo.jpg"]);
    const finestra = await screen.findByRole("dialog");
    expect(within(finestra).getByText("2 nuove foto prodotto · Bagno")).toBeInTheDocument();
    const campi = within(finestra).getAllByLabelText(/Etichetta/);
    expect(campi.map((c) => (c as HTMLInputElement).value)).toEqual(["lavabo sospeso 60", "specchio rotondo"]);
    expect(within(finestra).getByLabelText("Categoria di lavabo sospeso 60")).toBeInTheDocument();
  });

  it("tutto riuscito: un solo messaggio", async () => {
    stato.upload.mockResolvedValue({});
    render(<SettingsCatalogoRender />);
    scegli(["a.jpg", "b.jpg"]);
    fireEvent.click(await screen.findByRole("button", { name: "Salva nel catalogo" }));
    await waitFor(() => expect(stato.success).toHaveBeenCalledWith("2 foto aggiunte al catalogo"));
    expect(stato.success).toHaveBeenCalledTimes(1);
    expect(stato.error).not.toHaveBeenCalled();
  });

  it("una foto no: un solo messaggio che dice quale e perché (traducendo il testo del server)", async () => {
    stato.upload.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("The resource already exists"));
    render(<SettingsCatalogoRender />);
    scegli(["a.jpg", "b.jpg"]);
    fireEvent.click(await screen.findByRole("button", { name: "Salva nel catalogo" }));
    await waitFor(() => expect(stato.error).toHaveBeenCalledOnce());
    expect(stato.error).toHaveBeenCalledWith("Aggiunte 1 foto su 2", { description: "b.jpg: Esiste già un elemento con questi dati. Controlla e riprova." });
    expect(stato.success).not.toHaveBeenCalled();
  });

  it("le frasi già pronte (formato, peso) si leggono così come sono", async () => {
    stato.upload.mockRejectedValue(new MessaggioPerUtente("Formato non supportato: usa JPG, PNG o WebP"));
    render(<SettingsCatalogoRender />);
    scegli(["c.jpg"]);
    fireEvent.click(await screen.findByRole("button", { name: "Salva nel catalogo" }));
    await waitFor(() => expect(stato.error).toHaveBeenCalledOnce());
    expect(stato.error).toHaveBeenCalledWith("Non sono riuscito a caricare c.jpg", { description: "c.jpg: Formato non supportato: usa JPG, PNG o WebP" });
  });

  it("oltre 20 foto: si dice che ne ho prese 20", async () => {
    render(<SettingsCatalogoRender />);
    scegli(Array.from({ length: 23 }, (_, i) => `f${i}.jpg`));
    expect(await screen.findByText("20 nuove foto prodotto · Bagno")).toBeInTheDocument();
    expect(stato.info).toHaveBeenCalledWith("Ho preso le prime 20 foto: le altre caricale dopo.");
  });
});

describe("Catalogo render: lettura che fallisce e nomi dei comandi", () => {
  it("se il catalogo non si legge dice una frase sola, con «Riprova», non il testo grezzo", () => {
    stato.catalogo = { assets: [], urls: {}, loading: false, error: "FetchError: boom" };
    render(<SettingsCatalogoRender />);
    expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a leggere il catalogo.");
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/boom/);
  });

  it("i comandi hanno il nome: tipo di prodotto e filtro per categoria", () => {
    render(<SettingsCatalogoRender />);
    const gruppo = screen.getByRole("group", { name: "Tipo di prodotto" });
    expect(within(gruppo).getByRole("button", { name: "Bagno" })).toHaveAttribute("aria-pressed", "true");
    expect(within(gruppo).getByRole("button", { name: "Pavimenti" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Filtra per categoria")).toBeInTheDocument();
  });

  it("da telefono il tipo di prodotto è un elenco con il suo nome", () => {
    stato.telefono = true;
    render(<SettingsCatalogoRender />);
    expect(screen.getByLabelText("Tipo di prodotto")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Tipo di prodotto" })).toBeNull();
  });

  it("cambiando tipo di prodotto il filtro per categoria riparte da «Tutte le categorie»", async () => {
    render(<SettingsCatalogoRender />);
    const filtro = screen.getByLabelText("Filtra per categoria");
    fireEvent.pointerDown(filtro, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(await screen.findByRole("option", { name: "Lavabo" }));
    await waitFor(() => expect(screen.getByLabelText("Filtra per categoria")).toHaveTextContent("Lavabo"));
    // Nel nuovo tipo di prodotto quella categoria non c'è: il filtro non deve restare lì, con un elenco vuoto per un motivo che non si vede.
    fireEvent.click(screen.getByRole("button", { name: "Pavimenti" }));
    expect(screen.getByRole("button", { name: "Pavimenti" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Filtra per categoria")).toHaveTextContent("Tutte le categorie");
  });
});

describe("Catalogo render (libreria): le frasi di validazione sono già per chi legge", () => {
  const base = { companyId: "company-1", userId: "user-1", verticale: "bagno" as const, categoria: "lavabo", etichetta: "Lavabo" };

  it("formato, peso ed etichetta mancanti arrivano come MessaggioPerUtente, da mostrare così come sono", async () => {
    const { uploadRenderCatalogAsset } = await vi.importActual<typeof import("@/lib/render/renderCatalog")>("@/lib/render/renderCatalog");
    const gif = new File(["x"], "a.gif", { type: "image/gif" });
    await expect(uploadRenderCatalogAsset({ ...base, file: gif })).rejects.toMatchObject({
      name: "MessaggioPerUtente", message: "Formato non supportato: usa JPG, PNG o WebP",
    });
    const enorme = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "b.jpg", { type: "image/jpeg" });
    await expect(uploadRenderCatalogAsset({ ...base, file: enorme })).rejects.toMatchObject({
      name: "MessaggioPerUtente", message: "File troppo grande: al massimo 10 MB",
    });
    const buona = new File(["x"], "c.jpg", { type: "image/jpeg" });
    await expect(uploadRenderCatalogAsset({ ...base, file: buona, etichetta: "   " })).rejects.toMatchObject({
      name: "MessaggioPerUtente", message: "Inserisci un'etichetta per la foto",
    });
  });
});
