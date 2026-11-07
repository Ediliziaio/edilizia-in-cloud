import "@testing-library/jest-dom/vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { DocumentoOperativo } from "@/lib/documentiOperativi/modello";
const mock = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  genera: vi.fn(),
  modello: vi.fn(),
  company: { id: "c1", name: "Azienda uno", email: "uno@demo.invalid" },
}));
vi.mock("@/lib/modelliPdf/repository",()=>({leggiModelloPdf:mock.modello}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: mock.company, user: { id: "u1" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ upload: mock.upload, remove: mock.remove }) },
  },
}));
vi.mock("@/components/orders/CommessaCombobox", () => ({
  CommessaCombobox: ({
    onChange,
    onSelection,
  }: {
    onChange: (v: string | null) => void;
    onSelection: (v: unknown) => void;
  }) => (
    <><button onClick={()=>{onChange(null);onSelection(null);}}>Rimuovi commessa test</button><button
      onClick={() => {
        onChange("commessa-test");
        onSelection({
          id: "commessa-test",
          order_code: "COMM-42",
          description: "Ristrutturazione",
          client_name: "Cliente demo",
          work_address: "Via del Cantiere 42",
        });
      }}
    >
      Scegli commessa test
    </button></>
  ),
}));
vi.mock("@/hooks/useWarehouses", () => ({
  useWarehouses: () => ({ warehouses: [] as unknown[], isLoading: false, error: null as Error | null }),
}));
vi.mock("@/lib/documentiOperativi/pdf", () => ({
  generaPdfOperativo: mock.genera,
}));
vi.mock("@/pages/azienda/email/components/EmailComposeDialog", () => ({
  EmailComposeDialog: ({ context }: { context: unknown }) => (
    <pre data-testid="email">{JSON.stringify(context)}</pre>
  ),
}));
import { DocumentoInvioDialog } from "@/components/documentiOperativi/DocumentoInvioDialog";
const documento: DocumentoOperativo = {
  tipo: "materiali",
  numero: "ODA-TEST",
  destinatario: { nome: "Demo" },
  righe: [
    {
      descrizione: "Materiale",
      unita: "mq",
      quantita: 40,
      prezzo: 18,
      iva: 10,
    },
  ],
};
const props = {
  open: true,
  onOpenChange: vi.fn(),
  documento,
  context: {
    mode: "new" as const,
    initialTo: ["demo@demo.invalid"],
    initialSubject: "ODA-TEST",
  },
};
beforeEach(() => {
  mock.modello.mockReset().mockResolvedValue({condizioni:""});
  mock.upload.mockReset().mockResolvedValue({ error: null as Error | null });
  mock.remove.mockReset().mockResolvedValue({ error: null as Error | null });
  mock.genera
    .mockReset()
    .mockResolvedValue(new Blob(["%PDF-1.4"], { type: "application/pdf" }));
  mock.company = { id: "c1", name: "Azienda uno", email: "uno@demo.invalid" };
});
afterEach(cleanup);
describe("Scelta testo o PDF", () => {
  it("testo completo senza caricare file né inviare email", async () => {
    render(<DocumentoInvioDialog {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Prepara email" }));
    await waitFor(() =>
      expect(screen.getByTestId("email")).toBeInTheDocument(),
    );
    const ctx = JSON.parse(screen.getByTestId("email").textContent!);
    expect(ctx.initialBodyHtml).toContain("Materiale");
    expect(ctx.initialBodyHtml).toContain("792,00");
    expect(ctx.initialAttachments).toEqual([]);
    expect(mock.upload).not.toHaveBeenCalled();
  });
  it("PDF generato e allegato alla bozza con messaggio breve", async () => {
    render(<DocumentoInvioDialog {...props} />);
    fireEvent.click(
      screen.getByRole("radio", { name: "PDF allegato con messaggio breve" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Prepara email" }));
    await waitFor(() =>
      expect(screen.getByTestId("email")).toBeInTheDocument(),
    );
    const ctx = JSON.parse(screen.getByTestId("email").textContent!);
    expect(mock.upload).toHaveBeenCalledOnce();
    expect(mock.upload.mock.calls[0][0]).toMatch(/^u1\/tmp\//);
    expect(ctx.initialAttachments[0].name).toBe("ODA-TEST-materiali.pdf");
    expect(ctx.initialBodyHtml).toContain("in allegato");
    expect(ctx.initialBodyHtml).not.toContain("<table");
  });
  it("un upload fallito non apre una bozza che dichiara un allegato inesistente", async () => {
    mock.upload.mockResolvedValue({
      error: { message: "Caricamento non riuscito" },
    });
    render(<DocumentoInvioDialog {...props} />);
    fireEvent.click(
      screen.getByRole("radio", { name: "PDF allegato con messaggio breve" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Prepara email" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("PDF non allegato"),
    );
    expect(screen.queryByTestId("email")).not.toBeInTheDocument();
  });
  it("blocca prezzi mancanti prima di preparare l'email", () => {
    render(
      <DocumentoInvioDialog
        {...props}
        documento={{
          ...documento,
          righe: [{ ...documento.righe[0], prezzo: null }],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Prepara email" }));
    expect(screen.getByRole("alert")).toHaveTextContent("prezzo concordato");
    expect(screen.queryByTestId("email")).not.toBeInTheDocument();
  });
  it("un cambio azienda scarta i dati modificati della precedente", () => {
    const v = render(<DocumentoInvioDialog {...props} />);
    fireEvent.change(screen.getByLabelText("Destinatario", { exact: true }), {
      target: { value: "Nome precedente" },
    });
    mock.company = { id: "c2", name: "Azienda due", email: "due@demo.invalid" };
    v.rerender(
      <DocumentoInvioDialog
        {...props}
        documento={{ ...documento, destinatario: { nome: "Destinatario due" } }}
      />,
    );
    expect(screen.getByLabelText("Destinatario", { exact: true })).toHaveValue(
      "Destinatario due",
    );
    expect(
      screen.queryByDisplayValue("Nome precedente"),
    ).not.toBeInTheDocument();
  });
});

it("la scelta della commessa compila riferimento e indirizzo nella copia", async () => {
  render(<DocumentoInvioDialog {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Scegli commessa test" }));
  expect(
    screen.getByLabelText("Indirizzo completo di destinazione / ritiro"),
  ).toHaveValue("Via del Cantiere 42");
  fireEvent.click(screen.getByRole("button", { name: "Prepara email" }));
  await waitFor(() => expect(screen.getByTestId("email")).toBeInTheDocument());
  const ctx = JSON.parse(screen.getByTestId("email").textContent!);
  expect(ctx.initialBodyHtml).toContain("COMM-42");
  expect(ctx.initialBodyHtml).toContain("Via del Cantiere 42");
});

it("cambiando fornitore non mantiene l'email o il pagamento della copia precedente", async () => {
  const v = render(
    <DocumentoInvioDialog
      {...props}
      documento={{
        ...documento,
        fornitoreId: "a",
        destinatario: { nome: "A", email: "a@demo.invalid" },
        pagamento: "60 giorni",
      }}
    />,
  );
  fireEvent.change(screen.getByLabelText("Email destinatario"), {
    target: { value: "personalizzata@a.invalid" },
  });
  v.rerender(
    <DocumentoInvioDialog
      {...props}
      documento={{
        ...documento,
        fornitoreId: "b",
        destinatario: { nome: "B", email: "b@demo.invalid" },
        pagamento: "Da definire con il fornitore",
      }}
    />,
  );
  expect(screen.getByLabelText("Email destinatario")).toHaveValue(
    "b@demo.invalid",
  );
  expect(screen.getByLabelText("Condizioni di pagamento")).toHaveValue(
    "Da definire con il fornitore",
  );
  fireEvent.click(screen.getByRole("button", { name: "Prepara email" }));
  await waitFor(() => expect(screen.getByTestId("email")).toBeInTheDocument());
  expect(
    JSON.parse(screen.getByTestId("email").textContent!).initialTo,
  ).toEqual(["b@demo.invalid"]);
});

it("permette di preparare un ordine senza prezzo e senza IVA ancora noti",async()=>{
 render(<DocumentoInvioDialog {...props} documento={{...documento,righe:[{...documento.righe[0],prezzo:null,iva:null}]}}/>);
 fireEvent.change(screen.getByLabelText("Prezzi dell’ordine da inviare"),{target:{value:"attesa"}});
 fireEvent.click(screen.getByRole("button",{name:"Prepara email"}));
 await waitFor(()=>expect(screen.getByTestId("email")).toBeInTheDocument());
 const ctx=JSON.parse(screen.getByTestId("email").textContent!);
 expect(ctx.initialBodyHtml).toContain("Prezzi da confermare dal fornitore");expect(ctx.initialBodyHtml).not.toContain("Imponibile:");
});

it("le condizioni senza prezzi sono modificabili senza moltiplicare l'avviso automatico",async()=>{
 render(<DocumentoInvioDialog {...props} documento={{...documento,prezziDaConfermare:true}}/>);
 fireEvent.change(screen.getByLabelText("Condizioni da riportare nella copia"),{target:{value:"Scarico con preavviso"}});
 expect(screen.getByLabelText("Condizioni da riportare nella copia")).toHaveValue("Scarico con preavviso");
 fireEvent.change(screen.getByLabelText("Condizioni da riportare nella copia"),{target:{value:"Scarico con preavviso di 24 ore"}});
 fireEvent.click(screen.getByRole("button",{name:"Prepara email"}));await waitFor(()=>expect(screen.getByTestId("email")).toBeInTheDocument());
 const ctx=JSON.parse(screen.getByTestId("email").textContent!);expect(ctx.initialBodyHtml.match(/Prezzi da confermare dal fornitore/g)).toHaveLength(1);expect(ctx.initialBodyHtml).toContain("preavviso di 24 ore");
});
it("un'email destinatario non valida blocca la preparazione prima dell'upload",()=>{
 render(<DocumentoInvioDialog {...props} documento={{...documento,destinatario:{nome:"Fornitore",email:"indirizzo sbagliato"}}}/>);
 fireEvent.click(screen.getByRole("radio",{name:"PDF allegato con messaggio breve"}));fireEvent.click(screen.getByRole("button",{name:"Prepara email"}));expect(screen.getByRole("alert")).toHaveTextContent("email del destinatario");expect(mock.upload).not.toHaveBeenCalled();expect(screen.queryByTestId("email")).not.toBeInTheDocument();
});

it("rimuovere la commessa non lascia indirizzo e istruzioni del cantiere precedente",()=>{render(<DocumentoInvioDialog {...props}/>);fireEvent.click(screen.getByRole("button",{name:"Scegli commessa test"}));fireEvent.click(screen.getByRole("button",{name:"Rimuovi commessa test"}));expect(screen.getByLabelText("Indirizzo completo di destinazione / ritiro")).toHaveValue("");expect(screen.getByLabelText("Dove consegnare / ritirare")).toHaveValue("altro");});

it("cambiare tipo documento azzera l'inversione contabile invece di applicarla di nascosto ai materiali",()=>{render(<DocumentoInvioDialog {...props} tipi={["materiali","servizi"]}/>);fireEvent.change(screen.getByLabelText("Documento",{exact:true}),{target:{value:"servizi"}});fireEvent.click(screen.getByRole("checkbox",{name:"Inversione contabile concordata per questo ordine"}));expect(screen.getByRole("checkbox",{name:"Inversione contabile concordata per questo ordine"})).toBeChecked();fireEvent.change(screen.getByLabelText("Documento",{exact:true}),{target:{value:"materiali"}});fireEvent.change(screen.getByLabelText("Documento",{exact:true}),{target:{value:"servizi"}});expect(screen.getByRole("checkbox",{name:"Inversione contabile concordata per questo ordine"})).not.toBeChecked();});


it("il testo email usa le condizioni del modello della stessa azienda",async()=>{
 mock.modello.mockResolvedValue({condizioni:"Condizione aziendale personalizzata"});
 render(<DocumentoInvioDialog {...props}/>);
 fireEvent.click(screen.getByRole("button",{name:"Prepara email"}));
 await waitFor(()=>expect(screen.getByTestId("email")).toBeInTheDocument());
 const ctx=JSON.parse(screen.getByTestId("email").textContent!);
 expect(ctx.initialBodyHtml).toContain("Condizione aziendale personalizzata");
 expect(mock.modello).toHaveBeenCalledWith("c1","materiali");
});

it("l’azione rapida PDF apre direttamente la modalità allegato", () => {
 render(<DocumentoInvioDialog {...props} initialMode="pdf" />);
 expect(screen.getByRole("radio", {name:"PDF allegato con messaggio breve"})).toHaveAttribute("aria-checked","true");
 expect(screen.getByRole("radio", {name:"Testo completo nell’email"})).toHaveAttribute("aria-checked","false");
 expect(mock.upload).not.toHaveBeenCalled();
});
