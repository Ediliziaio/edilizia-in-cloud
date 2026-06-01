// MP-P1 — Interactive WhatsApp (button/list) payload builder.
//
// Costruisce l'oggetto `interactive` nel formato Meta Cloud API accettato da
// whatsapp-send (che valida interactive.type/body/action). Funzione PURA:
// nessun I/O. L'invio resta centralizzato in index.ts (sendInteractiveReply),
// così il tool che la usa (chiedi_conferma) non ha side-effect di rete e resta
// facilmente testabile.
//
// Vincoli Meta rispettati (https://developers.facebook.com/docs/whatsapp):
//  - button:  max 3 bottoni, reply.title ≤ 20 char, reply.id ≤ 256 char
//  - list:    max 10 righe totali, row.title ≤ 24 char, row.description ≤ 72,
//             action.button (label menu) ≤ 20 char
//  - body.text: ≤ 1024 char e NON vuoto (Meta rifiuta body vuoto)
//
// Round-trip: quando l'utente tocca un bottone/riga, il parser inbound
// (whatsapp-webhook/parser.ts) salva come content_text il `title` selezionato.
// Per questo i titoli sono troncati con HARD SLICE (nessun "…"): il testo che
// torna è un prefisso pulito dell'etichetta originale, così l'LLM lo riconosce.

export interface InteractiveOption {
  /** ID stabile rimandato da Meta (non mostrato all'utente). */
  id: string;
  /** Etichetta visibile e testo che torna come content_text al tap. */
  title: string;
  /** Solo per liste: sottotitolo opzionale (utile per etichette lunghe). */
  description?: string;
}

export type InteractivePayload =
  | {
    type: "button";
    body: { text: string };
    action: {
      buttons: Array<{ type: "reply"; reply: { id: string; title: string } }>;
    };
  }
  | {
    type: "list";
    body: { text: string };
    action: {
      button: string;
      sections: Array<{
        title?: string;
        rows: Array<{ id: string; title: string; description?: string }>;
      }>;
    };
  };

/** Trim + hard slice a `max` caratteri (nessun ellipsis: vedi nota round-trip). */
function clamp(value: string, max: number): string {
  const t = (value ?? "").trim();
  return t.length <= max ? t : t.slice(0, max);
}

/**
 * Costruisce il payload interactive Meta.
 *  - ≤ 3 opzioni → bottoni rapidi (UX migliore: visibili senza aprire menu).
 *  - 4–10 opzioni → lista a tendina (single section).
 * Le opzioni con titolo vuoto vengono scartate; oltre 10 sono troncate.
 */
export function buildInteractivePayload(
  bodyText: string,
  options: InteractiveOption[],
  listButtonLabel = "Scegli",
): InteractivePayload {
  const text = clamp(bodyText, 1024) || "Confermi?";
  const opts = (options ?? []).filter(
    (o) => o && (o.title ?? "").trim().length > 0,
  );

  if (opts.length <= 3) {
    return {
      type: "button",
      body: { text },
      action: {
        buttons: opts.slice(0, 3).map((o, i) => ({
          type: "reply" as const,
          reply: {
            id: clamp(o.id || `opt_${i}`, 256) || `opt_${i}`,
            title: clamp(o.title, 20),
          },
        })),
      },
    };
  }

  return {
    type: "list",
    body: { text },
    action: {
      button: clamp(listButtonLabel, 20) || "Scegli",
      sections: [
        {
          rows: opts.slice(0, 10).map((o, i) => ({
            id: clamp(o.id || `opt_${i}`, 200) || `opt_${i}`,
            title: clamp(o.title, 24),
            ...(o.description
              ? { description: clamp(o.description, 72) }
              : {}),
          })),
        },
      ],
    },
  };
}
