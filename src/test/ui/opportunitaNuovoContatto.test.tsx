/**
 * «Nuova opportunità» con un contatto che non esiste ancora (17/09/2026).
 *
 * Tiene fermo:
 *   · il «+» accanto alla ricerca apre la scheda del nuovo contatto con Nome,
 *     Cognome, Email e Telefono separati;
 *   · email o telefono: ne basta uno, nessuno dei due blocca;
 *   · il nome dell'opportunità segue nome e cognome mentre si scrivono;
 *   · un nome scritto nella ricerca e non scelto non dà più solo «Seleziona o
 *     crea un contatto»: apre la creazione con quel nome.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const inserimenti: Array<Record<string, unknown>> = [];

function builder(tabella: string) {
  const b: Record<string, unknown> = {};
  const catena = () => b;
  for (const m of ["select", "eq", "limit", "or", "order", "neq", "update"]) b[m] = vi.fn(catena);
  b.insert = vi.fn((riga: Record<string, unknown>) => {
    inserimenti.push({ tabella, ...riga });
    return b;
  });
  b.single = vi.fn(async () => ({ data: { id: "contatto-nuovo" }, error: null }));
  b.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => builder(t) },
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const mutate = vi.fn();
vi.mock("@/hooks/useOpportunitiesData", () => ({
  useCreateOpportunity: () => ({ mutate, isPending: false }),
  useCompanyStaff: () => ({ data: [] as unknown[] }),
  useCompanySalespeople: () => ({ data: [] as unknown[] }),
  useCompanyCallCenterUsers: () => ({ data: [] as unknown[] }),
}));
vi.mock("@/hooks/useOpportunityDetailData", () => ({ useOpportunityCustomFields: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/useIsPlatformCrm", () => ({ useIsPlatformCrm: () => false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canEditMarketingOpportunities: true, canEditMarketingContacts: true }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/hooks/useTagSync", () => ({ syncTagsToContact: vi.fn() }));
vi.mock("@/components/marketing/TagSelector", () => ({ TagSelector: (): null => null }));
vi.mock("./ServizioAedixFields", () => ({ ServizioAedixFields: (): null => null }));

import { OpportunityDialog } from "@/components/opportunities/OpportunityDialog";

function scrivi(el: HTMLInputElement, valore: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(el, valore);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

const campo = (placeholder: string) =>
  document.body.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`);
const bottone = (testo: string) =>
  Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.trim() === testo) as HTMLButtonElement | undefined;
const attendi = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe("Nuova opportunità con un contatto nuovo", () => {
  let contenitore: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(async () => {
    inserimenti.length = 0;
    mutate.mockReset();
    Object.values(toast).forEach((f) => f.mockReset());
    contenitore = document.createElement("div");
    document.body.appendChild(contenitore);
    root = createRoot(contenitore);
    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <OpportunityDialog open onOpenChange={() => {}} pipelineId="pipe-1" pipelineName="Vendite" stages={[{ id: "fase-1", name: "Nuovo" }]} />
        </QueryClientProvider>,
      );
    });
    await attendi();
  });

  afterEach(() => {
    act(() => root.unmount());
    contenitore.remove();
    document.body.innerHTML = "";
  });

  it("il + apre Nome, Cognome, Email, Telefono e il nome opportunità li segue", async () => {
    const piu = document.body.querySelector<HTMLButtonElement>('button[aria-label="Crea un nuovo contatto"]');
    expect(piu).toBeTruthy();
    await act(async () => piu!.click());

    expect(campo("Nome *")).toBeTruthy();
    expect(campo("Cognome")).toBeTruthy();
    expect(campo("Email")).toBeTruthy();
    expect(campo("Telefono")).toBeTruthy();

    await act(async () => scrivi(campo("Nome *")!, "Mario"));
    await act(async () => scrivi(campo("Cognome")!, "Rossi"));
    expect(campo("Auto: nome e cognome del contatto")!.value).toBe("Mario Rossi");
  });

  it("basta il telefono: crea il contatto e poi l'opportunità col suo nome", async () => {
    await act(async () => document.body.querySelector<HTMLButtonElement>('button[aria-label="Crea un nuovo contatto"]')!.click());
    await act(async () => scrivi(campo("Nome *")!, "Mario"));
    await act(async () => scrivi(campo("Cognome")!, "Rossi"));
    await act(async () => scrivi(campo("Telefono")!, "333 1234567"));
    await act(async () => bottone("Crea")!.click());
    await attendi();

    const contatto = inserimenti.find((r) => r.tabella === "marketing_contacts");
    expect(contatto).toMatchObject({ company_id: "azienda-1", first_name: "Mario", last_name: "Rossi", email: null });
    expect(contatto?.phone).toBeTruthy();
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toMatchObject({ contact_id: "contatto-nuovo", name: "Mario Rossi", pipeline_id: "pipe-1" });
  });

  it("senza email né telefono non crea nulla e lo dice", async () => {
    await act(async () => document.body.querySelector<HTMLButtonElement>('button[aria-label="Crea un nuovo contatto"]')!.click());
    await act(async () => scrivi(campo("Nome *")!, "Mario"));
    await act(async () => bottone("Crea")!.click());
    await attendi();

    expect(toast.error).toHaveBeenCalledWith("Inserisci almeno email o telefono del contatto");
    expect(inserimenti).toHaveLength(0);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("un nome scritto nella ricerca e non scelto apre la creazione con quel nome", async () => {
    await act(async () => scrivi(campo("Cerca per nome o email...")!, "Luca Bianchi"));
    await act(async () => bottone("Crea")!.click());
    await attendi();

    expect(toast.info).toHaveBeenCalled();
    expect(campo("Nome *")!.value).toBe("Luca");
    expect(campo("Cognome")!.value).toBe("Bianchi");
    expect(mutate).not.toHaveBeenCalled();
  });
});
