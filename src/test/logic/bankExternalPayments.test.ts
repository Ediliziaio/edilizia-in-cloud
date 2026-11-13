import { beforeEach, it, expect, vi } from "vitest";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));
import { syncBankExternalPayments } from "@/lib/finance/bankExternalPayments";
beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue({ data: { ok: true } });
});
it("raggruppa più incassi della stessa fattura e usa un target assoluto ripetibile", async () => {
  const f = {
    invoice_id: "invoice",
    provider: "fattureincloud",
    saldata: false,
    numero: "FT-1",
    allinea: true,
  };
  const items = [
    {
      id: "t1",
      booking_date: "2026-11-13",
      result: { esterne: [{ ...f, importo: 40 }] },
    },
    {
      id: "t2",
      booking_date: "2026-11-13",
      result: { esterne: [{ ...f, importo: 60, saldata: true }] },
    },
  ];
  expect(await syncBankExternalPayments(items)).toEqual([]);
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledWith("billing-payment-push", {
    body: {
      invoice_id: "invoice",
      paid_date: "2026-11-13",
      azione: "allinea_banca",
    },
  });
});
it("un errore esterno restituisce le fatture da riallineare senza ripetere pagamenti", async () => {
  invoke.mockResolvedValue({ error: new Error("Offline") });
  expect(
    await syncBankExternalPayments([
      {
        id: "t",
        booking_date: null,
        result: {
          esterne: [
            {
              invoice_id: "invoice",
              provider: "fattureincloud",
              saldata: false,
              importo: 25,
              numero: "FT-25",
              allinea: true,
            },
          ],
        },
      },
    ]),
  ).toEqual(["FT-25"]);
});

it("mantiene il percorso dei singoli incassi parziali già esistente",async()=>{
 await syncBankExternalPayments([{id:'tx',booking_date:'2026-11-13',result:{esterne:[{invoice_id:'invoice',provider:'fattureincloud',saldata:false,importo:40,numero:'FT-1'}]}}]);
 expect(invoke).toHaveBeenCalledWith('billing-payment-push',{body:{invoice_id:'invoice',paid_date:'2026-11-13',azione:'incassa',importo:40}});
});
