import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  hr: true,
  safety: true,
  readonly: false,
  errore: false,
  fetching: false,
  hash: "a".repeat(64),
  registrazioni: [] as unknown[],
  salva: vi.fn(),
  apri: vi.fn(),
  retry: vi.fn(),
  fontePersona: "persona",
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewPersone: m.hr,
    canViewSicurezzaCantiere: m.safety,
    solaLettura: m.readonly,
  }),
}));
vi.mock("@/hooks/useQualificheAddetto", () => ({
  useQualificheAddetto: () => ({
    data: {
      company_id: "azienda",
      persona: {
        id: "persona",
        tipo: "hr",
        nome: "TEST",
        cognome: "Addetto",
        attivo: true,
      },
      puo_classificare: true,
      fonti: [
        {
          foto: {
            id: "doc",
            impronta: m.hash,
            titolo: "TEST Originale PLE",
            file_name: "attestato.pdf",
            persona: { id: m.fontePersona, tipo: "hr" },
          },
          bucket: "hr-documenti",
          path: "azienda/persona/attestato.pdf",
        },
      ],
      registrazioni: m.registrazioni,
    },
    isLoading: false,
    isError: m.errore,
    isFetching: m.fetching,
    refetch: m.retry,
  }),
  useRegistraQualifica: () => ({ isPending: false, mutateAsync: m.salva }),
}));
vi.mock("@/lib/storagePrivato", () => ({ apriFileRiservato: m.apri }));
import { QualificheAddetto } from "@/components/sicurezza/QualificheAddetto";
const ui = () => (
  <QualificheAddetto
    companyId="azienda"
    tipo="hr"
    personaId="persona"
    apertoIniziale
  />
);
const btn = () =>
  screen.getByRole("button", { name: "Registra riesame" }) as HTMLButtonElement;
const chk = () =>
  screen.getByRole("checkbox", {
    name: /Ho letto l’originale/,
  }) as HTMLInputElement;
function compila() {
  fireEvent.click(screen.getByRole("button", { name: "Registra qualifica" }));
  fireEvent.change(screen.getByLabelText("Originale della persona"), {
    target: { value: "doc" },
  });
  for (const [label, value] of [
    ["Titolo della qualifica", "TEST PLE"],
    [
      "Ambito documentato (attività, ruolo, attrezzatura)",
      "TEST PLE specifica",
    ],
    ["Soggetto/ente attestante", "Ente TEST"],
    ["Decorrenza documentata", "2026-11-01"],
    ["Scadenza documentata", "2027-10-31"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
async function leggi() {
  fireEvent.click(
    screen.getByRole("button", { name: "Apri originale da riesaminare" }),
  );
  await waitFor(() => expect(chk().disabled).toBe(false));
  fireEvent.click(chk());
}
beforeEach(() => {
  m.hr = true;
  m.safety = true;
  m.readonly = false;
  m.errore = false;
  m.fetching = false;
  m.hash = "a".repeat(64);
  m.registrazioni = [];
  m.fontePersona = "persona";
  vi.clearAllMocks();
  m.apri.mockResolvedValue(undefined);
  m.salva.mockResolvedValue({ id: "ok" });
});
afterEach(cleanup);
it("richiede originale aperto prima della conferma", () => {
  render(ui());
  compila();
  expect(chk().disabled).toBe(true);
  expect(btn().disabled).toBe(true);
  expect(m.apri).not.toHaveBeenCalled();
});
it("registra fonte e persona attraverso il contesto senza allegare un path nella scrittura", async () => {
  render(ui());
  compila();
  await leggi();
  fireEvent.click(btn());
  await waitFor(() => expect(m.salva).toHaveBeenCalledOnce());
  expect(m.apri).toHaveBeenCalledWith(
    "hr-documenti",
    "azienda/persona/attestato.pdf",
  );
  expect(m.salva.mock.calls[0][0]).toMatchObject({
    precedente: null,
    azione: "riesamina",
    fonte: "doc",
    impronta: m.hash,
    dati: { conferma_lettura: true, ambito: "TEST PLE specifica" },
  });
  expect(JSON.stringify(m.salva.mock.calls[0][0])).not.toContain(
    "attestato.pdf",
  );
});
it("una modifica del riesame annulla la conferma", async () => {
  render(ui());
  compila();
  await leggi();
  fireEvent.change(screen.getByLabelText("Limitazioni e condizioni"), {
    target: { value: "TEST limiti" },
  });
  expect(chk().checked).toBe(false);
  expect(btn().disabled).toBe(true);
});
it("una nuova impronta richiede rilettura e conferma", async () => {
  const v = render(ui());
  compila();
  await leggi();
  m.hash = "b".repeat(64);
  v.rerender(ui());
  expect(chk().checked).toBe(false);
  expect(chk().disabled).toBe(true);
  expect(btn().disabled).toBe(true);
});
it("dopo risposta incerta il ritentativo conserva lo stesso identificatore", async () => {
  m.salva.mockRejectedValueOnce(new Error("Risposta incerta"));
  render(ui());
  compila();
  await leggi();
  fireEvent.click(btn());
  await waitFor(() => expect(m.salva).toHaveBeenCalledTimes(1));
  fireEvent.click(btn());
  await waitFor(() => expect(m.salva).toHaveBeenCalledTimes(2));
  expect(m.salva.mock.calls[0][0].id).toBe(m.salva.mock.calls[1][0].id);
});
it("la sola lettura non propone scritture", () => {
  m.readonly = true;
  render(ui());
  expect(
    screen.queryByRole("button", { name: "Registra qualifica" }),
  ).toBeNull();
});
it("Sicurezza senza Personale non usa originali HR eventualmente in cache", () => {
  m.hr = false;
  render(ui());
  expect(
    screen.queryByRole("button", { name: "Registra qualifica" }),
  ).toBeNull();
  expect(m.apri).not.toHaveBeenCalled();
});
it("nessun permesso nasconde anche lo storico in cache", () => {
  m.hr = false;
  m.safety = false;
  render(ui());
  expect(screen.queryByText(/Formazione, abilitazioni/)).toBeNull();
});
it("l’errore non viene presentato come assenza di qualifiche", () => {
  m.errore = true;
  render(ui());
  expect(screen.getByRole("alert").textContent).toContain("non disponibili");
  expect(screen.queryByText(/Nessuna qualifica riesaminata/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Riprova qualifiche" }));
  expect(m.retry).toHaveBeenCalledOnce();
});
it("non apre l’originale di un omonimo o una fonte non pertinente", async () => {
  m.fontePersona = "altro";
  render(ui());
  compila();
  fireEvent.click(
    screen.getByRole("button", { name: "Apri originale da riesaminare" }),
  );
  await waitFor(() => expect(m.apri).not.toHaveBeenCalled());
  expect(chk().disabled).toBe(true);
});
it("un errore di apertura non abilita la conferma", async () => {
  m.apri.mockRejectedValueOnce(new Error("Originale non disponibile"));
  render(ui());
  compila();
  fireEvent.click(
    screen.getByRole("button", { name: "Apri originale da riesaminare" }),
  );
  await waitFor(() => expect(m.apri).toHaveBeenCalledOnce());
  expect(chk().disabled).toBe(true);
});
it("revoca motivata senza richiedere un originale ormai rimosso", async () => {
  m.registrazioni = [
    {
      id: "r1",
      famiglia_id: "f1",
      versione: 1,
      stato: "riesaminata",
      fonte_corrente: false,
      registrato_il: "2026-11-01",
      dati: {
        titolo: "TEST PLE",
        tipologia: "abilitazione",
        ambito: "TEST",
        ente: "Ente",
        validita_dal: "2026-11-01",
        validita_al: "2027-10-31",
      },
      motivo: "",
    },
  ];
  render(ui());
  fireEvent.click(screen.getByRole("button", { name: "Revoca qualifica" }));
  const b = screen.getByRole("button", {
    name: "Registra revoca",
  }) as HTMLButtonElement;
  expect(b.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Motivo della revoca"), {
    target: { value: "TEST ritiro attestazione" },
  });
  fireEvent.click(b);
  await waitFor(() => expect(m.salva).toHaveBeenCalledOnce());
  expect(m.salva.mock.calls[0][0]).toMatchObject({
    precedente: "r1",
    azione: "revoca",
    fonte: null,
    impronta: null,
    dati: null,
    motivo: "TEST ritiro attestazione",
  });
  expect(m.apri).not.toHaveBeenCalled();
});
it("un lettore HR può aprire l’originale corrente senza modificare il riesame", async () => {
  m.readonly = true;
  m.registrazioni = [
    {
      id: "r1",
      famiglia_id: "f1",
      versione: 1,
      stato: "riesaminata",
      fonte_id: "doc",
      fonte_corrente: true,
      registrato_il: "2026-11-01",
      dati: {
        titolo: "TEST PLE",
        tipologia: "abilitazione",
        ambito: "TEST",
        ente: "Ente",
        validita_dal: "2026-11-01",
        validita_al: "2027-10-31",
      },
      motivo: "",
    },
  ];
  render(ui());
  fireEvent.click(
    screen.getByRole("button", { name: "Apri originale corrente" }),
  );
  await waitFor(() => expect(m.apri).toHaveBeenCalledOnce());
  expect(screen.queryByRole("button", { name: "Nuova revisione" })).toBeNull();
});
it("la sola Sicurezza non apre dal registro l’originale HR in cache", () => {
  m.hr = false;
  m.registrazioni = [
    {
      id: "r1",
      famiglia_id: "f1",
      versione: 1,
      stato: "riesaminata",
      fonte_id: "doc",
      fonte_corrente: true,
      registrato_il: "2026-11-01",
      dati: {
        titolo: "TEST PLE",
        tipologia: "abilitazione",
        ambito: "TEST",
        ente: "Ente",
        validita_dal: "2026-11-01",
        validita_al: "2027-10-31",
      },
      motivo: "",
    },
  ];
  render(ui());
  expect(screen.getByText("TEST PLE · Rev. 1")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Apri originale corrente" }),
  ).toBeNull();
});
