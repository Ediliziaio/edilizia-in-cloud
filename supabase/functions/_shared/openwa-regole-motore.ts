/**
 * Motore REGOLE di WhatsApp Locale: cosa fare quando arriva un messaggio.
 *
 * Valuta le regole accese (del numero, generali e delle campagne di cui chi
 * scrive è destinatario) ed esegue le azioni: ignora, risposta automatica,
 * etichette/assegnazione, avviso email e, per le campagne, ferma il flusso,
 * esito sulla bacheca, non scrivergli più.
 *
 * Le regole di una campagna si leggono come SE / ALTRIMENTI SE: per ogni
 * campagna decide la PRIMA che combacia, in ordine. Con "tutte quelle che
 * combaciano" un «ok, ma non mi interessa» finiva etichettato sia interessato
 * sia non interessato. Le regole generali restano cumulative, come prima.
 *
 * Senza Deno: le dipendenze (client, invio, email, orario) arrivano da fuori,
 * così il motore si prova in vitest con un client finto.
 */
import { testoCombacia, esitoValido } from "./openwa-regole.ts";

export interface MessaggioInArrivo {
  numberId: string | null;
  chatId: string;
  phone: string;
  text: string;
  contactId: string | null;
}

export interface DipendenzeMotore {
  // deno-lint-ignore no-explicit-any
  admin: any;
  platformCompanyId: string;
  inviaRisposta: (p: { to: string; text: string; numberId: string; contactId: string | null }) => Promise<unknown>;
  avvisaEmail: (to: string, phone: string, text: string, regola: string | null) => Promise<unknown>;
  fuoriOrario: () => Promise<boolean>;
}

const STATI_NEL_FLUSSO = ["da_inviare", "inviato", "followup_inviato", "followup2_inviato", "followup3_inviato"];

export async function applicaRegole(dip: DipendenzeMotore, ctx: MessaggioInArrivo): Promise<void> {
  const { admin } = dip;
  const cleanText = (ctx.text || "").trim();
  if (!cleanText) return;

  // Di quali campagne è destinatario chi scrive: le regole di una campagna
  // valgono solo per i SUOI destinatari.
  let destinatari: Array<{ destinatario_id: string; campagna_id: string; contact_id: string | null }> = [];
  try {
    const { data } = await admin.rpc("openwa_destinatari_di_chi_scrive", { p_phone: ctx.phone || ctx.chatId, p_contact_id: ctx.contactId });
    destinatari = (data ?? []) as typeof destinatari;
  } catch { /* senza campagne valgono le regole generali */ }
  const campagneIds = [...new Set(destinatari.map((d) => d.campagna_id))];

  const numFilter = ctx.numberId
    ? `number_id.eq.${ctx.numberId},number_id.is.null`
    : `number_id.is.null`;
  // Due .or() = AND tra i due gruppi: (numero o globale) E (generale o una sua campagna).
  const campFilter = campagneIds.length
    ? `campagna_id.is.null,campagna_id.in.(${campagneIds.join(",")})`
    : `campagna_id.is.null`;
  const { data: rules } = await admin
    .from("openwa_rules")
    .select("*")
    .eq("enabled", true)
    .or(numFilter)
    .or(campFilter)
    .order("priority", { ascending: true });
  if (!rules?.length) return;
  // Prima «ignora» (lo spam non merita nessuna azione, nemmeno di campagna),
  // poi le regole delle campagne (le più specifiche), poi le generali; dentro
  // ciascun gruppo, nell'ordine scelto.
  // deno-lint-ignore no-explicit-any
  const ordinate = [...(rules as any[])].sort((a, b) =>
    Number(!a.block) - Number(!b.block)
    || Number(!a.campagna_id) - Number(!b.campagna_id)
    || (a.priority ?? 100) - (b.priority ?? 100));

  const { count } = await admin.from("openwa_messages")
    .select("id", { count: "exact", head: true })
    .eq("wa_chat_id", ctx.chatId).eq("direction", "inbound");
  const isFirst = (count ?? 0) <= 1;
  let outside: boolean | null = null;
  const campagneDecise = new Set<string>();
  // Una sola risposta automatica per messaggio in arrivo, qualunque cosa
  // dicano le regole: due messaggi del "bot" di fila fanno segnalare il numero.
  let giaRisposto = false;

  for (const r of ordinate) {
    if (r.campagna_id && campagneDecise.has(r.campagna_id)) continue; // ALTRIMENTI SE
    if (r.only_first_contact && !isFirst) continue;
    if (r.only_outside_hours) {
      if (outside === null) outside = await dip.fuoriOrario();
      if (!outside) continue;
    }
    // Parole intere, senza accenti né punteggiatura: vedi openwa-regole.ts.
    if (!testoCombacia(r.match_type, r.match_keywords, cleanText)) continue;
    if (r.block) return; // spam/ignora → stop, nessuna altra azione
    if (r.campagna_id) campagneDecise.add(r.campagna_id);

    // Destinatari su cui agiscono le azioni di campagna: quelli della campagna
    // della regola, o di tutte le sue campagne se la regola è generale.
    const suoi = destinatari.filter((d) => !r.campagna_id || d.campagna_id === r.campagna_id);
    const bersaglio = suoi.map((d) => d.destinatario_id);
    const ora = new Date().toISOString();

    // Lo scatto si registra PRIMA della risposta: l'indice unico su (regola,
    // chat) delle righe con risposta fa da lucchetto, così la stessa regola
    // risponde una volta sola per chat anche a messaggi ripetuti o simultanei.
    // Senza numberId la risposta partirebbe da un numero DIVERSO da quello a
    // cui la persona ha scritto (rotazione): per lei sarebbe uno sconosciuto.
    let rispondi = !!String(r.reply_text ?? "").trim() && !!ctx.numberId && !giaRisposto;
    const scatto = { rule_id: r.id, campagna_id: r.campagna_id ?? null, wa_chat_id: ctx.chatId, contact_id: ctx.contactId };
    if (rispondi) {
      const { error } = await admin.from("openwa_regole_scatti").insert({ ...scatto, risposta_inviata: true });
      if (error?.code === "23505") rispondi = false; // a questa chat questa regola ha già risposto
      else if (error) console.error("[openwa-regole] scatto regola:", error.message);
    }
    if (!rispondi) {
      const { error } = await admin.from("openwa_regole_scatti").insert({ ...scatto, risposta_inviata: false });
      if (error) console.error("[openwa-regole] scatto regola:", error.message);
    }
    // La risposta parte PRIMA dell'opt-out: un «ok, non ti scriviamo più»
    // configurato sulla regola verrebbe altrimenti bloccato dall'opt-out
    // appena scritto.
    if (rispondi && ctx.numberId) {
      giaRisposto = true;
      await dip.inviaRisposta({ to: ctx.phone || ctx.chatId, text: r.reply_text, numberId: ctx.numberId, contactId: ctx.contactId })
        .catch(() => null);
    }

    if (bersaglio.length && (r.ferma_flusso || r.optout)) {
      await admin.from("openwa_campagna_destinatari")
        .update({ stato: "risposto", risposto_at: ora, claimed_at: null })
        .in("id", bersaglio)
        .in("stato", STATI_NEL_FLUSSO);
    }
    if (bersaglio.length && esitoValido(r.imposta_esito)) {
      // Solo dove l'esito è ancora vuoto: una scelta fatta a mano sulla
      // bacheca non la sposta nessuna regola.
      await admin.from("openwa_campagna_destinatari")
        .update({ esito: r.imposta_esito, esito_at: ora })
        .in("id", bersaglio)
        .is("esito", null);
    }
    if (r.optout) {
      // Come lo STOP: tutte le schede con quel numero, non solo quella agganciata.
      const cifre = (ctx.phone || "").replace(/\D/g, "");
      const patchOptOut = { optout_whatsapp: true, optout_at: ora, optout_reason: `Regola WhatsApp: ${r.name ?? "senza nome"}` };
      if (cifre.length >= 9) {
        await admin.from("marketing_contacts").update(patchOptOut)
          .eq("company_id", dip.platformCompanyId).ilike("phone", `%${cifre.slice(-9)}%`);
      } else if (ctx.contactId) {
        await admin.from("marketing_contacts").update(patchOptOut).eq("id", ctx.contactId);
      }
    }

    // Etichette e assegnatario sulla scheda agganciata alla chat E su quelle
    // messe in campagna: con i doppioni in archivio possono essere gemelle, e
    // l'etichetta deve comparire dove poi si filtra.
    const schede = [...new Set([ctx.contactId, ...suoi.map((d) => d.contact_id)].filter(Boolean))] as string[];
    if (schede.length && (r.add_tags?.length || r.assign_to)) {
      for (const id of schede) {
        const patch: Record<string, unknown> = {};
        if (r.add_tags?.length) {
          const { data: c } = await admin.from("marketing_contacts").select("tags").eq("id", id).maybeSingle();
          patch.tags = Array.from(new Set([...(c?.tags ?? []), ...r.add_tags]));
        }
        if (r.assign_to) patch.assigned_to = r.assign_to;
        await admin.from("marketing_contacts").update(patch).eq("id", id);
      }
    }
    // La conversazione va a chi la deve seguire, se non è già di qualcuno:
    // un'assegnazione fatta a mano non la sposta nessuna regola.
    if (r.assign_to) {
      const { data: conv } = await admin.from("openwa_conversazioni")
        .select("assegnato_a").eq("wa_chat_id", ctx.chatId).maybeSingle();
      if (!conv) {
        await admin.from("openwa_conversazioni").insert({ wa_chat_id: ctx.chatId, assegnato_a: r.assign_to });
      } else if (!conv.assegnato_a) {
        await admin.from("openwa_conversazioni")
          .update({ assegnato_a: r.assign_to, updated_at: ora })
          .eq("wa_chat_id", ctx.chatId).is("assegnato_a", null);
      }
    }
    if (r.notify_email) await dip.avvisaEmail(r.notify_email, ctx.phone, cleanText, r.campagna_id ? r.name : null);
  }
}
