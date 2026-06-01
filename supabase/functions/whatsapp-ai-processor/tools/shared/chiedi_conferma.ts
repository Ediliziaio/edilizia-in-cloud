// MP-P1 — Tool `chiedi_conferma`: domanda con bottoni/lista interattivi.
//
// Disponibile a tutti i ruoli (requires_grants: []). NON esegue I/O: costruisce
// il payload interactive e lo restituisce in `data.__interactive`; è il loop
// agentico (index.ts) a inviarlo via whatsapp-send e a sopprimere la risposta
// testuale duplicata (replyHandled). Così l'invio resta centralizzato e il
// comportamento storico (sendReply) non cambia quando il tool non è usato.

import { okResult, type ToolCtx, type ToolResult } from "./types.ts";
import {
  buildInteractivePayload,
  type InteractiveOption,
} from "../../interactive.ts";

interface ChiediConfermaArgs {
  domanda?: string;
  opzioni?: string[];
}

export const chiediConfermaDef = {
  name: "chiedi_conferma",
  description:
    "Invia all'utente una domanda con bottoni rapidi (es. Sì / No) per confermare un'azione PRIMA di eseguirla, " +
    "oppure per farlo scegliere tra poche opzioni brevi. Usalo come PASSO FINALE del turno quando devi avere una " +
    "conferma esplicita (registrare un rapportino, caricare un DDT, registrare una presenza) o disambiguare " +
    "(es. quale cantiere). Da 1 a 3 opzioni → bottoni; da 4 a 10 → lista. Le etichette devono essere brevissime " +
    "(≤20 caratteri per i bottoni, ≤24 per la lista). Quando usi questo tool NON chiamare altri tool nello stesso " +
    "turno e NON aggiungere altro testo: all'utente arriva solo la domanda coi bottoni, e la sua scelta tornerà " +
    "come prossimo messaggio.",
  parameters: {
    type: "object",
    properties: {
      domanda: {
        type: "string",
        description:
          "Testo della domanda mostrato sopra i bottoni (es. 'Confermi la registrazione del rapportino di oggi?').",
      },
      opzioni: {
        type: "array",
        items: { type: "string" },
        description:
          "Etichette delle risposte. Default ['Sì','No']. Massimo 10. Tienile brevissime (≤20 caratteri per i bottoni).",
      },
    },
    required: ["domanda"],
  },
  requires_grants: [] as string[],
};

export function chiediConferma(
  _ctx: ToolCtx,
  args: ChiediConfermaArgs,
): Promise<ToolResult> {
  const domanda = (args.domanda ?? "").trim() || "Confermi?";
  const raw = Array.isArray(args.opzioni) && args.opzioni.length > 0
    ? args.opzioni
    : ["Sì", "No"];

  const options: InteractiveOption[] = raw
    .map((s) => String(s ?? "").trim())
    .filter((s) => s.length > 0)
    .slice(0, 10)
    .map((title, i) => ({ id: `conf_${i}`, title }));

  // Fallback difensivo: se per qualche motivo non resta alcuna opzione valida,
  // ripieghiamo su Sì/No così il payload è sempre valido per Meta.
  const safeOptions = options.length > 0
    ? options
    : [{ id: "conf_0", title: "Sì" }, { id: "conf_1", title: "No" }];

  const interactive = buildInteractivePayload(domanda, safeOptions);

  // user_message vuoto: la domanda è già nel payload interactive; il loop NON
  // deve inviare un secondo messaggio testuale.
  return Promise.resolve(
    okResult({ inviato: true, __interactive: interactive }, ""),
  );
}
