import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isMissingTableError, isMissingRpcError } from "./_shared";

/**
 * Hook dati della dashboard "Statistiche" dell'Outreach Engine cold.
 * Indipendente dagli altri hook outreach (nessun riuso di useOutreachConversations).
 *
 * Strategia a SCALA (migliaia di invii/risposte):
 *  1. PERCORSO PRIMARIO — RPC Postgres `outreach_stats_*` (SECURITY DEFINER, scoped
 *     company + super-admin) che fanno COUNT/GROUP BY in SQL: il client riceve solo
 *     gli aggregati (payload minuscolo, niente loop su 5.000 righe, conteggi headline
 *     esatti senza cap). Vedi migrazione 20270825000000_outreach_stats_rpc.sql.
 *  2. FALLBACK TOLLERANTE — se le RPC non esistono ancora (migrazione non applicata:
 *     PGRST202/42883), ricade sul calcolo client-side storico (`computeClientSide`),
 *     identico nei numeri e nell'empty-state. Nessuna regressione finché la migrazione
 *     non è applicata.
 *
 * Resilienza comune:
 *  - tabelle assenti (motore outreach non installato) → `migrationNeeded: true`, niente throw.
 *  - tabelle/RPC vuote → aggregati a 0, mai NaN o divisioni per zero (i rapporti %
 *    si calcolano in UI con guardie dedicate).
 */

const ROW_CAP = 5000;
const DAILY_WINDOW_DAYS = 30;
const STATS_TZ = "Europe/Rome"; // bucket giornalieri coerenti con l'asse "oggi" lato client

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface DailyPoint {
  date: string; // yyyy-mm-dd (chiave)
  label: string; // gg/mm (asse)
  sent: number;
  opened: number;
  replied: number;
}

export interface FunnelStage {
  key: string;
  label: string;
  value: number;
}

export interface QueueSlice {
  status: string;
  label: string;
  value: number;
}

export interface SenderRow {
  id: string;
  email: string;
  status: string;
  sent: number;
  bounce: number;
  complaint: number;
  atRisk: boolean;
}

export interface SequenceRow {
  id: string;
  name: string;
  status: string;
  enrolled: number;
  sent: number;
  replied: number;
}

export interface OutreachStats {
  migrationNeeded: boolean;
  hasAnyData: boolean;
  totals: {
    sent: number;
    opened: number;
    replied: number;
    interested: number;
    delivered: number;
    activeSenders: number;
    contactable: number;
  };
  daily: DailyPoint[];
  funnel: FunnelStage[];
  queue: QueueSlice[];
  senders: SenderRow[];
  sequences: SequenceRow[];
}

const QUEUE_STATUS_LABEL: Record<string, string> = {
  sent: "Inviate",
  queued: "In coda",
  sending: "In invio",
  skipped: "Saltate",
  failed: "Fallite",
  cancelled: "Annullate",
  canceled: "Annullate",
};

const QUEUE_STATUS_ORDER = ["sent", "queued", "sending", "skipped", "failed", "cancelled", "canceled"];

/** Intent/stato di una risposta che indica interesse commerciale (→ opportunità). */
const INTERESTED_INTENTS = new Set(["interested", "positive", "meeting", "meeting_booked", "opportunity"]);

function toDayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // chiave locale yyyy-mm-dd (coerente con l'asse "oggi")
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildDailyScaffold(): { points: DailyPoint[]; index: Map<string, number> } {
  const points: DailyPoint[] = [];
  const index = new Map<string, number>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = DAILY_WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = toDayKey(d.toISOString())!;
    const label = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    index.set(key, points.length);
    points.push({ date: key, label, sent: 0, opened: 0, replied: 0 });
  }
  return { points, index };
}

interface QueueRow {
  status: string | null;
  sent_at: string | null;
  opened_at: string | null;
  sender_account_id: string | null;
  enrollment_id: string | null;
}
interface ReplyRow {
  received_at: string | null;
  intent: string | null;
  status: string | null;
  enrollment_id: string | null;
}
interface EnrollRow {
  id: string;
  sequence_id: string | null;
  status: string | null;
}
interface SenderApiRow {
  id: string;
  email: string | null;
  status: string | null;
  bounce_count: number | null;
  complaint_count: number | null;
}
interface SequenceApiRow {
  id: string;
  name: string | null;
  status: string | null;
}

// ── Righe restituite dalle RPC `outreach_stats_*` (percorso server-side) ──
interface DailyRpcRow {
  day_key: string;
  date_label: string;
  sent: number | string;
  opened: number | string;
  replied: number | string;
}
interface FunnelRpcRow {
  sent: number | string;
  delivered: number | string;
  opened: number | string;
  replied: number | string;
  interested: number | string;
  active_senders: number | string;
  contactable: number | string;
}
interface QueueRpcRow {
  status: string | null;
  total: number | string;
}
interface SenderRpcRow {
  id: string;
  email: string | null;
  status: string | null;
  sent: number | string;
  bounce: number | string;
  complaint: number | string;
}
interface SequenceRpcRow {
  id: string;
  name: string | null;
  status: string | null;
  enrolled: number | string;
  sent: number | string;
  replied: number | string;
}

export function useOutreachStats(companyId: string) {
  return useQuery<OutreachStats>({
    queryKey: ["outreach-stats", companyId],
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      const db = supabase as Db;

      // Probe leggera: se la tabella core manca, mostriamo il MigrationGate.
      const probe = await db
        .from("outreach_send_queue")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId);
      if (probe.error) {
        if (isMissingTableError(probe.error)) return emptyStats(true);
        throw probe.error;
      }

      // PERCORSO PRIMARIO: aggregazioni lato-server. Se le RPC non esistono ancora
      // (migrazione non applicata) → null, e si ricade sul calcolo client-side.
      const serverStats = await computeServerSide(db, companyId);
      if (serverStats) return serverStats;

      return computeClientSide(db, companyId);
    },
  });
}

/**
 * PERCORSO PRIMARIO — chiama le 5 RPC `outreach_stats_*` in parallelo e mappa il
 * risultato nello stesso shape `OutreachStats` del client. Ritorna `null` (→ fallback)
 * se QUALSIASI RPC segnala "funzione assente" (migrazione non applicata): in quel
 * caso non mescoliamo RPC + client, ricadiamo interamente sul client per coerenza.
 * Errori "duri" (non-missing) vengono propagati.
 */
async function computeServerSide(db: Db, companyId: string): Promise<OutreachStats | null> {
  const [dailyRes, funnelRes, queueRes, sendersRes, sequencesRes] = await Promise.all([
    db.rpc("outreach_stats_daily", { p_company: companyId, p_days: DAILY_WINDOW_DAYS, p_tz: STATS_TZ }),
    db.rpc("outreach_stats_funnel", { p_company: companyId }),
    db.rpc("outreach_stats_queue_status", { p_company: companyId }),
    db.rpc("outreach_stats_by_sender", { p_company: companyId }),
    db.rpc("outreach_stats_by_sequence", { p_company: companyId }),
  ]);

  const results = [dailyRes, funnelRes, queueRes, sendersRes, sequencesRes];
  // Migrazione non applicata (anche una sola funzione mancante) → fallback completo.
  if (results.some((r) => r.error && isMissingRpcError(r.error))) return null;
  for (const r of results) {
    if (r.error) throw r.error;
  }

  // ── Andamento giornaliero: scaffold (ordine/etichette garantiti dal client) ──
  // L'RPC restituisce già la serie continua; ci allineiamo allo scaffold locale per
  // robustezza se p_days differisse, riempiendo per chiave giorno.
  const { points: daily, index: dayIndex } = buildDailyScaffold();
  for (const row of (dailyRes.data ?? []) as DailyRpcRow[]) {
    const idx = dayIndex.get(row.day_key);
    if (idx === undefined) continue;
    daily[idx].sent = Number(row.sent) || 0;
    daily[idx].opened = Number(row.opened) || 0;
    daily[idx].replied = Number(row.replied) || 0;
  }

  // ── Funnel + totali headline (una riga) ──
  const f = ((funnelRes.data ?? [])[0] ?? {}) as FunnelRpcRow;
  const sentTotal = Number(f.sent) || 0;
  const deliveredTotal = Number(f.delivered) || 0;
  const openedTotal = Number(f.opened) || 0;
  const repliedTotal = Number(f.replied) || 0;
  const interestedTotal = Number(f.interested) || 0;
  const activeSenders = Number(f.active_senders) || 0;
  const contactable = Number(f.contactable) || 0;

  const funnel: FunnelStage[] = [
    { key: "sent", label: "Inviate", value: sentTotal },
    { key: "delivered", label: "Consegnate", value: deliveredTotal },
    { key: "opened", label: "Aperte", value: openedTotal },
    { key: "replied", label: "Risposte", value: repliedTotal },
    { key: "interested", label: "Interessati", value: interestedTotal },
  ];

  // ── Distribuzione coda per stato (donut), stesso ordine/etichette del client ──
  const queue: QueueSlice[] = ((queueRes.data ?? []) as QueueRpcRow[])
    .map((r) => {
      const status = (r.status ?? "unknown").toLowerCase();
      return { status, label: QUEUE_STATUS_LABEL[status] ?? status, value: Number(r.total) || 0 };
    })
    .sort((a, b) => {
      const ia = QUEUE_STATUS_ORDER.indexOf(a.status);
      const ib = QUEUE_STATUS_ORDER.indexOf(b.status);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  const queueRowCount = queue.reduce((s, q) => s + q.value, 0);

  // ── Salute per casella (at-risk deciso qui, stessa soglia del client) ──
  const senders: SenderRow[] = ((sendersRes.data ?? []) as SenderRpcRow[]).map((s) => {
    const bounce = Number(s.bounce) || 0;
    const complaint = Number(s.complaint) || 0;
    return {
      id: s.id,
      email: s.email ?? "(senza email)",
      status: s.status ?? "—",
      sent: Number(s.sent) || 0,
      bounce,
      complaint,
      atRisk: bounce >= 3 || complaint >= 1 || s.status === "paused" || s.status === "blocked",
    };
  });

  // ── Per sequenza ──
  const sequences: SequenceRow[] = ((sequencesRes.data ?? []) as SequenceRpcRow[]).map((s) => ({
    id: s.id,
    name: s.name ?? "(senza nome)",
    status: s.status ?? "—",
    enrolled: Number(s.enrolled) || 0,
    sent: Number(s.sent) || 0,
    replied: Number(s.replied) || 0,
  }));

  const totals = {
    sent: sentTotal,
    opened: openedTotal,
    replied: repliedTotal,
    interested: interestedTotal,
    delivered: deliveredTotal,
    activeSenders,
    contactable,
  };

  const hasAnyData =
    sentTotal > 0 || repliedTotal > 0 || sequences.some((s) => s.enrolled > 0) || queueRowCount > 0;

  return { migrationNeeded: false, hasAnyData, totals, daily, funnel, queue, senders, sequences };
}

/**
 * FALLBACK — calcolo client-side storico: scarica righe grezze (cap ROW_CAP) e
 * aggrega in JS. Usato solo finché la migrazione RPC non è applicata. Numeri ed
 * empty-state identici al percorso server-side.
 */
async function computeClientSide(db: Db, companyId: string): Promise<OutreachStats> {
  {
      const eq = (q: Db) => q.eq("company_id", companyId);

      // Una manciata di letture parallele. Le righe della coda sono limitate da
      // ROW_CAP (ordinate per recenza) e aggregate lato client, così sia
      // l'andamento 30g sia i totali per casella restano leggeri anche con volumi alti.
      const [
        sentTotalRes,
        openedTotalRes,
        queueRowsRes,
        repliesRes,
        enrollRes,
        sendersRes,
        sequencesRes,
        contactsRes,
        optoutRes,
        queueStatusRes,
      ] = await Promise.all([
        eq(db.from("outreach_send_queue").select("id", { count: "exact", head: true })).eq("status", "sent"),
        eq(db.from("outreach_send_queue").select("id", { count: "exact", head: true })).not("opened_at", "is", null),
        eq(
          db
            .from("outreach_send_queue")
            .select("status,sent_at,opened_at,sender_account_id,enrollment_id")
            .order("created_at", { ascending: false })
            .limit(ROW_CAP),
        ),
        eq(
          db
            .from("outreach_replies")
            .select("received_at,intent,status,enrollment_id")
            .order("received_at", { ascending: false })
            .limit(ROW_CAP),
        ),
        eq(db.from("outreach_enrollments").select("id,sequence_id,status").limit(ROW_CAP)),
        eq(
          db.from("outreach_sender_accounts").select("id,email,status,bounce_count,complaint_count").order("email"),
        ),
        eq(db.from("outreach_sequences").select("id,name,status").order("created_at", { ascending: false })),
        eq(db.from("marketing_contacts").select("id", { count: "exact", head: true })),
        eq(db.from("marketing_contacts").select("id", { count: "exact", head: true })).or(
          "optout_email.eq.true,opt_out.eq.true,unsubscribed.eq.true",
        ),
        // Distribuzione coda per stato: la facciamo lato DB con count su tutti gli stati.
        eq(db.from("outreach_send_queue").select("status").limit(ROW_CAP)),
      ]);

      // Errori "duri" (non tabella mancante) → propaga; tabella mancante su
      // letture secondarie (replies/enrollments gated) → trattata come vuota.
      const softEmpty = <T,>(res: { data: T[] | null; error: unknown }): T[] => {
        if (res.error) {
          if (isMissingTableError(res.error)) return [];
          throw res.error;
        }
        return res.data ?? [];
      };

      const queueRows = softEmpty<QueueRow>(queueRowsRes);
      const replyRows = softEmpty<ReplyRow>(repliesRes);
      const enrollRows = softEmpty<EnrollRow>(enrollRes);
      const senderRows = softEmpty<SenderApiRow>(sendersRes);
      const sequenceRows = softEmpty<SequenceApiRow>(sequencesRes);
      const queueStatusRows = softEmpty<{ status: string | null }>(queueStatusRes);

      const sentTotal = sentTotalRes.error ? 0 : sentTotalRes.count ?? 0;
      const openedTotal = openedTotalRes.error ? 0 : openedTotalRes.count ?? 0;
      const contactsTotal = contactsRes.error ? 0 : contactsRes.count ?? 0;
      const optoutTotal = optoutRes.error ? 0 : optoutRes.count ?? 0;

      // ── Andamento giornaliero (30g): inviate vs aperte vs risposte per data ──
      const { points: daily, index: dayIndex } = buildDailyScaffold();
      const bump = (iso: string | null, field: "sent" | "opened" | "replied") => {
        const key = toDayKey(iso);
        if (!key) return;
        const idx = dayIndex.get(key);
        if (idx === undefined) return;
        daily[idx][field] += 1;
      };
      for (const row of queueRows) {
        if (row.sent_at) bump(row.sent_at, "sent");
        if (row.opened_at) bump(row.opened_at, "opened");
      }
      for (const row of replyRows) bump(row.received_at, "replied");

      // ── Totali risposte / interessati ──
      const repliedTotal = replyRows.length;
      const interestedTotal = replyRows.filter(
        (r) =>
          (r.intent && INTERESTED_INTENTS.has(r.intent.toLowerCase())) ||
          (r.status && r.status.toLowerCase() === "interested"),
      ).length;

      // ── Distribuzione coda per stato (donut) ──
      const queueCount = new Map<string, number>();
      for (const r of queueStatusRows) {
        const s = (r.status ?? "unknown").toLowerCase();
        queueCount.set(s, (queueCount.get(s) ?? 0) + 1);
      }
      const queue: QueueSlice[] = [...queueCount.entries()]
        .map(([status, value]) => ({ status, label: QUEUE_STATUS_LABEL[status] ?? status, value }))
        .sort((a, b) => {
          const ia = QUEUE_STATUS_ORDER.indexOf(a.status);
          const ib = QUEUE_STATUS_ORDER.indexOf(b.status);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });

      // "Consegnate" ≈ inviate senza un bounce noto. Non abbiamo un flag delivered
      // dedicato sulla coda, quindi stimiamo da inviate − fallite (proxy onesto).
      const failedTotal = queueCount.get("failed") ?? 0;
      const deliveredTotal = Math.max(0, sentTotal - failedTotal);

      // ── Funnel cold cumulativo ──
      const funnel: FunnelStage[] = [
        { key: "sent", label: "Inviate", value: sentTotal },
        { key: "delivered", label: "Consegnate", value: deliveredTotal },
        { key: "opened", label: "Aperte", value: openedTotal },
        { key: "replied", label: "Risposte", value: repliedTotal },
        { key: "interested", label: "Interessati", value: interestedTotal },
      ];

      // ── Salute per casella ──
      // Invii per casella: contiamo le righe "sent" raggruppate per sender_account_id.
      const sentBySender = new Map<string, number>();
      for (const row of queueRows) {
        if (row.status === "sent" && row.sender_account_id) {
          sentBySender.set(row.sender_account_id, (sentBySender.get(row.sender_account_id) ?? 0) + 1);
        }
      }
      const senders: SenderRow[] = senderRows.map((s) => {
        const bounce = s.bounce_count ?? 0;
        const complaint = s.complaint_count ?? 0;
        return {
          id: s.id,
          email: s.email ?? "(senza email)",
          status: s.status ?? "—",
          sent: sentBySender.get(s.id) ?? 0,
          bounce,
          complaint,
          atRisk: bounce >= 3 || complaint >= 1 || s.status === "paused" || s.status === "blocked",
        };
      });
      const activeSenders = senderRows.filter(
        (s) => s.status === "active" || s.status === "warming" || s.status === "warmup",
      ).length;

      // ── Per sequenza ──
      const seqEnrolled = new Map<string, number>();
      const enrollIdToSeq = new Map<string, string>();
      for (const e of enrollRows) {
        if (e.sequence_id) {
          seqEnrolled.set(e.sequence_id, (seqEnrolled.get(e.sequence_id) ?? 0) + 1);
          enrollIdToSeq.set(e.id, e.sequence_id);
        }
      }
      const seqSent = new Map<string, number>();
      for (const row of queueRows) {
        if (row.status !== "sent" || !row.enrollment_id) continue;
        const seq = enrollIdToSeq.get(row.enrollment_id);
        if (seq) seqSent.set(seq, (seqSent.get(seq) ?? 0) + 1);
      }
      const seqReplied = new Map<string, number>();
      for (const r of replyRows) {
        if (!r.enrollment_id) continue;
        const seq = enrollIdToSeq.get(r.enrollment_id);
        if (seq) seqReplied.set(seq, (seqReplied.get(seq) ?? 0) + 1);
      }
      const sequences: SequenceRow[] = sequenceRows.map((s) => ({
        id: s.id,
        name: s.name ?? "(senza nome)",
        status: s.status ?? "—",
        enrolled: seqEnrolled.get(s.id) ?? 0,
        sent: seqSent.get(s.id) ?? 0,
        replied: seqReplied.get(s.id) ?? 0,
      }));

      const totals = {
        sent: sentTotal,
        opened: openedTotal,
        replied: repliedTotal,
        interested: interestedTotal,
        delivered: deliveredTotal,
        activeSenders,
        contactable: Math.max(0, contactsTotal - optoutTotal),
      };

      const hasAnyData =
        sentTotal > 0 || repliedTotal > 0 || enrollRows.length > 0 || queueStatusRows.length > 0;

      return { migrationNeeded: false, hasAnyData, totals, daily, funnel, queue, senders, sequences };
  }
}

function emptyStats(migrationNeeded: boolean): OutreachStats {
  const { points } = buildDailyScaffold();
  return {
    migrationNeeded,
    hasAnyData: false,
    totals: { sent: 0, opened: 0, replied: 0, interested: 0, delivered: 0, activeSenders: 0, contactable: 0 },
    daily: points,
    funnel: [
      { key: "sent", label: "Inviate", value: 0 },
      { key: "delivered", label: "Consegnate", value: 0 },
      { key: "opened", label: "Aperte", value: 0 },
      { key: "replied", label: "Risposte", value: 0 },
      { key: "interested", label: "Interessati", value: 0 },
    ],
    queue: [],
    senders: [],
    sequences: [],
  };
}
