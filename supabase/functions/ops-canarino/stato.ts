/**
 * Lo stato della piattaforma: i segnali del canarino, pronti per un'email.
 *
 * Stava dentro index.ts; dal 25/09/2026 lo usano due email, «Stato
 * piattaforma» e l'email unica del mattino (modo «mattino»), con gli stessi
 * segnali. Qui solo letture: lo snapshot del cron, i backup dal vivo, il conto
 * OpenRouter. L'invio lo fa chi chiama.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Etichette in italiano per le sezioni del rapporto, nell'ordine di gravita'.
const SEZIONI: Array<{ key: string; titolo: string }> = [
  { key: "snapshot_vecchio", titolo: "Il controllo stesso: raccolta dati ferma" },
  { key: "backup_mancanti", titolo: "Aziende senza un backup da più di 8 giorni" },
  { key: "dunning_fermo", titolo: "Aziende in mancato pagamento SENZA solleciti" },
  { key: "cron_silenti", titolo: "Cron giornalieri che non girano da 26 ore" },
  { key: "http_errori_24h", titolo: "Errori HTTP dei cron (ultime 24h)" },
  { key: "whatsapp_numeri_bannati", titolo: "Numeri WhatsApp BANNATI (campagne in pausa)" },
  { key: "oauth_provider_giu", titolo: "Credenziali OAuth di piattaforma da controllare" },
  { key: "integrazioni_scadute", titolo: "Credenziali integrazioni scadute" },
  { key: "ricariche_esaurite", titolo: "Ricariche automatiche esaurite (serve il cliente)" },
  { key: "richiamo_caldo_bloccato", titolo: "Lead che hanno detto sì e nessuno li richiama" },
  { key: "openrouter_saldo", titolo: "Conto OpenRouter (tutta l'AI passa da lì)" },
];

/**
 * Saldo del conto OpenRouter — il conto prepagato da cui esce OGNI chiamata AI
 * della piattaforma (Silvio, personas, email, riassunti, OCR). Quando finisce
 * non fallisce una funzione: falliscono tutte, per tutte le aziende, e il
 * registro dice solo «402». E' gia' successo: il 23/08 «would exceed your
 * available credits» su Silvio, il 01/09 «requires at least $0.50 in balance»
 * sull'OCR dei PDF. Nessuno lo guardava, perche' nessuno lo riportava.
 *
 * Il saldo del conto lo espone /credits, ma SOLO a una chiave di tipo
 * «management» (con la chiave normale risponde 403): va creata su
 * openrouter.ai/settings/keys e salvata nei secrets come
 * OPENROUTER_MANAGEMENT_KEY. Finche' manca, si ripiega su /auth/key con la
 * chiave del router, che pero' dice solo quanto ha SPESO questa chiave e
 * quanto le resta se ha un tetto: senza tetto il saldo non si conosce, e il
 * rapporto lo scrive in fondo invece di fingere un numero.
 *
 * Sotto la soglia (OPENROUTER_SALDO_MINIMO_USD, default 20 $) diventa un
 * segnale. Il numero compare comunque in fondo al rapporto, anche quando va
 * bene: e' il modo in cui ci si accorge che sta calando.
 */
async function saldoOpenRouter(): Promise<{
  disponibile_usd: number | null;
  usato_usd: number | null;
  /** Da dove viene il numero: il conto intero, o solo questa chiave. */
  fonte: "conto" | "chiave" | null;
  /** Guasto vero del controllo (chiave presente ma la chiamata fallisce). */
  errore: string | null;
  /** Cosa manca per avere il saldo vero (non e' un guasto: e' configurazione). */
  nota: string | null;
}> {
  const vuoto = { disponibile_usd: null, usato_usd: null, fonte: null, errore: null, nota: null };
  const management = Deno.env.get("OPENROUTER_MANAGEMENT_KEY");
  const normale = Deno.env.get("OPENROUTER_API_KEY");

  if (management) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/credits", {
        headers: { Authorization: `Bearer ${management}` },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return { ...vuoto, errore: `OpenRouter /credits ha risposto ${res.status}` };
      const json = await res.json() as { data?: { total_credits?: number; total_usage?: number } };
      const crediti = Number(json?.data?.total_credits);
      const usato = Number(json?.data?.total_usage);
      if (!Number.isFinite(crediti) || !Number.isFinite(usato)) {
        return { ...vuoto, errore: "risposta /credits senza i totali" };
      }
      return {
        disponibile_usd: Math.round((crediti - usato) * 100) / 100,
        usato_usd: Math.round(usato * 100) / 100,
        fonte: "conto",
        errore: null,
        nota: null,
      };
    } catch (e) {
      return { ...vuoto, errore: e instanceof Error ? e.message : String(e) };
    }
  }

  if (!normale) return { ...vuoto, errore: "OPENROUTER_API_KEY assente nei secrets: l'AI non puo' funzionare" };
  const comeAverlo =
    "per il saldo del conto serve una chiave management (openrouter.ai/settings/keys) salvata come OPENROUTER_MANAGEMENT_KEY";
  try {
    // Documentato come GET /api/v1/key: funziona con la chiave normale e
    // descrive SOLO quella chiave (usage, limit, limit_remaining).
    const res = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${normale}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { ...vuoto, errore: `OpenRouter /key ha risposto ${res.status}: la chiave del router potrebbe essere revocata` };
    const json = await res.json() as { data?: { usage?: number; limit?: number | null; limit_remaining?: number | null } };
    const usato = Number(json?.data?.usage);
    const residuo = json?.data?.limit_remaining;
    return {
      disponibile_usd: typeof residuo === "number" && Number.isFinite(residuo) ? Math.round(residuo * 100) / 100 : null,
      usato_usd: Number.isFinite(usato) ? Math.round(usato * 100) / 100 : null,
      fonte: "chiave",
      errore: null,
      nota: typeof residuo === "number" ? null : `la chiave del router non ha un tetto, quindi il saldo non si legge: ${comeAverlo}`,
    };
  } catch (e) {
    return { ...vuoto, errore: e instanceof Error ? e.message : String(e) };
  }
}

function rigaHtml(item: Record<string, unknown>): string {
  const testo = Object.entries(item)
    .map(([k, v]) => `${k}: <strong>${String(v ?? "—")}</strong>`)
    .join(" · ");
  return `<li style="margin:4px 0;font-family:sans-serif;font-size:13px;color:#374151;">${testo}</li>`;
}

export interface StatoPiattaforma {
  /** Quanti segnali in tutto (una riga per problema). */
  totale: number;
  /** «Stato piattaforma — 4 segnali da guardare» */
  subject: string;
  /** Le sezioni con almeno un problema, nell'ordine di gravità. */
  problemi: Array<{ key: string; titolo: string; items: Array<Record<string, unknown>> }>;
  /** Le sezioni in HTML (o la riga «nessun segnale»). */
  corpoHtml: string;
  /** Caselle collegate e conto OpenRouter, in piccolo. */
  piedeHtml: string;
  /** Quando lo snapshot è stato raccolto. */
  generatoAlle: string;
}

export async function statoPiattaforma(supabase: SupabaseClient): Promise<StatoPiattaforma> {
  // I vitali li raccoglie il cron SQL delle 03:52 UTC (ops-canarino-snapshot,
  // prima dei rapporti delle 06:00 di Roma, dal 25/09/2026):
  // via PostgREST la RPC sfora gli 8s di statement_timeout per colpa dello
  // storico pg_cron, su cui non possiamo mettere indici. Qui si legge la
  // riga pronta — e uno snapshot vecchio e' esso stesso un guasto da dire.
  const { data: snap, error } = await supabase
    .from("ops_canarino_snapshot")
    .select("vitali, generato_alle")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(`snapshot: ${error.message}`);
  if (!snap) throw new Error("snapshot assente: il cron ops-canarino-snapshot non e' mai girato");
  const vitali = snap.vitali as Record<string, unknown>;

  const etaMinuti = Math.round((Date.now() - new Date(snap.generato_alle).getTime()) / 60000);
  if (etaMinuti > 120) {
    (vitali as Record<string, unknown>)["snapshot_vecchio"] = [
      { problema: `la raccolta dati non gira da ${Math.round(etaMinuti / 60)} ore`, cron: "ops-canarino-snapshot" },
    ];
  }

  // Backup: chi e' rimasto senza. Il cron del backup non legge la risposta, e
  // il 20/09/2026 le quattro aziende piu' grandi erano senza copia da una o
  // due settimane senza che nessuno lo sapesse. Controllo dal vivo (una
  // lettura svelta su storage.objects), non dallo snapshot delle 04:50.
  try {
    const { data: senzaBackup, error: errBackup } = await supabase.rpc("ops_backup_mancanti", { p_giorni: 8 });
    if (errBackup) throw new Error(errBackup.message);
    if (Array.isArray(senzaBackup) && senzaBackup.length > 0) {
      (vitali as Record<string, unknown>)["backup_mancanti"] = senzaBackup;
    }
  } catch (errBackup) {
    (vitali as Record<string, unknown>)["backup_mancanti"] = [
      { problema: "impossibile controllare i backup", dettaglio: (errBackup as Error).message },
    ];
  }

  // Conto OpenRouter: controllo dal vivo, non dallo snapshot (e' una chiamata
  // HTTP alla loro API, non una lettura del nostro database).
  const openrouter = await saldoOpenRouter();
  const sogliaUsd = Number(Deno.env.get("OPENROUTER_SALDO_MINIMO_USD") ?? "20") || 20;
  if (openrouter.errore) {
    (vitali as Record<string, unknown>)["openrouter_saldo"] = [
      { problema: "impossibile leggere il saldo", dettaglio: openrouter.errore },
    ];
  } else if (openrouter.disponibile_usd != null && openrouter.disponibile_usd < sogliaUsd) {
    (vitali as Record<string, unknown>)["openrouter_saldo"] = [
      {
        problema: `saldo sotto ${sogliaUsd} $: sotto zero si ferma l'AI di tutte le aziende`,
        disponibile_usd: openrouter.disponibile_usd,
        misurato_su: openrouter.fonte === "conto" ? "conto intero" : "tetto di questa chiave",
        ricarica: "https://openrouter.ai/settings/credits",
      },
    ];
  }

  const problemi = SEZIONI
    .map((s) => ({ ...s, items: (vitali?.[s.key] ?? []) as Array<Record<string, unknown>> }))
    .filter((s) => s.items.length > 0);
  const totale = problemi.reduce((n, s) => n + s.items.length, 0);

  const subject = totale === 0
    ? "Stato piattaforma — tutto regolare"
    : `Stato piattaforma — ${totale} segnali da guardare`;

  const corpo = totale === 0
    ? `<p style="font-family:sans-serif;font-size:14px;color:#374151;">Nessun segnale nelle ultime 24 ore: cron eseguiti, nessun errore HTTP rilevante, caselle e integrazioni attive, solleciti in corso dove servono.</p>`
    : problemi.map((s) => `
        <h3 style="font-family:sans-serif;font-size:14px;color:#111827;margin:16px 0 4px;">${s.titolo} (${s.items.length})</h3>
        <ul style="margin:0;padding-left:18px;">${s.items.map(rigaHtml).join("")}</ul>`).join("");

  const piedeHtml = `${(() => {
        const rotte = Number(vitali?.["caselle_scollegate_totale"] ?? 0);
        const tot = Number(vitali?.["caselle_collegate_totale"] ?? 0);
        if (!tot) return "";
        // Conteggio, non elenco: le singole caselle le riconnettono le aziende
        // (avvisate da system-emails-tick), il super-admin non puo' farlo.
        return `<p style="font-family:sans-serif;font-size:13px;color:#6b7280;margin-top:16px;">
          Caselle email collegate: <strong>${tot - rotte}/${tot}</strong> attive${rotte > 0 ? ` — ${rotte} scollegate, le aziende sono state avvisate` : ""}.
        </p>`;
      })()}
      ${openrouter.disponibile_usd != null
        ? `<p style="font-family:sans-serif;font-size:13px;color:#6b7280;margin-top:8px;">
          Conto OpenRouter: <strong>${openrouter.disponibile_usd.toFixed(2)} $</strong> disponibili${openrouter.fonte === "chiave" ? " (tetto della chiave del router)" : ""}${openrouter.usato_usd != null ? ` — usati finora ${openrouter.usato_usd.toFixed(2)} $` : ""}.
        </p>`
        : openrouter.nota
          ? `<p style="font-family:sans-serif;font-size:13px;color:#6b7280;margin-top:8px;">
          Conto OpenRouter: usati finora ${openrouter.usato_usd?.toFixed(2) ?? "—"} $ con la chiave del router; ${openrouter.nota}.
        </p>`
          : ""}`;

  return { totale, subject, problemi, corpoHtml: corpo, piedeHtml, generatoAlle: String(vitali?.generato_alle ?? snap.generato_alle ?? "") };
}
