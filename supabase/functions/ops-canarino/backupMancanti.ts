/**
 * L'allarme «aziende senza backup» (ops-canarino, modo «backup»).
 *
 * PERCHÉ ESISTE. Dal 15/11/2026 quattordici aziende sono rimaste senza una
 * copia per quindici giorni — Vulcano con 131 commesse, Renova, Bonarrigo, le
 * Demo — e Consorzio Amalfi non l'aveva mai avuta. L'avviso però C'ERA e ha
 * funzionato: il rapporto del mattino è partito tutte le mattine, quindici su
 * quindici, e il controllo legge lo storage dal vivo. Ogni mattina quell'elenco
 * era nell'email.
 *
 * Il difetto non era accorgersene: era COME lo diceva. Una riga fra i segnali
 * vitali, in mezzo a cron, code e metriche, dove si legge e si dimentica. Qui
 * il backup che manca ha il trattamento del credito AI finito: email dedicata
 * col MOTIVO nell'oggetto, campanella, push, e un promemoria ogni 12 ore
 * finché non è risolto. Quando torna a posto arriva «Risolto», così il
 * silenzio non si confonde con l'essere a posto.
 *
 * Lo stato, l'idempotenza e la cadenza stanno nel database
 * (`ops_backup_allarme_controlla`): due controlli in parallelo non mandano due
 * email, e un controllo che gira ogni ora non manda un'email all'ora.
 *
 * Modi di prova, come per il credito AI:
 *  · `anteprima: true` — dice cosa partirebbe senza scrivere né spedire;
 *  · `prova: true` — spedisce UNA email «[Prova]» con dati di esempio, senza
 *    toccare l'allarme.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { avvisaSuperAdmin } from "../_shared/avvisaSuperAdmin.ts";
import { notificaInterna } from "../_shared/notificaInterna.ts";
import {
  componiAvvisoBackup,
  componiRipristinoBackup,
  motivoErrore,
  type AziendaSenzaBackup,
  type EsitoBackupMancanti,
  type EsitoControllo,
} from "../_shared/backupAllarmeTesti.ts";
export type { AziendaSenzaBackup, EsitoBackupMancanti };

/** Sotto questi giorni non è un allarme: il giro notturno salta per mille motivi normali. */
const GIORNI = 2;
/** Un promemoria ogni mezza giornata: il backup è quotidiano, più spesso è rumore. */
const ORE_PROMEMORIA = 12;

async function spedisci(
  supabase: SupabaseClient,
  avviso: { oggetto: string; sommario: string; dettagli: Array<[string, string]> },
  allarme: string | null,
  prefissoOggetto = "",
): Promise<boolean> {
  const base = Deno.env.get("APP_URL") ?? "https://app.ediliziaincloud.com";
  const url = `${base}/admin/aziende`;
  const emailOk = await notificaInterna(supabase, {
    oggetto: `${prefissoOggetto}${avviso.oggetto}`,
    sommario: avviso.sommario,
    dettagli: avviso.dettagli,
    url,
    urlLabel: "Apri le aziende",
  });
  // La campanella e il push sono la seconda via: se l'email non parte restano
  // l'unico segnale, quindi si mandano comunque. Non per la prova.
  if (!prefissoOggetto) {
    try {
      await avvisaSuperAdmin(supabase, {
        tipo: "backup_allarme",
        titolo: avviso.oggetto,
        testo: avviso.sommario,
        url,
        tag: "backup-allarme",
        entityType: "backup_allarme",
        entityId: allarme ?? undefined,
      });
    } catch (e) {
      console.warn("[backup] campanella:", motivoErrore(e));
    }
  }
  return emailOk;
}

/** L'email di prova: dati di esempio, oggetto «[Prova]», nessun effetto sull'allarme. */
export async function provaAvvisoBackup(
  supabase: SupabaseClient,
): Promise<{ inviata: boolean; oggetto: string }> {
  const elenco: AziendaSenzaBackup[] = [
    { azienda: "Impresa di prova S.r.l.", ultimo_backup: "2026-11-08", giorni_senza: 15, nota: "l'ultima copia è vecchia" },
    { azienda: "Seconda di prova S.r.l.", ultimo_backup: null, giorni_senza: null, nota: "mai salvata" },
  ];
  const avviso = componiAvvisoBackup(elenco, { giorniPeggiore: 15, avvisoNumero: 2 });
  const inviata = await spedisci(supabase, avviso, null, "[Prova] ");
  return { inviata, oggetto: `[Prova] ${avviso.oggetto}` };
}

export async function controllaBackupMancanti(
  supabase: SupabaseClient,
  opzioni: { anteprima?: boolean; giorni?: number; orePromemoria?: number } = {},
): Promise<EsitoBackupMancanti> {
  const errori: string[] = [];
  const { data, error } = await supabase.rpc("ops_backup_allarme_controlla", {
    p_giorni: opzioni.giorni ?? GIORNI,
    p_ore_promemoria: opzioni.orePromemoria ?? ORE_PROMEMORIA,
    p_anteprima: opzioni.anteprima === true,
  });
  if (error) throw new Error(`controllo backup: ${error.message}`);
  const esito = (data ?? { azione: "niente" }) as EsitoControllo;

  const base: EsitoBackupMancanti = {
    azione: esito.azione,
    aziende: Number(esito.aziende ?? esito.aziende_prima?.length ?? 0),
    giorni_peggiore: esito.giorni_peggiore ?? null,
    avviso_inviato: false,
    oggetto: null,
    errori,
  };

  if (esito.azione === "niente" || esito.azione === "aspetta") return base;

  const avviso = esito.azione === "risolto"
    ? componiRipristinoBackup(esito)
    : componiAvvisoBackup(esito.elenco ?? [], {
      giorniPeggiore: esito.giorni_peggiore ?? null,
      avvisoNumero: esito.avviso_numero,
    });
  base.oggetto = avviso.oggetto;

  if (opzioni.anteprima === true) {
    base.anteprima = avviso;
    return base;
  }

  try {
    base.avviso_inviato = await spedisci(supabase, avviso, esito.allarme ?? null);
    if (!base.avviso_inviato) errori.push("email non inviata");
  } catch (e) {
    errori.push(motivoErrore(e));
  }
  // L'avviso viene preso in carico PRIMA di spedirlo, perché due controlli
  // insieme non devono mandare due email. Se però la spedizione non riesce,
  // l'allarme va rilasciato: altrimenti il guasto resterebbe muto per dodici
  // ore proprio perché l'email non è partita. Con `ultima_notifica` a null il
  // giro dopo riprova subito. (Non per il «risolto»: l'allarme è già chiuso.)
  if (!base.avviso_inviato && esito.azione === "avvisa" && esito.allarme) {
    const { error: erroreRilascio } = await supabase
      .from("ops_backup_allarme")
      .update({ ultima_notifica: null, notifiche_inviate: Math.max(0, (esito.avviso_numero ?? 1) - 1) })
      .eq("id", esito.allarme)
      .is("chiuso_il", null);
    if (erroreRilascio) errori.push(`allarme non rilasciato: ${erroreRilascio.message}`);
  }
  return base;
}
