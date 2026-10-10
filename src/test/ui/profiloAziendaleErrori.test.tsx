/**
 * Profilo aziendale: il salvataggio dice come è andata (09/10/2026).
 *
 * - Una partita IVA sbagliata la rifiuta il database, e scrive già in italiano cosa non va: la pagina buttava via il
 *   motivo e diceva «Impossibile aggiornare i dati aziendali».
 * - Logo, bonus e portale clienti non controllavano che l'aggiornamento avesse toccato una riga: con le regole di
 *   accesso che non bastano (chi ha il permesso «Profilo aziendale» ma non quello generale delle impostazioni) il
 *   database non dà errore e non cambia niente, e la pagina diceva «Logo caricato» / «Bonus … attivati» lo stesso.
 * - Il logo: i file vecchi si cancellano solo dopo che il database ha accettato il nuovo indirizzo (prima per primi:
 *   un rifiuto lasciava un logo che puntava a un file sparito).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CompanyProfileForm } from "@/components/settings/CompanyProfileForm";
import { LogoUploader } from "@/components/settings/LogoUploader";
import { BonusFiscaliToggles } from "@/components/settings/BonusFiscaliToggles";
import { CustomerPortalToggle } from "@/components/settings/CustomerPortalToggle";

const stato = vi.hoisted(() => ({
  azienda: { id: "az-1", name: "Rossi", email: "info@rossi.it", sector: "altro", business_name: "Rossi S.r.l.", vat_number: "01234567897", phone: "123", logo_url: "https://x/vecchio.png", bonus_multipli_enabled: false, blocca_prezzo_enabled: true, customer_portal_enabled: false } as Record<string, unknown>,
  righe: [{ id: "az-1" }] as { id: string }[],
  rifiuto: null as { code?: string; message: string } | null,
  ordine: [] as string[],
  rimossi: [] as string[][],
  nelloStorage: [{ name: "logo.png" }, { name: "logo.webp" }] as { name: string }[],
  aggiornamenti: [] as Record<string, unknown>[],
  aggiornato: vi.fn(async (_url?: string | null): Promise<void> => {}),
  toastSonner: { success: vi.fn(), error: vi.fn() },
  toastShadcn: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: stato.azienda, refreshAuth: async (): Promise<void> => {}, userRoles: ["super_admin"] }),
}));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => async () => true }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: stato.toastShadcn }) }));
vi.mock("sonner", () => ({ toast: stato.toastSonner }));
vi.mock("@/lib/geocoding", () => ({ forwardGeocode: async (): Promise<null> => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: async () => { stato.ordine.push("upload"); return { error: null as unknown }; },
        getPublicUrl: () => ({ data: { publicUrl: "https://x/az-1/logo.png" } }),
        list: async () => { stato.ordine.push("list"); return { data: stato.nelloStorage }; },
        remove: async (percorsi: string[]) => { stato.ordine.push("remove"); stato.rimossi.push(percorsi); return {}; },
      }),
    },
    from: () => {
      const costruttore = {
        select: () => costruttore,
        eq: () => costruttore,
        maybeSingle: async () => ({ data: { order_code_prefix: "O" }, error: null as unknown }),
        update: (valore: Record<string, unknown>) => { stato.ordine.push("update"); stato.aggiornamenti.push(valore); return costruttore; },
        // il modulo dei dati chiede una riga sola: zero righe = PGRST116
        single: async () => (stato.rifiuto
          ? { data: null as unknown, error: stato.rifiuto }
          : stato.righe.length === 0
            ? { data: null as unknown, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } }
            : { data: stato.righe[0], error: null as unknown }),
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
          Promise.resolve({ data: stato.rifiuto ? (null as unknown) : stato.righe, error: stato.rifiuto }).then(ok, ko),
      };
      return costruttore;
    },
  },
}));

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  stato.righe = [{ id: "az-1" }];
  stato.rifiuto = null;
  stato.ordine.length = 0;
  stato.rimossi.length = 0;
  stato.nelloStorage = [{ name: "logo.png" }, { name: "logo.webp" }];
  stato.aggiornamenti.length = 0;
  stato.aggiornato.mockClear();
  stato.toastSonner.success.mockClear();
  stato.toastSonner.error.mockClear();
  stato.toastShadcn.mockClear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function modificaTelefonoESalva() {
  render(<CompanyProfileForm />);
  await waitFor(() => expect(screen.getByLabelText(/Prefisso del codice commessa/)).toHaveValue("O"));
  fireEvent.change(screen.getByLabelText("Telefono"), { target: { value: "456" } });
  fireEvent.click(screen.getByRole("button", { name: "Salva dati aziendali" }));
}

describe("Dati aziendali: il motivo del rifiuto", () => {
  it("una partita IVA sbagliata dice cosa non va, con le parole del database", async () => {
    const motivo = "Partita IVA non valida: \"123\". Devono essere 11 cifre e l'ultima è di controllo: ricontrolla il numero.";
    stato.rifiuto = { code: "23514", message: motivo };
    await modificaTelefonoESalva();
    await waitFor(() => expect(stato.toastSonner.error).toHaveBeenCalledOnce());
    expect(stato.toastSonner.error.mock.calls[0]).toEqual(["Dati non salvati", { description: motivo }]);
    expect(screen.getByRole("status")).toHaveTextContent("Modifiche non salvate");
    expect(stato.toastSonner.success).not.toHaveBeenCalled();
  });

  it("un permesso che manca si dice come permesso, non come «impossibile aggiornare»", async () => {
    stato.rifiuto = { code: "42501", message: "permission denied for table companies" };
    await modificaTelefonoESalva();
    await waitFor(() => expect(stato.toastSonner.error).toHaveBeenCalledOnce());
    expect(stato.toastSonner.error.mock.calls[0][1]).toEqual({ description: "Non hai i permessi per questa operazione. Contatta l'amministratore." });
  });

  it("se le regole di accesso non lasciano toccare la riga lo dice chiaro", async () => {
    stato.righe = [];
    await modificaTelefonoESalva();
    await waitFor(() => expect(stato.toastSonner.error).toHaveBeenCalledOnce());
    expect(stato.toastSonner.error.mock.calls[0][1]).toEqual({ description: "Il tuo utente non può modificare i dati dell'azienda: chiedi a un amministratore." });
    expect(stato.toastSonner.success).not.toHaveBeenCalled();
  });

  it("senza rete dice di controllare la connessione", async () => {
    stato.rifiuto = { message: "TypeError: Failed to fetch" };
    await modificaTelefonoESalva();
    await waitFor(() => expect(stato.toastSonner.error).toHaveBeenCalledOnce());
    expect(stato.toastSonner.error.mock.calls[0][1]).toEqual({ description: "Connessione persa. Controlla la rete e riprova." });
  });
});

describe("Logo", () => {
  const scegli = (nome = "nuovo-logo.png") => {
    render(<LogoUploader company={stato.azienda as never} onLogoUpdated={stato.aggiornato} />);
    fireEvent.change(screen.getByLabelText("Scegli il file del logo"), { target: { files: [new File(["x"], nome, { type: "image/png" })] } });
  };

  it("carica, fa accettare l'indirizzo al database e SOLO DOPO cancella i file con un'altra estensione", async () => {
    scegli();
    await waitFor(() => expect(stato.toastSonner.success).toHaveBeenCalledOnce());
    expect(stato.ordine).toEqual(["upload", "update", "list", "remove"]);
    // il file appena caricato (logo.png) non si cancella; quello vecchio con un'altra estensione sì
    expect(stato.rimossi).toEqual([["az-1/logo.webp"]]);
    expect(stato.aggiornato).toHaveBeenCalledOnce();
  });

  it("se il database non tocca la riga non dice «Logo caricato» e non cancella niente", async () => {
    stato.righe = [];
    scegli();
    await waitFor(() => expect(stato.toastSonner.error).toHaveBeenCalledOnce());
    expect(stato.toastSonner.error.mock.calls[0]).toEqual(["Logo non caricato", { description: "Il tuo utente non può modificare i dati dell'azienda: chiedi a un amministratore." }]);
    expect(stato.toastSonner.success).not.toHaveBeenCalled();
    expect(stato.ordine).toEqual(["upload", "update"]);
    expect(stato.rimossi).toHaveLength(0);
    expect(stato.aggiornato).not.toHaveBeenCalled();
  });

  it("un rifiuto del database dice il motivo", async () => {
    stato.rifiuto = { code: "42501", message: "new row violates row-level security policy for table \"companies\"" };
    scegli();
    await waitFor(() => expect(stato.toastSonner.error).toHaveBeenCalledOnce());
    expect(stato.toastSonner.error.mock.calls[0][1]).toEqual({ description: "Non hai i permessi per questa operazione. Contatta l'amministratore." });
  });

  it("rimuovere il logo: prima il database, poi i file; se il database rifiuta i file restano", async () => {
    render(<LogoUploader company={stato.azienda as never} onLogoUpdated={stato.aggiornato} />);
    fireEvent.click(screen.getByRole("button", { name: /Rimuovi/ }));
    await waitFor(() => expect(stato.toastSonner.success).toHaveBeenCalledOnce());
    expect(stato.ordine).toEqual(["update", "list", "remove"]);
    expect(stato.aggiornamenti[0]).toEqual({ logo_url: null });
    expect(stato.rimossi).toEqual([["az-1/logo.png", "az-1/logo.webp"]]);
    expect(stato.aggiornato).toHaveBeenCalledWith(null);
  });

  it("rimuovere senza permesso non cancella i file e non dice «Logo rimosso»", async () => {
    stato.righe = [];
    render(<LogoUploader company={stato.azienda as never} onLogoUpdated={stato.aggiornato} />);
    fireEvent.click(screen.getByRole("button", { name: /Rimuovi/ }));
    await waitFor(() => expect(stato.toastSonner.error).toHaveBeenCalledOnce());
    expect(stato.ordine).toEqual(["update"]);
    expect(stato.rimossi).toHaveLength(0);
    expect(stato.toastSonner.success).not.toHaveBeenCalled();
  });

  it("parla italiano: «Carica logo», «Cambia logo», e il logo di serie è «Finché non carichi il tuo»", () => {
    const { rerender } = render(<LogoUploader company={{ ...stato.azienda, logo_url: null } as never} onLogoUpdated={stato.aggiornato} />);
    expect(screen.getByRole("button", { name: "Carica logo" })).toBeInTheDocument();
    expect(screen.getByText("Finché non carichi il tuo, si usa questo:")).toBeInTheDocument();
    expect(screen.queryByText(/Fallback/)).toBeNull();
    rerender(<LogoUploader company={stato.azienda as never} onLogoUpdated={stato.aggiornato} />);
    expect(screen.getByRole("button", { name: "Cambia logo" })).toBeInTheDocument();
  });
});

describe("Bonus edilizi e portale clienti", () => {
  it("accendere i bonus multipli scrive soltanto quella colonna e lo dice", async () => {
    render(<BonusFiscaliToggles />);
    fireEvent.click(screen.getByRole("switch", { name: "Bonus edilizi multipli" }));
    await waitFor(() => expect(stato.toastShadcn).toHaveBeenCalledWith({ title: "Bonus edilizi multipli attivati" }));
    expect(stato.aggiornamenti).toEqual([{ bonus_multipli_enabled: true }]);
  });

  it("senza permesso non dice «attivati»: dice perché, e l'interruttore torna com'era", async () => {
    stato.righe = [];
    render(<BonusFiscaliToggles />);
    fireEvent.click(screen.getByRole("switch", { name: "Bonus edilizi multipli" }));
    await waitFor(() => expect(stato.toastShadcn).toHaveBeenCalled());
    expect(stato.toastShadcn.mock.calls[0][0]).toEqual({ title: "Non salvato", description: "Il tuo utente non può modificare i dati dell'azienda: chiedi a un amministratore.", variant: "destructive" });
    await waitFor(() => expect(screen.getByRole("switch", { name: "Bonus edilizi multipli" })).not.toBeChecked());
  });

  it("anche «Blocca prezzo» torna com'era se il database non lo accetta", async () => {
    stato.rifiuto = { code: "42501", message: "permission denied for table companies" };
    render(<BonusFiscaliToggles />);
    expect(screen.getByRole("switch", { name: "Blocca prezzo" })).toBeChecked();
    fireEvent.click(screen.getByRole("switch", { name: "Blocca prezzo" }));
    await waitFor(() => expect(stato.toastShadcn).toHaveBeenCalled());
    expect(stato.toastShadcn.mock.calls[0][0]).toMatchObject({ title: "Non salvato", variant: "destructive" });
    await waitFor(() => expect(screen.getByRole("switch", { name: "Blocca prezzo" })).toBeChecked());
  });

  it("il super admin accende il portale; se il database non tocca la riga il portale resta spento", async () => {
    stato.righe = [];
    render(<CustomerPortalToggle />);
    fireEvent.click(screen.getByRole("switch", { name: "Area privata clienti" }));
    await waitFor(() => expect(stato.toastShadcn).toHaveBeenCalled());
    expect(stato.toastShadcn.mock.calls[0][0]).toMatchObject({ title: "Non salvato", variant: "destructive" });
    await waitFor(() => expect(screen.getByRole("switch", { name: "Area privata clienti" })).not.toBeChecked());
  });
});
