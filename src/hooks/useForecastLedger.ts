import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  RITENUTA_BONIFICO_PARLANTE,
  IVA_SCORPORO_BANCA,
} from "@/lib/orders/bonusFiscali";
import {
  parseBloccaPrezzo,
  movimentiPrevisti,
} from "@/lib/orders/bloccaPrezzo";
import {
  buildForecastLedger,
  calendarDate,
  dayKey,
  emptyForecastSources,
  moveDay,
  resolveOpeningBalance,
  toCents,
  type ForecastMovement,
  type ForecastSources,
  type OpeningBalance,
  type VatDocumentRow,
} from "@/lib/finance/forecastLedger";

interface ReadResult {
  data: unknown[] | null;
  error: { message: string } | null;
}
interface ReadQuery extends PromiseLike<ReadResult> {
  select(columns: string): ReadQuery;
  eq(column: string, value: string | boolean): ReadQuery;
  neq(column: string, value: string): ReadQuery;
  is(column: string, value: null): ReadQuery;
  not(column: string, operator: string, value: string | null): ReadQuery;
  gte(column: string, value: string): ReadQuery;
  lte(column: string, value: string): ReadQuery;
  /** Filtro PostgREST in alternativa, es. «is_paid.eq.false,due_date.gte.2026-10-01». */
  or(filters: string): ReadQuery;
  in(column: string, values: string[]): ReadQuery;
  like(column: string, pattern: string): ReadQuery;
  order(column: string): ReadQuery;
  range(from: number, to: number): ReadQuery;
}
interface ReadClient {
  from(table: string): ReadQuery;
  /** Le RPC che restituiscono righe si leggono a pagine come le tabelle (PostgREST taglia a mille). */
  rpc(name: string, args: Record<string, string>): ReadQuery;
}
const api = supabase as unknown as ReadClient;
export const FORECAST_PAGE_SIZE = 500;

/** Each page recreates the query; ranges are inclusive. Errors never become empty sources. */
export async function readForecastPages<T>(
  build: () => ReadQuery,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += FORECAST_PAGE_SIZE) {
    const { data, error } = await build().range(
      offset,
      offset + FORECAST_PAGE_SIZE - 1,
    );
    if (error) throw new Error(error.message);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < FORECAST_PAGE_SIZE) return rows;
  }
}
export interface ForecastDataset {
  companyId: string;
  today: string;
  opening: OpeningBalance;
  movements: ForecastMovement[];
  collected: ForecastMovement[];
  issues: string[];
  warnings: string[];
  updatedAt: string;
}
export async function loadForecastDataset(
  companyId: string,
  today: string,
  client: ReadClient = api,
): Promise<ForecastDataset> {
  if (!companyId)
    throw new Error("Seleziona un’azienda per vedere il previsionale.");
  const s = emptyForecastSources();
  const issues: string[] = [];
  const softWarnings: string[] = [];
  const year = Number(today.slice(0, 4));
  // L'IVA si stima sui mesi la cui liquidazione può ancora cadere da oggi in avanti: bastano
  // gli ultimi tre mesi (il credito dei mesi prima si perde: limite dichiarato).
  const vatFrom = (() => {
    const d = calendarDate(`${today.slice(0, 7)}-01`);
    d.setMonth(d.getMonth() - 3);
    return dayKey(d);
  })();
  const scoped = (table: string, columns: string) =>
    client.from(table).select(columns).eq("company_id", companyId).order("id");
  const jobScoped = (table: string, columns: string) =>
    client
      .from(table)
      .select(columns)
      .eq("order.company_id", companyId)
      .order("id");
  const job =
    "order:orders!inner(id,order_code,company_id,deleted_at,client_name,client_company)";
  const sources: {
    key: Exclude<keyof ForecastSources, "blocked">;
    label: string;
    build: () => ReadQuery;
  }[] = [
    {
      key: "banks",
      label: "Conti bancari",
      build: () =>
        scoped(
          "bank_accounts",
          "id,current_balance,available_balance,currency,balance_updated_at",
        ).eq("is_active", true),
    },
    {
      key: "orders",
      label: "Commesse",
      build: () =>
        scoped(
          "orders",
          "id,order_code,client_name,client_company,deleted_at,has_building_bonus",
        ),
    },
    {
      key: "installments",
      label: "Rate delle commesse",
      build: () =>
        jobScoped(
          "order_installments",
          `id,order_id,amount,label,type,expected_date,is_paid,paid_date,invoice_id,documento_fiscale_id,${job}`,
        ),
    },
    {
      // La regola della scheda commessa: residuo per rata, piani storici e parte non pianificata.
      key: "rateDaIncassare",
      label: "Rate da incassare",
      build: () =>
        client
          .rpc("cruscotto_rate_da_incassare", { p_company_id: companyId })
          .order("id"),
    },
    {
      key: "incassiRate",
      label: "Incassi delle rate",
      build: () =>
        client
          .rpc("cruscotto_rate_incassi", { p_company_id: companyId })
          .order("installment_id")
          .order("data")
          .order("importo"),
    },
    {
      key: "invoices",
      label: "Fatture",
      build: () =>
        scoped(
          "invoices",
          "id,total,paid_amount,due_date,status,invoice_number,client_company_name,order_id,document_type,payment_date,deleted_at,issue_date,tax_amount,credited_invoice_id",
        )
          .is("deleted_at", null)
          .neq("status", "draft")
          .neq("status", "cancelled"),
    },
    {
      key: "costs",
      label: "Spese",
      build: () =>
        scoped(
          "company_costs",
          "id,name,amount,vat_rate,due_date,is_paid,order_id,category,purchase_order_id,recurrence,recurrence_auto,recurrence_end_date,supplier_id,supplier:suppliers(vat_rate)",
          // Lo storico delle spese pagate serve solo per: ricorrenze (la spesa madre), ODA già
          // diventati spesa, e occorrenze vicine a oggi da non ripetere. Il resto non cambia il piano.
        ).or(
          `is_paid.eq.false,is_paid.is.null,recurrence_auto.eq.true,purchase_order_id.not.is.null,due_date.gte.${moveDay(today, -7)}`,
        ),
    },
    {
      key: "deadlines",
      label: "Scadenzario",
      build: () =>
        scoped(
          "scadenze",
          "id,description,amount,paid_amount,due_date,direction,status,cost_id,invoice_id,order_item_id,order_id,notes,is_previsionale",
        ).neq("status", "annullata"),
    },
    {
      key: "items",
      label: "Pagamenti fornitori",
      build: () =>
        jobScoped(
          "order_items",
          `id,name,order_id,purchase_price,quantity,payment_method,deposit_amount,balance_amount,deposit_paid,balance_paid,deposit_expected_date,balance_expected_date,is_paid,supplier:suppliers(name,vat_rate),${job}`,
        )
          .not("supplier_id", "is", null)
          .is("stock_item_id", null),
    },
    {
      key: "coveredItems",
      label: "Collegamenti acquisti e spese",
      build: () =>
        client
          .from("v_articoli_gia_a_costo")
          .select("order_item_id,company_cost_id")
          .eq("company_id", companyId)
          .order("order_item_id")
          .order("company_cost_id"),
    },
    {
      key: "purchases",
      label: "Ordini acquisto",
      build: () =>
        scoped(
          "purchase_orders",
          "id,total,status,oda_number,order_id,issue_date,expected_delivery_date,actual_delivery_date,payment_terms_base,payment_terms_giorni",
          // Gli ODA ricevuti dell'ultimo anno entrano tra le uscite finché non diventano una spesa.
        ).or(
          `status.in.(inviato,confermato,parziale),and(status.eq.ricevuto,issue_date.gte.${moveDay(today, -366)})`,
        ),
    },
    {
      key: "purchaseItems",
      label: "Articoli degli ordini acquisto",
      build: () =>
        client
          .from("purchase_order_items")
          .select(
            "purchase_order_id,order_item_id,purchase:purchase_orders!inner(company_id)",
          )
          .eq("purchase.company_id", companyId)
          .not("purchase.status", "in", "(annullato,bozza)")
          .order("id"),
    },
    {
      key: "employees",
      label: "Personale",
      build: () =>
        scoped(
          "employees",
          "id,first_name,last_name,net_salary,gross_salary,data_assunzione,data_inizio_lavoro,created_at",
        ).eq("is_active", true),
    },
    {
      key: "payroll",
      label: "Cedolini",
      build: () =>
        scoped(
          "hr_cedolini",
          "id,employee_id,anno,mese,netto,stato,data_pagamento",
        )
          .neq("stato", "bozza")
          // I cedolini pagati servono solo per i periodi recenti e per il giorno di paga.
          .or(`stato.neq.pagato,anno.gte.${year - 1}`),
    },
    {
      key: "taxes",
      label: "F24",
      build: () =>
        scoped(
          "f24_entries",
          "id,importo,data_scadenza,tributo_descrizione",
        ).eq("stato", "da_pagare"),
    },
    {
      key: "teams",
      label: "Squadre esterne",
      build: () =>
        jobScoped(
          "order_external_teams",
          `id,order_id,total_cost,vat_rate,payment_date,is_paid,external_team:external_teams(name),${job}`,
        ).eq("is_paid", false),
    },
    {
      key: "commissions",
      label: "Provvigioni",
      build: () =>
        jobScoped(
          "order_salespeople",
          `id,order_id,commission_amount,deduction_amount,payment_expected_date,is_paid,salesperson:salespeople(first_name,last_name),${job}`,
        ).eq("is_paid", false),
    },
    {
      key: "notes",
      label: "Prima Nota",
      build: () =>
        scoped(
          "prima_nota_entries",
          "id,direction,amount,entry_date,category,description,invoice_id,installment_id,documento_fiscale_id",
        )
          .gte("entry_date", moveDay(today, -366))
          .lte("entry_date", today),
    },
  ];
  let primaNota: { saldo?: number; entry_count?: number } | null = null;
  await Promise.all([
    ...sources.map(async (source) => {
      try {
        Object.assign(s, {
          [source.key]: await readForecastPages(source.build),
        });
      } catch {
        issues.push(source.label);
      }
    }),
    (async () => {
      // Stima IVA: fonti facoltative. Se non si leggono (permessi, modulo spento) il piano resta
      // valido e lo diciamo tra le ipotesi, senza segnare la previsione come incompleta.
      try {
        const [native, received, f24] = await Promise.all([
          readForecastPages<{
            data_emissione: string | null;
            iva_totale: number | null;
            tipo: string;
          }>(() =>
            scoped("documenti_fiscali", "id,data_emissione,iva_totale,tipo")
              .in("tipo", ["fattura", "fattura_pa", "nota_credito"])
              .not("stato", "in", "(bozza,annullata,rifiutata)")
              .is("deleted_at", null)
              .gte("data_emissione", vatFrom),
          ),
          readForecastPages<{
            data_fattura: string | null;
            iva_totale: number | null;
            tipo_documento: string | null;
          }>(() =>
            scoped(
              "fatture_ricevute",
              "id,data_fattura,iva_totale,tipo_documento",
            )
              .neq("stato", "rifiutata")
              .gte("data_fattura", vatFrom),
          ),
          readForecastPages<{
            anno: number;
            mese: number | null;
            tributo_code: string | null;
            stato: string;
          }>(() =>
            scoped("f24_entries", "id,anno,mese,tributo_code,stato")
              .like("tributo_code", "60%")
              .neq("stato", "annullato")
              .gte("anno", String(year - 1)),
          ),
        ]);
        s.vatDocuments.push(
          ...native.map(
            (d): VatDocumentRow => ({
              date: d.data_emissione,
              vat: d.iva_totale,
              kind: "vendita",
              credit: d.tipo === "nota_credito",
              origin: "nativa",
            }),
          ),
          ...received
            // Autofatture e integrazioni (reverse charge) hanno l'IVA da entrambe le parti.
            .filter(
              (d) =>
                !/^TD(16|17|18|19)$|self_invoice/i.test(d.tipo_documento ?? ""),
            )
            .map(
              (d): VatDocumentRow => ({
                date: d.data_fattura,
                vat: d.iva_totale,
                kind: "acquisto",
                credit: /^TD04$|credit/i.test(d.tipo_documento ?? ""),
                origin: "ricevuta",
              }),
            ),
        );
        s.vatF24 = f24;
      } catch {
        softWarnings.push(
          "Stima IVA non disponibile: non è stato possibile leggere fatture o F24 dell’IVA.",
        );
      }
    })(),
    (async () => {
      try {
        const { data, error } = (await client.rpc("get_prima_nota_saldo", {
          p_company_id: companyId,
          p_to_date: today,
        })) as { data: unknown; error: { message: string } | null };
        if (error) throw error;
        primaNota = data as typeof primaNota;
      } catch {
        issues.push("Saldo Prima Nota");
      }
    })(),
    (async () => {
      try {
        const rows = await readForecastPages<unknown>(() =>
          scoped("blocca_prezzo", "*").eq("stato", "incassato"),
        );
        s.blocked = movimentiPrevisti(
          parseBloccaPrezzo(rows),
          calendarDate(today),
        ).map((m, index) => ({
          id: `blocca:${m.id ?? index}:${m.direzione}`,
          description:
            m.direzione === "in"
              ? "Blocca prezzo in arrivo"
              : "Blocca prezzo da restituire",
          counterparty: "",
          category: "blocca-prezzo",
          direction: m.direzione,
          cents: toCents(m.importo),
          date: m.data ? dayKey(m.data) : null,
          source: "Blocca prezzo",
          href: m.orderId ? `/azienda/ordini/${m.orderId}` : "/azienda/ordini",
          orderId: m.orderId,
          estimated: false,
        }));
      } catch {
        issues.push("Blocca prezzo");
      }
    })(),
  ]);
  s.vatDocuments.push(
    ...s.invoices
      .filter(
        (i) =>
          (i.issue_date ?? "") >= vatFrom &&
          !["proforma"].includes(i.document_type ?? ""),
      )
      .map(
        (i): VatDocumentRow => ({
          date: i.issue_date ?? null,
          vat: i.tax_amount ?? 0,
          kind: "vendita",
          credit: ["credit_note", "nota_credito", "TD04"].includes(
            i.document_type ?? "",
          ),
          origin: "esterna",
        }),
      ),
  );
  let opening = resolveOpeningBalance(s.banks, []);
  // The full server aggregate, not the 12 months of detail used for collections.
  const pn = primaNota as { saldo?: number; entry_count?: number } | null;
  if (!s.banks.length && pn && Number(pn.entry_count) > 0)
    opening = {
      cents: toCents(pn.saldo),
      source: "prima-nota",
      updatedAt: today,
    };
  // A partial VAT source set must never generate a seemingly complete tax estimate.
  const vatReady = !softWarnings.length && !issues.includes("Fatture");
  if (!vatReady) s.vatDocuments = [];
  const ledger = buildForecastLedger(
    s,
    today,
    1 - RITENUTA_BONIFICO_PARLANTE / (1 + IVA_SCORPORO_BANCA),
  );
  return {
    companyId,
    today,
    opening,
    ...ledger,
    warnings: [...ledger.warnings, ...softWarnings].filter(
      (w) => vatReady || !w.startsWith("IVA da versare stimata"),
    ),
    issues: issues.sort(),
    updatedAt: new Date().toISOString(),
  };
}

export function useForecastLedger() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [today, setToday] = useState(() => dayKey(new Date()));
  const queryClient = useQueryClient();
  useEffect(() => {
    const timer = window.setInterval(
      () => setToday(dayKey(new Date())),
      60_000,
    );
    return () => window.clearInterval(timer);
  }, []);
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== "updated" || event.action.type !== "invalidate")
          return;
        const key = event.query.queryKey;
        if (
          key[0] === "cashflow" &&
          key[1] !== "ledger" &&
          key.includes(companyId)
        )
          void queryClient.invalidateQueries({
            queryKey: ["cashflow", "ledger", companyId],
          });
      }),
    [companyId, queryClient],
  );
  return useQuery({
    queryKey: ["cashflow", "ledger", companyId, today],
    enabled: !!companyId,
    queryFn: () => loadForecastDataset(companyId!, today),
    // Diciotto fonti: si ricarica con «Aggiorna» o quando un'altra pagina invalida i dati, non a
    // ogni ritorno sulla finestra.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
