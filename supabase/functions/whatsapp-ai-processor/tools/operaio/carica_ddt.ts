// Conserva l'originale WhatsApp nella stessa coda persistente di app e desktop.
// L'ufficio controlla la lettura e conferma le quantità effettive: il caricamento
// del documento non crea da solo costi, materiali o movimenti di magazzino.

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";
import { resolveCantiere } from "../shared/resolve_cantiere.ts";
import { acquisisciDdtWhatsapp } from "../../../_shared/ddtWhatsappPersistente.ts";
import { requireSiteAccess } from "../shared/siteAccess.ts";

export const caricaDDTDef: Omit<ToolDef, "handler"> = {
  name: "carica_ddt",
  description:
    "Registra un DDT (Documento di Trasporto) ricevuto al cantiere a partire dalla foto. " +
    "Estrae i dati, cerca l'ordine d'acquisto del fornitore, conserva l’originale e lo prepara per il controllo dell’ufficio. " +
    "Il riepilogo dei dati e la conferma coi bottoni li prepara il sistema: non mostrare i dati a parole prima, chiama direttamente coi dati letti.",
  parameters: {
    type: "object",
    properties: {
      numero_ddt: { type: "string" },
      fornitore: { type: "string" },
      data_ddt: {
        type: "string",
        description: "Data DDT in formato YYYY-MM-DD se leggibile",
      },
      righe: {
        type: "array",
        items: {
          type: "object",
          properties: {
            descrizione: { type: "string" },
            codice: {
              type: "string",
              description: "Codice articolo/SKU se presente",
            },
            quantita: { type: "number" },
            unita_misura: { type: "string" },
          },
          required: ["descrizione"],
        },
      },
      riferimento_ordine: {
        type: "string",
        description:
          "Numero ordine d'acquisto citato sul DDT (es. 'Rif. Vs ordine 2025/128'), se presente",
      },
      indirizzo_consegna: {
        type: "string",
        description:
          "Indirizzo di consegna/destinazione riportato sul DDT (es. 'Cantiere Via Roma 12'), se presente. Aiuta a capire il cantiere.",
      },
      order_id: {
        type: "string",
        description: "ID commessa/cantiere se già noto",
      },
      cantiere_hint: { type: "string" },
      media_url: {
        type: "string",
        description: "Non serve: si usa la foto arrivata su WhatsApp",
      },
      note: { type: "string" },
    },
    required: ["numero_ddt", "fornitore"],
    additionalProperties: false,
  },
  requires_grants: ["ddt.write"],
  requires_confirmation: true,
};

interface RigaArg {
  descrizione: string;
  codice?: string;
  quantita?: number;
  unita_misura?: string;
}

interface Args {
  numero_ddt: string;
  fornitore: string;
  data_ddt?: string;
  righe?: RigaArg[];
  riferimento_ordine?: string;
  indirizzo_consegna?: string;
  order_id?: string;
  cantiere_hint?: string;
  media_url?: string;
  note?: string;
}

export async function caricaDDT(ctx: ToolCtx, args: Args): Promise<ToolResult> {
  const media = ctx.mediaCorrente;
  if (ctx.kind === "unknown" || (!ctx.user_id && !ctx.employee_id))
    return errResult(
      "no_identity",
      "Chiedi all’ufficio di associare il tuo numero alla tua utenza.",
    );
  if (!media?.storagePath || !["image", "document"].includes(media.tipo))
    return errResult(
      "no_originale",
      "Per conservare il documento originale, allega la foto o il PDF della bolla e scegli il cantiere.",
    );
  let orderId = args.order_id ?? null;
  try {
    if (!orderId && ctx.kind !== "operaio") {
      const r = await resolveCantiere(ctx, args.cantiere_hint, {
        riferimento_ordine: args.riferimento_ordine ?? null,
        fornitore: args.fornitore,
        indirizzo: args.indirizzo_consegna ?? null,
      });
      orderId = r.cantiere_id ?? null;
    }
    if (ctx.kind === "operaio" && !orderId)
      return errResult(
        "site_missing",
        "Scegli il cantiere su cui è stata consegnata la merce.",
      );
    if (orderId) await requireSiteAccess(ctx, orderId);
    const acquisito = await acquisisciDdtWhatsapp(ctx.supabase, {
      storagePath: media.storagePath,
      companyId: ctx.company_id,
      userId: ctx.user_id,
      employeeId: ctx.employee_id,
      messageId: ctx.requestId ?? media.storagePath,
      orderId,
    });
    return okResult(
      {
        documento_job_id: acquisito.id,
        order_id: orderId,
        stato: acquisito.status,
      },
      `📄 Bolla${args.numero_ddt ? ` n. ${args.numero_ddt}` : ""} conservata con l’originale. L’ufficio la trova in «DDT → Documenti in ingresso» e conferma i materiali arrivati. La consegna in cantiere non entra in magazzino e il prezzo può restare da definire.`,
    );
  } catch {
    return errResult(
      "ddt_non_accodato",
      "Non riesco a completare il salvataggio. L’allegato è conservato: riprova o apri «Bolle e DDT» nell’app.",
    );
  }
}
