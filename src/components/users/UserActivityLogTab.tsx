import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { escapeCsvCell } from "@/lib/csvExport";
import { descriviEsportazioneCrm } from "@/lib/export/esportazioniCrm";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Loader2, Download, FileText, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  CATEGORIE_LOG, contaPerCategoria, estremiIso, etichettaGiorno, intervalloPreset,
  raggruppaPerGiorno, vocedaAttivitaRegistro, vocedaLogAzienda,
  type CategoriaLog, type Intervallo, type PresetPeriodo, type VoceLog,
} from "@/lib/users/logAttivitaUtente";

interface UserActivityLogTabProps {
  userId: string;
}

const ACTION_LABELS: Record<string, string> = {
  user_created: "Utente creato",
  login: "Login",
  logout: "Logout",
  password_changed: "Password cambiata",
  role_changed: "Ruolo modificato",
  permissions_updated: "Permessi aggiornati",
  session_revoked: "Sessione revocata",
  account_locked: "Account bloccato",
  account_unlocked: "Account sbloccato",
  access_blocked: "Accesso bloccato",
  access_unblocked: "Accesso ripristinato",
  user_deleted: "Utente eliminato",
  crm_exported: "Esportazione dati clienti",
};

const COLORE_CATEGORIA: Record<CategoriaLog, string> = {
  sicurezza: "bg-amber-600/10 text-amber-700 border-amber-600/20",
  note: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
  pipeline: "bg-violet-600/10 text-violet-700 border-violet-600/20",
  contatti: "bg-blue-600/10 text-blue-700 border-blue-600/20",
  chiamate: "bg-green-600/10 text-green-700 border-green-600/20",
  email: "bg-sky-600/10 text-sky-700 border-sky-600/20",
  appuntamenti: "bg-indigo-600/10 text-indigo-700 border-indigo-600/20",
  preventivi: "bg-orange-600/10 text-orange-700 border-orange-600/20",
  attivita: "bg-teal-600/10 text-teal-700 border-teal-600/20",
  documenti: "bg-slate-500/10 text-slate-700 border-slate-500/20",
  altro: "bg-muted text-muted-foreground",
};

const PRESET: { chiave: PresetPeriodo; etichetta: string }[] = [
  { chiave: "oggi", etichetta: "Oggi" },
  { chiave: "ieri", etichetta: "Ieri" },
  { chiave: "7", etichetta: "7 giorni" },
  { chiave: "30", etichetta: "30 giorni" },
  { chiave: "tutto", etichetta: "Tutto" },
];

/** Righe lette per ogni fonte: oltre, si restringe l'intervallo di date. */
const LIMITE_PER_FONTE = 500;

/* eslint-disable @typescript-eslint/no-explicit-any */
async function leggiFonte(
  tabella: string,
  colonne: string,
  colonnaUtente: string,
  colonnaData: string,
  userId: string,
  companyId: string,
  estremi: { da: string | null; a: string | null },
): Promise<any[]> {
  let q: any = (supabase as any).from(tabella).select(colonne)
    .eq("company_id", companyId).eq(colonnaUtente, userId)
    .order(colonnaData, { ascending: false }).limit(LIMITE_PER_FONTE);
  if (estremi.da) q = q.gte(colonnaData, estremi.da);
  if (estremi.a) q = q.lte(colonnaData, estremi.a);
  const { data, error } = await q;
  // Una fonte che non si legge non deve nascondere le altre.
  if (error) return [];
  return data ?? [];
}

async function caricaLog(userId: string, companyId: string, intervallo: Intervallo): Promise<{ voci: VoceLog[]; troncato: boolean }> {
  const estremi = estremiIso(intervallo);

  let sicurezzaQ: any = (supabase as any).from("user_audit_log").select("*")
    .or(`actor_id.eq.${userId},target_user_id.eq.${userId}`)
    .order("created_at", { ascending: false }).limit(LIMITE_PER_FONTE);
  if (estremi.da) sicurezzaQ = sicurezzaQ.gte("created_at", estremi.da);
  if (estremi.a) sicurezzaQ = sicurezzaQ.lte("created_at", estremi.a);

  const [sicurezza, attivita, note, chiamate, chiamateUmane, email, appuntamenti, task, preventivi, logAzienda] = await Promise.all([
    sicurezzaQ.then((r: any) => (r.error ? [] : r.data ?? [])),
    leggiFonte("marketing_contact_activities", "id, activity_type, description, contact_id, created_at", "created_by", "created_at", userId, companyId, estremi),
    leggiFonte("marketing_contact_notes", "id, content, contact_id, automatica, created_at", "created_by", "created_at", userId, companyId, estremi),
    leggiFonte("call_logs", "id, outcome, notes, duration_sec, contact_id, started_at", "user_id", "started_at", userId, companyId, estremi),
    leggiFonte("human_call_logs", "id, to_number, status, duration_seconds, contact_id, started_at", "user_id", "started_at", userId, companyId, estremi),
    leggiFonte("email_outbox", "id, subject, to_emails, status, created_at, sent_at", "user_id", "created_at", userId, companyId, estremi),
    leggiFonte("appointments", "id, title, appointment_date, status, contact_id, created_at", "created_by", "created_at", userId, companyId, estremi),
    leggiFonte("tasks", "id, title, status, contact_id, created_at", "created_by", "created_at", userId, companyId, estremi),
    leggiFonte("quotes", "id, title, client_name, status, total, contact_id, created_at", "created_by", "created_at", userId, companyId, estremi),
    leggiFonte("company_activity_log", "id, action, description, target_label, created_at", "user_id", "created_at", userId, companyId, estremi),
  ]);

  const voci: VoceLog[] = [];

  for (const r of sicurezza) {
    const dettagli = r.details && typeof r.details === "object" ? (r.details as Record<string, unknown>) : {};
    const testo = r.action === "crm_exported"
      ? descriviEsportazioneCrm(r.details)
      : Object.entries(dettagli).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k}: ${v}`).join(" • ");
    voci.push({
      id: `sic_${r.id}`, quando: r.created_at, categoria: "sicurezza",
      titolo: ACTION_LABELS[r.action] || r.action, dettaglio: testo || null,
      impersonata: !!r.is_impersonated, azione: r.action,
    });
  }
  for (const r of attivita) {
    // «Nota aggiunta» è già nelle note, con il testo: qui sarebbe un doppione.
    if (r.activity_type === "note_added") continue;
    const v = vocedaAttivitaRegistro(r.activity_type);
    voci.push({ id: `att_${r.id}`, quando: r.created_at, categoria: v.categoria, titolo: v.titolo, dettaglio: r.description, contactId: r.contact_id });
  }
  for (const r of note) {
    if (r.automatica) continue; // scritta dal sistema, non da lui
    voci.push({ id: `nota_${r.id}`, quando: r.created_at, categoria: "note", titolo: "Nota inserita", dettaglio: r.content, contactId: r.contact_id });
  }
  for (const r of chiamate) {
    const esito: Record<string, string> = { answered: "risposta", no_answer: "senza risposta", busy: "occupato", wrong_number: "numero errato", callback: "da richiamare" };
    voci.push({
      id: `cl_${r.id}`, quando: r.started_at, categoria: "chiamate",
      titolo: `Chiamata ${esito[r.outcome] ?? r.outcome ?? "registrata"}`,
      dettaglio: [r.duration_sec ? `durata ${Math.floor(r.duration_sec / 60)}:${String(r.duration_sec % 60).padStart(2, "0")}` : null, r.notes].filter(Boolean).join(" · ") || null,
      contactId: r.contact_id,
    });
  }
  for (const r of chiamateUmane) {
    voci.push({
      id: `hc_${r.id}`, quando: r.started_at, categoria: "chiamate", titolo: "Chiamata dal softphone",
      dettaglio: [r.to_number, r.duration_seconds ? `durata ${Math.floor(r.duration_seconds / 60)}:${String(r.duration_seconds % 60).padStart(2, "0")}` : null, r.status].filter(Boolean).join(" · ") || null,
      contactId: r.contact_id,
    });
  }
  for (const r of email) {
    voci.push({
      id: `em_${r.id}`, quando: r.sent_at ?? r.created_at, categoria: "email", titolo: "Email inviata",
      dettaglio: [Array.isArray(r.to_emails) ? `a ${r.to_emails.join(", ")}` : null, r.subject].filter(Boolean).join(" — ") || null,
    });
  }
  for (const r of appuntamenti) {
    voci.push({
      id: `ap_${r.id}`, quando: r.created_at, categoria: "appuntamenti", titolo: "Appuntamento fissato",
      dettaglio: [r.title, r.appointment_date ? `per il ${format(new Date(r.appointment_date), "dd/MM/yyyy")}` : null].filter(Boolean).join(" · ") || null,
      contactId: r.contact_id,
    });
  }
  for (const r of task) {
    voci.push({ id: `tk_${r.id}`, quando: r.created_at, categoria: "attivita", titolo: "Attività creata", dettaglio: r.title, contactId: r.contact_id });
  }
  for (const r of preventivi) {
    voci.push({
      id: `qt_${r.id}`, quando: r.created_at, categoria: "preventivi", titolo: "Preventivo creato",
      dettaglio: [r.title, r.client_name, r.total != null ? `${Number(r.total).toLocaleString("it-IT")} €` : null].filter(Boolean).join(" · ") || null,
      contactId: r.contact_id,
    });
  }
  for (const r of logAzienda) {
    const v = vocedaLogAzienda(r.action);
    voci.push({ id: `la_${r.id}`, quando: r.created_at, categoria: v.categoria, titolo: v.titolo, dettaglio: [r.target_label, r.description].filter(Boolean).join(" — ") || null });
  }

  const pieno = [sicurezza, attivita, note, chiamate, chiamateUmane, email, appuntamenti, task, preventivi, logAzienda]
    .some((f: any[]) => f.length >= LIMITE_PER_FONTE);
  return { voci: voci.filter((v) => v.quando), troncato: pieno };
}

export function UserActivityLogTab({ userId }: UserActivityLogTabProps) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const [preset, setPreset] = useState<PresetPeriodo>("7");
  const [intervallo, setIntervallo] = useState<Intervallo>(() => intervalloPreset("7"));
  const [categoria, setCategoria] = useState<CategoriaLog | "all">("all");
  const [ricerca, setRicerca] = useState("");

  const scegliPreset = (p: PresetPeriodo) => {
    setPreset(p);
    setIntervallo(intervalloPreset(p));
  };
  const cambiaData = (campo: "da" | "a", valore: string) => {
    setPreset("personalizzato");
    setIntervallo((i) => ({ ...i, [campo]: valore || null }));
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["user-activity-log", companyId, userId, intervallo.da, intervallo.a],
    enabled: !!companyId,
    staleTime: 30_000,
    queryFn: () => caricaLog(userId, companyId!, intervallo),
  });
  const voci = data?.voci ?? [];

  // Nomi dei contatti coinvolti, in una lettura sola.
  const idContatti = useMemo(
    () => [...new Set(voci.map((v) => v.contactId).filter((x): x is string => !!x))].sort().slice(0, 300),
    [voci],
  );
  const { data: nomiContatti } = useQuery({
    queryKey: ["user-activity-log-contatti", companyId, idContatti.join(",")],
    enabled: !!companyId && idContatti.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data: rows } = await supabase.from("marketing_contacts")
        .select("id, first_name, last_name").eq("company_id", companyId!).in("id", idContatti);
      const out: Record<string, string> = {};
      (rows ?? []).forEach((c) => {
        const n = [c.first_name, c.last_name].map((x) => x?.trim()).filter(Boolean).join(" ");
        if (n) out[c.id] = n;
      });
      return out;
    },
  });

  const conteggi = useMemo(() => contaPerCategoria(voci), [voci]);
  const visibili = useMemo(() => {
    const q = ricerca.trim().toLowerCase();
    return voci.filter((v) => {
      if (categoria !== "all" && v.categoria !== categoria) return false;
      if (!q) return true;
      const nome = v.contactId ? nomiContatti?.[v.contactId] ?? "" : "";
      return `${v.titolo} ${v.dettaglio ?? ""} ${nome}`.toLowerCase().includes(q);
    });
  }, [voci, categoria, ricerca, nomiContatti]);
  const gruppi = useMemo(() => raggruppaPerGiorno(visibili), [visibili]);

  const exportCsv = () => {
    if (visibili.length === 0) return;
    const headers = ["Data", "Ora", "Categoria", "Azione", "Contatto", "Dettagli"];
    const etichette = Object.fromEntries(CATEGORIE_LOG.map((c) => [c.chiave, c.etichetta]));
    const rows = [...visibili]
      .sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime())
      .map((v) => [
        format(new Date(v.quando), "dd/MM/yyyy"),
        format(new Date(v.quando), "HH:mm:ss"),
        etichette[v.categoria] ?? v.categoria,
        v.titolo,
        v.contactId ? nomiContatti?.[v.contactId] ?? "" : "",
        v.dettaglio ?? "",
      ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => escapeCsvCell(c, ",")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `log-attivita-${userId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Log Attività</CardTitle>
            <CardDescription>
              {isLoading ? "Carico…" : `${visibili.length} eventi${categoria !== "all" || ricerca ? ` su ${voci.length}` : ""} nel periodo`}
              {isFetching && !isLoading && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={visibili.length === 0}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>

        {/* Periodo: scorciatoie e date a scelta */}
        <div className="flex flex-wrap items-center gap-2">
          {PRESET.map((p) => (
            <Button key={p.chiave} size="sm" variant={preset === p.chiave ? "default" : "outline"} className="h-8" onClick={() => scegliPreset(p.chiave)}>
              {p.etichetta}
            </Button>
          ))}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>dal</span>
            <Input type="date" className="h-8 w-[140px]" value={intervallo.da ?? ""} max={intervallo.a ?? undefined} onChange={(e) => cambiaData("da", e.target.value)} />
            <span>al</span>
            <Input type="date" className="h-8 w-[140px]" value={intervallo.a ?? ""} min={intervallo.da ?? undefined} onChange={(e) => cambiaData("a", e.target.value)} />
          </div>
          <Input placeholder="Cerca nel log…" className="h-8 w-[200px]" value={ricerca} onChange={(e) => setRicerca(e.target.value)} />
        </div>

        {/* Tipo di azione */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategoria("all")}
            className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
              categoria === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:bg-muted")}
          >
            Tutto <span className="tabular-nums opacity-70">{voci.length}</span>
          </button>
          {CATEGORIE_LOG.filter((c) => conteggi[c.chiave] > 0).map((c) => (
            <button
              key={c.chiave}
              type="button"
              onClick={() => setCategoria(c.chiave)}
              className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                categoria === c.chiave ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:bg-muted")}
            >
              {c.etichetta} <span className="tabular-nums opacity-70">{conteggi[c.chiave]}</span>
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {data?.troncato && (
          <p className="mb-3 rounded-md border border-amber-600/30 bg-amber-600/10 px-3 py-2 text-xs text-amber-800">
            Ci sono più di {LIMITE_PER_FONTE} eventi in alcune categorie: restringi le date per vederli tutti.
          </p>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : visibili.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Nessun evento nel periodo scelto.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {gruppi.map((g) => (
              <div key={g.giorno} className="space-y-2">
                <div className="sticky top-0 z-10 bg-background/90 py-1 backdrop-blur">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {etichettaGiorno(g.giorno)} · {g.voci.length}
                  </span>
                </div>
                {g.voci.map((v) => {
                  const nome = v.contactId ? nomiContatti?.[v.contactId] : null;
                  return (
                    <div key={v.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                      <span className="w-11 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                        {format(new Date(v.quando), "HH:mm", { locale: it })}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={COLORE_CATEGORIA[v.categoria]}>{v.titolo}</Badge>
                          {v.impersonata && (
                            <Badge variant="outline" className="bg-amber-600/10 text-amber-700 border-amber-600/20 gap-1">
                              <ShieldAlert className="h-3 w-3" /> Via Impersonazione
                            </Badge>
                          )}
                          {nome && <span className="text-xs font-medium">{nome}</span>}
                        </div>
                        {v.dettaglio && (
                          <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">{v.dettaglio}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
