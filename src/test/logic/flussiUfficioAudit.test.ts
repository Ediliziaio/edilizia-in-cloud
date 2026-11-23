import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { normalizeTagList } from "@/lib/marketingTags";
import { formeTelefono, telefonoInternazionale } from "@/lib/contactUtils";
import { perOgniLotto } from "@/lib/lottiDiId";

function estrai(file: string, inizio: string, fine: string) {
  const fonte = readFileSync(file, "utf8");
  const da = fonte.indexOf(inizio);
  const a = fonte.indexOf(fine, da + inizio.length);
  if (da < 0 || a < 0) throw new Error(`Intervallo mancante in ${file}`);
  return fonte.slice(da, a);
}

function esegui(codice: string, ambiente: Record<string, unknown>) {
  const js = ts.transpileModule(codice, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return runInNewContext(js, ambiente);
}

describe("importazione contatti", () => {
  function gestore(errore?: Error) {
    const codice = estrai("src/pages/azienda/marketing/MarketingContacts.tsx", "  const handleImport =", "  if (importOpen)");
    const iscrivi = vi.fn(async (_nome: string, _arg: unknown) => ({ data: { enrolled: 2 }, error: null as null }));
    const inserisci = vi.fn((_righe: unknown) => ({ select: async () => ({ data: [{ id: "nuovo" }] }) }));
    const aggiorna = vi.fn((_riga: unknown) => ({ eq: () => ({ eq: async () => ({ error: null as Error | null }) }) }));
    const tabella = {
      select: () => ({ eq: () => ({ in: async () => ({ data: [{ id: "esistente", email: "gia@example.test" }], error: errore }) }) }),
      insert: inserisci, update: aggiorna,
    };
    const handleImport = esegui(codice + "\nhandleImport", {
      companyId: "azienda-a", canEditContacts: true, contactCustomFields: [], invalidate: vi.fn(),
      supabase: { from: () => tabella, rpc: iscrivi }, normalizeTagList, formeTelefono, telefonoInternazionale, perOgniLotto,
    });
    const righe = [
      { first_name: "Modificato", email: "gia@example.test" },
      { first_name: "Nuovo", email: "nuovo@example.test" },
    ];
    return { handleImport, righe, inserisci, aggiorna, iscrivi };
  }

  it("crea e aggiorna dallo stesso file", async () => {
    const { handleImport, righe, inserisci, aggiorna } = gestore();
    expect(await handleImport(righe, { mode: "upsert" })).toEqual({
      success: 2, errors: [], creati: 1, aggiornati: 1, saltati: 0, avvisi: [], fatto: [], nonRiuscito: [],
    });
    expect(inserisci).toHaveBeenCalledWith([expect.objectContaining({ email: "nuovo@example.test" })]);
    expect(aggiorna).toHaveBeenCalledWith(expect.objectContaining({ email: "gia@example.test" }));
  });

  it("interrompe l'importazione se la ricerca dei contatti esistenti fallisce", async () => {
    const { handleImport, righe, inserisci, aggiorna } = gestore(new Error("rete"));
    expect(await handleImport(righe, { mode: "upsert" })).toMatchObject({ success: 0 });
    expect(inserisci).not.toHaveBeenCalled();
    expect(aggiorna).not.toHaveBeenCalled();
  });
});

describe("export schede clienti", () => {
  function leggi(paginaFallita?: number) {
    const codice = estrai("src/components/orders/CustomerSheetsExportDialog.tsx", "      const customerIds =", "      // 3.");
    const range = vi.fn(async (da: number, a: number) => {
      if (da === paginaFallita) return { data: null, error: new Error("rete") };
      const data = Array.from({ length: Math.max(0, Math.min(5, a + 1) - da) }, (_, i) => ({
        id: `o-${da + i}`, customer_id: "c1", order_statuses: { name: "Nuova" },
      }));
      return { data, error: null };
    });
    const query = {
      select: () => query, eq: () => query, in: () => query, order: () => query,
      range, then: (resolve: (esito: unknown) => void) => range(0, 1).then(resolve),
    };
    const genera = vi.fn();
    const esito = esegui(`(async () => {\n${codice}\ngenera(); return ordersByCustomer.get("c1"); })()`, {
      customers: [{ id: "c1" }], effectiveCompany: { id: "azienda-a" }, BATCH_SIZE: 2,
      supabase: { from: () => query }, yieldToBrowser: async () => {}, genera,
    });
    return { esito, genera, range };
  }

  it("legge anche la pagina finale oltre il limite della prima query", async () => {
    const { esito, genera, range } = leggi();
    expect(await esito).toMatchObject([
      { id: "o-0" }, { id: "o-1" }, { id: "o-2" }, { id: "o-3" }, { id: "o-4" },
    ]);
    expect(range.mock.calls).toEqual([[0, 1], [2, 3], [4, 5]]);
    expect(genera).toHaveBeenCalledOnce();
  });

  it.each([0, 4])("blocca il PDF quando la pagina da %s fallisce", async (pagina) => {
    const { esito, genera } = leggi(pagina);
    await expect(esito).rejects.toThrow("Impossibile caricare tutte le commesse");
    expect(genera).not.toHaveBeenCalled();
  });
});

it("il solo avanzamento del rapportino attiva bozza e avviso di uscita", () => {
  const file = "src/pages/campo/CampoRapportino.tsx";
  const salva = estrai(file, "    if (bozzaAttivata.current ||", "\n  }, [bozzaCorrente");
  const guardia = estrai(file, "  const datiInseriti =", "  const goBack");
  const modifica = estrai(file, "                    avanzamentoModificato.current = true;", "                  }}");
  const aggiornaBozza = vi.fn();
  const setPercentuale = vi.fn();
  const vuoti = { materialiSel: {}, presenzeSel: {}, presenzeModificate: {}, fasiDichiarate: {}, mezziSel: {}, campiValori: {}, fotoUrls: [] as string[], fotoDaRiprovare: [] as string[], arrivo: [] as unknown[] };
  const bozzaCorrente = { ...vuoti, descrizione: "", sottofasiSpunte: [] as string[], sottofasiLavorate: [] as string[], firmaClienteNome: "" };
  const ambiente: Record<string, unknown> = {
    ...vuoti, bozzaCorrente, aggiornaBozza, setPercentuale,
    avanzamentoModificato: { current: false }, bozzaAttivata: { current: false }, oreModificate: { current: false },
    descrizione: "", confermaCliente: false, oreLavorate: "", oreStraordinario: 0,
    firmaOperaio: null, firmaCliente: null, firmaClienteNome: "", e: { target: { value: "50" } },
  };
  expect(esegui("(() => {" + salva + guardia + "\nreturn datiInseriti; })()", ambiente)).toBe(false);
  expect(aggiornaBozza).not.toHaveBeenCalled();
  expect(esegui("(() => {" + modifica + salva + guardia + "\nreturn datiInseriti; })()", ambiente)).toBe(true);
  expect(setPercentuale).toHaveBeenCalledWith(50);
  expect(aggiornaBozza).toHaveBeenCalledWith(bozzaCorrente);
});

it("la selezione di massa usa gli ID del filtro corrente anche a parità di conteggio", () => {
  const file = "src/pages/azienda/UnifiedTasks.tsx";
  const codice = estrai(file, "  const selezioneVisibile", "  // Senza ordinamento per colonna") +
    estrai(file, "  const toggleSelectAll", "\n  };") + "\n  };\ntoggleSelectAll();\n[...selezioneVisibile]";
  const setSelectedIds = vi.fn((_ids: Set<string>) => {});
  const visibili = esegui(codice, {
    filteredTasks: [{ id: "c" }, { id: "d" }], selectedIds: new Set(["a", "b"]),
    useMemo: (fn: () => unknown) => fn(), setSelectedIds,
  });
  expect(visibili).toEqual([]);
  expect([...(setSelectedIds.mock.calls[0][0] as Set<string>)]).toEqual(["c", "d"]);
  expect(readFileSync(file, "utf8")).toContain("selectedIds={selezioneVisibile}");
});

it("le mutazioni dei documenti aggiornano anche i contatori delle scadenze", () => {
  const file = "src/hooks/useDocumentiAzienda.ts";
  const codice = estrai(file, "const chiavi =", "\n}") + "\n}";
  const helper = estrai(file, "function invalidaDocumentiAzienda(", "\n}") + "\n}";
  const invalidateQueries = vi.fn();
  esegui(codice + "\n" + helper + '\ninvalidaDocumentiAzienda({ invalidateQueries }, "azienda-a");', { invalidateQueries });
  expect(invalidateQueries.mock.calls).toEqual([
    [{ queryKey: ["documenti-azienda", "elenco", "azienda-a"] }],
    [{ queryKey: ["documenti-azienda", "conteggio", "azienda-a"] }],
  ]);
});

it("riutilizza l'identità della voce di spesa dopo un commit con risposta persa", async () => {
  const codice = estrai("src/components/tesoreria/ExpenseReports.tsx", "  async function handleAddItem", "  async function cambiaStato");
  const salvate = new Map<string, { id: string; amount: number }>();
  const insert = vi.fn(async (riga: { id: string; amount: number }) => {
    if (salvate.has(riga.id)) return { error: { code: "23505", message: "Riga presente" } };
    salvate.set(riga.id, riga);
    throw new Error("Connessione interrotta dopo la scrittura");
  });
  const query = {
    insert, select: () => query, eq: () => query,
    maybeSingle: async () => ({ data: [...salvate.values()][0], error: null as Error | null }),
  };
  const toast = { error: vi.fn(), success: vi.fn() };
  const openDetail = vi.fn();
  const tentativoVoce: { current: { id: string } | null } = { current: null };
  const aggiungi = esegui(codice + "\nhandleAddItem", {
    aggiuntaInCorso: { current: false }, tentativoVoce, selectedReport: { id: "nota-a" },
    companyId: "azienda-a", setIsAddingItem: vi.fn(), setNewItem: vi.fn(), setShowAddItem: vi.fn(),
    newItem: { description: "Materiali", amount: "100", category: "Altro", expense_date: "2026-11-20" },
    parsePositiveAmount: (input: string) => Number(input), todayIso: () => "2026-11-20",
    crypto: { randomUUID: vi.fn().mockReturnValueOnce("voce-a").mockReturnValueOnce("voce-b") },
    supabase: { from: () => query }, toast, openDetail, loadReports: vi.fn(),
  });
  await aggiungi();
  expect(toast.error).toHaveBeenCalledOnce();
  expect(tentativoVoce.current).toMatchObject({ id: "voce-a" });
  await aggiungi();
  expect(insert.mock.calls.map(([riga]) => riga.id)).toEqual(["voce-a", "voce-a"]);
  expect(salvate.size).toBe(1);
  expect([...salvate.values()].reduce((totale, voce) => totale + voce.amount, 0)).toBe(100);
  expect(openDetail).toHaveBeenCalledOnce();
  expect(toast.success).toHaveBeenCalledOnce();
});

it("la rinomina di un conto invia soltanto il nome cambiato", async () => {
  const codice = estrai("src/components/tesoreria/ManualTreasuryPanel.tsx", "  async function submitEdit()", "  return (");
  const mutateAsync = vi.fn();
  const modifica = esegui(codice + "\nsubmitEdit", {
    editing: { id: "conto-a", display_name: "Prima", iban: null, opening_balance: 100 },
    form: { name: "Dopo", iban: "", opening: "100" },
    canViewBankBalances: true, solaLettura: false, updateAccount: { mutateAsync },
    setEditing: vi.fn(), resetForm: vi.fn(),
  });
  await modifica();
  expect(mutateAsync).toHaveBeenCalledWith({ id: "conto-a", name: "Dopo", iban: undefined, opening_balance: undefined });
});

it("una richiesta appena approvata non risulta annullata nella vista personale", async () => {
  const codice = estrai("src/hooks/useRichieste.ts", "export async function annullaRichiestaPersonale", "function inclusiveDays")
    .replace("export async function", "async function");
  const query = {
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValueOnce({ data: null }).mockResolvedValueOnce({ data: { id: "r-a" } }),
  };
  const annulla = esegui(codice + "\nannullaRichiestaPersonale", { supabase: { from: () => query } });
  await expect(annulla("r-a", "p-a", "azienda-a")).resolves.toBe(false);
  await expect(annulla("r-a", "p-a", "azienda-a")).resolves.toBe(true);
  expect(query.eq).toHaveBeenCalledWith("stato", "in_attesa");
  expect(query.eq).toHaveBeenCalledWith("company_id", "azienda-a");
});

it("due file omonimi nello stesso millisecondo ricevono percorsi distinti", () => {
  const codice = estrai("src/hooks/useFotoCantiere.ts", "        const nomePulito =", "        const riga =");
  const ambiente = {
    file: { name: "Cantiere 01.jpg" }, companyId: "azienda-a", orderId: "commessa-a",
    Date: { now: () => 1795180000000 },
    crypto: { randomUUID: vi.fn().mockReturnValueOnce("foto-a").mockReturnValueOnce("foto-b") },
  };
  const genera = () => esegui("(() => {" + codice + "\nreturn path; })()", ambiente);
  expect([genera(), genera()]).toEqual([
    "azienda-a/commessa-a/foto-a-Cantiere_01.jpg", "azienda-a/commessa-a/foto-b-Cantiere_01.jpg",
  ]);
});

it.each([
  { erroreSalvataggio: new Error("Scrittura respinta"), completato: null, eliminazioni: 0 },
  { erroreSalvataggio: null, completato: null, eliminazioni: 1 },
  { erroreSalvataggio: null, completato: { id: "sessione-a" }, eliminazioni: 0 },
])("il render richiede la conferma della riga prima di dichiarare il risultato", async ({ erroreSalvataggio, completato, eliminazioni }) => {
  const codice = estrai("supabase/functions/generate-room-render/index.ts", "      if (erroreSalvataggio)", "      // Il credito");
  const remove = vi.fn();
  const restituisciRisultato = vi.fn();
  const esito = esegui(`(async () => {\n${codice}\nrestituisciRisultato(); })()`, {
    erroreSalvataggio, completato, resultPath: "azienda-a/risultato.png",
    supabase: { storage: { from: () => ({ remove }) } }, restituisciRisultato,
  });
  if (completato) {
    await esito;
    expect(restituisciRisultato).toHaveBeenCalledOnce();
  } else {
    await expect(esito).rejects.toThrow("risultato");
    expect(restituisciRisultato).not.toHaveBeenCalled();
  }
  expect(remove).toHaveBeenCalledTimes(eliminazioni);
});

it("il timeout nel leggere un nodo rinvia l'automazione e l'azione parte una sola volta", async () => {
  const codice = estrai("supabase/functions/process-automation/index.ts", "      // Ripete solo la lettura.", "      // Execute the node");
  const lettura = vi.fn().mockResolvedValueOnce({ error: { message: "timeout" } })
    .mockResolvedValueOnce({ data: { id: "nodo-a" } }).mockResolvedValueOnce({ data: null });
  const update = vi.fn(() => query);
  const query = {
    select: () => query, eq: () => query, maybeSingle: lettura, update,
    then: (resolve: (esito: { error?: Error }) => void) => Promise.resolve({}).then(resolve),
  };
  const azione = vi.fn();
  const item = { id: "lavoro-a", current_node_id: "nodo-a", flow_id: "flusso-a", company_id: "azienda-a", attempts: 0, max_attempts: 3 };
  const eseguiGiro = () => esegui(`(async () => { for (const item of [lavoro]) {\n${codice}\nazione(node); } })()`, {
    lavoro: item, supabase: { from: () => query }, azione,
  });
  await eseguiGiro();
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "pending", attempts: 1 }));
  expect(azione).not.toHaveBeenCalled();
  item.attempts = 1;
  await eseguiGiro();
  expect(azione).toHaveBeenCalledOnce();
  await expect(eseguiGiro()).rejects.toThrow("Nodo dell’automazione non trovato");
  expect(azione).toHaveBeenCalledOnce();
});

it.each([500, 404, 410, 204])("cancellazione evento Google HTTP %s", async (status) => {
  const codice = estrai("supabase/functions/google-calendar-sync/index.ts", "  // 1) via gli eventi", "  // 2) crea");
  const query = { eq: () => query, then: (resolve: (esito: unknown) => void) => Promise.resolve({}).then(resolve) };
  const cancellaMappa = vi.fn(() => query);
  const fetch = vi.fn(async () => new Response(null, { status }));
  const ambiente: Record<string, unknown> = {
    admin: { from: () => ({ delete: cancellaMappa }) },
    order: { company_id: "azienda-a" }, bersagliAttivi: [], GCAL: "https://example.invalid/calendars",
    mappe: [{ id: "mappa-a", google_connection_id: "connessione", google_calendar_id: "calendario", google_event_id: "evento" }],
    getConnectionById: async () => ({ id: "connessione" }), getValidAccessToken: async () => "token-di-prova",
    fetch, AbortSignal,
  };
  const risposta = esegui(`(async () => { let removed = 0;\n${codice}\nreturn removed; })()`, ambiente);
  if (status === 500) {
    await expect(risposta).rejects.toThrow("cancellazione dell’evento non confermata");
    expect(cancellaMappa).not.toHaveBeenCalled();
  } else {
    await expect(risposta).resolves.toBe(1);
    expect(cancellaMappa).toHaveBeenCalledOnce();
  }
  expect(fetch).toHaveBeenCalledOnce();
});

describe("importazione contatti: etichette, automazioni e doppioni", () => {
  function gestore() {
    const codice = estrai("src/pages/azienda/marketing/MarketingContacts.tsx", "  const handleImport =", "  if (importOpen)");
    const inserisci = vi.fn((righe: { tags: string[] }[]) => ({ select: async () => ({ data: righe.map((_, i) => ({ id: `nuovo-${i}` })) }) }));
    const aggiorna = vi.fn((_riga: { tags?: string[] }) => ({ eq: () => ({ eq: async () => ({ error: null as Error | null }) }) }));
    const iscrivi = vi.fn(async (_nome: string, arg: { p_entity_ids: string[] }) => ({ data: { enrolled: arg.p_entity_ids.length }, error: null as null }));
    const tabella = {
      select: () => ({ eq: () => ({ in: async () => ({ data: [{ id: "esistente", email: "gia@example.test", tags: ["vecchia"] }], error: null as null }) }) }),
      insert: inserisci, update: aggiorna,
    };
    const handleImport = esegui(codice + "\nhandleImport", {
      companyId: "azienda-a", canEditContacts: true, contactCustomFields: [], invalidate: vi.fn(),
      supabase: { from: () => tabella, rpc: iscrivi }, normalizeTagList, formeTelefono, telefonoInternazionale, perOgniLotto,
    });
    return { handleImport, inserisci, aggiorna, iscrivi };
  }

  it("aggiunge le etichette scelte e fa entrare i contatti importati nell'automazione", async () => {
    const { handleImport, inserisci, aggiorna, iscrivi } = gestore();
    const esito = await handleImport(
      [{ first_name: "Già", email: "gia@example.test" }, { first_name: "Nuovo", email: "nuovo@example.test", tags: "fiera" }],
      { mode: "upsert", etichette: ["Lista novembre"], automazioni: [{ id: "flusso-1", nome: "Benvenuto" }] },
    );
    expect(inserisci.mock.calls[0][0][0].tags).toEqual(expect.arrayContaining(["fiera", "lista novembre"]));
    // Il contatto già presente tiene le sue etichette.
    expect(aggiorna.mock.calls[0][0].tags).toEqual(expect.arrayContaining(["vecchia", "lista novembre"]));
    expect(iscrivi).toHaveBeenCalledWith("enroll_entities_in_flow", expect.objectContaining({ p_flow_id: "flusso-1", p_entity_type: "contact" }));
    expect(esito.fatto).toEqual(["Etichetta «lista novembre» su 2 contatti", "2 contatti entrati nell'automazione «Benvenuto»"]);
  });

  it("senza etichette nel file non cancella quelle del contatto già presente", async () => {
    const { handleImport, aggiorna } = gestore();
    await handleImport([{ first_name: "Già", email: "gia@example.test" }], { mode: "update" });
    expect(aggiorna.mock.calls[0][0]).not.toHaveProperty("tags");
  });

  it("una riga doppia nel file diventa un solo avviso, non due errori", async () => {
    const { handleImport } = gestore();
    const esito = await handleImport(
      [{ first_name: "Anna", email: "anna@example.test", phone: "348 5273876" }, { first_name: "Anna", email: "anna@example.test", phone: "3485273876" }],
      { mode: "create" },
    );
    expect(esito.errors).toEqual([]);
    expect(esito.avvisi).toEqual(["Riga 3: è lo stesso contatto della riga 2 (stessa email e stesso telefono), importato una volta sola"]);
    expect(esito.creati).toBe(1);
  });
});
