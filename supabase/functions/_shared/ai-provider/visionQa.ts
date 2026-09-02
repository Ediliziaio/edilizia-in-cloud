// _shared/ai-provider/visionQa.ts
// Vision QA: confronta una source photo + una candidate render image
// e ritorna {pass, issues[]} secondo una regola di compliance.
//
// Usato da generate-render dopo aver generato il render per verificare,
// ad esempio, che cinghie/avvolgitori manuali siano stati effettivamente
// rimossi se l'utente ha scelto tapparella motorizzata.
//
// Passa SEMPRE via OpenRouter con chain di modelli vision-capable.

import { callOpenRouter } from "./openrouter.ts";
import type { ChatMessage } from "./types.ts";

// v8.6.32 — Gemini eliminato. Chain: Claude Haiku + GPT-4o-mini.
/**
 * Toglie il recinto markdown attorno al JSON.
 *
 * Diversi modelli vision — Claude Haiku in testa, che e' il PRIMO della chain —
 * rispondono incapsulando il JSON in un blocco ```json ... ```, anche quando il
 * prompt chiede JSON puro. JSON.parse su quel testo lancia sempre, la QA di quel
 * modello viene scartata e si passa al successivo: una chiamata sprecata e una
 * decina di secondi persi su OGNI render, in tutti i moduli. Visto in prod il
 * 01/09/2026 (json_parse_failed con raw che iniziava per "```json").
 * Qui il recinto viene rimosso prima del parse; se non c'e', il testo passa
 * invariato.
 */
function stripJsonFence(text: string): string {
  const fence = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  if (fence) return fence[1].trim();
  // Fallback: alcuni modelli aggiungono una frase prima/dopo il JSON.
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) return text.slice(first, last + 1).trim();
  return text;
}

const VISION_MODELS_CHAIN = [
  "anthropic/claude-haiku-4.5",
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
];

export interface VisionQaArgs {
  sourceImageDataUrl: string;
  candidateImageDataUrl: string;
  qaPrompt: string;
  metadata: {
    task_kind: string;
    company_id?: string | null;
    session_id?: string | null;
  };
  timeoutMs?: number;
  /** Catena di modelli da provare, in ordine. Default: QA_MODEL_CHAIN.
   *  Serve a confrontare i modelli sullo stesso prompt e sulle stesse
   *  immagini — un controllo negativo che passa con un modello e fallisce
   *  con un altro dice che il limite e' il modello, non il criterio. */
  models?: readonly string[];
}

/**
 * Issue ritornata dal vision QA. Può essere una stringa (formato legacy
 * compatibilità v8.3.6−) o un oggetto strutturato {category, detail}
 * (formato v8.3.7+ usato dal multi-criterion QA).
 */
export type VisionQaIssue = string | { category: string; detail: string };

export interface VisionQaResult {
  pass: boolean;
  issues: VisionQaIssue[];
  modelUsed: string;
  rawResponse: Record<string, unknown>;
  checked: boolean;
}

export async function callVisionQa(
  args: VisionQaArgs,
): Promise<VisionQaResult> {
  const messages: ChatMessage[] = [
    {
      role: "user",
      content: [
        { type: "text", text: args.qaPrompt },
        { type: "image_url", image_url: { url: args.sourceImageDataUrl } },
        { type: "image_url", image_url: { url: args.candidateImageDataUrl } },
      ],
    },
  ];

  let lastError: Error | null = null;
  for (const model of (args.models ?? VISION_MODELS_CHAIN)) {
    try {
      const result = await callOpenRouter(
        {
          model,
          messages: messages as unknown[],
          temperature: 0,
          max_tokens: 800,
          response_format: { type: "json_object" },
        },
        {
          task_kind: args.metadata.task_kind,
          company_id: args.metadata.company_id,
        },
      );

      const text = stripJsonFence((result.content ?? "").trim());
      if (!text) {
        lastError = new Error(`Empty response from ${model}`);
        continue;
      }

      try {
        const parsed = JSON.parse(text) as { pass?: boolean; issues?: unknown };
        // v8.3.7 — Accetta sia stringhe che oggetti {category, detail}.
        const issues: VisionQaIssue[] = Array.isArray(parsed.issues)
          ? parsed.issues
            .map((i: unknown): VisionQaIssue | null => {
              if (typeof i === "string" && i.trim().length > 0) return i;
              if (i && typeof i === "object") {
                const obj = i as { category?: unknown; detail?: unknown };
                const category = typeof obj.category === "string"
                  ? obj.category
                  : "";
                const detail = typeof obj.detail === "string" ? obj.detail : "";
                if (category || detail) {
                  return { category, detail };
                }
              }
              return null;
            })
            .filter((x): x is VisionQaIssue => x !== null)
          : [];
        return {
          pass: parsed.pass !== false,
          issues,
          modelUsed: result.model,
          rawResponse: result as unknown as Record<string, unknown>,
          checked: true,
        };
      } catch (e) {
        lastError = new Error(`JSON parse failed on ${model}: ${String(e)}`);
        console.warn(
          JSON.stringify({
            lvl: "warn",
            fn: "visionQa",
            session_id: args.metadata.session_id,
            model,
            msg: "json_parse_failed",
            raw: text.substring(0, 200),
          }),
        );
        continue;
      }
    } catch (e) {
      lastError = e as Error;
      console.warn(
        JSON.stringify({
          lvl: "warn",
          fn: "visionQa",
          session_id: args.metadata.session_id,
          model,
          msg: "vision_qa_failed",
          detail: String(lastError.message ?? lastError),
        }),
      );
    }
  }

  // Tutti i modelli vision sono falliti: ritorna checked=false con pass=true
  // per non bloccare il flusso (la QA è opzionale).
  console.warn(
    JSON.stringify({
      lvl: "warn",
      fn: "visionQa",
      session_id: args.metadata.session_id,
      msg: "qa_skipped_all_models_failed",
      last_error: String(lastError?.message ?? ""),
    }),
  );
  return {
    pass: true,
    issues: [],
    modelUsed: "skipped",
    rawResponse: {},
    checked: false,
  };
}

/**
 * Criterio QA sulla ricomposizione della scena, condiviso da tutti i verticali.
 *
 * Nasce da un controllo negativo su infissi: al QA e' stato dato un render che
 * allargava la finestra e ridisegnava le piastrelle intorno — il difetto numero
 * uno segnalato dall'utente — e l'ha PROMOSSO. Ogni prompt QA nominava "camera,
 * crop, geometry", ma poi chiudeva con "When in doubt, PASS": un allargamento
 * del 10% non e' un "geometry break", quindi passava.
 *
 * Il criterio che ha funzionato e' anchorato agli OGGETTI, non alle proporzioni
 * dell'immagine: il render esce sempre in una delle tre size del provider,
 * quindi le proporzioni differiscono SEMPRE dalla foto — e un criterio scritto
 * sulle proporzioni boccia anche i render buoni (misurato: il primo tentativo
 * di fix bocciava il render corretto). Si guarda invece se il soggetto e' stato
 * ingrandito rispetto a cio' che gli sta accanto, se gli oggetti della foto ci
 * sono ancora, e se sono state inventate superfici per riempire spazio.
 *
 * LIMITE MISURATO (2026-09-02), da non dimenticare: questo criterio coglie la
 * RICOMPOSIZIONE (soggetto allargato rispetto a cio' che gli sta accanto,
 * superfici inventate) — verificato su un render infissi quadrato reale —
 * ma NON coglie un RITAGLIO PURO. Controllo negativo: foto sorgente contro se
 * stessa ritagliata a quadrato (stesso contenuto, -17% per lato), con la
 * clausola (d) sui bordi esplicita: promossa sia da claude-haiku-4.5 sia da
 * openai/gpt-4o. Due modelli diversi, stessa cecita': il limite e' nel modo in
 * cui questi modelli confrontano due immagini, non nel prompt ne' nel modello.
 * Percio' il formato NON puo' essere affidato al QA: va imposto a monte
 * (provider diretto con `size` reale + guardie sulle dimensioni), e questo
 * blocco resta una seconda linea, non la prima.
 */
export const QA_BLOCCO_RICOMPOSIZIONE: readonly string[] = [
  "[framing_changed] — Has the SCENE been REBUILT? Judge this by physical objects, NOT by picture proportions.",
  "FIRST, what is NOT a defect: the render is always produced at one of three fixed picture shapes, chosen as the closest to the source. So Image 2 will normally show a slightly taller or wider view than Image 1. That alone is EXPECTED — never report it.",
  "What IS a defect: the scene rebuilt to fill the new shape. (a) The target element must keep the same size RELATIVE TO WHAT IS BESIDE IT — count tiles, bricks, panels, boards or furniture next to it: if it now covers noticeably more or fewer, FAIL. (b) Every object in Image 1 must still be there unchanged — shelves, radiators, sills, switches, furniture, plants, fixtures: if one disappeared, moved or was re-drawn differently, FAIL. (c) No surface may be INVENTED to fill space — new wall, tiles, floor, ceiling or sky that Image 1 did not show. Seeing a little more of a surface that was already there is fine; seeing one that did not exist is not. (d) CHECK THE FOUR BORDERS explicitly: name what touches the left, right, top and bottom edge of Image 1, then look for the same things in Image 2. If Image 2's borders show things that were well INSIDE Image 1 — i.e. the view has been zoomed or cropped and content at the edges is gone on two or more sides — FAIL. A modest extra margin on ONE axis is the expected picture-shape difference; losing edge content is not.",
  "The leniency rule below does NOT apply to [framing_changed]: a rebuilt scene is always a failure, however pretty the result. A merely different picture shape is not.",
];
