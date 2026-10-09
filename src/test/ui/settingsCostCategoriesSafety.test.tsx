/**
 * Categorie costi: storico protetto, niente colore, strumenti solo quando servono, errori in italiano.
 *
 * Cosa è cambiato rispetto alla prima versione di questo file (09/10/2026, controllo delle impostazioni):
 *  - il colore è stato tolto dalla pagina (nessun'altra parte dell'app lo leggeva: 4 categorie su 51 lo avevano).
 *    Per questo non c'è più il campo «Colore categoria Materiali» che restava attivo col nome bloccato: ora, con il
 *    nome bloccato, non resta niente da cambiare, e la riga lo dice;
 *  - le tre tessere Totali / In uso / Non usate sono una riga di testo («N categorie · M usate nei costi»), quindi
 *    non c'è più la tessera «Non usate» con il «–» (`div.p-3`);
 *  - ricerca, filtri («Tutte / In uso / Inutilizzate») e ordinamento compaiono da 11 categorie in su: il pulsante
 *    «Inutilizzate» spento in caso di errore si prova quindi con 11 categorie;
 *  - «Importa dai costi» si chiama «Importa da costi e fornitori» (legge anche i fornitori).
 * La sola lettura e la bozza conservata sono rimaste com'erano.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SettingsCostCategories from "@/pages/azienda/settings/SettingsCostCategories";

type RigaCategoria = { id: string; company_id: string; name: string; color: string | null; created_at: string };

const state = vi.hoisted(() => ({
  edit: true,
  mobile: true,
  readError: false,
  usageError: false,
  writeError: false,
  readMessage: "errore simulato",
  writeMessage: "errore simulato",
  writeCode: "",
  /** Le categorie nel database finto: le scritture riuscite le cambiano, così la pagina rilegge il vero. */
  categorie: [] as Array<{ id: string; company_id: string; name: string; color: string | null; created_at: string }>,
  /** Un elemento per costo: la sua categoria. */
  costi: [] as string[],
  /** Un elemento per fornitore: la sua categoria prodotti. */
  fornitori: [] as string[],
  writes: [] as string[],
  scritture: [] as Array<{ table: string; op: string; payload: unknown }>,
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: false, isLoading: false, canViewCosts: state.edit, solaLettura: !state.edit }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.mobile }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error, info: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  let op = "read";
  let payload: unknown;
  const filtri: Array<[string, unknown]> = [];
  const applica = () => {
    if (table !== "cost_categories") return;
    const id = filtri.find(([colonna]) => colonna === "id")?.[1];
    if (op === "insert") {
      const nuove = (Array.isArray(payload) ? payload : [payload]) as Array<{ company_id: string; name: string }>;
      nuove.forEach((n, i) => state.categorie.push({ id: `nuova-${state.categorie.length}-${i}`, company_id: n.company_id, name: n.name, color: null as string | null, created_at: "2026-10-10" }));
    } else if (op === "update") {
      const riga = state.categorie.find((c) => c.id === id);
      if (riga) Object.assign(riga, payload);
    } else if (op === "delete") {
      state.categorie = state.categorie.filter((c) => c.id !== id);
    }
  };
  const risposta = () => {
    if (op !== "read") {
      if (state.writeError) return { data: null as unknown, error: { message: state.writeMessage, code: state.writeCode } as unknown };
      applica();
      return { data: [{ id: "scritto" }] as unknown, error: null as unknown };
    }
    if (table === "cost_categories") {
      return state.readError
        ? { data: null as unknown, error: { message: state.readMessage } as unknown }
        : { data: state.categorie.map((c) => ({ ...c })) as unknown, error: null as unknown };
    }
    if (table === "company_costs") {
      return state.usageError
        ? { data: null as unknown, error: { message: "errore simulato" } as unknown }
        : { data: state.costi.map((category) => ({ category })) as unknown, error: null as unknown };
    }
    if (table === "suppliers") return { data: state.fornitori.map((product_category) => ({ product_category })) as unknown, error: null as unknown };
    return { data: [] as unknown, error: null as unknown };
  };
  const scrive = (nome: string, dati?: unknown) => { op = nome; payload = dati; state.writes.push(table); state.scritture.push({ table, op: nome, payload: dati }); };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select: () => builder,
    eq: (colonna: string, valore: unknown) => { filtri.push([colonna, valore]); return builder; },
    not: () => builder,
    order: () => builder,
    single: async () => risposta(),
    insert: (dati: unknown) => { scrive("insert", dati); return builder; },
    update: (dati: unknown) => { scrive("update", dati); return builder; },
    delete: () => { scrive("delete"); return builder; },
    then: (resolve: (value: ReturnType<typeof risposta>) => unknown) => Promise.resolve(risposta()).then(resolve),
  };
  return builder;
} } }));

const riga = (id: string, name: string, color: string | null = "#6366f1"): RigaCategoria => ({ id, company_id: "company-1", name, color, created_at: "2026-10-08" });
const molte = (quante: number) => Array.from({ length: quante }, (_, i) => riga(`c${i + 1}`, `Categoria ${String(i + 1).padStart(2, "0")}`));

function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><SettingsCostCategories /></QueryClientProvider>);
  return client;
}

beforeEach(() => {
  state.edit = true; state.mobile = true;
  state.readError = false; state.usageError = false; state.writeError = false;
  state.readMessage = "errore simulato"; state.writeMessage = "errore simulato"; state.writeCode = "";
  state.categorie = [riga("c1", "Materiali")];
  state.costi = []; state.fornitori = [];
  state.writes.length = 0; state.scritture.length = 0;
  state.success.mockClear(); state.error.mockClear();
});
afterEach(cleanup);

describe("Categorie costi: storico protetto e layout", () => {
  it("un errore degli utilizzi non rende eliminabili le categorie", async () => {
    state.usageError = true; open();
    await screen.findByText("Categorie costi non disponibili");
    expect(screen.getByRole("button", { name: "Elimina Materiali" })).toBeDisabled();
    // Gli utilizzi non si conoscono: la riga di riepilogo non inventa quante categorie sono usate.
    expect(screen.getByText("1 categoria")).toBeInTheDocument();
    expect(screen.queryByText(/usate? nei costi/)).toBeNull();
  });
  it("con tante categorie e utilizzi illeggibili i filtri per uso sono spenti", async () => {
    state.categorie = molte(11); state.usageError = true; open();
    await screen.findByText("Categorie costi non disponibili");
    expect(screen.getByRole("button", { name: "Inutilizzate" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "In uso" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tutte" })).toBeEnabled();
  });
  it("senza utilizzi non si può cambiare il nome, e non c'è nessun colore da cambiare", async () => {
    state.usageError = true; open(); await screen.findByText("Materiali");
    fireEvent.click(screen.getByRole("button", { name: "Modifica Materiali" }));
    expect(screen.getByLabelText("Nome categoria Materiali")).toBeDisabled();
    expect(screen.queryByLabelText(/colore/i)).toBeNull();
    expect(document.querySelector('input[type="color"]')).toBeNull();
    expect(screen.getByText("Utilizzi non disponibili: il nome non si può cambiare adesso.")).toBeInTheDocument();
  });
  it("la lettura fallita non è uno stato vuoto e blocca l'importazione", async () => {
    state.readError = true; open(); await screen.findByText("Categorie costi non disponibili");
    expect(screen.queryByText("Nessuna categoria configurata.")).toBeNull();
    expect(screen.getByLabelText("Nuova categoria")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Importa da costi e fornitori" })).toBeDisabled();
  });
  it("l'importazione richiede una conferma e non parte aprendo il dialog", async () => {
    open(); await screen.findByText("Materiali");
    fireEvent.click(screen.getByRole("button", { name: "Importa da costi e fornitori" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Non modifica i movimenti storici");
    expect(state.writes).toHaveLength(0);
  });
  it("la sola lettura non mostra comandi di modifica", async () => {
    state.edit = false; open(); await screen.findByText("Materiali");
    expect(screen.queryByRole("button", { name: "Modifica Materiali" })).toBeNull();
    expect(screen.queryByLabelText("Nuova categoria")).toBeNull();
    expect(screen.queryByRole("button", { name: "Importa da costi e fornitori" })).toBeNull();
  });
  it("una creazione fallita conserva la bozza", async () => {
    state.writeError = true; open(); await screen.findByText("Materiali");
    fireEvent.change(screen.getByLabelText("Nuova categoria"), { target: { value: "Trasferte" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Nuova categoria")).toHaveValue("Trasferte");
    expect(state.success).not.toHaveBeenCalled();
  });
});

describe("Categorie costi: niente colore", () => {
  it("né il modulo «Nuova categoria» né la riga in modifica hanno un selettore di colore", async () => {
    open(); await screen.findByText("Materiali");
    expect(document.querySelector('input[type="color"]')).toBeNull();
    expect(screen.queryByText("Colore")).toBeNull();
    expect(screen.queryByLabelText(/colore/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Modifica Materiali" }));
    expect(screen.getByLabelText("Nome categoria Materiali")).toBeEnabled();
    expect(document.querySelector('input[type="color"]')).toBeNull();
    expect(screen.queryByLabelText(/colore/i)).toBeNull();
  });
  it("la tabella non ha la colonna «Colore» né il pallino colorato", async () => {
    state.categorie = [riga("c1", "Materiali", "#ef4444")];
    open(); await screen.findByText("Materiali");
    expect(screen.queryByRole("columnheader", { name: "Colore" })).toBeNull();
    expect(screen.getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["Nome", "Utilizzi", "Azioni"]);
    expect(document.querySelector('[style*="background-color"]')).toBeNull();
  });
  it("una categoria nuova si crea senza colore: l'inserimento manda solo azienda e nome", async () => {
    open(); await screen.findByText("Materiali");
    fireEvent.change(screen.getByLabelText("Nuova categoria"), { target: { value: "  Trasferte  " } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Categoria aggiunta"));
    const inserimenti = state.scritture.filter((s) => s.op === "insert");
    expect(inserimenti).toHaveLength(1);
    expect(inserimenti[0].payload).toEqual({ company_id: "company-1", name: "Trasferte" });
    expect(Object.keys(inserimenti[0].payload as object)).not.toContain("color");
  });
  it("rinominare una categoria non usata scrive solo il nome", async () => {
    state.categorie = [riga("c1", "Materiali", "#ef4444")];
    open(); await screen.findByText("Materiali");
    fireEvent.click(screen.getByRole("button", { name: "Modifica Materiali" }));
    fireEvent.change(screen.getByLabelText("Nome categoria Materiali"), { target: { value: "Materiali edili" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Categoria aggiornata"));
    const modifiche = state.scritture.filter((s) => s.op === "update");
    expect(modifiche).toHaveLength(1);
    expect(modifiche[0].payload).toEqual({ name: "Materiali edili" });
  });
  it("l'importazione aggiunge le categorie mancanti senza colore", async () => {
    state.costi = ["Materiali", "Trasferte", "Trasferte"]; state.fornitori = ["Ferramenta"];
    open(); await screen.findByText("Materiali");
    fireEvent.click(screen.getByRole("button", { name: "Importa da costi e fornitori" }));
    fireEvent.click(await screen.findByRole("button", { name: "Importa categorie" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("2 categorie importate"));
    const inserimenti = state.scritture.filter((s) => s.op === "insert");
    expect(inserimenti).toHaveLength(1);
    expect(inserimenti[0].payload).toEqual([
      { company_id: "company-1", name: "Trasferte" },
      { company_id: "company-1", name: "Ferramenta" },
    ]);
    for (const riga of inserimenti[0].payload as object[]) expect(Object.keys(riga)).not.toContain("color");
  });
  it("il file CSV non ha la colonna «Colore» e il messaggio dice «File scaricato»", async () => {
    state.mobile = false;
    state.categorie = [riga("c1", "Materiali", "#ef4444"), riga("c2", "Affitto", null)];
    state.costi = ["Materiali", "Materiali", "Cantiere Rossi"];
    const blobs: Blob[] = [];
    const creaUrl = URL.createObjectURL; const revocaUrl = URL.revokeObjectURL;
    URL.createObjectURL = (blob: Blob | MediaSource) => { blobs.push(blob as Blob); return "blob:prova"; };
    URL.revokeObjectURL = () => {};
    const clic = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      open(); await screen.findByText("Materiali");
      await waitFor(() => expect(screen.getByRole("button", { name: "Esporta CSV" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Esporta CSV" }));
      await waitFor(() => expect(state.success).toHaveBeenCalledWith("File scaricato"));
      expect(blobs).toHaveLength(1);
      const righe = (await blobs[0].text()).replace(/^\uFEFF/, "").split("\n");
      expect(righe[0]).toBe("Nome,Utilizzi,Protezione,Configurata");
      expect(righe).toContain("Materiali,2,Protetta: in uso,SI");
      expect(righe).toContain("Affitto,0,Eliminabile: inutilizzata,SI");
      expect(righe).toContain("Cantiere Rossi,1,Storica: manca in configurazione,NO");
      expect(righe.join("\n")).not.toMatch(/colore|#[0-9a-f]{6}/i);
    } finally {
      clic.mockRestore();
      URL.createObjectURL = creaUrl; URL.revokeObjectURL = revocaUrl;
    }
  });
});

describe("Categorie costi: riepilogo e strumenti", () => {
  it("una riga sola dice quante categorie sono e quante usate nei costi", async () => {
    state.categorie = [riga("c1", "Materiali"), riga("c2", "Affitto"), riga("c3", "Utenze")];
    state.costi = ["Materiali", "Materiali", "Affitto"];
    open();
    expect(await screen.findByText("3 categorie · 2 usate nei costi")).toBeInTheDocument();
    // Non ci sono più le tre tessere.
    expect(screen.queryByText("Totali")).toBeNull();
    expect(screen.queryByText("Non usate")).toBeNull();
    expect(screen.queryByText("Almeno 1 costo associato")).toBeNull();
  });
  it("al singolare dice «1 categoria · 1 usata nei costi»", async () => {
    state.costi = ["Materiali"];
    open();
    expect(await screen.findByText("1 categoria · 1 usata nei costi")).toBeInTheDocument();
  });
  it("con 10 categorie c'è solo l'elenco: niente ricerca, filtri e ordinamento", async () => {
    state.categorie = molte(10);
    open(); await screen.findByText("Categoria 01");
    expect(screen.getByText("10 categorie · 0 usate nei costi")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cerca una categoria")).toBeNull();
    expect(screen.queryByLabelText("Ordina categorie")).toBeNull();
    for (const nome of ["Tutte", "In uso", "Inutilizzate"]) expect(screen.queryByRole("button", { name: nome })).toBeNull();
  });
  it("da 11 categorie compaiono ricerca, filtri e ordinamento, e la ricerca ha un nome", async () => {
    state.categorie = molte(11);
    open(); await screen.findByText("Categoria 01");
    const ricerca = screen.getByLabelText("Cerca una categoria");
    expect(screen.getByLabelText("Ordina categorie")).toBeInTheDocument();
    for (const nome of ["Tutte", "In uso", "Inutilizzate"]) expect(screen.getByRole("button", { name: nome })).toBeInTheDocument();
    fireEvent.change(ricerca, { target: { value: "categoria 07" } });
    expect(screen.queryByText("Categoria 01")).toBeNull();
    expect(screen.getByText("Categoria 07")).toBeInTheDocument();
    // Niente più la riga «Vista filtrata/ordinata…» sotto i filtri.
    fireEvent.click(screen.getByRole("button", { name: "Inutilizzate" }));
    expect(screen.queryByText(/Vista filtrata/)).toBeNull();
  });
  it("scendendo sotto le 11 categorie i filtri rimasti accesi non nascondono righe", async () => {
    state.categorie = molte(11);
    open(); await screen.findByText("Categoria 01");
    fireEvent.change(screen.getByLabelText("Cerca una categoria"), { target: { value: "categoria 11" } });
    expect(screen.queryByText("Categoria 01")).toBeNull();
    // Si elimina una categoria visibile (la 11): restano 10 e gli strumenti spariscono.
    fireEvent.click(screen.getByRole("button", { name: "Elimina Categoria 11" }));
    fireEvent.click(await screen.findByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Categoria eliminata"));
    await waitFor(() => expect(screen.queryByLabelText("Cerca una categoria")).toBeNull());
    expect(screen.getByText("Categoria 01")).toBeInTheDocument();
    expect(screen.getByText("Categoria 10")).toBeInTheDocument();
    expect(screen.queryByText("Nessuna categoria corrisponde ai filtri attivi.")).toBeNull();
  });
});

describe("Categorie costi: parole e categorie usate", () => {
  it("l'avviso delle categorie usate nei costi ma non nell'elenco usa le parole nuove", async () => {
    state.costi = ["Trasferte", "Cantiere Rossi"];
    open();
    expect(await screen.findByText("Categorie usate nei costi ma non nell'elenco")).toBeInTheDocument();
    expect(screen.getByText(/Ci sono 2 categorie usate nei costi ma non nell'elenco\. Premi «Importa da costi e fornitori» per aggiungerle senza toccare i costi già registrati\./)).toBeInTheDocument();
    expect(screen.queryByText(/storiche da configurare/i)).toBeNull();
  });
  it("la frase di testata dice a cosa servono le categorie", async () => {
    open(); await screen.findByText("Materiali");
    expect(screen.getByText(/Le categorie con cui dividi i costi \(affitto, utenze, marketing…\)\. Le scegli quando registri un costo e servono a leggerli nei report\./)).toBeInTheDocument();
  });
  it("una categoria già usata ha il nome bloccato e «Salva» non scrive niente", async () => {
    state.costi = ["Materiali"];
    open(); await screen.findByText("Materiali");
    fireEvent.click(await screen.findByRole("button", { name: "Modifica Materiali" }));
    await waitFor(() => expect(screen.getByLabelText("Nome categoria Materiali")).toBeDisabled());
    expect(screen.getByText("Nome bloccato: la categoria è usata nei costi.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    // La riga si chiude senza scrivere e senza un finto «Categoria aggiornata».
    expect(screen.queryByLabelText("Nome categoria Materiali")).toBeNull();
    expect(state.writes).toHaveLength(0);
    expect(state.success).not.toHaveBeenCalled();
  });
  it("se la categoria diventa usata mentre la si rinomina, il messaggio non rimanda a comandi che non ci sono", async () => {
    state.categorie = [riga("c1", "Trasferte")];
    const client = open(); await screen.findByText("Trasferte");
    fireEvent.click(screen.getByRole("button", { name: "Modifica Trasferte" }));
    fireEvent.change(screen.getByLabelText("Nome categoria Trasferte"), { target: { value: "Trasferte e viaggi" } });
    state.costi = ["Trasferte"];
    await client.refetchQueries();
    await waitFor(() => expect(screen.getByLabelText("Nome categoria Trasferte")).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("Categoria già usata nei costi: il nome non si può cambiare."));
    expect(state.error.mock.calls[0][0]).not.toMatch(/riclassific/i);
    expect(state.writes).toHaveLength(0);
  });
  it("la conferma di eliminazione di una categoria diventata usata spiega che resta nell'elenco", async () => {
    state.categorie = [riga("c1", "Trasferte")];
    const client = open(); await screen.findByText("Trasferte");
    fireEvent.click(screen.getByRole("button", { name: "Elimina Trasferte" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("verrà rimossa");
    // Gli utilizzi cambiano a finestra aperta: il ramo «bloccata» è la difesa.
    state.costi = ["Trasferte", "Trasferte"];
    await client.refetchQueries();
    await waitFor(() => expect(screen.getByRole("alertdialog")).toHaveTextContent("è usata da 2 costi"));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Per proteggere costi storici, marginalità e report, l'eliminazione è bloccata: lascia la categoria nell'elenco per lo storico.");
    expect(screen.getByRole("alertdialog")).not.toHaveTextContent(/riclassific/i);
    expect(screen.getByRole("button", { name: "Bloccata" })).toBeDisabled();
  });
});

describe("Categorie costi: errori in italiano", () => {
  it("un errore di lettura non mostra il testo del database né «Errore sconosciuto»", async () => {
    state.readError = true; state.readMessage = 'relation "public.cost_categories" does not exist';
    open(); await screen.findByText("Categorie costi non disponibili");
    expect(screen.getByText(/Non riesco a caricare correttamente categorie o utilizzi/)).toBeInTheDocument();
    expect(screen.queryByText(/does not exist/)).toBeNull();
    expect(screen.queryByText("Errore sconosciuto")).toBeNull();
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument();
  });
  it("se manca la rete lo dice in italiano", async () => {
    state.readError = true; state.readMessage = "Failed to fetch";
    open(); await screen.findByText("Categorie costi non disponibili");
    expect(screen.getByText("Connessione persa. Controlla la rete e riprova.")).toBeInTheDocument();
    expect(screen.queryByText("Failed to fetch")).toBeNull();
  });
  it("un salvataggio rifiutato dal database si legge in italiano", async () => {
    state.writeError = true; state.writeCode = "42501";
    state.writeMessage = 'new row violates row-level security policy for table "cost_categories"';
    open(); await screen.findByText("Materiali");
    fireEvent.change(screen.getByLabelText("Nuova categoria"), { target: { value: "Trasferte" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("Non hai i permessi per questa operazione. Contatta l'amministratore."));
    expect(state.error.mock.calls[0][0]).not.toMatch(/row-level|violates/i);
  });
  it("un errore che nessuna regola riconosce ripiega su una frase italiana con «Riprova»", async () => {
    state.writeError = true; state.writeMessage = "boom";
    open(); await screen.findByText("Materiali");
    fireEvent.change(screen.getByLabelText("Nuova categoria"), { target: { value: "Trasferte" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("Non sono riuscito ad aggiungere la categoria. Riprova."));
  });
});
