/**
 * La raccolta dei numeri del riepilogo outreach di ieri (25/09/2026).
 *
 * Stava dentro outreach-riepilogo: adesso la usano due email, il riepilogo
 * outreach e l'email unica del mattino (ops-canarino, modo «mattino»), e i
 * numeri devono essere gli stessi. Qui solo letture: nessun invio, nessun
 * registro. La forma la decide outreachRiepilogo.ts.
 *
 * Conta con COUNT sul database, non scaricando le righe: PostgREST taglia a
 * mille e un giorno buono di invii è già oltre.
 */

// deno-lint-ignore-file no-explicit-any

import { finestraGiorno, type ContiBrand, type DaChiamare, type DatiRiepilogo } from "./outreachRiepilogo.ts";
import { testoSenzaCitazione } from "./avvisoEmail.ts";

const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";

const INTENTO_IN_CHIARO: Record<string, string> = {
  interested: "interessato",
  question: "fa una domanda",
  not_interested: "non interessato",
  unsubscribe: "chiede di non essere più contattato",
  referral: "indica un'altra persona",
  other: "da leggere",
  auto_reply: "risposta automatica",
};

/** Gli esiti WhatsApp che valgono una chiamata, come li scrive il classificatore. */
const ESITO_WA_IN_CHIARO: Record<string, string> = {
  appuntamento: "chiede un appuntamento",
  da_ricontattare: "da ricontattare",
};

/**
 * Chi ha risposto bene si richiama oggi, anche se ha risposto sabato: il
 * riepilogo del lunedì deve contenere il fine settimana, altrimenti quelle
 * risposte non le vede più nessuno (prima arrivavano per email, una a una).
 */
const GIORNI_DA_CHIAMARE = 3;

/** «oggi», «ieri», «sabato»: come lo direbbe una persona. */
function quando(iso: string | null | undefined, adesso: Date): string {
  if (!iso) return "";
  const giorno = (d: Date) =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const q = new Date(iso);
  if (Number.isNaN(q.getTime())) return "";
  const suo = giorno(q);
  if (suo === giorno(adesso)) return "oggi";
  if (suo === giorno(new Date(adesso.getTime() - 86_400_000))) return "ieri";
  return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "long" }).format(q);
}

/** Il numero di righe che soddisfano la query, senza scaricarle. */
async function conta(q: any): Promise<number> {
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

export interface RaccoltaOutreach {
  /** «giovedì 24 settembre» */
  etichetta: string;
  da: string;
  a: string;
  /** Quello che serve a componiRiepilogo. */
  dati: DatiRiepilogo;
  /** Risposte vere del giorno (senza le autorisposte). */
  risposte: number;
}

export async function raccogliRiepilogoOutreach(admin: any, avvio: Date = new Date()): Promise<RaccoltaOutreach> {
  const { da, a, etichetta } = finestraGiorno(avvio);
  const fineOggi = new Date(new Date(a).getTime() + 86_400_000).toISOString();

  // Brand e flussi: servono per raggruppare e per sapere se le aperture
  // sono tracciate (oggi: su nessun flusso).
  const { data: brands } = await admin.from("outreach_brands").select("id, name, status").order("name");
  const { data: seqs } = await admin.from("outreach_sequences").select("id, brand_id, track_opens");
  const sequenze = (seqs ?? []) as Array<{ id: string; brand_id: string | null; track_opens: boolean | null }>;

  // Le risposte del giorno: poche righe, si leggono tutte.
  const { data: risposteRaw } = await admin.from("outreach_replies").select("*")
    .eq("company_id", PLATFORM_COMPANY).gte("received_at", da).lt("received_at", a)
    .order("received_at").limit(500);
  const risposte = (risposteRaw ?? []) as Array<Record<string, any>>;

  // Il brand di una risposta: quello scritto sulla riga (dal 18/09), oppure
  // ricostruito dall'iscrizione → flusso → brand.
  const enrIds = [...new Set(risposte.map((r) => r.enrollment_id).filter(Boolean))] as string[];
  const brandDiIscrizione = new Map<string, string | null>();
  if (enrIds.length) {
    const { data: enrs } = await admin.from("outreach_enrollments").select("id, sequence_id").in("id", enrIds);
    const brandDiSequenza = new Map(sequenze.map((s) => [s.id, s.brand_id] as const));
    for (const e of (enrs ?? []) as Array<{ id: string; sequence_id: string | null }>) {
      brandDiIscrizione.set(e.id, e.sequence_id ? brandDiSequenza.get(e.sequence_id) ?? null : null);
    }
  }
  const brandDiRisposta = (r: Record<string, any>): string | null =>
    (r.brand_id as string | null) ?? (r.enrollment_id ? brandDiIscrizione.get(r.enrollment_id) ?? null : null);

  // Chi ha risposto, con nome e azienda (le autorisposte non contano).
  const vere = risposte.filter((r) => r.intent !== "auto_reply");
  const contattoIds = [...new Set(vere.map((r) => r.contact_id).filter(Boolean))] as string[];
  const nomi = new Map<string, string>();
  if (contattoIds.length) {
    const { data: cs } = await admin.from("marketing_contacts")
      .select("id, first_name, last_name, company_name").in("id", contattoIds);
    for (const c of (cs ?? []) as Array<any>) {
      nomi.set(c.id, c.company_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "");
    }
  }
  const chiHaRisposto = vere.map((r) => {
    const chi = (r.contact_id ? nomi.get(r.contact_id) : "") || r.from_email || "sconosciuto";
    const intento = r.intent ? (INTENTO_IN_CHIARO[r.intent] ?? r.intent) : "da leggere";
    return `${chi} — ${intento}`;
  });

  // Un secchio per brand, più uno per le righe senza brand.
  const secchi: Array<{ id: string | null; nome: string; attivo: boolean }> = [
    ...((brands ?? []) as Array<{ id: string; name: string; status: string | null }>)
      .map((b) => ({ id: b.id, nome: b.name, attivo: b.status === "active" })),
    { id: null, nome: "Senza brand", attivo: false },
  ];

  // Positive sulle persone contattate negli ultimi 30 giorni, per brand: la
  // misura dell'obiettivo del 3% (24/09/2026). Se la funzione non risponde
  // il riepilogo parte lo stesso, senza quella riga.
  const trenta = new Map<string, { persone: number; positive: number }>();
  const { data: t30, error: t30Err } = await admin.rpc("outreach_positive_30_giorni");
  if (!t30Err) {
    for (const x of (t30 ?? []) as Array<{ brand_id: string | null; persone: number; positive: number }>) {
      trenta.set(x.brand_id ?? "", { persone: Number(x.persone) || 0, positive: Number(x.positive) || 0 });
    }
  }

  const conti: ContiBrand[] = [];
  const urgenze: string[] = [];
  for (const s of secchi) {
    const coda = () => {
      const q = admin.from("outreach_send_queue").select("id", { count: "exact", head: true })
        .eq("company_id", PLATFORM_COMPANY);
      return s.id ? q.eq("brand_id", s.id) : q.is("brand_id", null);
    };
    const inviate = await conta(coda().eq("status", "sent").gte("sent_at", da).lt("sent_at", a));
    const primoContatto = await conta(
      coda().eq("status", "sent").eq("primo_contatto", true).gte("sent_at", da).lt("sent_at", a),
    );
    const aperte = await conta(
      coda().eq("status", "sent").not("opened_at", "is", null).gte("sent_at", da).lt("sent_at", a),
    );
    const fallite = await conta(coda().eq("status", "failed").gte("updated_at", da).lt("updated_at", a));
    const inPartenza = await conta(coda().eq("status", "queued").lt("scheduled_for", fineOggi));
    const inCoda = await conta(coda().eq("status", "queued"));

    // Indirizzi inesistenti: iscrizioni finite a 'bounced' nella giornata.
    const seqDelBrand = sequenze.filter((x) => (s.id ? x.brand_id === s.id : !x.brand_id)).map((x) => x.id);
    let rimbalzi = 0;
    if (seqDelBrand.length) {
      rimbalzi = await conta(
        admin.from("outreach_enrollments").select("id", { count: "exact", head: true })
          .eq("company_id", PLATFORM_COMPANY).in("sequence_id", seqDelBrand)
          .eq("status", "bounced").gte("updated_at", da).lt("updated_at", a),
      );
    }

    const mie = vere.filter((r) => brandDiRisposta(r) === s.id);
    const conti1: ContiBrand = {
      brand: s.nome,
      inviate,
      primoContatto,
      fallite,
      risposte: mie.length,
      interessati: mie.filter((r) => r.intent === "interested" || r.intent === "question").length,
      negative: mie.filter((r) => r.intent === "not_interested").length,
      optout: mie.filter((r) => r.intent === "unsubscribe").length,
      rimbalzi,
      aperte,
      tracciaAperture: sequenze.some((x) => (s.id ? x.brand_id === s.id : !x.brand_id) && x.track_opens === true),
      inPartenza,
      inCoda,
      persone30: trenta.get(s.id ?? "")?.persone,
      positive30: trenta.get(s.id ?? "")?.positive,
    };
    // Un brand acceso con la coda piena che ieri non ha spedito niente è
    // fermo: o le caselle non partono, o la coda non gira.
    if (s.attivo && inCoda > 0 && inviate === 0) {
      urgenze.push(`${s.nome}: ${inCoda.toLocaleString("it-IT")} in coda e ieri non è partita nessuna email`);
    }
    // Un brand in pausa (e il secchio «Senza brand») compare solo se ha
    // davvero qualcosa dentro: righe tutte a zero sono rumore.
    if (s.attivo || inviate || fallite || mie.length || inCoda) conti.push(conti1);
  }

  // Caselle che non spediscono: in pausa, o con la connessione rotta.
  const { data: caselle } = await admin.from("outreach_sender_accounts")
    .select("email, status, connection_status");
  const tutte = (caselle ?? []) as Array<{ email: string; status: string | null; connection_status: string | null }>;
  const ferme = tutte.filter((c) => !["active", "warming"].includes(String(c.status)) || (c.connection_status && c.connection_status !== "ok"));

  if (ferme.length) {
    const nomi = ferme.slice(0, 3).map((c) => c.email).join(", ");
    urgenze.push(ferme.length === 1
      ? `la casella ${nomi} non spedisce`
      : `${ferme.length} caselle non spediscono: ${nomi}${ferme.length > 3 ? "…" : ""}`);
  }

  // Numeri WhatsApp staccati o bannati: le campagne e le risposte passano da lì.
  const { data: numeriWa } = await admin.from("openwa_numbers")
    .select("numero, display_name, stato, ban_rilevato_at, errori_consecutivi").is("deleted_at", null);
  for (const n of (numeriWa ?? []) as Array<any>) {
    const nome = [n.display_name, n.numero].filter(Boolean).join(" ") || "senza nome";
    if (n.ban_rilevato_at) urgenze.push(`WhatsApp ${nome}: bannato`);
    else if (String(n.stato) !== "connected") urgenze.push(`WhatsApp ${nome}: staccato`);
    else if (Number(n.errori_consecutivi ?? 0) >= 3) urgenze.push(`WhatsApp ${nome}: ${n.errori_consecutivi} errori di fila`);
  }

  // ── Da chiamare oggi ──────────────────────────────────────────────────
  // Le risposte buone non arrivano più per email una a una (24/09/2026):
  // si raccolgono qui, email e WhatsApp insieme, col numero da comporre.
  const daChiamareDa = new Date(new Date(da).getTime() - (GIORNI_DA_CHIAMARE - 1) * 86_400_000).toISOString();
  const [{ data: posEmail }, { data: posWa }] = await Promise.all([
    admin.from("outreach_replies")
      .select("contact_id, from_email, from_phone, intent, snippet, received_at")
      .eq("company_id", PLATFORM_COMPANY).in("intent", ["interested", "question"])
      .gte("received_at", daChiamareDa).order("received_at", { ascending: false }).limit(50),
    admin.from("openwa_campagna_destinatari")
      .select("contact_id, esito, esito_at, risposto_at")
      .in("esito", Object.keys(ESITO_WA_IN_CHIARO))
      .gte("risposto_at", daChiamareDa).order("risposto_at", { ascending: false }).limit(50),
  ]);

  const idsChiamata = [...new Set([
    ...((posEmail ?? []) as Array<any>).map((r) => r.contact_id),
    ...((posWa ?? []) as Array<any>).map((r) => r.contact_id),
  ].filter(Boolean))] as string[];
  const rubrica = new Map<string, { chi: string; telefono: string | null }>();
  if (idsChiamata.length) {
    const { data: cs } = await admin.from("marketing_contacts")
      .select("id, first_name, last_name, company_name, phone").in("id", idsChiamata);
    for (const c of (cs ?? []) as Array<any>) {
      rubrica.set(c.id, {
        chi: c.company_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "",
        telefono: c.phone ?? null,
      });
    }
  }

  // Una persona sola, anche se ha risposto su tutti e due i canali: si
  // tiene la risposta più recente.
  const candidati: Array<DaChiamare & { chiave: string; istante: number }> = [];
  for (const r of (posEmail ?? []) as Array<any>) {
    const inRubrica = r.contact_id ? rubrica.get(r.contact_id) : undefined;
    candidati.push({
      chiave: r.contact_id || String(r.from_email ?? "").toLowerCase() || `email-${candidati.length}`,
      istante: Date.parse(r.received_at ?? "") || 0,
      chi: inRubrica?.chi || r.from_email || "sconosciuto",
      canale: "email",
      motivo: INTENTO_IN_CHIARO[r.intent] ?? "da leggere",
      quando: quando(r.received_at, avvio),
      telefono: inRubrica?.telefono ?? r.from_phone ?? null,
      // Senza la nostra email citata sotto: in due righe si capisce se è calda.
      cosa: testoSenzaCitazione(r.snippet, 200) || null,
    });
  }
  for (const r of (posWa ?? []) as Array<any>) {
    const inRubrica = r.contact_id ? rubrica.get(r.contact_id) : undefined;
    const istante = r.risposto_at ?? r.esito_at;
    candidati.push({
      chiave: r.contact_id || `wa-${candidati.length}`,
      istante: Date.parse(istante ?? "") || 0,
      chi: inRubrica?.chi || "un numero non in rubrica",
      canale: "whatsapp",
      motivo: ESITO_WA_IN_CHIARO[r.esito] ?? String(r.esito),
      quando: quando(istante, avvio),
      telefono: inRubrica?.telefono ?? null,
    });
  }
  candidati.sort((x, y) => y.istante - x.istante);
  const viste = new Set<string>();
  const daChiamare: DaChiamare[] = [];
  for (const c of candidati) {
    if (viste.has(c.chiave)) continue;
    viste.add(c.chiave);
    daChiamare.push({ chi: c.chi, canale: c.canale, motivo: c.motivo, quando: c.quando, telefono: c.telefono, cosa: c.cosa });
  }

  return {
    etichetta, da, a,
    risposte: vere.length,
    dati: {
      giorno: etichetta,
      brand: conti,
      chiHaRisposto,
      caselleFerme: ferme.slice(0, 6).map((c) => `${c.email} (${c.status === "paused" ? "in pausa" : c.connection_status ?? "?"})`),
      caselleAttive: tutte.length - ferme.length,
      daChiamare,
      urgenze,
    },
  };
}
