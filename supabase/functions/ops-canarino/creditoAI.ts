/**
 * Il controllo del credito AI (ops-canarino, modo «credito-ai»).
 *
 * Gira ogni 5 minuti (cron `ai-credito-controllo`) e a ogni primo errore di
 * credito visto da una funzione (_shared/allarmeAI.ts la sveglia). Fa quattro
 * cose, nell'ordine:
 *
 *  1. SONDA — una richiesta minima a OpenRouter (_shared/allarmeAISonda.ts).
 *     Dice se l'AI risponde adesso, anche quando nessuno la sta usando;
 *  2. SALDO — se c'è la chiave management, il saldo del conto: sotto soglia
 *     è un allarme «credito in calo», PRIMA che finisca;
 *  3. CHIUSURE — un allarme si chiude solo con una prova: la sonda riesce e
 *     nessuna funzione ha segnalato errori negli ultimi 10 minuti. Il
 *     silenzio da solo non prova niente (di notte nessuno chiama);
 *  4. AVVISI — gli allarmi aperti da comunicare (ai_allarmi_da_notificare):
 *     email al titolare con il MOTIVO, più campanella e push. L'allarme viene
 *     preso in carico in modo atomico: due controlli insieme non mandano due
 *     email. Se l'email non parte, l'allarme viene rilasciato e il giro dopo
 *     riprova.
 *
 * Perché esiste: vedi _shared/allarmeAIClassifica.ts (il conto era a zero dal
 * 02/10/2026 e nessuno lo sapeva).
 *
 * Modi di prova (come per il rapporto del mattino):
 *  · `anteprima: true` — fa sonda e saldo, restituisce gli avvisi che
 *    partirebbero, senza prendere in carico né spedire niente;
 *  · `prova: true` — spedisce UNA email vera con «[Prova]» nell'oggetto e dati
 *    di esempio, senza toccare gli allarmi: serve a vedere com'è e a
 *    verificare che arrivi, prima di accendere il cron.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { avvisaSuperAdmin } from "../_shared/avvisaSuperAdmin.ts";
import { notificaInterna } from "../_shared/notificaInterna.ts";
import { sondaOpenRouter, type EsitoSonda } from "../_shared/allarmeAISonda.ts";
import {
  componiAvviso,
  componiRipristino,
  type Avviso,
  type ContestoAvviso,
  type RigaAllarme,
} from "../_shared/allarmeAITesti.ts";
import { saldoOpenRouter } from "./stato.ts";

/** Quanto deve passare senza errori segnalati perché, a sonda riuscita, l'allarme si chiuda. */
const MINUTI_SENZA_ERRORI = 10;
/** Per ciò che la sonda non può provare (OpenAI diretto, Anthropic, o una sonda che non riesce): si chiude dopo tanto silenzio, senza dire «risolto». */
const ORE_SILENZIO_ALTRI_PROVIDER = 6;

export interface EsitoControlloCreditoAI {
  sonda: { ok: boolean; stato: number | null; motivo: string | null; ms: number; costo_usd: number | null } | null;
  saldo_usd: number | null;
  allarmi_aperti: number;
  avvisi_inviati: number;
  avvisi_falliti: number;
  chiusi: string[];
  errori: string[];
  /** Solo con `anteprima`: gli avvisi che sarebbero partiti. */
  anteprima?: Array<{ allarme: string; oggetto: string; sommario: string; dettagli: Array<[string, string]> }>;
}

const motivoErrore = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function registraAllarme(
  supabase: SupabaseClient,
  provider: string,
  motivo: string,
  funzione: string,
  modello: string | null,
  dettaglio: string,
): Promise<void> {
  const { error } = await supabase.rpc("ai_allarme_registra", {
    p_provider: provider,
    p_motivo: motivo,
    p_funzione: funzione,
    p_modello: modello,
    p_dettaglio: dettaglio,
    p_azienda: null,
    p_conteggio: 1,
  });
  if (error) throw new Error(`ai_allarme_registra: ${error.message}`);
}

/** Una riga per prova in Salute: serve a vedere QUANDO è caduto, non solo che è caduto. */
async function registraMetrica(supabase: SupabaseClient, sonda: EsitoSonda | null, saldo: { disponibile_usd: number | null; usato_usd: number | null; fonte: string | null }) {
  try {
    await supabase.from("system_health_metrics").insert({
      metric_type: "ai_sonda",
      function_name: "ops-canarino",
      status_code: sonda?.stato ?? null,
      latency_ms: sonda?.ms ?? null,
      error_message: sonda && !sonda.ok ? sonda.dettaglio : null,
      metadata: {
        ok: sonda?.ok ?? null,
        motivo: sonda?.motivo ?? null,
        modello: sonda?.modello ?? null,
        costo_usd: sonda?.costoUsd ?? null,
        saldo_usd: saldo.disponibile_usd,
        usato_usd: saldo.usato_usd,
        saldo_fonte: saldo.fonte,
      },
    });
  } catch (e) {
    console.warn("[credito-ai] metrica non scritta:", motivoErrore(e));
  }
}

/** L'email con il motivo, la campanella e il push. Vero se l'email è partita. */
async function spedisciAvviso(
  supabase: SupabaseClient,
  avviso: Avviso,
  riga: { id: string; provider: string; motivo: string },
  prefissoOggetto = "",
): Promise<boolean> {
  const base = Deno.env.get("APP_URL") ?? "https://app.ediliziaincloud.com";
  const href = avviso.url.startsWith("/") ? `${base}${avviso.url}` : avviso.url;
  const emailOk = await notificaInterna(supabase, {
    oggetto: `${prefissoOggetto}${avviso.oggetto}`,
    sommario: avviso.sommario,
    dettagli: avviso.dettagli,
    url: href,
    urlLabel: avviso.urlLabel,
  });
  // La campanella e il push sono la seconda via: se l'email non parte restano
  // l'unico segnale, quindi si mandano comunque.
  if (!prefissoOggetto) {
    try {
      await avvisaSuperAdmin(supabase, {
        tipo: "ai_allarme",
        titolo: avviso.campanella.titolo,
        testo: avviso.campanella.testo,
        url: avviso.campanella.url,
        tag: `ai-allarme:${riga.provider}:${riga.motivo}`,
        entityType: "ai_allarme",
        entityId: riga.id,
      });
    } catch (e) {
      console.warn("[credito-ai] campanella:", motivoErrore(e));
    }
  }
  return emailOk;
}

/** L'email di prova: dati di esempio, oggetto «[Prova]», nessun effetto sugli allarmi. */
export async function provaAvvisoCreditoAI(supabase: SupabaseClient): Promise<{ inviata: boolean; oggetto: string }> {
  const adesso = new Date();
  const riga: RigaAllarme = {
    id: "prova",
    provider: "openrouter",
    motivo: "credito_esaurito",
    aperto_il: new Date(adesso.getTime() - 95 * 60_000).toISOString(),
    ultima_vista: adesso.toISOString(),
    conteggio: 412,
    funzioni: { persona_silvio: 212, email_compose: 130, lead_qualificazione: 70 },
    modelli: { "anthropic/claude-sonnet-4.5": 300, "openai/gpt-4o-mini": 112 },
    aziende: Array.from({ length: 12 }, (_, i) => `azienda-${i}`),
    ultimo_dettaglio:
      "402 This request requires more credits, or fewer max_tokens. You requested up to 1800 tokens, but can only afford 76.",
    notifiche_inviate: 1,
  };
  const avviso = componiAvviso(riga, {
    adesso,
    sonda: { ok: false, stato: 402, dettaglio: "This request requires more credits" },
    saldo: null,
  });
  const inviata = await spedisciAvviso(supabase, avviso, riga, "[Prova] ");
  return { inviata, oggetto: `[Prova] ${avviso.oggetto}` };
}

export async function controllaCreditoAI(
  supabase: SupabaseClient,
  opzioni: { anteprima?: boolean } = {},
): Promise<EsitoControlloCreditoAI> {
  const adesso = new Date();
  const errori: string[] = [];
  const esito: EsitoControlloCreditoAI = {
    sonda: null,
    saldo_usd: null,
    allarmi_aperti: 0,
    avvisi_inviati: 0,
    avvisi_falliti: 0,
    chiusi: [],
    errori,
  };

  // 1. La sonda.
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  let sonda: EsitoSonda | null = null;
  if (apiKey) {
    // Il modello si può cambiare senza ripubblicare (AI_SONDA_MODELLO): se OpenRouter lo ritira, la sonda non deve restare cieca.
    sonda = await sondaOpenRouter({ apiKey, modello: Deno.env.get("AI_SONDA_MODELLO") || undefined });
    esito.sonda = { ok: sonda.ok, stato: sonda.stato, motivo: sonda.motivo, ms: sonda.ms, costo_usd: sonda.costoUsd };
  }

  // 2. Il saldo (solo con la chiave management; senza, resta null e si dice).
  const saldo = await saldoOpenRouter();
  esito.saldo_usd = saldo.disponibile_usd;
  const sogliaUsd = Number(Deno.env.get("OPENROUTER_SALDO_MINIMO_USD") ?? "20") || 20;

  if (!opzioni.anteprima) await registraMetrica(supabase, sonda, saldo);

  // 3. Cosa dicono sonda e saldo: aprono o aggiornano gli allarmi.
  if (!opzioni.anteprima) {
    try {
      if (!apiKey) {
        await registraAllarme(supabase, "openrouter", "chiave_non_valida", "sonda", null, "OPENROUTER_API_KEY non configurata nei secrets: l'AI non può funzionare");
      } else if (sonda && !sonda.ok && sonda.motivo) {
        await registraAllarme(supabase, "openrouter", sonda.motivo, "sonda", sonda.modello, `${sonda.stato ?? ""} ${sonda.dettaglio ?? ""}`.trim());
      } else if (sonda && !sonda.ok) {
        // Rete, 5xx, 429: rumore normale, non un allarme. Si dice solo nell'esito.
        errori.push(`sonda non riuscita (${sonda.stato ?? "senza risposta"}): ${sonda.dettaglio ?? ""}`.trim());
      }
      const sondaOk = sonda?.ok === true;
      if (saldo.disponibile_usd != null && saldo.disponibile_usd < sogliaUsd && (sondaOk || !sonda)) {
        await registraAllarme(supabase, "openrouter", "credito_basso", "saldo", null, `saldo ${saldo.disponibile_usd.toFixed(2)} $, sotto la soglia di ${sogliaUsd} $`);
      }
    } catch (e) {
      errori.push(motivoErrore(e));
    }
  }

  // 4. Chiusure: solo con una prova (vedi l'intestazione).
  const { data: apertiGrezzi, error: erroreLettura } = await supabase.from("ai_allarmi").select("*").is("chiuso_il", null);
  if (erroreLettura) {
    errori.push(`lettura allarmi: ${erroreLettura.message}`);
    return esito;
  }
  const aperti = (apertiGrezzi ?? []) as RigaAllarme[];
  esito.allarmi_aperti = aperti.length;
  const contestoSonda: ContestoAvviso["sonda"] = sonda ? { ok: sonda.ok, stato: sonda.stato, dettaglio: sonda.dettaglio } : null;
  const contesto: ContestoAvviso = { adesso, sonda: contestoSonda, saldo, sogliaUsd };

  if (!opzioni.anteprima) {
    for (const a of aperti) {
      const silenzioMs = adesso.getTime() - Date.parse(a.ultima_vista);
      let nota: string | null = null;
      let conRipristino = false;

      if (a.provider === "openrouter" && a.motivo === "credito_basso") {
        if (saldo.disponibile_usd != null && saldo.disponibile_usd >= sogliaUsd) {
          nota = `saldo risalito a ${saldo.disponibile_usd.toFixed(2)} $`;
        } else if (silenzioMs > ORE_SILENZIO_ALTRI_PROVIDER * 3_600_000) {
          // Finché il saldo resta sotto soglia il giro rinfresca l'allarme; se
          // non si rinfresca più (chiave management tolta, credito poi finito
          // del tutto) non resta aperto a vita.
          nota = `nessuna lettura sotto soglia da ${ORE_SILENZIO_ALTRI_PROVIDER} ore`;
        }
      } else if (a.provider === "openrouter" && sonda?.ok && silenzioMs > MINUTI_SENZA_ERRORI * 60_000) {
        nota = `la sonda riesce e nessun errore da ${MINUTI_SENZA_ERRORI} minuti`;
        conRipristino = true;
      } else if (silenzioMs > ORE_SILENZIO_ALTRI_PROVIDER * 3_600_000) {
        // OpenAI e Anthropic la sonda non li copre; e se la sonda di OpenRouter
        // non riesce per un motivo che non è il credito (modello ritirato, rete)
        // un allarme aperto non si chiuderebbe mai. Dopo tanto silenzio si
        // chiude, ma senza dire «risolto»: nessuno ne ha la prova. Col credito
        // davvero finito non succede: la sonda fallita rinfresca l'allarme a
        // ogni giro, quindi il silenzio non arriva mai a 6 ore.
        nota = `nessun errore da ${ORE_SILENZIO_ALTRI_PROVIDER} ore (senza una prova di ripristino)`;
      }
      if (!nota) continue;

      try {
        const { data: chiusa, error } = await supabase.rpc("ai_allarme_chiudi", { p_id: a.id, p_nota: nota });
        if (error) throw new Error(error.message);
        if (!chiusa) continue; // l'ha già chiusa un altro controllo
        esito.chiusi.push(`${a.provider}:${a.motivo}`);
        if (conRipristino && a.notifiche_inviate > 0) {
          // Solo se l'allarme era stato comunicato: un guasto durato un minuto e
          // mai segnalato non merita un «risolto».
          const avvisoRipristino = componiRipristino(chiusa as RigaAllarme, contesto);
          await spedisciAvviso(supabase, avvisoRipristino, { id: a.id, provider: a.provider, motivo: "ripristino" });
        }
      } catch (e) {
        errori.push(`chiusura ${a.provider}:${a.motivo}: ${motivoErrore(e)}`);
      }
    }
  }

  // 5. Gli avvisi.
  if (opzioni.anteprima) {
    esito.anteprima = aperti.map((a) => {
      const avviso = componiAvviso({ ...a, notifiche_inviate: Math.max(a.notifiche_inviate, 1) }, contesto);
      return { allarme: `${a.provider}:${a.motivo}`, oggetto: avviso.oggetto, sommario: avviso.sommario, dettagli: avviso.dettagli };
    });
    return esito;
  }

  const { data: daInviare, error: erroreCoda } = await supabase.rpc("ai_allarmi_da_notificare");
  if (erroreCoda) {
    errori.push(`ai_allarmi_da_notificare: ${erroreCoda.message}`);
    return esito;
  }
  for (const riga of (daInviare ?? []) as RigaAllarme[]) {
    let partita = false;
    try {
      partita = await spedisciAvviso(supabase, componiAvviso(riga, contesto), riga);
    } catch (e) {
      errori.push(`invio ${riga.provider}:${riga.motivo}: ${motivoErrore(e)}`);
    }
    if (partita) {
      esito.avvisi_inviati++;
    } else {
      esito.avvisi_falliti++;
      // L'allarme torna com'era: il controllo dopo riprova, invece di aspettare il promemoria.
      const { error } = await supabase.rpc("ai_allarme_rilascia", { p_id: riga.id });
      if (error) errori.push(`rilascio ${riga.id}: ${error.message}`);
    }
  }

  const { count } = await supabase.from("ai_allarmi").select("id", { count: "exact", head: true }).is("chiuso_il", null);
  esito.allarmi_aperti = count ?? aperti.length;
  return esito;
}
