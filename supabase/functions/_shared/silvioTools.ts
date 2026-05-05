/**
 * Silvio Tool Catalog — JSON Schema OpenAI-compatible per tool calling.
 *
 * Ogni tool definito qui:
 *   1. Ha uno `schema` (formato OpenAI function tool) passato all'LLM
 *   2. Ha un `executor(args, ctx)` server-side che chiama la RPC SQL
 *   3. Ritorna sempre JSON serializzabile (stringificabile per il LLM)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export interface ToolContext {
  supabase: SupabaseClient;
  companyId: string;
  userId: string;
  primaryRole: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolExecutor = (args: any, ctx: ToolContext) => Promise<any>;

// Lazy import per non rompere bundle se brainEmbed non disponibile
async function tryGenerateEmbedding(text: string): Promise<number[] | null> {
  try {
    const { generateEmbedding } = await import("./brainEmbed.ts");
    return await generateEmbedding(text);
  } catch (e) {
    console.warn("[silvioTools] embedding skip:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

export interface SilvioTool {
  // OpenAI tool schema
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any;
  executor: ToolExecutor;
  // Ruoli che possono attivare questo tool. Se vuoto = tutti.
  allowedRoles?: string[];
}

// Helper per chiamare RPC e ritornare data | error
async function callRpc(supabase: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { error: error.message };
  return data;
}

// ─── TOOL DEFINITIONS ───────────────────────────────────────────────────────

export const SILVIO_TOOLS: Record<string, SilvioTool> = {
  get_company_kpi: {
    schema: {
      type: "function",
      function: {
        name: "get_company_kpi",
        description: "Ritorna i KPI sintetici aziendali: numero commesse attive/anno, fatturato YTD, preventivi aperti, rate scadute, saldo banche, team size. Usa questo tool quando l'utente chiede una visione d'insieme o KPI generali.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_tool_company_kpi", {
      p_company_id: ctx.companyId,
    }),
    allowedRoles: ["super_admin", "company_admin"],
  },

  get_orders_summary: {
    schema: {
      type: "function",
      function: {
        name: "get_orders_summary",
        description: "Ritorna lista commesse con valori, stato pagamenti, % avanzamento. Usa per domande tipo 'quante commesse aperte', 'lista commesse attive', 'valore commesse'.",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["active", "closed", "all"],
              description: "Filtro stato: active=non saldate, closed=saldate, all=tutte",
            },
            limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_orders_summary", {
      p_company_id: ctx.companyId,
      p_status: args?.status ?? "active",
      p_limit: args?.limit ?? 20,
    }),
  },

  get_revenue_forecast: {
    schema: {
      type: "function",
      function: {
        name: "get_revenue_forecast",
        description: "Ritorna gli incassi previsti nei prossimi N giorni (acconti, saldi, finanziamenti attesi). Usa per domande 'quanto incasso prossimo mese', 'cassa attesa', 'soldi in arrivo'.",
        parameters: {
          type: "object",
          properties: {
            days_ahead: {
              type: "integer", minimum: 1, maximum: 365, default: 30,
              description: "Giorni futuri da considerare (es. 30 per prossimo mese, 90 per trimestre)",
            },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_revenue_forecast", {
      p_company_id: ctx.companyId,
      p_days_ahead: args?.days_ahead ?? 30,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
  },

  get_overdue_payments: {
    schema: {
      type: "function",
      function: {
        name: "get_overdue_payments",
        description: "Ritorna le rate (acconto, acconto2, saldo, finanziamento) SCADUTE e non pagate. Usa per domande 'chi mi deve pagare', 'rate in ritardo', 'crediti scaduti'.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_tool_overdue_payments", {
      p_company_id: ctx.companyId,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
  },

  get_cashflow_status: {
    schema: {
      type: "function",
      function: {
        name: "get_cashflow_status",
        description: "Ritorna saldo banche aziendali + entrate/uscite ultimi N giorni dai movimenti bancari. Usa per 'saldo banca', 'cashflow', 'movimenti banca'.",
        parameters: {
          type: "object",
          properties: {
            days_back: { type: "integer", minimum: 1, maximum: 365, default: 30 },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_cashflow_status", {
      p_company_id: ctx.companyId,
      p_days_back: args?.days_back ?? 30,
    }),
    allowedRoles: ["super_admin", "company_admin"],
  },

  get_cashflow_forecast_90d: {
    schema: {
      type: "function",
      function: {
        name: "get_cashflow_forecast_90d",
        description: "Previsione cashflow predittiva settimanale per i prossimi 90 giorni (13 settimane). Combina saldo banche attuale + rate future attese (con ritardi pagamento storici per cliente) + stipendi settimanali + fatture fornitori (60gg). Ritorna per ogni settimana: incassi attesi, uscite, saldo cumulativo, status (ok/warning/critical), totali periodo, settimane critiche, settimana di saldo minimo. Usa per: 'come sarà la cassa nei prossimi 3 mesi', 'avrò problemi di liquidità', 'previsione cashflow', 'cassa futura', 'rischio cassa negativa'.",
        parameters: {
          type: "object",
          properties: {
            weeks: {
              type: "integer", minimum: 4, maximum: 26, default: 13,
              description: "Numero settimane da prevedere (default 13 = ~90 giorni)",
            },
            apply_delay: {
              type: "boolean", default: true,
              description: "Se true, applica ritardo storico medio pagamenti per cliente (più realistico)",
            },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_cashflow_forecast_90d", {
      p_company_id: ctx.companyId,
      p_weeks: args?.weeks ?? 13,
      p_apply_delay: args?.apply_delay ?? true,
    }),
    allowedRoles: ["super_admin", "company_admin"],
  },

  get_quotes_summary: {
    schema: {
      type: "function",
      function: {
        name: "get_quotes_summary",
        description: "Ritorna pipeline preventivi con valori e breakdown per status. Usa per 'preventivi aperti', 'pipeline vendite', 'preventivi vinti'.",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["open", "won", "lost", "all"],
              description: "Filtro: open=in attesa, won=vinti, lost=persi, all=tutti",
            },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_quotes_summary", {
      p_company_id: ctx.companyId,
      p_status: args?.status ?? "all",
    }),
  },

  search_orders: {
    schema: {
      type: "function",
      function: {
        name: "search_orders",
        description: "Cerca commesse per nome cliente, codice, descrizione lavoro o indirizzo. Usa per 'commessa Rossi', 'cantiere via Roma', 'lavori per Marco'.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Termine di ricerca (min 2 caratteri)" },
          },
          required: ["query"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_search_orders", {
      p_company_id: ctx.companyId,
      p_query: args?.query ?? "",
    }),
  },

  get_employees_workload: {
    schema: {
      type: "function",
      function: {
        name: "get_employees_workload",
        description: "Ritorna carico di lavoro per ogni operaio attivo: ore lavorate ultimi 30gg, ordini attivi, % utilizzo, stato (libero/leggero/medio/pieno/overload). Usa per 'chi è libero', 'carico operai', 'chi posso assegnare', 'team in overload'.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_employees_workload", {
      p_company_id: ctx.companyId,
    }),
    allowedRoles: ["super_admin", "company_admin"],
  },

  get_pricing_history: {
    schema: {
      type: "function",
      function: {
        name: "get_pricing_history",
        description: "Storico vendite di una voce/articolo: numero volte venduta, prezzo medio/min/max, costo medio, margine, markup % medio. Usa per 'a quanto ho venduto X', 'prezzo storico Y', 'margine articolo Z'.",
        parameters: {
          type: "object",
          properties: {
            item_name: { type: "string", description: "Nome articolo (anche parziale, min 2 char)" },
          },
          required: ["item_name"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_pricing_history", {
      p_company_id: ctx.companyId,
      p_item_name: args?.item_name ?? "",
    }),
    allowedRoles: ["super_admin", "company_admin", "salesperson"],
  },

  get_customers_ltv_top: {
    schema: {
      type: "function",
      function: {
        name: "get_customers_ltv_top",
        description: "Ritorna i top clienti per LTV predetto 12 mesi (Lifetime Value). Include ticket medio, fatturato storico, frequenza ordini, churn risk, azione consigliata. Usa per 'clienti più preziosi', 'top LTV', 'chi vale di più nel CRM'.",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 20, default: 10 },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_top_value_customers", {
      p_company_id: ctx.companyId,
      p_limit: args?.limit ?? 10,
    }),
    allowedRoles: ["super_admin", "company_admin", "salesperson"],
  },

  get_customers_at_risk: {
    schema: {
      type: "function",
      function: {
        name: "get_customers_at_risk",
        description: "Ritorna clienti a rischio churn (>180gg inattivi) con azione consigliata. Usa per 'clienti a rischio', 'chi sta perdendo', 'clienti dormienti', 'chi devo riattivare'.",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 20, default: 10 },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_top_at_risk_customers", {
      p_company_id: ctx.companyId,
      p_limit: args?.limit ?? 10,
    }),
    allowedRoles: ["super_admin", "company_admin", "salesperson"],
  },

  get_top_customers: {
    schema: {
      type: "function",
      function: {
        name: "get_top_customers",
        description: "Ritorna top N clienti per fatturato cumulato (somma valore commesse). Usa per 'clienti migliori', 'top clienti', 'chi compra di più'.",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_top_customers", {
      p_company_id: ctx.companyId,
      p_limit: args?.limit ?? 10,
    }),
    allowedRoles: ["super_admin", "company_admin", "salesperson"],
  },

  // ── EXTENDED TOOLS ─────────────────────────────────────────────────────

  get_team_summary: {
    schema: {
      type: "function",
      function: {
        name: "get_team_summary",
        description: "Ritorna composizione team (employees attivi, ruoli, costo lordo/netto mensile) + richieste HR pending (ferie/permessi/malattia da approvare). Usa per 'quanti operai ho', 'costo personale', 'ferie da approvare', 'team aziendale'.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_tool_team_summary", {
      p_company_id: ctx.companyId,
    }),
    allowedRoles: ["super_admin", "company_admin"],
  },

  get_warehouse_status: {
    schema: {
      type: "function",
      function: {
        name: "get_warehouse_status",
        description: "Ritorna stato magazzino: numero articoli, valore totale, articoli sotto soglia minima (da riordinare), top articoli per valore. Usa per 'magazzino', 'cosa devo riordinare', 'stock bassi', 'valore magazzino'.",
        parameters: {
          type: "object",
          properties: {
            search: {
              type: "string",
              description: "Filtro opzionale per nome o codice articolo",
            },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_warehouse_status", {
      p_company_id: ctx.companyId,
      p_search: args?.search ?? null,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
  },

  get_suppliers_summary: {
    schema: {
      type: "function",
      function: {
        name: "get_suppliers_summary",
        description: "Ritorna lista fornitori attivi con categoria prodotto, contatti, lead time, rating. Usa per 'fornitori', 'da chi compriamo', 'lista fornitori'.",
        parameters: {
          type: "object",
          properties: {
            search: {
              type: "string",
              description: "Filtro opzionale per nome o categoria prodotto",
            },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_suppliers_summary", {
      p_company_id: ctx.companyId,
      p_search: args?.search ?? null,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
  },

  get_subappaltatori_summary: {
    schema: {
      type: "function",
      function: {
        name: "get_subappaltatori_summary",
        description: "Ritorna lista subappaltatori con ragione sociale, responsabile, contatti, P.IVA. Usa per 'subappaltatori', 'imprese esterne', 'partner edili'.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_tool_subappaltatori_summary", {
      p_company_id: ctx.companyId,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
  },

  get_received_invoices: {
    schema: {
      type: "function",
      function: {
        name: "get_received_invoices",
        description: "Ritorna fatture passive ricevute dai fornitori (da pagare/pagate). Usa per 'fatture da pagare', 'pagamenti fornitori', 'scadenze fornitori'.",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["unpaid", "paid", "all"],
              description: "Filtro: unpaid=da pagare, paid=pagate, all=tutte",
            },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_received_invoices", {
      p_company_id: ctx.companyId,
      p_status: args?.status ?? "unpaid",
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
  },

  search_brain: {
    schema: {
      type: "function",
      function: {
        name: "search_brain",
        description: "Ricerca semantica nei documenti aziendali indicizzati (commesse, preventivi, clienti, fornitori, subappaltatori) tramite embedding. Usa quando la domanda richiede SEMANTICA non strutturata: 'che lavori abbiamo fatto a Firenze', 'fornitori specializzati in serramenti', 'commesse simili a quella di via Roma', 'note cliente Bianchi'. NON usare per domande con dati strutturati che hanno tool dedicati (es. quante commesse → usa get_orders_summary).",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Query in linguaggio naturale" },
            source_types: {
              type: "array",
              items: { type: "string", enum: ["order", "quote", "customer", "supplier", "subappaltatore", "chat_summary", "note"] },
              description: "Filtra solo certi tipi di documenti. Default tutti.",
            },
            limit: { type: "integer", minimum: 1, maximum: 15, default: 6 },
          },
          required: ["query"],
        },
      },
    },
    executor: async (args, ctx) => {
      const queryText = String(args?.query ?? "").trim();
      if (queryText.length < 3) return { error: "query troppo corta" };

      const embedding = await tryGenerateEmbedding(queryText);
      if (!embedding) {
        return { error: "embedding non disponibile (OPENAI_API_KEY mancante o servizio down)" };
      }

      const { data, error } = await ctx.supabase.rpc("match_brain", {
        p_company_id: ctx.companyId,
        p_query_embedding: `[${embedding.join(",")}]`,
        p_match_count: Math.min(args?.limit ?? 6, 15),
        p_min_similarity: 0.20,
        p_source_types: args?.source_types ?? null,
      });

      if (error) return { error: error.message };
      return {
        query: queryText,
        risultati: data ?? [],
        nota: data && data.length === 0 ? "Nessun match — prova una query diversa o usa tool strutturati." : undefined,
      };
    },
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson", "call_center"],
  },

  create_quote_draft: {
    schema: {
      type: "function",
      function: {
        name: "create_quote_draft",
        description: "Crea una BOZZA di preventivo nel sistema con cliente, descrizione lavori e voci dettagliate. La bozza ha status='draft' e l'utente potrà rivederla, modificarla e inviarla al cliente. Usa quando l'utente chiede 'fai un preventivo per X', 'crea un preventivo', 'genera bozza preventivo'. Le voci devono includere: name, description, quantity, unit_of_measure, unit_price, vat_rate.",
        parameters: {
          type: "object",
          properties: {
            client_name: { type: "string", description: "Nome cliente (obbligatorio, min 2 char)" },
            client_email: { type: "string", description: "Email cliente (opzionale)" },
            client_phone: { type: "string", description: "Telefono cliente (opzionale)" },
            client_address: { type: "string", description: "Indirizzo cliente (opzionale)" },
            title: { type: "string", description: "Titolo preventivo (es. 'Ristrutturazione bagno via Roma')" },
            description: { type: "string", description: "Descrizione generale lavori" },
            tipo_lavoro: { type: "string", description: "Categoria lavoro: 'Serramenti', 'Ristrutturazione', 'Manutenzione', ecc." },
            indirizzo_lavori: { type: "string", description: "Indirizzo dove si svolgeranno i lavori" },
            items: {
              type: "array",
              description: "Voci del preventivo (manodopera, materiali, ecc.)",
              items: {
                type: "object",
                properties: {
                  item_type: { type: "string", enum: ["material", "labor", "subcontract", "service", "other"] },
                  name: { type: "string", description: "Nome breve voce" },
                  description: { type: "string", description: "Descrizione dettagliata" },
                  quantity: { type: "number", description: "Quantità" },
                  unit_of_measure: { type: "string", description: "U.M. (pz, mq, ml, h, ...)" },
                  unit_price: { type: "number", description: "Prezzo unitario EUR" },
                  vat_rate: { type: "number", description: "% IVA (10, 22, 4 a seconda lavoro)" },
                },
                required: ["name", "quantity", "unit_price"],
              },
            },
            validity_days: { type: "integer", default: 30 },
            default_vat_rate: { type: "number", default: 22, description: "IVA default per voci che non la specificano. Per ristrutturazione casa privati: 10%. Manutenzione: 10%. Altro: 22%." },
          },
          required: ["client_name", "items"],
        },
      },
    },
    executor: async (args, ctx) => {
      const { data, error } = await ctx.supabase.rpc("silvio_create_quote_draft", {
        p_company_id: ctx.companyId,
        p_user_id: ctx.userId,
        p_client_name: args.client_name,
        p_client_email: args.client_email ?? null,
        p_client_phone: args.client_phone ?? null,
        p_client_address: args.client_address ?? null,
        p_title: args.title ?? null,
        p_description: args.description ?? null,
        p_tipo_lavoro: args.tipo_lavoro ?? null,
        p_indirizzo_lavori: args.indirizzo_lavori ?? null,
        p_items: args.items ?? [],
        p_validity_days: args.validity_days ?? 30,
        p_default_vat_rate: args.default_vat_rate ?? 22,
        p_internal_notes: "Bozza generata da Silvio AI",
      });
      if (error) return { error: error.message };
      return data;
    },
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
  },

  create_invoice_draft: {
    schema: {
      type: "function",
      function: {
        name: "create_invoice_draft",
        description: "Crea una riga fattura/rata su un ordine esistente. Usa quando l'utente chiede 'fai una fattura per ordine X', 'fammi la fattura del saldo per Y'. Richiede order_id (cercalo prima con search_orders se non l'hai). rata_type può essere acconto, acconto_2, saldo, finanziamento.",
        parameters: {
          type: "object",
          properties: {
            order_id: { type: "string", description: "UUID ordine (da search_orders)" },
            rata_type: {
              type: "string",
              enum: ["acconto", "acconto_2", "saldo", "finanziamento"],
              description: "Tipo rata da fatturare",
            },
            amount: {
              type: "number",
              description: "Importo override (se omesso, usa quello dalla commessa).",
            },
            notes: { type: "string", description: "Note opzionali" },
          },
          required: ["order_id", "rata_type"],
        },
      },
    },
    executor: async (args, ctx) => {
      const { data, error } = await ctx.supabase.rpc("silvio_create_invoice_draft", {
        p_company_id: ctx.companyId,
        p_user_id: ctx.userId,
        p_order_id: args.order_id,
        p_rata_type: args.rata_type,
        p_amount: args.amount ?? null,
        p_notes: args.notes ?? null,
      });
      if (error) return { error: error.message };
      return data;
    },
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
  },

  analyze_image: {
    schema: {
      type: "function",
      function: {
        name: "analyze_image",
        description: "Analizza un'immagine (foto cantiere, fattura scansionata, schema tecnico, ecc.) usando vision AI. Identifica violazioni sicurezza, % avanzamento lavori, materiali, anomalie. Per fatture/documenti: estrai dati strutturati. L'utente DEVE aver già caricato l'immagine e fornito storage_path o URL pubblico.",
        parameters: {
          type: "object",
          properties: {
            image_url: { type: "string", description: "URL pubblico o storage_path dell'immagine" },
            question: {
              type: "string",
              description: "Cosa analizzare specificamente (es. 'verifica DPI degli operai', 'calcola % avanzamento', 'estrai dati fattura')",
            },
            context: {
              type: "string",
              enum: ["cantiere_safety", "cantiere_progress", "fattura", "documento_tecnico", "generic"],
              description: "Tipo contesto per ottimizzare il prompt",
            },
          },
          required: ["image_url", "question"],
        },
      },
    },
    executor: async (args, ctx) => {
      const url = String(args?.image_url ?? "").trim();
      if (!url) return { error: "image_url mancante" };
      const question = String(args?.question ?? "Analizza dettagliatamente l'immagine.");
      const context = String(args?.context ?? "generic");

      // Resolve storage path → signed URL
      let imageUrl = url;
      if (!url.startsWith("http")) {
        try {
          const { data, error } = await ctx.supabase.storage
            .from("silvio-uploads").createSignedUrl(url, 600);
          if (error || !data?.signedUrl) {
            return { error: `Storage signed URL fallita: ${error?.message ?? "no url"}` };
          }
          imageUrl = data.signedUrl;
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) };
        }
      }

      const contextPrompt: Record<string, string> = {
        cantiere_safety: "Sei un esperto sicurezza cantieri D.Lgs 81/08. Identifica DPI mancanti, ponteggi non a norma, rischi caduta, ostacoli. Lista violazioni con riferimento normativo.",
        cantiere_progress: "Sei un PM cantiere. Stima % completamento, identifica fasi lavoro visibili, segnala anomalie qualità.",
        fattura: "Estrai in JSON: numero, data, fornitore (ragione sociale, P.IVA), importo netto, IVA, totale, data scadenza, voci principali.",
        documento_tecnico: "Analizza il documento tecnico/disegno: identifica elementi, quote, materiali, eventuali normative.",
        generic: "Analizza dettagliatamente l'immagine in italiano professionale.",
      };

      const apiKey = Deno.env.get("OPENAI_API_KEY");
      if (!apiKey) return { error: "OPENAI_API_KEY non configurata" };

      try {
        const start = Date.now();
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o",
            max_tokens: 1500,
            temperature: 0.2,
            messages: [
              { role: "system", content: contextPrompt[context] },
              {
                role: "user",
                content: [
                  { type: "text", text: question },
                  { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
                ],
              },
            ],
          }),
        });
        const durationMs = Date.now() - start;

        if (!res.ok) {
          const errText = await res.text();
          return { error: `Vision API ${res.status}: ${errText.slice(0, 300)}` };
        }
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content ?? "";
        const usage = data?.usage ?? {};

        // Charge il vision call (gpt-4o ~$2.50/M in, $10/M out)
        try {
          const costUsd = ((usage.prompt_tokens ?? 0) / 1_000_000) * 2.5 +
                         ((usage.completion_tokens ?? 0) / 1_000_000) * 10;
          await ctx.supabase.rpc("charge_ai_call", {
            p_idempotency_key: `vision_${ctx.userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            p_company_id: ctx.companyId,
            p_user_id: ctx.userId,
            p_task_key: "vision_analysis",
            p_tier_key: "t4_premium",
            p_model_used: "openai/gpt-4o",
            p_used_primary: true, p_fallback_index: 0,
            p_persona_key: "silvio",
            p_tokens_in: usage.prompt_tokens ?? 0,
            p_tokens_out: usage.completion_tokens ?? 0,
            p_cost_real_usd: costUsd,
            p_fx_usd_to_eur: Number(Deno.env.get("AI_FX_USD_EUR") ?? "0.92"),
            p_status: "success",
            p_duration_ms: durationMs,
            p_metadata: { context, image_url_hash: url.slice(-20) },
          });
        } catch { /* best-effort */ }

        return {
          ok: true,
          context,
          analysis: content,
          tokens: { in: usage.prompt_tokens, out: usage.completion_tokens },
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
  },

  analyze_quote: {
    schema: {
      type: "function",
      function: {
        name: "analyze_quote",
        description: "Analizza un preventivo specifico per win-probability, congruità prezzi, suggerimenti upsell. Usa quando l'utente chiede 'analizza preventivo PREV-XXX', 'questo preventivo è competitivo?', 'come migliorarlo'.",
        parameters: {
          type: "object",
          properties: {
            quote_number: { type: "string", description: "Numero preventivo (es. 'PREV-2026-0002')" },
            quote_id: { type: "string", description: "UUID alternativa a quote_number" },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => {
      let quoteId = args?.quote_id as string | undefined;
      if (!quoteId && args?.quote_number) {
        const { data } = await ctx.supabase.from("quotes")
          .select("id").eq("company_id", ctx.companyId).eq("quote_number", args.quote_number).maybeSingle();
        quoteId = data?.id;
      }
      if (!quoteId) return { error: "quote_id o quote_number mancante / non trovato" };

      const { data: quote } = await ctx.supabase.from("quotes")
        .select("quote_number, status, client_name, title, tipo_lavoro, subtotal, vat_amount, total, totale_costo_interno, totale_overhead, margine_totale_percentuale, created_at, expires_at, sent_at, signed_at, refused_at")
        .eq("id", quoteId).maybeSingle();
      if (!quote) return { error: "Preventivo non accessibile" };

      const { data: items } = await ctx.supabase.from("quote_items")
        .select("name, item_type, quantity, unit_of_measure, unit_price, vat_rate, line_total")
        .eq("quote_id", quoteId);

      // Stats su quote_items per win benchmark sui simili (stesso tipo_lavoro, ultimi 12 mesi)
      const { data: similar } = await ctx.supabase.from("quotes")
        .select("status, total")
        .eq("company_id", ctx.companyId)
        .eq("tipo_lavoro", quote.tipo_lavoro ?? "")
        .gte("created_at", new Date(Date.now() - 365 * 86400 * 1000).toISOString());

      const wonCount = (similar ?? []).filter((s: { status: string }) =>
        ["accepted", "won", "vinto", "approved"].includes(s.status)).length;
      const totalSimilar = (similar ?? []).length;
      const winRate = totalSimilar > 0 ? (wonCount / totalSimilar) * 100 : null;
      const avgWonValue = totalSimilar > 0 ? (similar ?? [])
        .filter((s: { status: string }) => ["accepted", "won", "vinto", "approved"].includes(s.status))
        .reduce((sum: number, s: { total: number }) => sum + Number(s.total), 0) / Math.max(wonCount, 1) : null;

      return {
        ok: true,
        quote: { ...quote, items },
        benchmark: {
          tipo_lavoro: quote.tipo_lavoro,
          preventivi_simili_ultimi_12m: totalSimilar,
          vinti: wonCount,
          win_rate_pct: winRate ? Math.round(winRate) : null,
          valore_medio_vinti_eur: avgWonValue ? Math.round(avgWonValue) : null,
        },
        nota: "Usa questi dati per: (1) congruenza prezzi voci vs medie aziendali, (2) win-rate benchmark, (3) suggerimenti pratici.",
      };
    },
    allowedRoles: ["super_admin", "company_admin", "salesperson"],
  },

  analyze_computo_metrico: {
    schema: {
      type: "function",
      function: {
        name: "analyze_computo_metrico",
        description: "Analizza un computo metrico estimativo (BoQ) fornito come testo: identifica voci, verifica congruenza prezzi vs media mercato, segnala anomalie, suggerisce migliorie. Per ora accetta SOLO testo (in futuro PDF). Lo Silvio passa il testo del computo nel parametro 'computo_text'.",
        parameters: {
          type: "object",
          properties: {
            computo_text: {
              type: "string",
              description: "Testo del computo (anche in formato grezzo). Min 50 char.",
            },
            focus: {
              type: "string",
              enum: ["prezzi", "completezza", "norme", "tutto"],
              default: "tutto",
              description: "Aspetto su cui concentrare l'analisi",
            },
          },
          required: ["computo_text"],
        },
      },
    },
    executor: async (args, ctx) => {
      const text = String(args?.computo_text ?? "").trim();
      if (text.length < 50) return { error: "Testo computo troppo corto (min 50 char)" };

      // L'analisi è "soft": ritorniamo il testo strutturato che permette al LLM di ragionarci.
      // Più avanti possiamo aggiungere parsing strutturato.
      return {
        ok: true,
        computo_lunghezza: text.length,
        focus: args.focus ?? "tutto",
        nota: "L'analisi del computo deve essere svolta dal LLM stesso usando questo testo. Il LLM deve identificare voci, prezzi, U.M., e dare feedback ragionato confrontando con prezziari di mercato (DEI, regionali) note dal Knowledge Base universale.",
        testo_da_analizzare: text.slice(0, 8000),
      };
    },
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
  },

  propose_action: {
    schema: {
      type: "function",
      function: {
        name: "propose_action",
        description: "Crea una BOZZA di azione che richiede conferma esplicita dell'utente prima di essere applicata. Usa quando l'utente chiede di FARE qualcosa che ha effetti reali (es. 'manda email recupero crediti', 'genera preventivo per X', 'sollecita pagamento'). NON usare per query di sola lettura.",
        parameters: {
          type: "object",
          properties: {
            action_type: {
              type: "string",
              description: "Tipo azione: email_recupero_crediti, sollecito_pagamento, preventivo_bozza, riordino_materiale, ecc.",
            },
            summary: {
              type: "string",
              description: "Sintesi human-readable di cosa farà l'azione (max 150 char)",
            },
            payload: {
              type: "object",
              description: "Dati strutturati pronti per l'esecuzione (es. {to_email, subject, body} per email)",
            },
            risk_level: {
              type: "string",
              enum: ["yellow", "red"],
              description: "yellow=conferma standard, red=azione irreversibile (es. invio fattura, cancellazione)",
            },
          },
          required: ["action_type", "summary", "payload"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_propose_action", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_action_type: args?.action_type,
      p_summary: args?.summary,
      p_payload: args?.payload ?? {},
      p_session_id: null,
      p_persona_key: "silvio",
      p_risk_level: args?.risk_level ?? "yellow",
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
  },
};

/**
 * Ritorna i tool disponibili per il ruolo dell'utente.
 */
export function getToolsForRole(role: string): SilvioTool[] {
  return Object.values(SILVIO_TOOLS).filter(t =>
    !t.allowedRoles || t.allowedRoles.length === 0 || t.allowedRoles.includes(role)
  );
}

/**
 * Esegue un tool by name + args.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  const tool = SILVIO_TOOLS[name];
  if (!tool) return { error: `Tool sconosciuto: ${name}` };
  if (tool.allowedRoles && !tool.allowedRoles.includes(ctx.primaryRole)) {
    return { error: `Tool ${name} non autorizzato per ruolo ${ctx.primaryRole}` };
  }
  try {
    return await tool.executor(args, ctx);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
