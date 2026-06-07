// Customer Service Window (finestra 24h) di WhatsApp Business Platform.
//
// Regola Meta: un'azienda può inviare messaggi a TESTO LIBERO solo entro 24h
// dall'ultimo messaggio INBOUND del cliente. Fuori dalla finestra (o senza
// nessun inbound) è obbligatorio un TEMPLATE approvato: il testo libero viene
// rifiutato da Meta (errore 131047) e degrada la quality rating del numero.
//
// Qui determiniamo se la finestra è aperta guardando l'ultimo messaggio
// `direction = 'inbound'` per quel numero di telefono nell'azienda.

const WINDOW_MS = 24 * 60 * 60 * 1000;

interface MinimalClient {
  from: (table: string) => any;
}

export interface WhatsAppWindowStatus {
  /** true se l'ultimo inbound del cliente è entro le 24h. */
  open: boolean;
  /** ISO timestamp dell'ultimo inbound, o null se non c'è mai stato. */
  lastInboundAt: string | null;
}

/** Normalizza un numero a sole cifre per confronti robusti. */
function digits(phone: string | null | undefined): string {
  return (phone ?? "").replace(/[^0-9]/g, "");
}

/**
 * Calcola lo stato della finestra 24h per `phone` nell'azienda `companyId`.
 * Non solleva mai: in caso di errore considera la finestra CHIUSA (fail-safe
 * verso il comportamento conforme = serve template).
 */
export async function getWhatsAppWindowStatus(
  client: MinimalClient,
  companyId: string,
  phone: string,
): Promise<WhatsAppWindowStatus> {
  const clean = digits(phone);
  if (!clean) return { open: false, lastInboundAt: null };

  try {
    // Prendiamo gli ultimi inbound recenti e confrontiamo per sole cifre
    // (i numeri possono essere salvati con/senza '+', spazi, prefissi).
    const sinceIso = new Date(Date.now() - WINDOW_MS).toISOString();
    const { data, error } = await client
      .from("whatsapp_messages")
      .select("from_phone, created_at")
      .eq("company_id", companyId)
      .eq("direction", "inbound")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error || !Array.isArray(data)) return { open: false, lastInboundAt: null };

    const match = data.find((m: { from_phone: string | null }) => {
      const f = digits(m.from_phone);
      return f === clean || f.endsWith(clean) || clean.endsWith(f);
    }) as { created_at: string } | undefined;

    if (!match) return { open: false, lastInboundAt: null };
    return { open: true, lastInboundAt: match.created_at };
  } catch (_err) {
    return { open: false, lastInboundAt: null };
  }
}

export interface TemplatePayloadInput {
  name: string;
  language: string;
  /** Valori delle variabili {{1}}, {{2}}, … del body (in ordine). */
  variables?: string[];
}

/** Costruisce il payload Meta `type: template`. */
export function buildTemplatePayload(to: string, tpl: TemplatePayloadInput): Record<string, unknown> {
  const vars = (tpl.variables ?? []).filter((v) => v != null);
  const components = vars.length > 0
    ? [{ type: "body", parameters: vars.map((v) => ({ type: "text", text: String(v) })) }]
    : undefined;
  return {
    messaging_product: "whatsapp",
    to: digits(to),
    type: "template",
    template: {
      name: tpl.name,
      language: { code: tpl.language || "it" },
      ...(components ? { components } : {}),
    },
  };
}
