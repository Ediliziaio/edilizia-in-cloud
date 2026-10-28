import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  legge: true,
  ro: false,
  errore: false,
  hash: "a".repeat(64),
  salva: vi.fn(),
  rileggi: vi.fn(),
  profili: [] as unknown[],
  storico: [] as unknown[],
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewSicurezzaCantiere: m.legge,
    solaLettura: m.ro,
  }),
}));
vi.mock("@/hooks/useProfiliRequisiti", () => ({
  useProfiliRequisiti: () => ({
    data: m.profili,
    refetch: m.rileggi,
    isError: false,
    isLoading: false,
    isFetching: false,
  }),
}));
vi.mock("@/hooks/useMezziPos", () => ({
  useMezziPos: () => ({
    data: { fonti: [] as never[] },
    refetch: m.rileggi,
    isError: false,
    isLoading: false,
    isFetching: false,
  }),
}));
vi.mock("@/components/sicurezza/QualificheAddetto", () => ({
  QualificheAddetto: () : null => null,
}));
vi.mock("@/hooks/useRequisitiAddetti", () => ({
  useAddettiCommessa: (
    _c: string,
    _o: string,
    dal: string,
    al: string,
    fase: string | null,
  ) => ({
    data: {
      company_id: "c",
      order_id: "o",
      dal,
      al,
      fase_id: fase,
      impronta: m.hash,
      da_collegare: [
        {
          chiave: "x",
          fonte_id: "x",
          nome: "TEST",
          cognome: "Da collegare",
          motivo: "Profilo HR non collegato",
        },
      ],
      persone: [
        {
          id: "h",
          tipo: "hr",
          nome: "TEST",
          cognome: "Omonimo",
          attivo: true,
          mansione: "TEST mansione",
          periodi: [
            {
              fonte: "commessa",
              fonte_id: "a",
              fase_id: null as null,
              dal,
              al,
              senza_date: true,
            },
          ],
        },
      ],
      qualifiche: [
        {
          id: "q",
          famiglia_id: "qf",
          versione: 1,
          persona_id: "h",
          persona_tipo: "hr",
          stato: "riesaminata",
          fonte_corrente: true,
          contesto_originale: {
            order_id: null as null,
            fase_id: null as null,
            dal: null as null,
            al: null as null,
          },
          dati: {
            titolo: "TEST PLE",
            ambito: "TEST piattaforma",
            limitazioni: "TEST limiti",
            validita_dal: "2026-11-01",
            validita_al: "2027-10-31",
          },
        },
        {
          id: "altra",
          persona_id: "altra",
          persona_tipo: "hr",
          dati: { titolo: "EVIDENZA DI UN ALTRO ADDETTO" },
        },
      ],
    },
    refetch: m.rileggi,
    isError: m.errore,
    isLoading: false,
    isFetching: false,
  }),
  useStoricoAddetti: () => ({
    data: m.storico,
    refetch: m.rileggi,
    isError: false,
    isLoading: false,
  }),
  useRegistraRiesameAddetti: () => ({ mutateAsync: m.salva, isPending: false }),
  useDettaglioRiesameAddetti: () => ({
    data: [] as never[],
    refetch: m.rileggi,
    isError: false,
    isLoading: false,
  }),
}));
import { RequisitiAddettiCommessa } from "@/components/sicurezza/RequisitiAddettiCommessa";
const profile = (id = "p", versione = 1, archiviato = false) => ({
  id,
  company_id: "c",
  famiglia_id: "fam",
  versione,
  archiviato,
  nome: "TEST Profilo",
  ruoli: "TEST addetti",
  criteri: [
    {
      id: "r",
      titolo: "TEST Requisito",
      catalogo_id: null as null,
      catalogo_versione: null as null,
      riferimento: "TEST fonte",
      indicazioni: "TEST adattamento",
    },
  ],
});
const ui = () => (
  <RequisitiAddettiCommessa
    companyId="c"
    orderId="o"
    dataRiferimento="2026-11-10"
  />
);
const apri = () =>
  fireEvent.click(
    screen.getByRole("button", {
      name: /Requisiti e qualifiche degli addetti/,
    }),
  );
function prepara() {
  apri();
  fireEvent.click(screen.getByRole("checkbox", { name: /TEST Requisito/ }));
  fireEvent.click(
    screen.getByRole("button", { name: "Prepara riscontri nominativi" }),
  );
}
function intestazione() {
  for (const [label, value] of [
    ["Attività da verificare", "TEST attività"],
    ["Responsabile del riesame", "TEST referente"],
    ["Ruolo del responsabile", "TEST tecnico"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Ho controllato le assegnazioni/ }),
  );
}
function positivo() {
  intestazione();
  fireEvent.change(screen.getByLabelText("Riscontro 1"), {
    target: { value: "riesaminata" },
  });
  fireEvent.change(screen.getByLabelText("Qualifica 1"), {
    target: { value: "q" },
  });
  fireEvent.change(screen.getByLabelText("Motivazione e prossima azione"), {
    target: { value: "TEST ambito e limiti pertinenti" },
  });
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Confermo la pertinenza/ }),
  );
}
beforeEach(() => {
  m.legge = true;
  m.ro = false;
  m.errore = false;
  m.hash = "a".repeat(64);
  m.profili = [profile()];
  m.storico = [];
  vi.clearAllMocks();
  m.salva.mockResolvedValue({ id: "ok" });
});
afterEach(cleanup);
it("mostra i collegamenti mancanti senza chiamarli copertura completa", () => {
  render(ui());
  apri();
  expect(screen.getByText("Copertura nominativa parziale")).toBeTruthy();
  expect(screen.getByText(/TEST Da collegare/)).toBeTruthy();
});
it("non precompila evidenze o conferme dal solo nome del requisito", () => {
  render(ui());
  prepara();
  expect(screen.getByLabelText("Riscontro 1")).toHaveProperty(
    "value",
    "da_verificare",
  );
  expect(screen.queryByLabelText("Qualifica 1")).toBeNull();
  expect(m.salva).not.toHaveBeenCalled();
});
it("registra identificativi e decisioni senza copiare file o snapshot client", async () => {
  render(ui());
  prepara();
  positivo();
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: /Ho definito i requisiti nominativi/,
    }),
  );
  expect(
    (
      screen.getByRole("checkbox", {
        name: /Confermo la pertinenza/,
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Registra riscontri" }));
  await waitFor(() => expect(m.salva).toHaveBeenCalledOnce());
  expect(m.salva.mock.calls[0][0]).toMatchObject({
    dal: "2026-11-10",
    al: "2026-11-10",
    dati: {
      requisiti_definiti: true,
      righe: [{ persona_id: "h", qualifica_id: "q", confermata: true }],
    },
  });
  expect(JSON.stringify(m.salva.mock.calls[0][0])).not.toContain(
    "persona_snapshot",
  );
});
it("non propone la qualifica di un altro addetto anche con titolo simile", () => {
  render(ui());
  prepara();
  intestazione();
  fireEvent.change(screen.getByLabelText("Riscontro 1"), {
    target: { value: "riesaminata" },
  });
  expect(
    screen.queryByRole("option", { name: /EVIDENZA DI UN ALTRO ADDETTO/ }),
  ).toBeNull();
});
it("una modifica della motivazione annulla la conferma", () => {
  render(ui());
  prepara();
  positivo();
  fireEvent.change(screen.getByLabelText("Motivazione e prossima azione"), {
    target: { value: "Modificata" },
  });
  expect(
    (
      screen.getByRole("checkbox", {
        name: /Confermo la pertinenza/,
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
});
it("una fonte cambiata blocca l’invio e non presenta le vecchie conferme come correnti", () => {
  const v = render(ui());
  prepara();
  positivo();
  m.hash = "b".repeat(64);
  v.rerender(ui());
  expect(
    (
      screen.getByRole("button", {
        name: "Registra riscontri",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    (
      screen.getByRole("checkbox", {
        name: /Confermo la pertinenza/,
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
  expect(screen.getByText(/Fonti o contesto cambiati/)).toBeTruthy();
});
it("ritenta l’ultimo payload esatto anche se il contesto è nel frattempo cambiato", async () => {
  m.salva.mockRejectedValueOnce(new Error("Risposta incerta"));
  const v = render(ui());
  prepara();
  positivo();
  fireEvent.click(screen.getByRole("button", { name: "Registra riscontri" }));
  await waitFor(() => expect(m.salva).toHaveBeenCalledOnce());
  m.hash = "b".repeat(64);
  v.rerender(ui());
  fireEvent.click(
    screen.getByRole("button", { name: "Ritenta l’ultimo invio esatto" }),
  );
  await waitFor(() => expect(m.salva).toHaveBeenCalledTimes(2));
  expect(m.salva.mock.calls[1][0]).toEqual(m.salva.mock.calls[0][0]);
});
it("la non applicabilità rimuove l’evidenza del riscontro precedente", async () => {
  render(ui());
  prepara();
  positivo();
  fireEvent.change(screen.getByLabelText("Riscontro 1"), {
    target: { value: "non_applicabile" },
  });
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Confermo la pertinenza/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Registra riscontri" }));
  await waitFor(() => expect(m.salva).toHaveBeenCalledOnce());
  expect(m.salva.mock.calls[0][0].dati.righe[0]).toMatchObject({
    esito: "non_applicabile",
    qualifica_id: null,
    confermata: true,
  });
});
it("la sola lettura consulta il contesto senza preparare scritture", () => {
  m.ro = true;
  render(ui());
  apri();
  expect(
    screen.queryByRole("button", { name: "Prepara riscontri nominativi" }),
  ).toBeNull();
  expect(screen.getByText("Copertura nominativa parziale")).toBeTruthy();
});
it("nasconde i dati in cache se manca il permesso Sicurezza", () => {
  m.legge = false;
  render(ui());
  expect(screen.queryByText(/Requisiti e qualifiche/)).toBeNull();
});
it("non presenta l’errore di fonte come organico vuoto", () => {
  m.errore = true;
  render(ui());
  apri();
  expect(screen.getByRole("alert").textContent).toContain(
    "non ancora disponibili",
  );
  expect(screen.queryByText(/Nessun addetto collegato/)).toBeNull();
});
it("il nuovo riesame storico riparte senza giudizi e responsabile ereditati", () => {
  m.storico = [
    {
      id: "v1",
      company_id: "c",
      order_id: "o",
      fase_id: null,
      famiglia_id: "vf",
      versione: 1,
      dal: "2026-11-10",
      al: "2026-11-10",
      stato: "riscontri_registrati",
      riscontri: 1,
      non_collegati: 0,
      impronta: m.hash,
      registrato_il: "2026-11-10T09:00:00Z",
      dati: {
        attivita: "TEST vecchia attività",
        responsabile: "TEST precedente",
        ruolo_responsabile: "TEST ruolo",
        requisiti: [{ profilo_id: "p", requisito_id: "r" }],
        attrezzatura: null,
      },
    },
  ];
  render(ui());
  apri();
  fireEvent.click(
    screen.getByRole("button", { name: "Riesamina senza ereditare conferme" }),
  );
  expect(screen.getByLabelText("Responsabile del riesame")).toHaveProperty(
    "value",
    "",
  );
  expect(screen.getByLabelText("Riscontro 1")).toHaveProperty(
    "value",
    "da_verificare",
  );
  expect(
    screen.queryByRole("checkbox", { name: /Confermo la pertinenza/ }),
  ).toBeNull();
});
it("filtra la consultazione ma registra anche le righe nascoste senza perdere gli esiti", async () => {
  const profilo = profile();
  profilo.criteri.push({
    ...profilo.criteri[0],
    id: "r2",
    titolo: "TEST Secondo requisito",
  });
  m.profili = [profilo];
  render(ui());
  apri();
  fireEvent.click(screen.getByRole("checkbox", { name: /TEST Requisito/ }));
  fireEvent.click(
    screen.getByRole("checkbox", { name: /TEST Secondo requisito/ }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Prepara riscontri nominativi" }),
  );
  intestazione();
  fireEvent.change(screen.getByLabelText("Riscontro 1"), {
    target: { value: "mancante" },
  });
  fireEvent.change(
    screen.getAllByLabelText("Motivazione e prossima azione")[0],
    { target: { value: "TEST acquisire originale" } },
  );
  fireEvent.change(screen.getByLabelText("Filtra riscontri per esito"), {
    target: { value: "da_verificare" },
  });
  expect(screen.queryByLabelText("Riscontro 1")).toBeNull();
  expect(screen.getByLabelText("Riscontro 2")).toHaveProperty(
    "value",
    "da_verificare",
  );
  fireEvent.change(screen.getByLabelText("Cerca nei riscontri"), {
    target: { value: "non presente" },
  });
  expect(screen.queryByLabelText("Riscontro 2")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Registra riscontri" }));
  await waitFor(() => expect(m.salva).toHaveBeenCalledOnce());
  expect(m.salva.mock.calls[0][0].dati.righe).toEqual([
    expect.objectContaining({
      requisito_id: "r",
      esito: "mancante",
      motivazione: "TEST acquisire originale",
    }),
    expect.objectContaining({ requisito_id: "r2", esito: "da_verificare" }),
  ]);
});
