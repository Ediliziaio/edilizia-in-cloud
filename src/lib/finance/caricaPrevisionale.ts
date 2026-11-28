/**
 * Il caricamento del Previsionale di cassa: le diciotto fonti lette a pagine e
 * messe insieme da buildForecastLedger (08/11/2026).
 *
 * Stava in hooks/useForecastLedger.ts, legato al client del browser. Qui riceve
 * il client, e gli import sono relativi con l'estensione: così lo usano anche
 * le edge function (Silvio, il brief del mattino), e lo scaduto da incassare è
 * lo stesso numero nell'app e nelle risposte di Silvio.
 */
import {
  RITENUTA_BONIFICO_PARLANTE,
  IVA_SCORPORO_BANCA,
} from "../orders/bonusFiscali.ts";
import {
  parseBloccaPrezzo,
  movimentiPrevisti,
} from "../orders/bloccaPrezzo.ts";
import {
  buildForecastLedger,
  calendarDate,
  dayKey,
  emptyForecastSources,
  moveDay,
  resolveOpeningBalance,
  portaSaldoAOggi,
  toCents,
  type BankRow,
  type CostPaymentRow,
  type EffettoRow,
  type ForecastMovement,
  type ForecastSources,
  type NoteRow,
  type OpeningBalance,
} from "./forecastLedger.ts";

export interface ReadResult {
  data: unknown[] | null;
  error: { message: string } | null;
}
export interface ReadQuery extends PromiseLike<ReadResult> {
  select(columns: string): ReadQuery;
  eq(column: string, value: string | boolean): ReadQuery;
  neq(column: string, value: string): ReadQuery;
  is(column: string, value: null): ReadQuery;
  not(column: string, operator: string, value: string | null): ReadQuery;
  gte(column: string, value: string): ReadQuery;
  lte(column: string, value: string): ReadQuery;
  /** Filtro PostgREST in alternativa, es. «is_paid.eq.false,due_date.gte.2026-10-01». */
  or(filters: string, options?: { referencedTable?: string }): ReadQuery;
  in(column: string, values: string[]): ReadQuery;
  like(column: string, pattern: string): ReadQuery;
  order(column: string): ReadQuery;
  range(from: number, to: number): ReadQuery;
}
export interface ReadClient {
  from(table: string): ReadQuery;
  /** Le RPC che restituiscono righe si leggono a pagine come le tabelle (PostgREST taglia a mille). */
  rpc(name: string, args: Record<string, string>): ReadQuery;
}
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

export async function loadOpeningBalance(
  client: ReadClient, companyId: string, today: string, banks: BankRow[],
): Promise<OpeningBalance> {
  const opening = resolveOpeningBalance(banks, []);
  const dateConti = opening.accountDates ?? {};
  const piuVecchia = Object.values(dateConti).sort()[0];
  if (opening.cents == null || !piuVecchia || piuVecchia >= today) return opening;

  const attivi = banks.filter((b) => dateConti[b.id] && dateConti[b.id] < today);
  const collegati = attivi.filter((b) => !b.is_manual).map((b) => b.id);
  const manuali = attivi.filter((b) => b.is_manual).map((b) => b.id);
  const dopo = moveDay(piuVecchia, 1);
  try {
    const [bank, notes] = await Promise.all([
      collegati.length ? readForecastPages<{ id: string; account_id: string; booking_date: string; amount: number | string; amount_eur: number | string | null }>(() =>
        client.from("bank_transactions_operativi").select("id,account_id,booking_date,amount,amount_eur")
          .eq("company_id",companyId).in("account_id",collegati)
          .or("status.eq.booked,status.is.null").gte("booking_date",dopo).lte("booking_date",today).order("id")) : [],
      manuali.length ? readForecastPages<NoteRow>(() =>
        client.from("prima_nota_entries").select("id,bank_account_id,direction,amount,entry_date")
          .eq("company_id",companyId).in("bank_account_id",manuali)
          .is("bank_transaction_id",null).gte("entry_date",dopo).lte("entry_date",today).order("id")) : [],
    ]);
    const movimentiBanca: NoteRow[] = bank.map((r) => {
      const importo = Number(r.amount_eur ?? r.amount);
      return { id: r.id, bank_account_id: r.account_id, entry_date: r.booking_date,
        direction: importo < 0 ? "uscita" : "entrata", amount: Math.abs(importo) };
    });
    return portaSaldoAOggi(opening, [...movimentiBanca, ...notes], today);
  } catch {
    return { ...opening, warning: "Aggiornamento dei saldi non disponibile. La previsione parte dai saldi dichiarati all’ultima lettura." };
  }
}

export async function loadForecastDataset(
  companyId: string,
  today: string,
  client: ReadClient,
): Promise<ForecastDataset> {
  if (!companyId)
    throw new Error("Seleziona un’azienda per vedere il previsionale.");
  const s = emptyForecastSources();
  const issues: string[] = [];
  const year = Number(today.slice(0, 4));
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
          "bank_accounts_operativi",
          "id,current_balance,available_balance,currency,balance_updated_at,is_manual",
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
      // 15/11/2026: da una funzione, non da order_installments con l'embed delle commesse: dal
      // browser passavano dalle viste dei diritti per riga (3,2 s) e la lettura andava in timeout.
      build: () =>
        client
          .rpc("previsionale_rate_commesse", { p_company_id: companyId })
          .order("id"),
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
          "id,name,amount,vat_rate,due_date,is_paid,order_id,category,purchase_order_id,recurrence,recurrence_auto,recurrence_end_date,supplier_id,order_external_team_id,supplier:suppliers(vat_rate)",
          // Lo storico delle spese pagate serve solo per: ricorrenze (la spesa madre), ODA già
          // diventati spesa, e occorrenze vicine a oggi da non ripetere. Il resto non cambia il piano.
        ).or(
          // 15/11/2026: tutte le spese madri ricorrenti, non solo quelle con la generazione accesa
          `is_paid.eq.false,is_paid.is.null,recurrence_auto.eq.true,recurrence.neq.once,purchase_order_id.not.is.null,due_date.gte.${moveDay(today, -7)}`,
        ),
    },
    {
      key: "supplierInstallments",
      label: "Rate dei fornitori",
      // Solo le rate dei costi ancora aperti: quelle dei costi pagati non
      // cambiano il piano. Tutte, anche le già pagate, per sapere «di quante».
      build: () =>
        scoped(
          "rate_fornitori",
          "id,company_cost_id,numero,scadenza,importo,metodo,stato,cost:company_costs!inner(is_paid)",
        ).or("is_paid.eq.false,is_paid.is.null", { referencedTable: "cost" }),
    },
    {
      // Fatture ricevute arrivate ma non ancora costo, e quelle con ritenuta d'acconto (per l'F24 1040):
      // le rate le dice la fattura stessa (XML o Fatture in Cloud), dal 01/11/2026.
      key: "receivedInvoices",
      label: "Fatture ricevute da registrare",
      build: () =>
        scoped(
          "fatture_ricevute",
          "id,cedente_ragione_sociale,cedente_piva,numero_fattura,data_fattura,tipo_documento,stato,storico_esterno,pagata_il,company_cost_id,purchase_order_id,piano_pagamento,netto_a_pagare,totale_documento,ritenuta_importo,ritenuta_aliquota",
        )
          .gte("data_fattura", moveDay(today, -400))
          .or("company_cost_id.is.null,ritenuta_importo.gt.0"),
    },
    {
      // Ritenute di garanzia trattenute: tornano allo svincolo (01/11/2026).
      key: "garanzie",
      label: "Ritenute di garanzia",
      build: () =>
        scoped(
          "ritenute_garanzia",
          "id,direzione,importo,stato,data_svincolo_prevista,controparte,order_id,fideiussione",
        ).eq("stato", "trattenuta"),
    },
    {
      key: "deadlines",
      label: "Scadenzario",
      build: () =>
        scoped(
          "scadenze",
          "id,description,amount,paid_amount,due_date,direction,status,cost_id,invoice_id,order_item_id,order_id,notes,is_previsionale,rata_numero",
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
          "id,first_name,last_name,net_salary,gross_salary,data_assunzione,data_inizio_lavoro,created_at,inps_rate,role_type",
        ).eq("is_active", true),
    },
    {
      key: "payroll",
      label: "Cedolini",
      build: () =>
        scoped(
          "hr_cedolini",
          "id,employee_id,anno,mese,netto,stato,data_pagamento,ritenute_irpef,contributi_dipendente,contributi_datore",
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
          "id,importo,data_scadenza,tributo_descrizione,tributo_code,anno,mese",
        ).eq("stato", "da_pagare"),
    },
    {
      // Gli F24 delle ritenute già registrati, anche pagati: il loro mese non si stima più (01/11/2026).
      key: "f24Ritenute",
      label: "F24 delle ritenute",
      build: () =>
        scoped("f24_entries", "id,anno,mese,tributo_code,stato")
          .in("tributo_code", ["1001", "1040", "DM10"])
          .neq("stato", "annullato")
          .gte("anno", String(year - 1)),
    },
    {
      // Mutui e finanziamenti attivi: la rata esce ogni mese fino alla fine del piano.
      key: "loans",
      label: "Mutui e finanziamenti",
      build: () =>
        scoped(
          "cg_loans",
          "id,banca,descrizione,capitale_residuo,tasso_pct,rata_mensile,data_inizio,data_fine,is_active",
        ).eq("is_active", true),
    },
    {
      key: "teams",
      label: "Squadre esterne",
      build: () =>
        jobScoped(
          "order_external_teams",
          `id,order_id,total_cost,vat_rate,payment_date,is_paid,external_team:external_teams(name,subappaltatore:subappaltatori(piva)),${job}`,
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
    {
      key: "costPayments",
      label: "Pagamenti delle spese",
      build: () =>
        scoped(
          "prima_nota_entries",
          "id,cost_id,amount,entry_date,direction,reversal_of",
        )
          .not("cost_id", "is", null)
          .lte("entry_date", today),
    },
    {
      key: "costWithholdings",
      label: "Garanzie trattenute sulle spese",
      // Nessun limite di età: una fattura aperta può precedere di anni lo svincolo.
      build: () =>
        scoped(
          "fatture_ricevute",
          "id,company_cost_id,trattenuta_garanzia,tipo_documento,stato,cost:company_costs!inner(is_paid)",
        )
          .not("company_cost_id", "is", null)
          .not("trattenuta_garanzia", "lte", "0")
          .or("is_paid.eq.false,is_paid.is.null", { referencedTable: "cost" }),
    },
  ];
  let primaNota: { saldo?: number; entry_count?: number } | null = null;
  let compensazioni: CostPaymentRow[] = [];
  await Promise.all([
    (async () => {
      // Assegni ed effetti in attesa (28/11/2026): spostano l'uscita/entrata alla data dell'assegno.
      try {
        s.effetti = await readForecastPages<EffettoRow>(() =>
          client.rpc("effetti_elenco", { p_company_id: companyId }).order("id"));
      } catch {
        issues.push("Assegni ed effetti");
      }
    })(),
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
      try {
        const { data, error } = await client.rpc("previsionale_liquidazioni_iva", { p_company_id: companyId, p_oggi: today });
        if (error) throw error;
        const proiezione = data as unknown as ForecastSources["vatProjection"];
        if (!Array.isArray(proiezione?.movements) || !Array.isArray(proiezione?.warnings)) throw new Error("Liquidazioni IVA indisponibili");
        s.vatProjection = proiezione;
      } catch {
        s.vatProjection = { movements: [], warnings: ["Stima IVA non disponibile. Verifica le liquidazioni in Contabilità fiscale."] };
      }
    })(),
    (async () => {
      try {
        compensazioni = await readForecastPages<CostPaymentRow>(() =>
          client.rpc("previsionale_compensazioni_anticipi", { p_company_id: companyId, p_al: today }).order("id"));
      } catch {
        issues.push("Compensazioni anticipi fornitori");
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
  // Le righe della funzione sono piatte: la commessa torna nell'oggetto `order` come prima.
  s.installments = (s.installments as unknown as Array<Record<string, unknown>>).map((r) =>
    r.order
      ? (r as unknown as ForecastSources["installments"][number])
      : ({
          ...r,
          order: {
            id: r.order_id,
            order_code: r.order_code ?? null,
            company_id: companyId,
            deleted_at: r.order_deleted_at ?? null,
            client_name: r.client_name ?? null,
            client_company: r.client_company ?? null,
          },
        } as unknown as ForecastSources["installments"][number]),
  );
  let opening = await loadOpeningBalance(client, companyId, today, s.banks);
  s.costPayments = [...(s.costPayments ?? []), ...compensazioni];
  // The full server aggregate, not the 12 months of detail used for collections.
  const pn = primaNota as { saldo?: number; entry_count?: number } | null;
  if (!s.banks.length && pn && Number(pn.entry_count) > 0)
    opening = {
      cents: toCents(pn.saldo),
      source: "prima-nota",
      updatedAt: today,
    };
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
    issues: issues.sort(),
    updatedAt: new Date().toISOString(),
  };
}
