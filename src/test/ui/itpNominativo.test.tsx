import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
const s = vi.hoisted(() => ({
  salva: vi.fn(),
  rileggi: vi.fn(),
  roster: { operai: [] as unknown[], incarichi: [] as unknown[] },
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewSicurezzaCantiere: true,
    solaLettura: false,
  }),
}));
vi.mock("@/hooks/useProfiliRequisiti", () => ({
  useProfiliRequisiti: () => ({ data: [] as never[], isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useVerificheItp", () => ({
  useSoggettiItp: () => ({ data: undefined as undefined, isLoading: false, isError: false }),
  leggiSoggettiItp: s.rileggi,
  useVerificheItp: () => ({
    data: [] as never[],
    isLoading: false,
    isError: false,
    refetch: async () => ({ data: [] as never[] }),
  }),
  useContestoItp: () => ({
    data: undefined as undefined,
    isLoading: false,
    isError: false,
    refetch: async () => ({
      data: {
        impresa: { id: "sub", ragione_sociale: "Impresa" },
        commessa: { id: "ordine", order_code: "ORD" },
        fase: null as null,
      },
    }),
  }),
  useRegistraItp: () => ({ mutateAsync: s.salva, isPending: false }),
}));
vi.mock("@/hooks/useFascicoloCantiere", () => ({ apriFileFascicolo: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { VerificaItpImpresa } from "@/components/sicurezza/VerificaItpImpresa";
import type { EvidenzaFascicolo } from "@/lib/sicurezza/fascicolo";
const operaio = (id: string) => ({
  id,
  nome: "Mario",
  cognome: id,
  mansione: "Posatore",
  attivo: true,
  updated_at: "2026-10-27",
  assegnazioni: [
    {
      id: `ass${id}`,
      dal: "2026-11-01",
      al: null as null,
      attivita: "Posa",
      fase_id: null as null,
      area: null as null,
      updated_at: "2026-10-27",
    },
  ],
});
const evidenza = (
  id: string,
  operaio_id: string | null,
  incarico_id: string | null = null,
) =>
  ({
    id,
    company_id: "azienda",
    subappaltatore_id: incarico_id ? null : "sub",
    order_id: incarico_id ? "ordine" : null,
    operaio_id,
    incarico_id,
    titolo: incarico_id ? "Nomina CSE" : `Certificato ${operaio_id}`,
    tipo: incarico_id ? "nomina" : "formazione",
    catalogo_id: incarico_id ? "nomina_cse" : "formazione_lavoratori",
    catalogo_versione: 1,
    stato: "verificato",
    updated_at: "2026-10-27",
    file_path: `file${id}`,
    file_name: `${id}.pdf`,
  }) as EvidenzaFascicolo;
afterEach(cleanup);
beforeEach(() => {
  s.roster = {
    operai: [operaio("A"), operaio("B")],
    incarichi: [
      {
        id: "cse",
        ruolo: "cse",
        nominativo: "Coordinatore del cantiere",
        dal: "2026-11-01",
        al: null,
        stato: "documentato",
        figura_id: null,
        subappaltatore_id: null,
        order_id: "ordine",
        updated_at: "2026-10-27",
      },
    ],
  };
  s.rileggi
    .mockReset()
    .mockImplementation(async () => JSON.parse(JSON.stringify(s.roster)));
  s.salva.mockReset().mockResolvedValue({ id: "v" });
});
async function apri() {
  render(
    <VerificaItpImpresa
      companyId="azienda"
      orderId="ordine"
      subId="sub"
      evidenze={[
        evidenza("eA", "A"),
        evidenza("eB", "B"),
        evidenza("eCse", null, "cse"),
      ]}
      giorno="2026-11-01"
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Registra verifica ITP" }),
  );
  await screen.findByRole("dialog");
}
function aggiungi(catalogo = "formazione_lavoratori") {
  fireEvent.change(screen.getByLabelText("Aggiungi criterio dal catalogo"), {
    target: { value: catalogo },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Aggiungi dal catalogo" }),
  );
}
function compila() {
  fireEvent.change(screen.getByLabelText("Lavori e ambito esaminati"), {
    target: { value: "Posa per questa commessa" },
  });
  fireEvent.change(screen.getByLabelText("Responsabile della valutazione"), {
    target: { value: "Tecnico" },
  });
  fireEvent.change(screen.getByLabelText("Ruolo del responsabile"), {
    target: { value: "Responsabile" },
  });
  fireEvent.change(
    screen.getByLabelText("Motivazione dell’esito e azioni richieste"),
    { target: { value: "Integrazioni per il caso" } },
  );
}
describe("Criteri nominativi nella verifica ITP", () => {
  it("scegliendo un operaio mostra solo i documenti di quel titolare, poi estende senza ereditare il file", async () => {
    await apri();
    aggiungi();
    fireEvent.change(screen.getByLabelText("Operaio titolare"), {
      target: { value: "A" },
    });
    expect(screen.getByText("Certificato A")).toBeTruthy();
    expect(screen.queryByText("Certificato B")).toBeNull();
    const label = screen.getByText("Certificato A").closest("label")!;
    fireEvent.click(within(label).getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Estendi agli addetti assegnati (2)",
      }),
    );
    expect(screen.getAllByLabelText("Operaio titolare")).toHaveLength(2);
    expect(
      screen
        .getAllByLabelText("Operaio titolare")
        .every((e) => (e as HTMLSelectElement).disabled),
    ).toBe(true);
    compila();
    fireEvent.click(
      screen.getByRole("button", { name: "Registra nello storico" }),
    );
    await waitFor(() => expect(s.salva).toHaveBeenCalledTimes(1));
    const cs = s.salva.mock.calls[0][0].dati.criteri;
    expect(cs.map((c: { operaio_id: string }) => c.operaio_id)).toEqual([
      "A",
      "B",
    ]);
    expect(
      cs.every(
        (c: { evidenze: unknown[]; applicabilita: string; esito: string }) =>
          !c.evidenze.length &&
          c.applicabilita === "da_chiarire" &&
          c.esito === "da_verificare",
      ),
    ).toBe(true);
  });
  it("la rilettura esplicita aggiorna i membri, rimette da verificare e non avanza silenziosamente il token", async () => {
    await apri();
    aggiungi();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Estendi agli addetti assegnati (2)",
      }),
    );
    fireEvent.change(screen.getAllByLabelText("Applicabilità")[0], {
      target: { value: "applicabile" },
    });
    fireEvent.change(screen.getAllByLabelText("Esito del criterio")[0], {
      target: { value: "conforme" },
    });
    s.roster = { ...s.roster, operai: [...s.roster.operai, operaio("C")] };
    expect(screen.getAllByLabelText("Operaio titolare")).toHaveLength(2);
    expect(s.rileggi).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Rileggi soggetti e azzera le verifiche nominative",
      }),
    );
    await waitFor(() =>
      expect(screen.getAllByLabelText("Operaio titolare")).toHaveLength(3),
    );
    expect(
      screen
        .getAllByLabelText("Esito del criterio")
        .every((e) => (e as HTMLSelectElement).value === "da_verificare"),
    ).toBe(true);
    expect(
      screen
        .getAllByLabelText("Applicabilità")
        .every((e) => (e as HTMLSelectElement).value === "da_chiarire"),
    ).toBe(true);
    compila();
    fireEvent.click(
      screen.getByRole("button", { name: "Registra nello storico" }),
    );
    await waitFor(() => expect(s.salva).toHaveBeenCalledTimes(1));
    expect(s.salva.mock.calls[0][0].dati.soggetti_attesi.operai).toHaveLength(
      3,
    );
  });
  it("usa la nomina generale della commessa con il suo incarico, senza attribuirla all’impresa", async () => {
    await apri();
    aggiungi("nomina_cse");
    fireEvent.change(screen.getByLabelText("Ruolo da esaminare"), {
      target: { value: "cse" },
    });
    fireEvent.change(screen.getByLabelText("Incarico titolare"), {
      target: { value: "cse" },
    });
    expect(screen.getByText("Nomina CSE",{selector:"span"})).toBeTruthy();
    expect(screen.queryByText("Certificato A")).toBeNull();
    compila();
    fireEvent.click(
      screen.getByRole("button", { name: "Registra nello storico" }),
    );
    await waitFor(() => expect(s.salva).toHaveBeenCalledTimes(1));
    expect(s.salva.mock.calls[0][0].dati.criteri[0]).toMatchObject({
      destinatario: "incarico",
      incarico_id: "cse",
      ruolo: "cse",
    });
  });
  it("non inventa un titolare quando il gruppo non ha addetti", async () => {
    s.roster.operai = [];
    await apri();
    aggiungi();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Estendi agli addetti assegnati (0)",
      }),
    );
    compila();
    fireEvent.click(
      screen.getByRole("button", { name: "Registra nello storico" }),
    );
    await waitFor(() => expect(s.salva).toHaveBeenCalledTimes(1));
    const cs = s.salva.mock.calls[0][0].dati.criteri;
    expect(cs).toHaveLength(1);
    expect(cs[0].operaio_id).toBeUndefined();
    expect(cs[0].esito).toBe("da_verificare");
    expect(cs[0].applicabilita).toBe("da_chiarire");
  });
});
