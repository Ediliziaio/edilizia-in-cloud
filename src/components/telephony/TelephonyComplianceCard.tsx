import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Upload, Loader2, FileCheck2, Send, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";

interface Compliance {
  id?: string;
  ragione_sociale: string | null;
  partita_iva: string | null;
  codice_fiscale: string | null;
  tipo_soggetto: string;
  indirizzo: string | null;
  civico: string | null;
  citta: string | null;
  cap: string | null;
  provincia: string | null;
  paese: string;
  email_contatto: string | null;
  telefono_contatto: string | null;
  doc_identita_path: string | null;
  doc_indirizzo_path: string | null;
  doc_visura_path: string | null;
  stato: string;
  note_revisione: string | null;
}

const EMPTY: Compliance = {
  ragione_sociale: "", partita_iva: "", codice_fiscale: "", tipo_soggetto: "azienda",
  indirizzo: "", civico: "", citta: "", cap: "", provincia: "", paese: "IT",
  email_contatto: "", telefono_contatto: "",
  doc_identita_path: null, doc_indirizzo_path: null, doc_visura_path: null,
  stato: "da_compilare", note_revisione: null,
};

const STATO_META: Record<string, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  da_compilare: { label: "Da compilare", cls: "border-muted-foreground/30 text-muted-foreground", icon: AlertTriangle },
  in_revisione: { label: "In revisione", cls: "border-amber-300 text-amber-700 bg-amber-50", icon: Clock },
  approvato:    { label: "Approvato", cls: "border-emerald-300 text-emerald-700 bg-emerald-50", icon: CheckCircle2 },
  rifiutato:    { label: "Rifiutato", cls: "border-destructive/40 text-destructive bg-destructive/5", icon: AlertTriangle },
};

/**
 * Dati normativi telefonia, compilati DALL'AZIENDA stessa (white-label): ogni azienda
 * inserisce i propri dati e carica i propri documenti → la responsabilità del numero
 * è sua, non della piattaforma. All'invio si crea il requirement group su Telnyx.
 */
export function TelephonyComplianceCard() {
  const companyId = useEffectiveCompanyId();
  const { role } = useAuth();
  const isAdmin = role === "super_admin";
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Compliance>(EMPTY);
  const [uploading, setUploading] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["telephony-compliance", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_telephony_compliance" as never)
        .select("*")
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return (data as unknown as Compliance) ?? null;
    },
  });

  useEffect(() => { if (data) setForm({ ...EMPTY, ...data }); }, [data]);

  const set = (k: keyof Compliance, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const locked = form.stato === "in_revisione" || form.stato === "approvato";

  const save = useMutation({
    mutationFn: async (patch?: Partial<Compliance>) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const row = { company_id: companyId, ...form, ...patch, updated_at: new Date().toISOString() };
      delete (row as Record<string, unknown>).id;
      const { error } = await supabase.from("company_telephony_compliance" as never)
        .upsert(row as never, { onConflict: "company_id" } as never);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["telephony-compliance"] }); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Errore salvataggio"),
  });

  const uploadDoc = async (field: "doc_identita_path" | "doc_indirizzo_path" | "doc_visura_path", file: File) => {
    if (!companyId) return;
    setUploading(field);
    try {
      const ext = file.name.split(".").pop() || "pdf";
      const path = `${companyId}/${field}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("telephony-compliance").upload(path, file, { upsert: true });
      if (error) throw error;
      setForm((f) => ({ ...f, [field]: path }));
      await save.mutateAsync({ [field]: path } as Partial<Compliance>);
      toast.success("Documento caricato");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore caricamento documento");
    } finally {
      setUploading(null);
    }
  };

  const submit = useMutation({
    mutationFn: async () => {
      // Validazione minima lato client.
      const missing: string[] = [];
      if (!form.ragione_sociale) missing.push("Ragione sociale");
      if (!form.partita_iva) missing.push("Partita IVA");
      if (!form.indirizzo || !form.citta || !form.cap) missing.push("Indirizzo completo");
      if (!form.doc_identita_path) missing.push("Documento d'identità");
      if (!form.doc_indirizzo_path) missing.push("Prova di indirizzo");
      if (missing.length) throw new Error("Mancano: " + missing.join(", "));
      await save.mutateAsync({ stato: "in_revisione", inviato_il: new Date().toISOString() } as Partial<Compliance>);
      // Crea il requirement group su Telnyx (intestato a QUESTA azienda).
      const { data, error } = await supabase.functions.invoke("telnyx-requirement-group", {
        body: { company_id: companyId, action: "submit" },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error?: string }).error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telephony-compliance"] });
      toast.success("Dati inviati a Telnyx per la validazione");
    },
    onError: (e: unknown) => {
      queryClient.invalidateQueries({ queryKey: ["telephony-compliance"] });
      toast.error(e instanceof Error ? e.message : "Errore invio");
    },
  });

  // Revisione super_admin: approva/rifiuta la riga dell'azienda.
  const review = useMutation({
    mutationFn: async ({ stato, nota }: { stato: "approvato" | "rifiutato"; nota?: string }) => {
      const { error } = await supabase.from("company_telephony_compliance" as never)
        .update({ stato, note_revisione: nota ?? null, updated_at: new Date().toISOString() } as never)
        .eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["telephony-compliance"] }); toast.success("Stato aggiornato"); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Errore revisione"),
  });

  const viewDoc = async (path: string | null) => {
    if (!path) return;
    const { data } = await supabase.storage.from("telephony-compliance").createSignedUrl(path, 120);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  };

  const meta = STATO_META[form.stato] ?? STATO_META.da_compilare;
  const StatoIcon = meta.icon;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Dati normativi azienda
          </CardTitle>
          <CardDescription>
            Per acquistare numeri italiani la tua azienda deve fornire i propri dati e documenti.
            La titolarità del numero è della tua azienda.
          </CardDescription>
        </div>
        <Badge variant="outline" className={`shrink-0 gap-1 ${meta.cls}`}>
          <StatoIcon className="h-3.5 w-3.5" /> {meta.label}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {form.stato === "rifiutato" && form.note_revisione && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <strong>Rifiutato:</strong> {form.note_revisione} — correggi e reinvia.
          </div>
        )}
        {form.stato === "approvato" && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            ✓ Dati approvati: puoi acquistare numeri italiani per la tua azienda.
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <fieldset disabled={locked} className="space-y-4 disabled:opacity-70">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Ragione sociale *"><Input value={form.ragione_sociale ?? ""} onChange={(e) => set("ragione_sociale", e.target.value)} /></Field>
              <Field label="Partita IVA *"><Input value={form.partita_iva ?? ""} onChange={(e) => set("partita_iva", e.target.value)} placeholder="IT01234567890" /></Field>
              <Field label="Codice fiscale"><Input value={form.codice_fiscale ?? ""} onChange={(e) => set("codice_fiscale", e.target.value)} /></Field>
              <Field label="Email di contatto"><Input value={form.email_contatto ?? ""} onChange={(e) => set("email_contatto", e.target.value)} type="email" /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-6">
              <div className="sm:col-span-4"><Field label="Indirizzo *"><Input value={form.indirizzo ?? ""} onChange={(e) => set("indirizzo", e.target.value)} /></Field></div>
              <div className="sm:col-span-2"><Field label="Civico"><Input value={form.civico ?? ""} onChange={(e) => set("civico", e.target.value)} /></Field></div>
              <div className="sm:col-span-2"><Field label="Città *"><Input value={form.citta ?? ""} onChange={(e) => set("citta", e.target.value)} /></Field></div>
              <div className="sm:col-span-1"><Field label="CAP *"><Input value={form.cap ?? ""} onChange={(e) => set("cap", e.target.value)} /></Field></div>
              <div className="sm:col-span-1"><Field label="Prov."><Input value={form.provincia ?? ""} onChange={(e) => set("provincia", e.target.value)} maxLength={2} /></Field></div>
              <div className="sm:col-span-2"><Field label="Paese"><Input value={form.paese ?? "IT"} onChange={(e) => set("paese", e.target.value)} maxLength={2} /></Field></div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <DocUpload label="Documento titolare *" path={form.doc_identita_path} busy={uploading === "doc_identita_path"} onPick={(f) => uploadDoc("doc_identita_path", f)} />
              <DocUpload label="Prova indirizzo *" path={form.doc_indirizzo_path} busy={uploading === "doc_indirizzo_path"} onPick={(f) => uploadDoc("doc_indirizzo_path", f)} />
              <DocUpload label="Visura/CCIAA" path={form.doc_visura_path} busy={uploading === "doc_visura_path"} onPick={(f) => uploadDoc("doc_visura_path", f)} />
            </div>
          </fieldset>
        )}

        {/* Revisione piattaforma (solo super_admin) */}
        {isAdmin && data && (
          <div className="rounded-lg border border-dashed bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Revisione piattaforma (super_admin)</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => viewDoc(form.doc_identita_path)} disabled={!form.doc_identita_path}>Documento identità</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => viewDoc(form.doc_indirizzo_path)} disabled={!form.doc_indirizzo_path}>Prova indirizzo</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => viewDoc(form.doc_visura_path)} disabled={!form.doc_visura_path}>Visura</Button>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => review.mutate({ stato: "approvato" })} disabled={review.isPending}>Approva</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs border-destructive/40 text-destructive" onClick={() => { const n = window.prompt("Motivo del rifiuto:") || "Documenti non validi"; review.mutate({ stato: "rifiutato", nota: n }); }} disabled={review.isPending}>Rifiuta</Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          {!locked && (
            <Button variant="outline" size="sm" onClick={() => save.mutate(undefined, { onSuccess: () => toast.success("Salvato") })} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null} Salva bozza
            </Button>
          )}
          {form.stato !== "approvato" && (
            <Button size="sm" onClick={() => submit.mutate()} disabled={submit.isPending || locked}>
              {submit.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              {form.stato === "in_revisione" ? "In revisione…" : "Invia per validazione"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function DocUpload({ label, path, busy, onPick }: { label: string; path: string | null; busy: boolean; onPick: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <input ref={ref} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }} />
      <Button type="button" variant="outline" size="sm" className="w-full justify-start font-normal" onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : path ? <FileCheck2 className="h-4 w-4 mr-2 text-emerald-600" /> : <Upload className="h-4 w-4 mr-2" />}
        {path ? "Caricato — sostituisci" : "Carica file"}
      </Button>
    </div>
  );
}
