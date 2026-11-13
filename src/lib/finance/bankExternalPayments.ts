import { supabase } from "@/integrations/supabase/client";
export interface BankExternalPayment {
  invoice_id: string;
  provider: string;
  saldata: boolean;
  importo: number;
  numero: string;
  allinea?: boolean;
}
export interface BankBatchResult {
  count: number;
  items: {
    id: string;
    booking_date: string | null;
    result: { esterne?: BankExternalPayment[] };
  }[];
}
/** Only run after commit. A provider failure must never replay bank registrations. */
export async function syncBankExternalPayments(
  items: BankBatchResult["items"],
) {
  const failed: string[] = [];
  const grouped = new Map<
    string,
    { payment: BankExternalPayment; date: string | null }
  >();
  for (const item of items)
    for (const f of item.result.esterne ?? []) {
      const prev = grouped.get(f.invoice_id);
      grouped.set(f.invoice_id, {
        payment: {
          ...f,
          importo: f.importo + (prev?.payment.importo ?? 0),
          saldata: f.saldata || !!prev?.payment.saldata,
        },
        date: item.booking_date,
      });
    }
  for (const { payment: f, date } of grouped.values()) {
    if (f.provider !== "fattureincloud") continue;
    try {
      const { data, error } = await supabase.functions.invoke(
        "billing-payment-push",
        {
          body: {
            invoice_id: f.invoice_id,
            paid_date: date || undefined,
            ...(f.allinea
              ? { azione: "allinea_banca" }
              : f.saldata
                ? {}
                : { azione: "incassa", importo: f.importo }),
          },
        },
      );
      if (error || !data?.ok) failed.push(f.numero);
    } catch {
      failed.push(f.numero);
    }
  }
  return failed;
}
