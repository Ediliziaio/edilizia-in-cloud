/**
 * «Segna pagata» registra un incasso vero (25/09/2026).
 *
 * Prima il dettaglio, l'elenco e la selezione multipla aggiornavano la fattura
 * a mano (stato 'pagata', importo pagato): nessun movimento di cassa, niente
 * prima nota, scadenza scoperta. Qui il dialog vero, con Supabase finto:
 * deve chiamare registra_incasso_atomico e mai scrivere sulla tabella.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentoFiscale } from "@/types/fatturazione";

const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => from(...a) },
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "azienda-1" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { toast } from "sonner";
import { SegnaPagataDialog } from "@/components/fatturazione/SegnaPagataDialog";
import dettaglio from "@/pages/azienda/fatturazione/DocumentoDetail.tsx?raw";
import elenco from "@/pages/azienda/fatturazione/DocumentiFiscaliList.tsx?raw";

const fattura = (x: Partial<DocumentoFiscale> = {}) => ({
  id: "f1", numero: "FT-2026-0001", tipo: "fattura", stato: "consegnata",
  totale_da_pagare: 1220, importo_pagato: 0, metodo_pagamento_codice: "MP01", ...x,
}) as DocumentoFiscale;

function monta(fatture: DocumentoFiscale[], onFatto?: () => void) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <SegnaPagataDialog open onOpenChange={onOpenChange} fatture={fatture} onFatto={onFatto} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  rpc.mockResolvedValue({ error: null });
  vi.mocked(toast.warning).mockClear();
});

describe("«Segna pagata» chiama registra_incasso_atomico, non aggiorna la fattura a mano", () => {
  it("una fattura: l'incasso per il residuo, col metodo della fattura e la data di oggi", async () => {
    const { onOpenChange } = monta([fattura({ importo_pagato: 220 })]);
    fireEvent.click(screen.getByRole("button", { name: "Registra incasso" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith("registra_incasso_atomico", expect.objectContaining({
      p_company_id: "azienda-1",
      p_documento_id: "f1",
      p_importo: 1000,
      p_metodo: "contanti",
      p_data_movimento: new Date().toLocaleDateString("en-CA"),
    }));
    expect(from).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("una selezione: un incasso per fattura, e una che non riesce non ferma le altre", async () => {
    rpc
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "Incasso (1220 EUR) superiore al residuo da pagare" } })
      .mockResolvedValueOnce({ error: null });
    const onFatto = vi.fn();
    monta([fattura({ id: "a", numero: "1" }), fattura({ id: "b", numero: "2" }), fattura({ id: "c", numero: "3" })], onFatto);
    fireEvent.click(screen.getByRole("button", { name: "Registra 3 incassi" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(3));
    expect(rpc.mock.calls.map((c) => (c[1] as { p_documento_id: string }).p_documento_id)).toEqual(["a", "b", "c"]);
    expect(from).not.toHaveBeenCalled();
    await waitFor(() => expect(onFatto).toHaveBeenCalled());
    expect(toast.warning).toHaveBeenCalledWith(
      "2 incassi registrati, 1 non riusciti",
      expect.objectContaining({ description: expect.stringContaining("2: Incasso (1220 EUR) superiore al residuo") }),
    );
  });

  it("niente da incassare: nessun pulsante per registrare", () => {
    monta([]);
    expect(screen.queryByRole("button", { name: /Registra/ })).toBeNull();
  });
});

describe("le tre azioni passano dal dialog", () => {
  it("dettaglio: niente più update diretto a 'pagata'", () => {
    expect(dettaglio).toContain("<SegnaPagataDialog");
    expect(dettaglio).not.toMatch(/stato:\s*"pagata"/);
  });

  it("elenco: azione singola e selezione multipla, niente update diretto", () => {
    expect(elenco.match(/<SegnaPagataDialog/g)).toHaveLength(2);
    expect(elenco).not.toMatch(/stato:\s*"pagata"/);
    expect(elenco).not.toMatch(/importo_pagato:\s*\w+\.totale_da_pagare/);
  });
});
