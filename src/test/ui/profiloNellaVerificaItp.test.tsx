import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
const s = vi.hoisted(() => ({
  salva: vi.fn(),
  profiles: [
    {
      id: "p1",
      company_id: "azienda",
      famiglia_id: "p1",
      versione: 1,
      nome: "Posa interna",
      attivita: "Posa serramenti",
      ruoli: "Impresa e preposto",
      limiti: "Esclusi ponteggi",
      archiviato: false,
      criteri: [
        {
          id: "r1",
          titolo: "Criterio A",
          catalogo_id: null as null,
          catalogo_versione: null as null,
          riferimento: "Rif A",
          indicazioni: "Guida A",
        },
        {
          id: "r2",
          titolo: "Criterio B",
          catalogo_id: null as null,
          catalogo_versione: null as null,
          riferimento: "Rif B",
          indicazioni: "Guida B",
        },
      ],
    },
  ],
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewSicurezzaCantiere: true,
    solaLettura: false,
  }),
}));
vi.mock("@/hooks/useProfiliRequisiti", () => ({
  useProfiliRequisiti: () => ({
    data: s.profiles,
    isError: false,
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useVerificheItp", () => ({
  useSoggettiItp:()=>({data: undefined as undefined,isError:false,isLoading:false}),
  leggiSoggettiItp:async()=>({operai:[] as never[],incarichi:[] as never[]}),
  useVerificheItp: () => ({
    data: [] as never[],
    isError: false,
    isLoading: false,
    refetch: async () => ({ data: [] as never[] }),
  }),
  useContestoItp: () => ({
    data: undefined as undefined,
    isError: false,
    isLoading: false,
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
afterEach(cleanup);
it("il profilo entra nella verifica con tutti i criteri, senza esiti; non eredita una motivazione e le modifiche azzerano la conferma", async () => {
  s.salva.mockResolvedValue({ id: "verifica" });
  render(
    <VerificaItpImpresa
      companyId="azienda"
      orderId="ordine"
      subId="sub"
      evidenze={[]}
      giorno="2026-11-01"
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Registra verifica ITP" }),
  );
  await screen.findByRole("dialog");
  fireEvent.change(screen.getByLabelText("Profilo requisiti da caricare"), {
    target: { value: "p1" },
  });
  expect(screen.getByText("Esclusi ponteggi")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Carica criteri del profilo" }),
  );
  expect(screen.getByLabelText("Criterio 1")).toHaveValue("Criterio A");
  expect(screen.getByLabelText("Criterio 1")).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Rimuovi criterio 1" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Rimuovi criterio 2" }),
  ).toBeDisabled();
  expect(
    screen
      .getAllByLabelText("Note e motivazione della non applicabilità")
      .every((e) => (e as HTMLTextAreaElement).value === ""),
  ).toBe(true);
  const conferma = screen.getByRole("checkbox", {
    name: /Ho definito ed esaminato/,
  });
  fireEvent.click(conferma);
  expect(conferma).toBeChecked();
  fireEvent.change(screen.getAllByLabelText("Riferimento del criterio")[0], {
    target: { value: "Adattato al caso" },
  });
  expect(conferma).not.toBeChecked();
  fireEvent.change(screen.getByLabelText("Lavori e ambito esaminati"), {
    target: { value: "Posa in questa commessa" },
  });
  fireEvent.change(screen.getByLabelText("Responsabile della valutazione"), {
    target: { value: "Tecnico" },
  });
  fireEvent.change(screen.getByLabelText("Ruolo del responsabile"), {
    target: { value: "Responsabile" },
  });
  fireEvent.change(
    screen.getByLabelText("Motivazione dell’esito e azioni richieste"),
    { target: { value: "Da integrare per questo caso" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Registra nello storico" }),
  );
  await waitFor(() => expect(s.salva).toHaveBeenCalledTimes(1));
  const d = s.salva.mock.calls[0][0].dati;
  expect(d.criteri).toHaveLength(2);
  expect(
    d.criteri.every(
      (c: {
        profilo_id: string;
        esito: string;
        applicabilita: string;
        evidenze: string[];
      }) =>
        c.profilo_id === "p1" &&
        c.esito === "da_verificare" &&
        c.applicabilita === "da_chiarire" &&
        !c.evidenze.length,
    ),
  ).toBe(true);
  expect(d.completezza).toBe(false);
  expect(d.esito).toBe("da_integrare");
});
