/**
 * ai-genera-modello-sopralluogo — un modello di sopralluogo da una descrizione
 * (piano sopralluoghi, lotto 6: docs/piano-sopralluoghi-vendita-tecnico.md).
 *
 * Body: { company_id, descrizione, categoria? }
 * Risposta: { ok, schema, avvisi } — lo schema è già ripulito da `normalizzaModelloGenerato`;
 * la funzione non salva niente: si vede l'anteprima e si crea il modello dall'editor.
 *
 * Se la risposta non si legge o non ha elementi utilizzabili, la chiamata si rimborsa.
 * Addebitata all'azienda (claudeMessagesBilled, compito `survey_template_generation`); l'azienda
 * è quella del corpo, ma solo se chi chiama ci lavora (requireCompanyAccess). Gli errori del
 * provider arrivano all'allarme AI dentro claudeProxy.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { claudeMessagesBilled } from "../_shared/claudeProxy.ts";
import { requireCompanyAccess } from "../_shared/auth.ts";
import { rimborsaAddebitoAi } from "../_shared/rimborsoAi.ts";
import { normalizzaModelloGenerato } from "../../../shared/sopralluoghi/modelloGenerato.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MODEL_ID = "claude-sonnet-4-5";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Lo stile è legato ai campi, non chiesto a parte: un «rispondi in testo semplice» fa uscire il
// modello dal JSON (è successo, e la funzione andava in 500).
const SISTEMA = `Sei un tecnico edile italiano esperto di sopralluoghi. Costruisci il MODELLO di un sopralluogo:
l'elenco di cosa misurare e annotare in cantiere, da compilare sul telefono.

Rispondi SOLO con un oggetto JSON, senza testo prima o dopo, con questa forma:
{
  "area_definition": { "label": "Stanza", "label_plural": "Stanze", "name_suggestions": ["Cucina", "Bagno"] },
  "header_schema": [ { "key": "immobile", "label": "Immobile", "fields": [ CAMPO, ... ] } ],
  "element_types": [
    { "key": "infisso", "label": "Infisso", "label_plural": "Infissi",
      "sections": [ { "key": "misure", "label": "Misure", "solo_tecnico": false, "fields": [ CAMPO, ... ] } ],
      "required_photos": [ { "key": "frontale", "label": "Foto frontale con metro" } ] }
  ],
  "general_required_photos": [ { "key": "facciata", "label": "Facciata" } ],
  "output_mapping": { "estimate_lines": {
    "infisso": { "description_template": "Infisso {materiale} {larghezza}x{altezza} cm", "unit": "pz", "quantity_field": "quantity" } } }
}
CAMPO = { "key": "larghezza", "label": "Larghezza", "type": TIPO, "unit": "cm", "required": true,
          "solo_tecnico": false, "help": "Misura sul foro", "options": [ { "value": "pvc", "label": "PVC" } ] }
TIPO è uno di: text, textarea, number, dimension, select, multiselect, boolean, date, color, currency.

Regole:
- In italiano, parole del cantiere, etichette brevi (massimo 4 parole). Chiavi in minuscolo con underscore.
- Le misure sono "dimension" con "unit" (cm per infissi e porte, m o mq per superfici).
- "select" e "multiselect" hanno almeno 2 "options".
- Da 2 a 8 tipi di elemento, ognuno con 1-3 sezioni e al massimo 12 campi per sezione.
- "required": true solo per ciò che serve davvero al preventivo (misure principali, tipologia).
- "solo_tecnico": true per i dettagli che servono solo al tecnico e non al commerciale
  (fissaggi, spessori, impianti esistenti, quote di dettaglio). Le misure principali NO.
- "output_mapping.estimate_lines": per ogni tipo di elemento una riga di preventivo; nella
  descrizione si usano SOLO chiavi dei campi di quel tipo tra graffe; "unit" è pz, mq, ml, m, kg, h o corpo;
  "quantity_field" è "quantity" (numero di pezzi) oppure la chiave di un campo numerico (es. una superficie in mq).
- Non inventare marchi, prezzi o norme.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Metodo non ammesso" }, 405);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userRes } = await supabase.auth.getUser(token);
  const userId = userRes?.user?.id;
  if (!userId) return json({ ok: false, error: "Accesso richiesto" }, 401);

  let body: { company_id?: string; descrizione?: string; categoria?: string } = {};
  try { body = await req.json(); } catch { /* corpo vuoto */ }
  const descrizione = (body.descrizione ?? "").trim().slice(0, 4000);
  if (!body.company_id) return json({ ok: false, error: "Azienda mancante" }, 400);
  if (descrizione.length < 15) return json({ ok: false, error: "Descrivi il sopralluogo in almeno una frase" }, 400);

  try {
    await requireCompanyAccess(supabase, userId, body.company_id, CORS);
  } catch (r) {
    if (r instanceof Response) return r;
    throw r;
  }

  const categoria = (body.categoria ?? "").trim().slice(0, 40);
  const richiesta = `${categoria ? `Categoria: ${categoria}\n` : ""}Cosa deve rilevare il sopralluogo:\n${descrizione}`;

  // Una chiave per chiamata al provider: serve a rimborsare proprio questa se la risposta è inutilizzabile.
  const chiave = `modello-sopralluogo:${crypto.randomUUID()}`;
  const res = await claudeMessagesBilled({
    model: MODEL_ID,
    max_tokens: 7000,
    system: SISTEMA,
    messages: [{ role: "user", content: richiesta }],
    temperature: 0.2,
  }, {
    supabase,
    companyId: body.company_id,
    taskKind: "survey_template_generation",
    estimatedTokensTotal: 9000,
    metadata: { user_id: userId, categoria },
    idempotencyKey: chiave,
  });
  if (!res.ok) {
    const testo = await res.text();
    if (res.status === 402) return json({ ok: false, error: "Credito AI esaurito: ricarica per generare il modello." }, 402);
    console.error("[ai-genera-modello-sopralluogo] provider", res.status, testo.slice(0, 300));
    return json({ ok: false, error: "L'AI non ha risposto. Riprova tra poco." }, 502);
  }
  const risposta = await res.json() as { content?: Array<{ text?: string }> };
  const grezzo = (risposta.content?.[0]?.text ?? "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let dati: unknown = null;
  try {
    dati = JSON.parse(grezzo.slice(grezzo.indexOf("{"), grezzo.lastIndexOf("}") + 1));
  } catch {
    // Il provider ha lavorato, l'errore è nel leggere: si rimborsa (regola del censimento AI, §9).
    console.error("[ai-genera-modello-sopralluogo] JSON non leggibile", grezzo.slice(0, 300));
    await rimborsaAddebitoAi(supabase, { idempotencyKey: chiave, motivo: "modello di sopralluogo: JSON non leggibile" });
    return json({ ok: false, error: "La risposta dell'AI non era un modello leggibile. Riprova, magari descrivendo meglio." }, 502);
  }
  const { schema, avvisi } = normalizzaModelloGenerato(dati);
  if (!schema.element_types.length) {
    await rimborsaAddebitoAi(supabase, { idempotencyKey: chiave, motivo: "modello di sopralluogo: nessun elemento utilizzabile" });
    return json({ ok: false, error: "L'AI non ha prodotto elementi utilizzabili. Riprova descrivendo cosa si misura.", avvisi }, 422);
  }
  return json({ ok: true, schema, avvisi });
});
