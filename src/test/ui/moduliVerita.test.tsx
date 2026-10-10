/**
 * Moduli contatto del sito (ex «Form & UTM»): la scelta che decide viene per prima, e le parole sono di tutti i giorni (10/10/2026).
 *
 * Prima il pannello del modulo si apriva su «Aspetto» (colori, font, larghezza) e a chi va il contatto, in quale pipeline e fase,
 * con quali tag stava nella scheda «Impostazioni», sotto «Email notifica» e «URL redirect»; nessuna etichetta era collegata al suo
 * campo; i campi nella tela erano caselle cliccabili che da tastiera non si potevano scegliere; sul telefono al nome del modulo
 * restavano ~95 px; «Salva modifiche» stava in cima e nell'editor lungo usciva dallo schermo; le modifiche non salvate si perdevano
 * uscendo dal menu; la scheda «Tracking UTM» era una pila di quattro riquadri con dodici parametri tecnici.
 * «Email notifica» NON si è tolta (decisione di Florin) ma la pagina dice che non fa partire nessuna email.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Riga = Record<string, unknown>;

const stato = vi.hoisted(() => ({
  forms: [] as Array<Record<string, unknown>>,
  admin: true,
  modifica: true,
  errore: false,
  crea: vi.fn(),
  salva: vi.fn(),
  elimina: vi.fn(),
  pubblica: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ isAdmin: stato.admin, canEditSettingsCustomization: stato.modifica }),
}));
vi.mock("@/hooks/useOpportunitiesData", () => ({ useCompanyCallCenterUsers: () => ({ data: [{ id: "cc1", name: "Call center Nord" }] }) }));
vi.mock("@/hooks/useFormBuilder", async () => {
  const React = await import("react");
  return {
    useFormBuilder: () => {
      const [editingForm, setEditingForm] = React.useState<Record<string, unknown> | null>(null);
      return {
        forms: stato.forms,
        isLoading: false,
        isError: stato.errore,
        error: stato.errore ? new Error("Failed to fetch") : null,
        refetch: vi.fn(),
        editingForm,
        setEditingForm,
        createForm: { mutateAsync: stato.crea, isPending: false },
        updateForm: { mutateAsync: stato.salva, isPending: false },
        deleteForm: { mutateAsync: stato.elimina },
        togglePublish: stato.pubblica,
      };
    },
  };
});
vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string): unknown => {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, metodo: string) {
          if (metodo === "then") {
            return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => {
              const dati: Record<string, unknown[]> = {
                marketing_pipelines: [{ id: "p1", name: "Vendita edile", marketing_pipeline_stages: [{ id: "s1", name: "Nuovo", position: 0 }, { id: "s2", name: "Sopralluogo", position: 1 }] }],
                profiles: [{ id: "u1", first_name: "Mario", last_name: "Rossi", email: "mario@esempio.it" }],
                marketing_tags: [{ id: "t1", name: "Sito", color: null }, { id: "t2", name: "Preventivo", color: null }],
              };
              return Promise.resolve({ data: dati[tabella] ?? [], error: null as unknown }).then(ok, ko);
            };
          }
          return () => proxy;
        },
      },
    );
    return proxy;
  };
  return { supabase: { from: (tabella: string) => catena(tabella) } };
});

import SettingsFormBuilder from "@/pages/azienda/settings/SettingsFormBuilder";
import { confermaNavigazioneImpostazioni } from "@/hooks/useSettingsDraftGuard";

const modulo = (extra: Riga = {}): Riga => ({
  id: "m1",
  company_id: "azienda-1",
  name: "Richiesta preventivo",
  slug: "richiesta-preventivo",
  description: null as unknown,
  fields: [
    { id: "f1", name: "email", label: "Email", type: "email", required: true, placeholder: "" },
    { id: "f2", name: "nome", label: "Nome", type: "text", required: false, placeholder: "" },
  ],
  theme: {},
  settings: {},
  is_published: true,
  total_views: 120,
  total_submissions: 7,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-02T10:00:00Z",
  ...extra,
});

function monta() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SettingsFormBuilder />
    </QueryClientProvider>,
  );
}
async function apriEditor(nome = "Richiesta preventivo") {
  monta();
  // Chi non può modificare il modulo lo guarda (stesso pulsante, nome diverso).
  const verbo = stato.admin || stato.modifica ? "Modifica" : "Guarda";
  fireEvent.click(await screen.findByRole("button", { name: `${verbo} il modulo «${nome}»` }));
  return screen.findByRole("tab", { name: "Dopo l'invio" });
}

beforeEach(() => {
  stato.forms = [modulo()];
  stato.admin = true;
  stato.modifica = true;
  stato.errore = false;
  stato.crea.mockReset();
  stato.salva.mockReset();
  stato.elimina.mockReset();
  stato.pubblica.mockReset();
  window.sessionStorage.clear();
});
afterEach(() => cleanup());

describe("l'elenco dei moduli", () => {
  it("schede «Moduli» e «Da dove arrivano i contatti» (non «Form Builder» e «Tracking UTM»)", async () => {
    monta();
    await screen.findByText("Richiesta preventivo");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Moduli", "Da dove arrivano i contatti"]);
    expect(screen.getByRole("heading", { name: "I tuoi moduli" })).toBeTruthy();
    expect(screen.getByText("Chi compila un modulo diventa un contatto nel CRM.")).toBeTruthy();
    expect(screen.queryByText(/Form di acquisizione lead|Form Builder|Tracking UTM/)).toBeNull();
    expect(screen.getByRole("button", { name: "Nuovo modulo" })).toBeTruthy();
  });

  it("senza moduli invita a crearne uno", async () => {
    stato.forms = [];
    monta();
    expect(await screen.findByText(/Nessun modulo creato\. Crea il primo/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Crea un modulo" })).toBeTruthy();
  });

  it("la riga: sul telefono le azioni stanno sotto il nome; ogni pulsante ha un nome e un bersaglio da 44 px", async () => {
    monta();
    await screen.findByText("Richiesta preventivo");
    const riga = screen.getByText("Richiesta preventivo").closest("div.flex-col") as HTMLElement;
    expect(riga.className).toMatch(/sm:flex-row/);
    for (const nome of [
      "Modifica il modulo «Richiesta preventivo»",
      "Elimina il modulo «Richiesta preventivo»",
      "Apri il modulo «Richiesta preventivo»",
      "Copia il link di «Richiesta preventivo»",
    ]) {
      const pulsante = screen.getByRole("button", { name: nome });
      expect(pulsante.className, nome).toMatch(/h-11 w-11/);
    }
    const interruttore = screen.getByRole("switch", { name: "Sospendi la pubblicazione di «Richiesta preventivo»" });
    expect(interruttore).toBeChecked();
    // L'interruttore è alto 24 px: la zona che risponde al dito si allarga a 44 senza spostare niente.
    expect(interruttore.className).toMatch(/max-md:before:absolute/);
    expect(interruttore.className).toMatch(/max-md:before:-inset-y-2\.5/);
  });

  it("l'intestazione: sul telefono «Nuovo modulo» va sotto il testo, a tutta larghezza (non esce dalla pagina)", async () => {
    monta();
    await screen.findByText("Richiesta preventivo");
    const pulsante = screen.getByRole("button", { name: "Nuovo modulo" });
    expect(pulsante.className).toMatch(/max-sm:w-full/);
    const intestazione = pulsante.parentElement as HTMLElement;
    expect(intestazione.className).toMatch(/flex-col/);
    expect(intestazione.className).toMatch(/sm:flex-row/);
  });

  it("eliminare dice cosa sparisce (le richieste) e cosa resta (i contatti)", async () => {
    monta();
    fireEvent.click(await screen.findByRole("button", { name: "Elimina il modulo «Richiesta preventivo»" }));
    const finestra = await screen.findByRole("alertdialog");
    expect(within(finestra).getByText("Eliminare il modulo?")).toBeTruthy();
    expect(finestra.textContent).toContain("Spariscono anche le richieste ricevute con questo modulo (7). I contatti già creati restano. Per fermarlo senza cancellare, togli la spunta da «Pubblicato».");
    expect(finestra.textContent).not.toMatch(/irreversibile|submission/);
    stato.elimina.mockResolvedValue(undefined);
    fireEvent.click(within(finestra).getByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(stato.elimina).toHaveBeenCalledWith("m1"));
  });

  it("un errore di lettura si dice in italiano (non «Failed to fetch»)", async () => {
    stato.errore = true;
    monta();
    expect(await screen.findByText("Moduli non disponibili")).toBeTruthy();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
    expect(screen.getByText("Connessione persa. Controlla la rete e riprova.")).toBeTruthy();
  });

  it("«Nuovo modulo»: nome e indirizzo con etichetta e aiuto; crea con nome e indirizzo", async () => {
    stato.crea.mockResolvedValue(undefined);
    monta();
    fireEvent.click(await screen.findByRole("button", { name: "Nuovo modulo" }));
    const finestra = await screen.findByRole("dialog");
    expect(within(finestra).getByRole("heading", { name: "Nuovo modulo" })).toBeTruthy();
    fireEvent.change(within(finestra).getByLabelText("Nome"), { target: { value: "Richiesta sopralluogo" } });
    expect(within(finestra).getByLabelText("Indirizzo del modulo")).toHaveValue("richiesta-sopralluogo");
    expect(within(finestra).getByText("Compare nel link, per esempio …/richiesta-preventivo. Solo lettere, numeri e trattini.")).toBeTruthy();
    expect(finestra.textContent).not.toMatch(/Slug/);
    fireEvent.click(within(finestra).getByRole("button", { name: "Crea" }));
    await waitFor(() => expect(stato.crea).toHaveBeenCalledWith({ name: "Richiesta sopralluogo", slug: "richiesta-sopralluogo" }));
  });
});

describe("il pannello del modulo", () => {
  it("si apre su «Dopo l'invio», prima di «Aspetto» e «Condivisione» (non su «Aspetto»)", async () => {
    const scheda = await apriEditor();
    expect(scheda.getAttribute("aria-selected")).toBe("true");
    const pannello = scheda.closest("[role=tablist]")!.parentElement as HTMLElement;
    expect(within(pannello).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Dopo l'invio", "Aspetto", "Condivisione"]);
    expect(within(pannello).queryByRole("tab", { name: "Impostazioni" })).toBeNull();
    expect(within(pannello).getByText("Cosa succede dopo l'invio")).toBeTruthy();
  });

  it("dentro «Dopo l'invio» le scelte sono nell'ordine: assegna, call center, tag, opportunità, conferma, vai a, email", async () => {
    await apriEditor();
    const ordine = [
      "Assegna il contatto a",
      "Call center che richiama",
      "Tag da aggiungere ai contatti",
      "Crea anche un'opportunità in…",
      "Titolo di conferma",
      "Messaggio di conferma",
      "Dopo l'invio vai a (facoltativo)",
      "Email notifica",
    ];
    const campi = ordine.map((etichetta) => screen.getByLabelText(etichetta));
    for (let i = 1; i < campi.length; i++) {
      expect(campi[i - 1].compareDocumentPosition(campi[i]) & Node.DOCUMENT_POSITION_FOLLOWING, ordine[i]).toBeTruthy();
    }
    // Senza pipeline non ci sono «Parte dalla fase» né la fonte.
    expect(screen.queryByLabelText("Parte dalla fase")).toBeNull();
    expect(screen.queryByLabelText("Fonte da scrivere sull'opportunità")).toBeNull();
    // Il titolo e il messaggio di conferma non stanno più in «Aspetto»: sono la risposta a «cosa succede dopo l'invio».
    expect(screen.queryByText(/Titolo successo|Messaggio successo|URL redirect/)).toBeNull();
  });

  it("scegliendo una pipeline compaiono la fase di partenza e la fonte; i nomi sono quelli nuovi", async () => {
    stato.forms = [modulo({ settings: { pipelineId: "p1" } })];
    await apriEditor();
    expect(await screen.findByLabelText("Parte dalla fase")).toBeTruthy();
    expect(screen.getByLabelText("Fonte da scrivere sull'opportunità")).toBeTruthy();
    expect(screen.getByLabelText("Parte dalla fase")).toHaveTextContent("La prima della pipeline");
    expect(screen.getByLabelText("Crea anche un'opportunità in…")).toHaveTextContent("Vendita edile");
    expect(screen.queryByText(/Fase iniziale|Pipeline opportunità|Azioni CRM dopo invio|Tag predefiniti|Assegna contatto\/opportunità/)).toBeNull();
  });

  it("«Email notifica» c'è ancora, ma dice che non fa partire nessuna email", async () => {
    await apriEditor();
    expect(screen.getByLabelText("Email notifica")).toBeTruthy();
    expect(screen.getByText(/Oggi questo indirizzo non fa partire nessuna email: gli avvisi di nuova richiesta partono dall'automazione «Notifica lead» collegata al modulo\./)).toBeTruthy();
  });

  it("«Aspetto» e «Condivisione» hanno etichette in italiano, ognuna collegata al suo campo", async () => {
    await apriEditor();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Aspetto" }), { button: 0, ctrlKey: false });
    for (const etichetta of ["Colore dei pulsanti", "Colore dello sfondo", "Colore del testo", "Larghezza (px)", "Arrotondamento (px)", "Testo del pulsante"]) {
      expect(await screen.findByLabelText(etichetta), etichetta).toBeTruthy();
    }
    expect(screen.queryByText(/Colore accento|Colore sfondo|Testo bottone/)).toBeNull();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Condivisione" }), { button: 0, ctrlKey: false });
    for (const etichetta of ["Link del modulo", "Altezza minima (px)", "Larghezza massima (px)", "Codice per il tuo sito (si adatta da solo)", "Codice semplice (altezza fissa)"]) {
      expect(await screen.findByLabelText(etichetta), etichetta).toBeTruthy();
    }
    expect(screen.getByText("Cresce e si accorcia da solo dopo errori e messaggio di conferma.")).toBeTruthy();
    expect(screen.queryByText(/URL pubblica|Embed automatico|Iframe semplice|Altezza min\.|Larghezza max\./)).toBeNull();
    expect(screen.getByRole("button", { name: "Copia il link del modulo" }).className).toMatch(/max-md:h-11/);
  });
});

describe("i campi del modulo", () => {
  it("nella tela ogni campo è un pulsante raggiungibile da tastiera, con un nome che dice cosa fa", async () => {
    await apriEditor();
    const email = screen.getByRole("button", { name: "Modifica il campo «Email» (email)" });
    expect(email.tagName).toBe("BUTTON");
    expect(email.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Trascina «Email» per riordinare" })).toBeTruthy();
    fireEvent.click(email);
    expect(screen.getByRole("button", { name: "Modifica il campo «Email» (email)" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("le proprietà hanno etichette in italiano collegate al campo, con l'aiuto sul nome interno", async () => {
    await apriEditor();
    fireEvent.click(screen.getByRole("button", { name: "Modifica il campo «Nome» (testo)" }));
    expect(screen.getByLabelText("Testo del campo")).toHaveValue("Nome");
    expect(screen.getByLabelText("Nome interno")).toHaveValue("nome");
    expect(screen.getByText("Serve al sistema: non cambiarlo se il modulo è già pubblicato.")).toBeTruthy();
    expect(screen.getByLabelText("Testo di esempio nel campo")).toBeTruthy();
    expect(screen.getByLabelText("Salva nel contatto come")).toHaveTextContent("Non salvare nel contatto");
    expect(screen.getByRole("switch", { name: "Obbligatorio" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Obbligatorio" }).className).toMatch(/max-md:before:absolute/);
    expect(screen.queryByText(/^Label$|Nome campo|Placeholder|Mappatura contatto/)).toBeNull();
  });

  it("la libreria dice cosa aggiunge, con parole di tutti i giorni", async () => {
    await apriEditor();
    expect(screen.getByRole("button", { name: "Aggiungi un campo: Spunta sì/no" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aggiungi un campo: Dato nascosto" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Checkbox|Nascosto$/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi un campo: Dato nascosto" }));
    expect(screen.getByRole("button", { name: /Modifica il campo «Campo nascosto» \(dato nascosto\)/ })).toBeTruthy();
    // Un dato nascosto ha un «Valore fisso (o parametro UTM)».
    expect(screen.getByLabelText("Valore fisso (o parametro UTM)")).toBeTruthy();
  });
});

describe("salvare e non perdere le modifiche", () => {
  it("senza modifiche non c'è la barra; con una compare «Modifiche non salvate», che resta in vista, e salva", async () => {
    stato.salva.mockResolvedValue(undefined);
    await apriEditor();
    expect(screen.queryByText("Modifiche non salvate")).toBeNull();
    expect(screen.queryByRole("button", { name: "Salva modifiche" })).toBeNull();

    fireEvent.change(screen.getByLabelText("Nome del modulo"), { target: { value: "Richiesta preventivo gratuito" } });
    expect(screen.getByText("Modifiche non salvate").getAttribute("role")).toBe("status");
    expect(screen.getByText("Restano su questo computer finché non salvi o le scarti.")).toBeTruthy();
    const barra = screen.getByRole("button", { name: "Salva modifiche" }).closest("div.sticky") as HTMLElement;
    expect(barra.className).toMatch(/bottom-0/);
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(stato.salva).toHaveBeenCalled());
    expect(stato.salva.mock.calls[0][0]).toMatchObject({ id: "m1", name: "Richiesta preventivo gratuito" });
  });

  it("uscire dal menu con modifiche non salvate chiede conferma (oltre alla bozza locale)", async () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    await apriEditor();
    expect(confermaNavigazioneImpostazioni()).toBe(true);
    expect(conferma).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Nome del modulo"), { target: { value: "Un altro nome" } });
    expect(confermaNavigazioneImpostazioni()).toBe(false);
    expect(conferma).toHaveBeenCalledTimes(1);
    conferma.mockReturnValue(true);
    expect(confermaNavigazioneImpostazioni()).toBe(true);
    conferma.mockRestore();
  });

  it("«Scarta» toglie le modifiche e la barra sparisce", async () => {
    await apriEditor();
    fireEvent.change(screen.getByLabelText("Nome del modulo"), { target: { value: "Un altro nome" } });
    fireEvent.click(screen.getByRole("button", { name: "Scarta" }));
    expect(screen.getByLabelText("Nome del modulo")).toHaveValue("Richiesta preventivo");
    expect(screen.queryByText("Modifiche non salvate")).toBeNull();
  });

  it("senza permesso: «Solo lettura», campi spenti e nessuna barra", async () => {
    stato.admin = false;
    stato.modifica = false;
    await apriEditor();
    expect(screen.getByText("Puoi guardare campi, impostazioni e link, ma per modificarli serve il permesso «Modifica» su Personalizzazione.")).toBeTruthy();
    expect(screen.getByLabelText("Nome del modulo")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nome del modulo"), { target: { value: "Altro" } });
    expect(screen.queryByRole("button", { name: "Salva modifiche" })).toBeNull();
    expect(screen.queryByText("Bozza recuperata")).toBeNull();
  });

  it("un nome vuoto si rifiuta con parole di tutti i giorni", async () => {
    await apriEditor();
    fireEvent.change(screen.getByLabelText("Nome del modulo"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    expect(stato.salva).not.toHaveBeenCalled();
    const { toast } = await import("sonner");
    expect(toast.error).toHaveBeenCalledWith("Controlla il modulo", { description: "Scrivi il nome del modulo." });
  });
});

describe("la scheda «Da dove arrivano i contatti»", () => {
  const apri = async () => {
    monta();
    await screen.findByText("Richiesta preventivo");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Da dove arrivano i contatti" }), { button: 0, ctrlKey: false });
    await screen.findByText("Il codice da incollare nel sito");
  };

  it("una riga, il codice con «Copia», e due riquadri chiusi (non quattro riquadri di peso uguale)", async () => {
    await apri();
    expect(screen.getByText(/Incolla questo codice nel sito: ogni contatto porta con sé l'annuncio o la campagna da cui è arrivato\./)).toBeTruthy();
    expect(screen.getByLabelText("Codice da incollare nel sito").textContent).toContain("azienda-1");
    expect(screen.getByRole("button", { name: "Copia" })).toBeTruthy();
    for (const titolo of ["Quali dati raccoglie", "Prova un indirizzo"]) {
      const riquadro = screen.getByText(titolo).closest("details") as HTMLDetailsElement;
      expect(riquadro.open, titolo).toBe(false);
    }
    expect(screen.queryByText(/Come funziona|Parametri supportati|Snippet di tracking|Test URL|1\. Installa lo snippet/)).toBeNull();
  });

  it("i dati che raccoglie sono in italiano: i cinque «utm» con la loro spiegazione, i codici dei clic in una riga", async () => {
    await apri();
    const riquadro = screen.getByText("Quali dati raccoglie").closest("details") as HTMLElement;
    expect(within(riquadro).getByText("Sorgente: da dove arriva chi visita")).toBeTruthy();
    expect(within(riquadro).getByText("Campagna")).toBeTruthy();
    expect(within(riquadro).getByText("Parola chiave")).toBeTruthy();
    expect(within(riquadro).getAllByText(/^utm_/)).toHaveLength(5);
    expect(riquadro.textContent).toContain("il codice legge da solo i codici dei clic di Google, Facebook, TikTok, Microsoft e LinkedIn");
    // Niente elenco di dodici sigle tecniche.
    expect(riquadro.textContent).not.toMatch(/wbraid|gbraid|li_fat_id|Google Ads iOS/);
  });

  it("la prova riconosce sia i dati «utm» sia i codici dei clic, e dice quando non c'è niente", async () => {
    await apri();
    const campo = screen.getByLabelText("Indirizzo da provare");
    const prova = screen.getByText("Prova un indirizzo").closest("details") as HTMLElement;
    fireEvent.change(campo, { target: { value: "https://tuosito.it/?utm_source=google&gclid=abc123&altro=1" } });
    expect(within(prova).getByText("utm_source")).toBeTruthy();
    expect(within(prova).getByText("gclid")).toBeTruthy();
    expect(within(prova).getByText("abc123")).toBeTruthy();
    expect(within(prova).queryByText("altro")).toBeNull();
    fireEvent.change(campo, { target: { value: "https://tuosito.it/?altro=1" } });
    expect(within(prova).getByText("In questo indirizzo non c'è nessun dato di campagna che il codice riconosca.")).toBeTruthy();
  });
});
