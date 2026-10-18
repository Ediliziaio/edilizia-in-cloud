/**
 * Cantiere → «Ufficio»: le fasi d'ufficio della commessa in ordine — contratto, misure, ordini,
 * pratiche, detrazioni, SAL e fatture, consegna — ognuna con chi la fa, la scadenza e lo stato.
 * Sono attività vere (tasks con activity_scope «ufficio»): ognuno le ritrova nelle sue Attività.
 * Una fase può aspettare un'altra attività o una fase del cantiere; quando quella si chiude
 * si sblocca da sola (trigger nel database) e avvisa chi la deve fare.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { CheckCircle2, Circle, Clock, Hourglass, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { campoWorkDay } from "@/lib/campo/workDay";
import { messaggioErrore } from "@/lib/campo/messaggioErrore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlaybookEditorDialog } from "@/components/orders/PlaybookEditorDialog";

// Colonne nuove (activity_scope, attende_fase_id) non ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface FaseUfficio {
  id: string;
  title: string;
  status: "da_fare" | "in_corso" | "in_attesa" | "completata" | string;
  due_date: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  ufficio_id: string | null;
  sort_order: number | null;
  bloccata_da_task_id: string | null;
  attende_fase_id: string | null;
}

export const chiaveFasiUfficio = (orderId: string) => ["commessa-fasi-ufficio", orderId] as const;

/** In ritardo: non completata e scadenza passata. */
export function inRitardo(f: Pick<FaseUfficio, "status" | "due_date">, oggi = campoWorkDay()): boolean {
  return f.status !== "completata" && !!f.due_date && f.due_date < oggi;
}

export function FasiUfficio({ orderId }: { orderId: string }) {
  const { effectiveCompany, user, role } = useAuth();
  const permissions = usePermissions();
  const companyId = effectiveCompany?.id;
  const puoModificare = role === "company_admin" || role === "super_admin" || !!permissions.canEditOrders;
  const qc = useQueryClient();
  const [nuova, setNuova] = useState<{ titolo: string; scadenza: string; responsabile: string } | null>(null);
  const [modifica, setModifica] = useState<string | null>(null);
  const [configura, setConfigura] = useState(false);

  const fasi = useQuery({
    queryKey: chiaveFasiUfficio(orderId),
    enabled: !!orderId && !!companyId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db.from("tasks")
        .select("id, title, status, due_date, completed_at, assigned_to, ufficio_id, sort_order, bloccata_da_task_id, attende_fase_id")
        .eq("order_id", orderId).eq("activity_scope", "ufficio")
        .order("sort_order", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true });
      if (error) throw error;
      const righe = (data ?? []) as FaseUfficio[];
      const persone = [...new Set(righe.map((r) => r.assigned_to).filter(Boolean))] as string[];
      const uffici = [...new Set(righe.map((r) => r.ufficio_id).filter(Boolean))] as string[];
      const fasiCantiere = [...new Set(righe.map((r) => r.attende_fase_id).filter(Boolean))] as string[];
      const [p, u, fc] = await Promise.all([
        persone.length ? supabase.from("profiles").select("id, first_name, last_name").in("id", persone) : Promise.resolve({ data: [] }),
        uffici.length ? db.from("company_uffici").select("id, nome").in("id", uffici) : Promise.resolve({ data: [] }),
        fasiCantiere.length ? db.from("order_work_phases").select("id, name").in("id", fasiCantiere) : Promise.resolve({ data: [] }),
      ]);
      return {
        righe,
        nomePersona: new Map(((p.data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>).map((x) => [x.id, [x.first_name, x.last_name].filter(Boolean).join(" ")])),
        nomeUfficio: new Map(((u.data ?? []) as Array<{ id: string; nome: string }>).map((x) => [x.id, x.nome])),
        nomeFaseCantiere: new Map(((fc.data ?? []) as Array<{ id: string; name: string }>).map((x) => [x.id, x.name])),
      };
    },
  });

  const persone = useQuery({
    queryKey: ["commessa-persone-ufficio", companyId],
    enabled: !!companyId && (!!nuova || !!modifica),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("get_internal_chat_profiles", { p_company_id: companyId });
      if (error) throw error;
      return ((data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; roles: string[] }>)
        .filter((x) => x.roles.some((r) => ["company_admin", "company_staff", "salesperson", "call_center"].includes(r)));
    },
  });

  const aggiorna = () => { void qc.invalidateQueries({ queryKey: chiaveFasiUfficio(orderId) }); void qc.invalidateQueries({ queryKey: ["tasks"] }); };
  const cambia = useMutation({
    mutationFn: async ({ f, completa }: { f: FaseUfficio; completa: boolean }) => {
      const { data, error } = await db.from("tasks").update(completa
        ? { status: "completata", completed_at: new Date().toISOString(), assigned_to: f.assigned_to ?? (f.ufficio_id ? null : user?.id ?? null) }
        : { status: "da_fare", completed_at: null }).eq("id", f.id).select("id");
      if (error) throw error;
      // Nessuna riga toccata = nessun permesso: lo si dice, invece di «salvato».
      if (!data || data.length === 0) throw new Error("Non puoi modificare questa fase: chiedi a chi segue la commessa.");
    },
    onSuccess: (_d, v) => { toast.success(v.completa ? "Fase completata: la successiva è sbloccata" : "Fase riaperta"); aggiorna(); },
    onError: (e) => toast.error(messaggioErrore(e, "Non sono riuscito a salvare la fase.")),
  });
  const correggi = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { assigned_to?: string | null; due_date?: string | null } }) => {
      const { data, error } = await db.from("tasks").update(patch).eq("id", id).eq("activity_scope", "ufficio").select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Non puoi modificare questa fase: chiedi a chi segue la commessa.");
    },
    onSuccess: () => aggiorna(),
    onError: (e) => toast.error(messaggioErrore(e, "Non sono riuscito a salvare.")),
  });
  const aggiungi = useMutation({
    mutationFn: async () => {
      if (!nuova?.titolo.trim()) throw new Error("Scrivi cosa c'è da fare");
      const ultima = Math.max(0, ...(fasi.data?.righe ?? []).map((r) => r.sort_order ?? 0));
      const { error } = await db.from("tasks").insert({
        company_id: companyId, order_id: orderId, title: nuova.titolo.trim(), status: "da_fare",
        due_date: nuova.scadenza || null, assigned_to: nuova.responsabile || user?.id, created_by: user?.id,
        priority: "normale", category: "ordini", activity_scope: "ufficio", sort_order: ultima + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Fase d’ufficio aggiunta"); setNuova(null); aggiorna(); },
    onError: (e) => toast.error(messaggioErrore(e, "Non sono riuscito ad aggiungere la fase.")),
  });

  const d = fasi.data;
  const righe = d?.righe ?? [];
  const fatte = righe.filter((r) => r.status === "completata").length;
  const oggi = campoWorkDay();
  const titoloDi = (id: string | null) => righe.find((r) => r.id === id)?.title;

  return (
    <section className="space-y-3 rounded-xl border bg-white p-4" aria-labelledby="fasi-ufficio-titolo">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="fasi-ufficio-titolo" className="font-semibold">Fasi dell’ufficio</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {righe.length > 0 ? `${fatte} di ${righe.length} fatte.` : "Il lavoro d’ufficio di questa commessa, in ordine, con chi lo fa."}
          </p>
        </div>
        {puoModificare && !nuova && <Button size="sm" className="gap-1.5" onClick={() => setNuova({ titolo: "", scadenza: "", responsabile: "" })}><Plus className="h-4 w-4" />Aggiungi fase d’ufficio</Button>}
      </div>

      {righe.length > 0 && (
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((fatte / righe.length) * 100)}%` }} />
        </div>
      )}

      {fasi.isError ? <p role="alert" className="text-sm text-destructive">Non riesco a leggere le fasi d’ufficio. <button className="underline" onClick={() => void fasi.refetch()}>Riprova</button></p>
        : fasi.isLoading ? <p className="text-sm text-muted-foreground">Carico…</p>
        : righe.length === 0 && !nuova ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nessuna fase d’ufficio. Si creano da sole applicando il flusso di lavoro dell’azienda, oppure le aggiungi qui.</p>
        : (
          <ol className="space-y-1.5">
            {righe.map((f, i) => {
              const fatta = f.status === "completata";
              const attesa = f.status === "in_attesa";
              const ritardo = inRitardo(f, oggi);
              const chi = f.ufficio_id ? d?.nomeUfficio.get(f.ufficio_id) ?? "Ufficio" : f.assigned_to ? d?.nomePersona.get(f.assigned_to) || "Persona" : "Nessuno";
              const motivoAttesa = f.attende_fase_id ? `il cantiere: «${d?.nomeFaseCantiere.get(f.attende_fase_id) ?? "fase"}»` : f.bloccata_da_task_id ? `«${titoloDi(f.bloccata_da_task_id) ?? "fase precedente"}»` : null;
              return (
                <li key={f.id} className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 ${fatta ? "bg-muted/30" : ritardo ? "border-red-200 bg-red-50/40" : ""}`}>
                  <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                  {fatta ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : attesa ? <Hourglass className="h-5 w-5 shrink-0 text-muted-foreground" /> : <Circle className="h-5 w-5 shrink-0 text-primary" />}
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${fatta ? "text-muted-foreground line-through" : ""}`}>{f.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {chi}
                      {attesa && motivoAttesa ? ` · aspetta ${motivoAttesa}` : ""}
                      {!fatta && f.due_date ? <> · <span className={ritardo ? "font-semibold text-red-700" : ""}><Clock className="mr-0.5 inline h-3 w-3" />entro il {format(parseISO(f.due_date), "d MMM", { locale: it })}</span></> : ""}
                      {fatta && f.completed_at ? ` · fatta il ${format(parseISO(f.completed_at), "d MMM", { locale: it })}` : ""}
                    </p>
                  </div>
                  {puoModificare && !fatta && <Button size="sm" variant="ghost" onClick={() => setModifica(modifica === f.id ? null : f.id)}>{modifica === f.id ? "Chiudi" : "Cambia"}</Button>}
                  {puoModificare && !attesa && (fatta
                    ? <Button size="sm" variant="ghost" className="gap-1" disabled={cambia.isPending} onClick={() => cambia.mutate({ f, completa: false })}><RotateCcw className="h-3.5 w-3.5" />Riapri</Button>
                    : <Button size="sm" variant="outline" disabled={cambia.isPending} onClick={() => cambia.mutate({ f, completa: true })}>Fatta</Button>)}
                  {modifica === f.id && (
                    <div className="flex w-full flex-wrap items-center gap-2 pl-8">
                      <select aria-label={`Chi fa: ${f.title}`} value={f.assigned_to ?? ""} disabled={correggi.isPending}
                        onChange={(e) => correggi.mutate({ id: f.id, patch: { assigned_to: e.target.value || null } })}
                        className="h-9 rounded-md border bg-background px-2 text-sm">
                        <option value="">{f.ufficio_id ? "L’ufficio" : "Da assegnare"}</option>
                        {(persone.data ?? []).map((p) => <option key={p.id} value={p.id}>{[p.first_name, p.last_name].filter(Boolean).join(" ")}</option>)}
                      </select>
                      <Input aria-label={`Entro il: ${f.title}`} type="date" className="h-9 w-40" value={f.due_date ?? ""} disabled={correggi.isPending || attesa}
                        onChange={(e) => correggi.mutate({ id: f.id, patch: { due_date: e.target.value || null } })} />
                      {attesa && <span className="text-xs text-muted-foreground">La scadenza parte quando si sblocca.</span>}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

      {puoModificare && permissions.canEditSettingsOrders && (
        <>
          <button type="button" className="text-sm text-primary underline underline-offset-4" onClick={() => setConfigura(true)}>Configura le fasi d’ufficio dell’azienda (flusso di lavoro)</button>
          {companyId && <PlaybookEditorDialog open={configura} onOpenChange={setConfigura} companyId={companyId} />}
        </>
      )}
      {nuova && (
        <form className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[1fr_auto_auto_auto]" onSubmit={(e) => { e.preventDefault(); aggiungi.mutate(); }}>
          <Input autoFocus aria-label="Cosa c'è da fare" placeholder="Es. Pratica ENEA, Ordine serramenti…" value={nuova.titolo} onChange={(e) => setNuova({ ...nuova, titolo: e.target.value })} />
          <select aria-label="Chi la fa" value={nuova.responsabile} onChange={(e) => setNuova({ ...nuova, responsabile: e.target.value })} className="h-10 rounded-md border bg-background px-2 text-sm">
            <option value="">Io</option>
            {(persone.data ?? []).map((p) => <option key={p.id} value={p.id}>{[p.first_name, p.last_name].filter(Boolean).join(" ")}</option>)}
          </select>
          <Input aria-label="Entro il" type="date" value={nuova.scadenza} onChange={(e) => setNuova({ ...nuova, scadenza: e.target.value })} className="w-40" />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={aggiungi.isPending || !nuova.titolo.trim()}>Aggiungi</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setNuova(null)}>Annulla</Button>
          </div>
        </form>
      )}
    </section>
  );
}

/** Panoramica: una riga sola — quante fasi d'ufficio sono fatte, la prossima e chi la fa. */
export function RiepilogoFasiUfficio({ orderId, onOpen }: { orderId: string; onOpen: () => void }) {
  const { effectiveCompany } = useAuth();
  const q = useQuery({
    queryKey: [...chiaveFasiUfficio(orderId), "riepilogo"],
    enabled: !!orderId && !!effectiveCompany?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.from("tasks").select("id, title, status, due_date, sort_order")
        .eq("order_id", orderId).eq("activity_scope", "ufficio")
        .order("sort_order", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<Pick<FaseUfficio, "id" | "title" | "status" | "due_date" | "sort_order">>;
    },
  });
  const righe = q.data ?? [];
  if (q.isError || righe.length === 0) return null;
  const fatte = righe.filter((r) => r.status === "completata").length;
  const prossima = righe.find((r) => r.status !== "completata" && r.status !== "in_attesa") ?? righe.find((r) => r.status !== "completata");
  const ritardo = righe.filter((r) => inRitardo(r)).length;
  return (
    <button type="button" onClick={onOpen} className="mb-4 flex w-full items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 text-left hover:bg-muted/40">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">Ufficio · {fatte} di {righe.length} fasi fatte{ritardo > 0 ? ` · ${ritardo} in ritardo` : ""}</span>
        {prossima && <span className="block truncate text-xs text-muted-foreground">Prossima: {prossima.title}</span>}
      </span>
      <span className="shrink-0 text-xs text-primary underline">Apri</span>
    </button>
  );
}
