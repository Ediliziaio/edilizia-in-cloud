/**
 * Tab "Candidati" — banca dati + pipeline di selezione.
 *
 * Due viste sugli stessi candidati: la PIPELINE (kanban a fasi
 * personalizzabili: primo colloquio, secondo colloquio, prova in
 * cantiere…) per chi sta selezionando ORA, e l'ELENCO per ruolo che fa
 * da banca dati quando una ricerca si riapre. La fase dice dove sei nel
 * processo; l'esito (assunto / non idoneo / archivio) come è finita.
 */
import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

// Il test attitudinale è PARTE della selezione: vive qui come terza vista
// (resta un chunk separato: 500KB di report/grafici caricati solo se serve).
const TabSelezioni = lazy(() => import("./TabSelezioni").then((m) => ({ default: m.TabSelezioni })));
import { toast } from "sonner";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { uploadHrFile, getHrFileUrl } from "@/hooks/useHrDocumenti";
import {
  useHrCandidati, useUpsertCandidato, useDeleteCandidato,
  useColloquiCandidato, useAddColloquio, useDeleteColloquio,
  useFasiSelezione, useUpsertFase, useDeleteFase, useScambiaFasi, useSpostaFase, useAssumiCandidato,
  useCandidaturaForms, useUpsertCandidaturaForm, useDeleteCandidaturaForm, type CandidaturaForm, type StatoCampoModulo,
  STATI_CANDIDATO, FONTI_CANDIDATO, TIPI_COLLOQUIO, ESITI_COLLOQUIO,
  type HrCandidato, type CandidatoStato, type CandidatoFonte, type ColloquioTipo, type ColloquioEsito, type FaseSelezione,
} from "@/hooks/useHrCandidati";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowDown, ArrowUp, BrainCircuit, CalendarCheck, Copy, Download, ExternalLink, FileText, Globe,
  HardHat, KanbanSquare, Link2, List, Mail, MapPin, Phone, Plus, Search, Settings2, Star, Trash2,
  ShieldCheck, Upload, UserRoundSearch, Users, XCircle, CheckCircle2, Archive,
} from "lucide-react";

const RUOLI_SUGGERITI = [
  "Muratore", "Manovale", "Capocantiere", "Posatore serramenti", "Carpentiere",
  "Elettricista", "Idraulico", "Imbianchino", "Geometra", "Impiegato/a ufficio",
  "Commerciale", "Altro",
];

type Esito = "in_selezione" | "assunto" | "scartato" | "archiviato";
/** L'esito riassume lo stato: i valori legacy di processo contano come "in selezione". */
const esitoDi = (c: HrCandidato): Esito =>
  c.stato === "assunto" || c.stato === "scartato" || c.stato === "archiviato" ? c.stato : "in_selezione";

const ESITI: Record<Esito, { label: string; classe: string }> = {
  in_selezione: { label: "In selezione", classe: "bg-blue-100 text-blue-700" },
  assunto: STATI_CANDIDATO.assunto,
  scartato: STATI_CANDIDATO.scartato,
  archiviato: STATI_CANDIDATO.archiviato,
};

function Stelle({ valore, onChange, size = "h-4 w-4" }: { valore: number | null; onChange?: (v: number | null) => void; size?: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={(e) => { e.stopPropagation(); onChange?.(valore === n ? null : n); }}
          className={onChange ? "cursor-pointer" : "cursor-default"}
          aria-label={`${n} stelle`}
        >
          <Star className={`${size} ${valore != null && n <= valore ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
        </button>
      ))}
    </div>
  );
}

/** Ruolo a testo libero coi suggerimenti: ogni impresa chiama i ruoli a modo suo. */
function CampoRuolo({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <>
      <Input id={id} list="ruoli-suggeriti" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Es. Muratore" />
      <datalist id="ruoli-suggeriti">{RUOLI_SUGGERITI.map((r) => <option key={r} value={r} />)}</datalist>
    </>
  );
}

function NuovoCandidatoDialog({ open, onOpenChange, fasi, onCreato }: { open: boolean; onOpenChange: (v: boolean) => void; fasi: FaseSelezione[]; onCreato: (c: HrCandidato) => void }) {
  const upsert = useUpsertCandidato();
  const [form, setForm] = useState({ nome: "", cognome: "", ruolo: "", email: "", telefono: "", citta: "", fonte: "manuale" as CandidatoFonte });
  const salva = async () => {
    if (!form.nome.trim()) { toast.error("Serve almeno il nome"); return; }
    const creato = await upsert.mutateAsync({
      nome: form.nome.trim(),
      cognome: form.cognome.trim(),
      ruolo: form.ruolo.trim() || "Altro",
      email: form.email.trim() || null,
      telefono: form.telefono.trim() || null,
      citta: form.citta.trim() || null,
      fonte: form.fonte,
      stato: "in_valutazione",
      fase_id: fasi[0]?.id ?? null, // entra dalla prima fase della pipeline
    });
    toast.success("Candidato inserito");
    setForm({ nome: "", cognome: "", ruolo: form.ruolo, email: "", telefono: "", citta: "", fonte: form.fonte });
    onOpenChange(false);
    onCreato(creato);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nuovo candidato</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label htmlFor="cand-nome">Nome *</Label><Input id="cand-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div><Label htmlFor="cand-cognome">Cognome</Label><Input id="cand-cognome" value={form.cognome} onChange={(e) => setForm({ ...form, cognome: e.target.value })} /></div>
          </div>
          <div><Label htmlFor="cand-ruolo">Ruolo cercato</Label><CampoRuolo id="cand-ruolo" value={form.ruolo} onChange={(v) => setForm({ ...form, ruolo: v })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label htmlFor="cand-tel">Telefono</Label><Input id="cand-tel" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></div>
            <div><Label htmlFor="cand-email">Email</Label><Input id="cand-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label htmlFor="cand-citta">Città</Label><Input id="cand-citta" value={form.citta} onChange={(e) => setForm({ ...form, citta: e.target.value })} /></div>
            <div>
              <Label>Come è arrivato</Label>
              <Select value={form.fonte} onValueChange={(v) => setForm({ ...form, fonte: v as CandidatoFonte })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(FONTI_CANDIDATO).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button variant="brand" onClick={salva} disabled={upsert.isPending}>Aggiungi</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Moduli di candidatura pubblici: il link da mettere sul sito o nell'annuncio. */
function ModuliSitoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: moduli = [], isLoading } = useCandidaturaForms();
  const upsert = useUpsertCandidaturaForm();
  const del = useDeleteCandidaturaForm();
  const [titolo, setTitolo] = useState("");
  const [ruoli, setRuoli] = useState("");
  const linkDi = (m: CandidaturaForm) => `${window.location.origin}/candidatura/${m.token}`;
  const copia = async (m: CandidaturaForm) => {
    try {
      await navigator.clipboard.writeText(linkDi(m));
      toast.success("Link copiato: incollalo sul sito o nell'annuncio");
    } catch {
      toast.error("Copia non riuscita", { description: linkDi(m) });
    }
  };
  // Stesso pattern dell'embed dei moduli lead: iframe pronto da incollare.
  const copiaEmbed = async (m: CandidaturaForm) => {
    const snippet = `<iframe src="${linkDi(m)}?embed=1" title="${m.titolo.replace(/"/g, "&quot;")}" width="100%" height="760" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" style="width:100%;min-height:760px;border:0;max-width:640px;margin:0 auto;display:block;border-radius:12px;overflow:hidden;"></iframe>`;
    try {
      await navigator.clipboard.writeText(snippet);
      toast.success("Codice embed copiato: incollalo nell'HTML del sito");
    } catch {
      toast.error("Copia non riuscita");
    }
  };
  const crea = () => {
    if (!titolo.trim()) { toast.error("Dai un titolo al modulo (es. Lavora con noi)"); return; }
    upsert.mutate({
      titolo: titolo.trim(),
      descrizione: null,
      ruoli: ruoli.split(",").map((r) => r.trim()).filter(Boolean),
    });
    setTitolo("");
    setRuoli("");
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Moduli di candidatura per il tuo sito</DialogTitle></DialogHeader>
        <p className="-mt-2 text-xs text-muted-foreground">
          Crea il modulo e metti il link sul tuo sito o nell'annuncio: chi si candida
          finisce qui dentro, in prima fase, col CV allegato. Spegnendo il modulo il link smette di funzionare.
        </p>
        {isLoading ? <Skeleton className="h-16 w-full" /> : moduli.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Nessun modulo ancora: creane uno qui sotto.</p>
        ) : (
          <div className="space-y-2">
            {moduli.map((m) => (
              <div key={m.id} className="rounded-lg border p-2.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Globe className={`h-4 w-4 shrink-0 ${m.attivo ? "text-emerald-500" : "text-slate-300"}`} />
                  <p className="flex-1 truncate text-sm font-semibold">{m.titolo}</p>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">{m.total_submissions} candidature · {m.total_views} visite</span>
                </div>
                {m.ruoli.length > 0 && (
                  <p className="text-[11px] text-muted-foreground truncate">Ruoli proposti: {m.ruoli.join(", ")}</p>
                )}
                {/* Ogni impresa decide cosa chiedere: obbligatorio, facoltativo o via. */}
                <details className="rounded border bg-slate-50/60 px-2 py-1">
                  <summary className="cursor-pointer text-[11px] font-medium text-slate-600">Campi del modulo</summary>
                  <div className="grid grid-cols-1 gap-1 py-1.5 sm:grid-cols-2">
                    {([["cognome", "Cognome"], ["telefono", "Telefono"], ["email", "Email"], ["citta", "Città"], ["ruolo", "Ruolo"], ["messaggio", "Presentazione"], ["cv", "Curriculum"]] as const).map(([campo, label]) => {
                      const valore: StatoCampoModulo = m.campi?.[campo] ?? (campo === "telefono" ? "obbligatorio" : "facoltativo");
                      return (
                        <label key={campo} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-slate-600">{label}</span>
                          <select
                            className="h-6 rounded border bg-white px-1 text-[11px]"
                            value={valore}
                            onChange={(e) => upsert.mutate({ id: m.id, titolo: m.titolo, campi: { [campo]: e.target.value as StatoCampoModulo } })}
                          >
                            <option value="obbligatorio">Obbligatorio</option>
                            <option value="facoltativo">Facoltativo</option>
                            <option value="nascosto">Nascosto</option>
                          </select>
                        </label>
                      );
                    })}
                  </div>
                  <p className="pb-1 text-[10px] text-muted-foreground">Il nome è sempre obbligatorio; serve comunque almeno un contatto (telefono o email).</p>
                  <div className="flex flex-wrap items-center gap-3 border-t py-1.5">
                    <span className="text-[11px] font-medium text-slate-600">Aspetto:</span>
                    <label className="flex items-center gap-1 text-[11px] text-slate-600">
                      Testata
                      <input
                        type="color"
                        value={m.stile?.testata ?? "#F97316"}
                        onChange={(e) => upsert.mutate({ id: m.id, titolo: m.titolo, stile: { testata: e.target.value } })}
                        className="h-5 w-6 cursor-pointer rounded border bg-transparent p-0"
                        aria-label="Colore testata"
                      />
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-slate-600">
                      Bottone
                      <input
                        type="color"
                        value={m.stile?.bottone ?? "#F97316"}
                        onChange={(e) => upsert.mutate({ id: m.id, titolo: m.titolo, stile: { bottone: e.target.value } })}
                        className="h-5 w-6 cursor-pointer rounded border bg-transparent p-0"
                        aria-label="Colore bottone"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      <input
                        type="checkbox"
                        checked={m.stile?.mostra_azienda === true}
                        onChange={(e) => upsert.mutate({ id: m.id, titolo: m.titolo, stile: { mostra_azienda: e.target.checked } })}
                      />
                      Mostra nome azienda
                    </label>
                  </div>
                </details>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => copia(m)}>
                    <Copy className="h-3 w-3" /> Copia link
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => copiaEmbed(m)}>
                    <Copy className="h-3 w-3" /> Copia embed
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => window.open(linkDi(m), "_blank")}>
                    <ExternalLink className="h-3 w-3" /> Anteprima
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => upsert.mutate({ id: m.id, titolo: m.titolo, attivo: !m.attivo })}
                  >
                    {m.attivo ? "Spegni" : "Riattiva"}
                  </Button>
                  <button
                    type="button"
                    className="ml-auto text-slate-400 hover:text-destructive"
                    aria-label={`Elimina modulo ${m.titolo}`}
                    onClick={() => { if (window.confirm(`Eliminare il modulo "${m.titolo}"? Il link smette di funzionare.`)) del.mutate(m.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nuovo modulo</p>
          <Input placeholder="Titolo (es. Lavora con noi — Cerchiamo muratori)" value={titolo} onChange={(e) => setTitolo(e.target.value)} />
          <Input placeholder="Ruoli proposti, separati da virgola (vuoto = campo libero)" value={ruoli} onChange={(e) => setRuoli(e.target.value)} />
          <div className="flex justify-end">
            <Button size="sm" variant="brand" className="gap-1" disabled={upsert.isPending} onClick={crea}>
              <Plus className="h-3.5 w-3.5" /> Crea modulo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Pulizia privacy: i CV sono dati personali — i candidati CHIUSI (non
 *  idonei / in archivio) fermi da oltre la soglia si eliminano in blocco,
 *  curriculum compreso. Assunti e selezioni in corso non si toccano MAI. */
function PuliziaPrivacyDialog({ open, onOpenChange, candidati }: { open: boolean; onOpenChange: (v: boolean) => void; candidati: HrCandidato[] }) {
  const qc = useQueryClient();
  const [mesi, setMesi] = useState(12);
  const [confermaAperta, setConfermaAperta] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const soglia = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - mesi);
    return d.toISOString();
  }, [mesi]);
  const daEliminare = useMemo(
    () => candidati.filter((c) => {
      const es = esitoDi(c);
      return (es === "scartato" || es === "archiviato") && c.updated_at < soglia;
    }),
    [candidati, soglia],
  );

  const elimina = async () => {
    if (eliminando || daEliminare.length === 0) return;
    setEliminando(true);
    try {
      const percorsiCv = daEliminare.map((c) => c.cv_path).filter((p): p is string => !!p);
      if (percorsiCv.length > 0) {
        // Prima i file: un record senza CV è un dato orfano, un CV senza
        // record è una violazione che nessuno vede più.
        const { error: stErr } = await supabase.storage.from("hr-documenti").remove(percorsiCv);
        if (stErr) throw new Error(`CV non eliminati dallo storage: ${stErr.message}`);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("hr_candidati").delete().in("id", daEliminare.map((c) => c.id));
      if (error) throw error;
      toast.success(`${daEliminare.length} candidati eliminati (con ${percorsiCv.length} CV)`);
      qc.invalidateQueries({ queryKey: ["hr-candidati"] });
      setConfermaAperta(false);
      onOpenChange(false);
    } catch (e) {
      toast.error("Pulizia non completata", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setEliminando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Pulizia privacy — candidati chiusi</DialogTitle></DialogHeader>
        <p className="-mt-2 text-xs text-muted-foreground">
          I CV sono dati personali: la prassi è non tenerli oltre i 12 mesi dalla chiusura
          della selezione, salvo consenso. Qui si eliminano SOLO i candidati con esito
          "Non idoneo" o "In archivio": assunti e selezioni in corso non si toccano.
        </p>
        <div className="flex items-center gap-2">
          <Label className="text-xs shrink-0">Chiusi da più di</Label>
          <Select value={String(mesi)} onValueChange={(v) => setMesi(Number(v))}>
            <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="12">12 mesi</SelectItem>
              <SelectItem value="18">18 mesi</SelectItem>
              <SelectItem value="24">24 mesi</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {daEliminare.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            Nessun candidato chiuso da più di {mesi} mesi: sei in regola.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800">{daEliminare.length} candidati da eliminare:</p>
            <div className="max-h-40 overflow-y-auto rounded-lg border p-2 text-xs text-slate-600 space-y-0.5">
              {daEliminare.slice(0, 12).map((c) => (
                <p key={c.id}>{c.nome} {c.cognome} — {c.ruolo}{c.cv_path ? " (con CV)" : ""}</p>
              ))}
              {daEliminare.length > 12 && <p className="text-muted-foreground">… e altri {daEliminare.length - 12}</p>}
            </div>
            <div className="flex justify-end">
              <Button variant="destructive" size="sm" className="gap-1" onClick={() => setConfermaAperta(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Elimina {daEliminare.length} candidati
              </Button>
            </div>
          </div>
        )}
        <AlertDialog open={confermaAperta} onOpenChange={setConfermaAperta}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminare definitivamente {daEliminare.length} candidati?</AlertDialogTitle>
              <AlertDialogDescription>
                Spariscono schede, colloqui e curriculum. Non si torna indietro: è il punto della pulizia privacy.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={elimina} disabled={eliminando}>
                {eliminando ? "Eliminazione…" : "Elimina tutto"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

/** Editor della pipeline: rinomina, colore, ordina, aggiungi, elimina. */
function GestisciFasiDialog({ open, onOpenChange, fasi, candidati }: { open: boolean; onOpenChange: (v: boolean) => void; fasi: FaseSelezione[]; candidati: HrCandidato[] }) {
  const upsert = useUpsertFase();
  const del = useDeleteFase();
  const scambia = useScambiaFasi();
  const [nuovaFase, setNuovaFase] = useState("");
  const contaIn = (faseId: string) => candidati.filter((c) => c.fase_id === faseId && esitoDi(c) === "in_selezione").length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Le fasi della tua selezione</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">Rinomina, riordina o aggiungi fasi: la pipeline è la tua. Eliminando una fase, i candidati dentro tornano "da smistare".</p>
        <div className="space-y-1.5">
          {fasi.map((f, i) => (
            <div key={f.id} className="flex items-center gap-1.5 rounded-lg border px-2 py-1.5">
              <input
                type="color"
                value={f.colore || "#94A3B8"}
                onChange={(e) => upsert.mutate({ id: f.id, nome: f.nome, colore: e.target.value })}
                className="h-5 w-6 shrink-0 cursor-pointer rounded border bg-transparent p-0"
                aria-label={`Colore fase ${f.nome}`}
              />
              <Input
                className="h-7 flex-1 border-0 shadow-none focus-visible:ring-1 px-1 text-sm"
                defaultValue={f.nome}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== f.nome) upsert.mutate({ id: f.id, nome: v }); }}
              />
              <span className="text-[11px] text-muted-foreground w-6 text-right">{contaIn(f.id)}</span>
              <button type="button" disabled={i === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-30" onClick={() => scambia.mutate({ a: f, b: fasi[i - 1] })} aria-label="Sposta su"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" disabled={i === fasi.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-30" onClick={() => scambia.mutate({ a: f, b: fasi[i + 1] })} aria-label="Sposta giù"><ArrowDown className="h-3.5 w-3.5" /></button>
              <button
                type="button"
                className="text-slate-400 hover:text-destructive"
                aria-label={`Elimina fase ${f.nome}`}
                onClick={() => {
                  const n = contaIn(f.id);
                  if (n > 0 && !window.confirm(`Nella fase "${f.nome}" ci sono ${n} candidati: torneranno "da smistare". Continuare?`)) return;
                  del.mutate(f.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 border-t pt-2">
          <Input className="h-8 flex-1" placeholder="Nuova fase (es. Colloquio col titolare)" value={nuovaFase} onChange={(e) => setNuovaFase(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && nuovaFase.trim()) { upsert.mutate({ nome: nuovaFase.trim(), posizione: (fasi[fasi.length - 1]?.posizione ?? 0) + 1 }); setNuovaFase(""); } }} />
          <Button size="sm" className="h-8 gap-1" disabled={!nuovaFase.trim()} onClick={() => { upsert.mutate({ nome: nuovaFase.trim(), posizione: (fasi[fasi.length - 1]?.posizione ?? 0) + 1 }); setNuovaFase(""); }}>
            <Plus className="h-3.5 w-3.5" /> Aggiungi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Kanban ──────────────────────────────────────────────────────────────────

function CardCandidato({ candidato, oggi, onApri }: { candidato: HrCandidato; oggi: number; onApri: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: candidato.id });
  const giorniFermo = Math.floor((oggi - new Date(candidato.updated_at).getTime()) / 86400000);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onApri}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 30, position: "relative" } : undefined}
      className={`cursor-grab rounded-lg border bg-card p-2 shadow-sm transition-shadow hover:shadow ${isDragging ? "opacity-70 ring-2 ring-primary/40" : ""}`}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="text-sm font-medium leading-tight">{candidato.nome} {candidato.cognome}</p>
        {candidato.cv_path && <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
      </div>
      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"><HardHat className="h-3 w-3" />{candidato.ruolo}</p>
      <div className="mt-1 flex items-center justify-between">
        <Stelle valore={candidato.valutazione} />
        {giorniFermo >= 7 && <span className="text-[10px] text-amber-600 font-medium">{giorniFermo}g fermo</span>}
      </div>
    </div>
  );
}

function ColonnaFase({ id, titolo, colore, candidati, oggi, onApri }: { id: string; titolo: string; colore: string | null; candidati: HrCandidato[]; oggi: number; onApri: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`flex w-[230px] shrink-0 flex-col rounded-xl border bg-slate-50/70 transition-colors ${isOver ? "border-primary bg-primary/5" : "border-slate-200"}`}>
      <div className="flex items-center gap-1.5 border-b px-2.5 py-2" style={{ borderTopColor: colore ?? undefined }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colore ?? "#94A3B8" }} />
        <p className="text-xs font-semibold">{titolo}</p>
        <span className="ml-auto text-[11px] text-muted-foreground">{candidati.length}</span>
      </div>
      <div className="flex flex-col gap-1.5 p-1.5 min-h-[70px]">
        {candidati.map((c) => <CardCandidato key={c.id} candidato={c} oggi={oggi} onApri={() => onApri(c.id)} />)}
        {candidati.length === 0 && <p className="py-4 text-center text-[11px] text-slate-400">Trascina qui</p>}
      </div>
    </div>
  );
}

function TargetEsito({ esito, label, icona: Icona, classe }: { esito: Esito; label: string; icona: typeof CheckCircle2; classe: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `esito:${esito}` });
  return (
    <div ref={setNodeRef} className={`flex items-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-2 text-xs font-medium transition-all ${classe} ${isOver ? "scale-105 border-solid" : ""}`}>
      <Icona className="h-4 w-4" /> {label}
    </div>
  );
}

// ── Scheda candidato ────────────────────────────────────────────────────────

function SchedaCandidato({ candidato, fasi, onClose, vaiAlTest, vaiOrganigramma }: { candidato: HrCandidato; fasi: FaseSelezione[]; onClose: () => void; vaiAlTest: () => void; vaiOrganigramma: () => void }) {
  const companyId = useEffectiveCompanyId();
  const upsert = useUpsertCandidato();
  const del = useDeleteCandidato();
  const { data: colloqui = [], isLoading: colloquiLoading } = useColloquiCandidato(candidato.id);
  const addColloquio = useAddColloquio(candidato);
  const delColloquio = useDeleteColloquio(candidato.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [caricandoCv, setCaricandoCv] = useState(false);
  const [anteprimaCv, setAnteprimaCv] = useState<string | null>(null);
  const [confermaElimina, setConfermaElimina] = useState(false);
  const [nuovoColloquio, setNuovoColloquio] = useState({ data_colloquio: new Date().toLocaleDateString("en-CA"), ora_colloquio: "", tipo: "conoscitivo" as ColloquioTipo, esito: "" as "" | ColloquioEsito, note: "" });
  const assumi = useAssumiCandidato();

  const aggiorna = (patch: Partial<HrCandidato>) => upsert.mutate({ ...patch, id: candidato.id, nome: patch.nome ?? candidato.nome });

  // Aggancio al test attitudinale: se collegato mostra lo stato; se esiste un
  // test con la STESSA email non ancora collegato, lo propone — cercarlo a
  // mano nella vista test era il modo migliore per non collegarlo mai.
  const { data: testInfo } = useQuery({
    queryKey: ["talent-match", candidato.id, candidato.talent_candidate_id, candidato.email],
    enabled: !!companyId && (!!candidato.talent_candidate_id || !!candidato.email),
    staleTime: 60 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const talentDb = supabase as any;
      if (candidato.talent_candidate_id) {
        const { data } = await talentDb.from("hr_talent_candidates").select("id, status").eq("id", candidato.talent_candidate_id).maybeSingle();
        return data ? { collegato: true as const, id: data.id as string, status: data.status as string } : null;
      }
      const { data } = await talentDb
        .from("hr_talent_candidates")
        .select("id, status, nome, cognome")
        .eq("company_id", companyId)
        .ilike("email", candidato.email!)
        .limit(1)
        .maybeSingle();
      return data ? { collegato: false as const, id: data.id as string, status: data.status as string } : null;
    },
  });
  const STATO_TEST: Record<string, string> = {
    draft: "bozza", invited: "invitato, in attesa", in_progress: "in corso", completed: "completato ✓", archived: "archiviato",
  };

  const caricaCv = async (file: File) => {
    if (!companyId) return;
    setCaricandoCv(true);
    try {
      const { path, name } = await uploadHrFile(companyId, `candidato-${candidato.id}`, file);
      await upsert.mutateAsync({ id: candidato.id, nome: candidato.nome, cv_path: path, cv_nome: name });
      toast.success("CV caricato");
    } catch (e) {
      toast.error("CV non caricato", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setCaricandoCv(false);
    }
  };

  const scaricaCv = async () => {
    if (!candidato.cv_path) return;
    const url = await getHrFileUrl(candidato.cv_path);
    if (!url) { toast.error("Non riesco ad aprire il CV"); return; }
    // PDF e immagini si vedono in anteprima qui dentro; i .doc il browser
    // non li rende, quindi si scaricano e basta.
    if (/\.(docx?|xlsx?)$/i.test(candidato.cv_nome ?? candidato.cv_path)) {
      window.open(url, "_blank");
      return;
    }
    setAnteprimaCv(url);
  };

  const rimuoviCv = async () => {
    if (!candidato.cv_path) return;
    await supabase.storage.from("hr-documenti").remove([candidato.cv_path]);
    aggiorna({ cv_path: null, cv_nome: null });
  };

  const registraColloquio = () => {
    if (!nuovoColloquio.data_colloquio) { toast.error("Serve la data del colloquio"); return; }
    addColloquio.mutate(
      { data_colloquio: nuovoColloquio.data_colloquio, ora_colloquio: nuovoColloquio.ora_colloquio || null, tipo: nuovoColloquio.tipo, esito: nuovoColloquio.esito || null, note: nuovoColloquio.note.trim() || null },
      { onSuccess: () => setNuovoColloquio((p) => ({ ...p, note: "", esito: "" })) },
    );
  };

  const esito = esitoDi(candidato);
  const fase = fasi.find((f) => f.id === candidato.fase_id) ?? null;
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>{candidato.nome} {candidato.cognome}</span>
            <Badge className={`${ESITI[esito].classe} border-0`}>{esito === "in_selezione" && fase ? fase.nome : ESITI[esito].label}</Badge>
            <Badge variant="outline" className="gap-1"><HardHat className="h-3 w-3" />{candidato.ruolo}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Fase + esito + valutazione: le leve del processo */}
          <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-slate-50 p-3">
            <div className="min-w-[170px]">
              <Label className="text-xs">Fase della selezione</Label>
              <Select value={candidato.fase_id ?? "nessuna"} onValueChange={(v) => aggiorna({ fase_id: v === "nessuna" ? null : v })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nessuna">— Da smistare —</SelectItem>
                  {fasi.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[150px]">
              <Label className="text-xs">Esito</Label>
              <Select value={esito} onValueChange={(v) => aggiorna({ stato: (v === "in_selezione" ? "in_valutazione" : v) as CandidatoStato })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ESITI).map(([v, e]) => <SelectItem key={v} value={v}>{e.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Valutazione</Label>
              <div className="pt-1.5"><Stelle valore={candidato.valutazione} onChange={(v) => aggiorna({ valutazione: v })} size="h-5 w-5" /></div>
            </div>
          </div>

          {/* Anagrafica e contatti (nome e cognome inclusi: i refusi capitano) */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div><Label htmlFor="sc-nome" className="text-xs">Nome</Label><Input id="sc-nome" className="h-8" defaultValue={candidato.nome} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== candidato.nome) aggiorna({ nome: v }); }} /></div>
            <div><Label htmlFor="sc-cognome" className="text-xs">Cognome</Label><Input id="sc-cognome" className="h-8" defaultValue={candidato.cognome} onBlur={(e) => { const v = e.target.value.trim(); if (v !== candidato.cognome) aggiorna({ cognome: v }); }} /></div>
            <div><Label htmlFor="sc-ruolo" className="text-xs">Ruolo cercato</Label><Input id="sc-ruolo" list="ruoli-suggeriti" className="h-8" defaultValue={candidato.ruolo} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== candidato.ruolo) aggiorna({ ruolo: v }); }} /></div>
            <div><Label htmlFor="sc-tel" className="text-xs">Telefono</Label><Input id="sc-tel" className="h-8" defaultValue={candidato.telefono ?? ""} onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== candidato.telefono) aggiorna({ telefono: v }); }} /></div>
            <div><Label htmlFor="sc-email" className="text-xs">Email</Label><Input id="sc-email" className="h-8" defaultValue={candidato.email ?? ""} onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== candidato.email) aggiorna({ email: v }); }} /></div>
            <div><Label htmlFor="sc-citta" className="text-xs">Città</Label><Input id="sc-citta" className="h-8" defaultValue={candidato.citta ?? ""} onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== candidato.citta) aggiorna({ citta: v }); }} /></div>
          </div>

          {/* CV */}
          <div className="rounded-lg border p-3">
            <p className="mb-2 text-sm font-semibold flex items-center gap-1.5"><FileText className="h-4 w-4 text-slate-500" /> Curriculum</p>
            {candidato.cv_path ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-700 truncate max-w-[280px]">{candidato.cv_nome ?? "CV"}</span>
                <Button size="sm" variant="outline" className="h-7 gap-1" onClick={scaricaCv}><Download className="h-3.5 w-3.5" /> Apri</Button>
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-muted-foreground hover:text-destructive" onClick={rimuoviCv}><Trash2 className="h-3.5 w-3.5" /> Rimuovi</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-8 gap-1" disabled={caricandoCv} onClick={() => fileRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" /> {caricandoCv ? "Caricamento…" : "Carica CV"}
                </Button>
                <span className="text-xs text-muted-foreground">PDF o immagine, max 18 MB</span>
              </div>
            )}
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) caricaCv(f); e.target.value = ""; }} />
          </div>

          {/* Colloqui */}
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-sm font-semibold flex items-center gap-1.5"><Users className="h-4 w-4 text-slate-500" /> Colloqui</p>
            {colloquiLoading ? <Skeleton className="h-10 w-full" /> : colloqui.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nessun colloquio registrato.</p>
            ) : (
              <div className="space-y-1.5">
                {colloqui.map((c) => (
                  <div key={c.id} className="flex items-start gap-2 rounded border bg-slate-50 px-2 py-1.5 text-xs">
                    <span className="font-medium whitespace-nowrap">
                      {new Date(`${c.data_colloquio}T00:00:00`).toLocaleDateString("it-IT")}
                      {c.ora_colloquio && <span className="text-slate-500"> {c.ora_colloquio.slice(0, 5)}</span>}
                    </span>
                    <span className="text-slate-600 whitespace-nowrap">{TIPI_COLLOQUIO[c.tipo]}</span>
                    {c.appointment_id && <CalendarCheck className="h-3.5 w-3.5 shrink-0 text-blue-500" aria-label="In calendario" />}
                    {c.esito && <span className={`font-semibold ${ESITI_COLLOQUIO[c.esito].classe}`}>{ESITI_COLLOQUIO[c.esito].label}</span>}
                    {c.note && <span className="text-slate-500 flex-1">{c.note}</span>}
                    <button type="button" className="ml-auto text-slate-400 hover:text-destructive" onClick={() => delColloquio.mutate({ id: c.id, appointmentId: c.appointment_id })} aria-label="Elimina colloquio">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-end gap-2 border-t pt-2">
              <div><Label className="text-[11px]">Data</Label><Input type="date" className="h-8 w-[140px]" value={nuovoColloquio.data_colloquio} onChange={(e) => setNuovoColloquio({ ...nuovoColloquio, data_colloquio: e.target.value })} /></div>
              <div><Label className="text-[11px]">Ora</Label><Input type="time" className="h-8 w-[100px]" value={nuovoColloquio.ora_colloquio} onChange={(e) => setNuovoColloquio({ ...nuovoColloquio, ora_colloquio: e.target.value })} /></div>
              <div>
                <Label className="text-[11px]">Tipo</Label>
                <Select value={nuovoColloquio.tipo} onValueChange={(v) => setNuovoColloquio({ ...nuovoColloquio, tipo: v as ColloquioTipo })}>
                  <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(TIPI_COLLOQUIO).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">Esito</Label>
                <Select value={nuovoColloquio.esito || "nessuno"} onValueChange={(v) => setNuovoColloquio({ ...nuovoColloquio, esito: v === "nessuno" ? "" : (v as ColloquioEsito) })}>
                  <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nessuno">—</SelectItem>
                    {Object.entries(ESITI_COLLOQUIO).map(([v, e]) => <SelectItem key={v} value={v}>{e.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Input className="h-8 flex-1 min-w-[160px]" placeholder="Note del colloquio…" value={nuovoColloquio.note} onChange={(e) => setNuovoColloquio({ ...nuovoColloquio, note: e.target.value })} />
              <Button size="sm" className="h-8 gap-1" onClick={registraColloquio} disabled={addColloquio.isPending}><Plus className="h-3.5 w-3.5" /> Registra</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">I colloqui con data di oggi o futura finiscono anche sul calendario aziendale.</p>
          </div>

          <div>
            <Label htmlFor="sc-note" className="text-xs">Note sul candidato</Label>
            <Textarea id="sc-note" rows={2} defaultValue={candidato.note ?? ""} placeholder="Esperienze, referenze, disponibilità, impressioni…" onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== candidato.note) aggiorna({ note: v }); }} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <BrainCircuit className="h-4 w-4 shrink-0 text-orange-500" />
              <span>
                {testInfo?.collegato
                  ? `Test attitudinale: ${STATO_TEST[testInfo.status] ?? testInfo.status}.`
                  : testInfo
                    ? "C'è un test attitudinale con questa email, non ancora collegato."
                    : "Vuoi anche il profilo attitudinale? È nella vista Test."}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {testInfo && !testInfo.collegato && (
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => aggiorna({ talent_candidate_id: testInfo.id })}>
                  <Link2 className="h-3 w-3" /> Collega
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 text-xs text-orange-600 hover:text-orange-700" onClick={() => { onClose(); vaiAlTest(); }}>
                Apri i test →
              </Button>
            </div>
          </div>

          {esito === "assunto" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              {candidato.hr_profilo_id ? (
                <>
                  <div className="flex items-center gap-2 text-xs text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Profilo dipendente creato.</span>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-700 hover:text-emerald-800" onClick={() => { onClose(); vaiOrganigramma(); }}>
                    Apri Organigramma →
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-xs text-emerald-800">
                    <HardHat className="h-4 w-4 text-emerald-600" />
                    <span>È assunto: crea il profilo dipendente con i suoi dati già compilati.</span>
                  </div>
                  <Button size="sm" className="h-7 gap-1 bg-emerald-600 text-white hover:bg-emerald-700" disabled={assumi.isPending} onClick={() => assumi.mutate(candidato)}>
                    <Plus className="h-3.5 w-3.5" /> Crea profilo dipendente
                  </Button>
                </>
              )}
            </div>
          )}

          <div className="flex justify-between pt-1">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive gap-1" onClick={() => setConfermaElimina(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Elimina candidato
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>Chiudi</Button>
          </div>
        </div>

        {anteprimaCv && (
          <Dialog open onOpenChange={(v) => { if (!v) setAnteprimaCv(null); }}>
            <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-3">
              <DialogHeader className="flex-row items-center justify-between space-y-0 pr-8">
                <DialogTitle className="text-sm truncate">{candidato.cv_nome ?? "Curriculum"}</DialogTitle>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => window.open(anteprimaCv, "_blank")}>
                  <Download className="h-3.5 w-3.5" /> Apri in un'altra scheda
                </Button>
              </DialogHeader>
              <iframe src={anteprimaCv} title={`Anteprima ${candidato.cv_nome ?? "CV"}`} className="w-full flex-1 rounded-lg border bg-slate-50" />
            </DialogContent>
          </Dialog>
        )}

        <AlertDialog open={confermaElimina} onOpenChange={setConfermaElimina}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminare {candidato.nome} {candidato.cognome}?</AlertDialogTitle>
              <AlertDialogDescription>Spariscono anche colloqui e CV. Se può servire in futuro, meglio l'esito "In archivio".</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  if (candidato.cv_path) await supabase.storage.from("hr-documenti").remove([candidato.cv_path]);
                  del.mutate(candidato.id, { onSuccess: onClose });
                }}
              >
                Elimina
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

// ── Tab ─────────────────────────────────────────────────────────────────────

export function TabCandidati() {
  const { data: candidati = [], isLoading } = useHrCandidati();
  const { data: fasi = [], isLoading: fasiLoading } = useFasiSelezione();
  const upsert = useUpsertCandidato();
  const spostaFase = useSpostaFase();
  const [searchParams, setSearchParams] = useSearchParams();
  const [vista, setVista] = useState<"pipeline" | "elenco" | "test">(() => {
    // I vecchi link ?tab=selezioni atterrano dritti sulla vista test.
    if (searchParams.get("tab") === "selezioni") return "test";
    try {
      const v = localStorage.getItem("hr-candidati-vista");
      return v === "elenco" || v === "test" ? v : "pipeline";
    } catch { return "pipeline"; }
  });
  const cambiaVista = (v: "pipeline" | "elenco" | "test") => {
    setVista(v);
    try { localStorage.setItem("hr-candidati-vista", v); } catch { /* niente */ }
  };
  const [ricerca, setRicerca] = useState("");
  const [filtroRuolo, setFiltroRuolo] = useState("tutti");
  const [filtroEsito, setFiltroEsito] = useState<"in_selezione" | "tutti" | Esito>("in_selezione");
  const [nuovoAperto, setNuovoAperto] = useState(false);
  const [fasiAperte, setFasiAperte] = useState(false);
  const [moduliAperti, setModuliAperti] = useState(false);
  const [privacyAperta, setPrivacyAperta] = useState(false);
  const [apertoId, setApertoId] = useState<string | null>(null);
  // Istante di riferimento per "Ng fermo": preso al mount, la precisione al
  // minuto non serve e il render resta puro (react-compiler).
  const [oggi] = useState(() => Date.now());
  const sensori = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const companyIdKpi = useEffectiveCompanyId();
  // Conteggio test attitudinali per la card unificata: la vista test ha i
  // suoi dettagli, qui basta sapere quanti sono e a che punto.
  const { data: testStats } = useQuery({
    queryKey: ["hr-talent-count", companyIdKpi],
    enabled: !!companyIdKpi,
    staleTime: 60 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("hr_talent_candidates")
        .select("status")
        .eq("company_id", companyIdKpi);
      if (error) throw error;
      const righe = (data ?? []) as { status: string }[];
      return { totale: righe.length, completati: righe.filter((r) => r.status === "completed").length };
    },
  });

  const ruoliPresenti = useMemo(() => [...new Set(candidati.map((c) => c.ruolo))].sort(), [candidati]);

  const filtrati = useMemo(() => {
    const q = ricerca.trim().toLowerCase();
    return candidati.filter((c) => {
      if (filtroRuolo !== "tutti" && c.ruolo !== filtroRuolo) return false;
      if (filtroEsito !== "tutti" && esitoDi(c) !== filtroEsito) return false;
      if (q && !`${c.nome} ${c.cognome} ${c.email ?? ""} ${c.telefono ?? ""} ${c.citta ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [candidati, ricerca, filtroRuolo, filtroEsito]);

  const inPipeline = useMemo(() => filtrati.filter((c) => esitoDi(c) === "in_selezione"), [filtrati]);
  const senzaFase = useMemo(() => inPipeline.filter((c) => !c.fase_id || !fasi.some((f) => f.id === c.fase_id)), [inPipeline, fasi]);

  const perRuolo = useMemo(() => {
    const map = new Map<string, HrCandidato[]>();
    for (const c of filtrati) {
      const arr = map.get(c.ruolo) ?? [];
      arr.push(c);
      map.set(c.ruolo, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtrati]);

  const kpi = useMemo(() => ({
    totale: candidati.length,
    inSelezione: candidati.filter((c) => esitoDi(c) === "in_selezione").length,
    assunti: candidati.filter((c) => c.stato === "assunto").length,
    inArchivio: candidati.filter((c) => c.stato === "archiviato").length,
  }), [candidati]);

  const aperto = apertoId ? candidati.find((c) => c.id === apertoId) ?? null : null;
  const vaiAlTest = () => cambiaVista("test");
  const vaiOrganigramma = () => setSearchParams((p) => { const n = new URLSearchParams(p); n.set("tab", "organigramma"); return n; });

  const onDragEnd = (event: DragEndEvent) => {
    const candidatoId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId) return;
    const candidato = candidati.find((c) => c.id === candidatoId);
    if (!candidato) return;
    if (overId.startsWith("fase:")) {
      const faseId = overId === "fase:senza" ? null : overId.slice(5);
      if (faseId !== candidato.fase_id) spostaFase.mutate({ candidatoId, faseId });
      return;
    }
    if (overId.startsWith("esito:")) {
      const esito = overId.slice(6) as Esito;
      const stato: CandidatoStato = esito === "in_selezione" ? "in_valutazione" : (esito as CandidatoStato);
      upsert.mutate({ id: candidatoId, nome: candidato.nome, stato });
      toast.success(`${candidato.nome} ${candidato.cognome}: ${ESITI[esito].label}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* KPI: la testata NON cambia cambiando vista — è la stessa area. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Candidati totali", val: kpi.totale, icona: UserRoundSearch },
          { label: "In selezione", val: kpi.inSelezione, icona: Users },
          { label: "Assunti", val: kpi.assunti, icona: HardHat },
          { label: "In archivio", val: kpi.inArchivio, icona: Archive },
        ].map(({ label, val, icona: Icona }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><Icona className="h-5 w-5" /></div>
              <div>
                <p className="text-xl font-bold leading-none">{val}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
        <button
          type="button"
          onClick={() => cambiaVista("test")}
          className={`rounded-xl border bg-card text-left shadow-sm transition-colors hover:bg-orange-50/50 ${vista === "test" ? "border-orange-300 ring-1 ring-orange-200" : ""}`}
        >
          <div className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><BrainCircuit className="h-5 w-5" /></div>
            <div>
              <p className="text-xl font-bold leading-none">{testStats ? `${testStats.completati}/${testStats.totale}` : "—"}</p>
              <p className="text-xs text-muted-foreground">Test completati</p>
            </div>
          </div>
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border p-0.5">
          <button type="button" onClick={() => cambiaVista("pipeline")} className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${vista === "pipeline" ? "bg-orange-50 text-orange-700" : "text-muted-foreground hover:bg-muted"}`}>
            <KanbanSquare className="h-3.5 w-3.5" /> Pipeline
          </button>
          <button type="button" onClick={() => cambiaVista("elenco")} className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${vista === "elenco" ? "bg-orange-50 text-orange-700" : "text-muted-foreground hover:bg-muted"}`}>
            <List className="h-3.5 w-3.5" /> Elenco
          </button>
          <button type="button" onClick={() => cambiaVista("test")} className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${vista === "test" ? "bg-orange-50 text-orange-700" : "text-muted-foreground hover:bg-muted"}`}>
            <BrainCircuit className="h-3.5 w-3.5" /> Test attitudinali
          </button>
        </div>
        {vista !== "test" && (
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 pl-8" placeholder="Cerca per nome, telefono, email…" value={ricerca} onChange={(e) => setRicerca(e.target.value)} />
        </div>
        )}
        {vista !== "test" && (
        <Select value={filtroRuolo} onValueChange={setFiltroRuolo}>
          <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i ruoli</SelectItem>
            {ruoliPresenti.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        )}
        {vista === "elenco" && (
          <Select value={filtroEsito} onValueChange={(v) => setFiltroEsito(v as typeof filtroEsito)}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="in_selezione">In selezione</SelectItem>
              <SelectItem value="tutti">Tutti</SelectItem>
              <SelectItem value="assunto">Assunti</SelectItem>
              <SelectItem value="scartato">Non idonei</SelectItem>
              <SelectItem value="archiviato">In archivio</SelectItem>
            </SelectContent>
          </Select>
        )}
        {vista === "pipeline" && (
          <Button variant="outline" size="sm" className="h-9 gap-1" onClick={() => setFasiAperte(true)}>
            <Settings2 className="h-3.5 w-3.5" /> Fasi
          </Button>
        )}
        {vista !== "test" && (
          <Button variant="outline" size="sm" className="h-9 gap-1" onClick={() => setModuliAperti(true)}>
            <Globe className="h-3.5 w-3.5" /> Modulo sito
          </Button>
        )}
        {vista === "elenco" && (
          <Button variant="outline" size="sm" className="h-9 gap-1" onClick={() => setPrivacyAperta(true)}>
            <ShieldCheck className="h-3.5 w-3.5" /> Privacy
          </Button>
        )}
        {vista !== "test" && (
          <Button variant="brand" className="ml-auto gap-1" onClick={() => setNuovoAperto(true)}><Plus className="h-4 w-4" /> Nuovo candidato</Button>
        )}
      </div>

      {/* Corpo */}
      {vista === "test" ? (
        <Suspense fallback={<div className="space-y-3 py-2"><Skeleton className="h-9 w-2/3 max-w-xs" /><Skeleton className="h-56 w-full rounded-xl" /></div>}>
          <TabSelezioni embedded />
        </Suspense>
      ) : isLoading || fasiLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
      ) : candidati.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <UserRoundSearch className="h-10 w-10 text-slate-300" />
            <p className="font-semibold">La tua banca dati candidati è vuota</p>
            <p className="max-w-sm text-sm text-muted-foreground">Aggiungi chi si è proposto o chi hai già sentito: CV, colloqui e valutazioni restano qui anche per le ricerche future.</p>
            <Button variant="brand" className="mt-2 gap-1" onClick={() => setNuovoAperto(true)}><Plus className="h-4 w-4" /> Aggiungi il primo</Button>
          </CardContent>
        </Card>
      ) : vista === "pipeline" ? (
        <DndContext sensors={sensori} onDragEnd={onDragEnd}>
          <div className="overflow-x-auto pb-1">
            <div className="flex items-start gap-2 min-w-max">
              {senzaFase.length > 0 && (
                <ColonnaFase id="fase:senza" titolo="Da smistare" colore="#94A3B8" candidati={senzaFase} oggi={oggi} onApri={setApertoId} />
              )}
              {fasi.map((f) => (
                <ColonnaFase key={f.id} id={`fase:${f.id}`} titolo={f.nome} colore={f.colore} candidati={inPipeline.filter((c) => c.fase_id === f.id)} oggi={oggi} onApri={setApertoId} />
              ))}
            </div>
          </div>
          {/* Trascina qui per chiudere il percorso di un candidato */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] text-muted-foreground">Trascina un candidato su:</span>
            <TargetEsito esito="assunto" label="Assunto" icona={CheckCircle2} classe="border-emerald-300 bg-emerald-50 text-emerald-700" />
            <TargetEsito esito="scartato" label="Non idoneo" icona={XCircle} classe="border-red-300 bg-red-50 text-red-600" />
            <TargetEsito esito="archiviato" label="In archivio" icona={Archive} classe="border-slate-300 bg-slate-50 text-slate-600" />
          </div>
        </DndContext>
      ) : filtrati.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nessun candidato con questi filtri.</p>
      ) : (
        <div className="space-y-4">
          {perRuolo.map(([ruolo, lista]) => (
            <div key={ruolo}>
              <div className="mb-1.5 flex items-center gap-2">
                <HardHat className="h-4 w-4 text-orange-500" />
                <h3 className="text-sm font-semibold">{ruolo}</h3>
                <span className="text-xs text-muted-foreground">{lista.length}</span>
              </div>
              <div className="overflow-hidden rounded-xl border bg-card">
                {lista.map((c, i) => {
                  const es = esitoDi(c);
                  const fase = es === "in_selezione" ? fasi.find((f) => f.id === c.fase_id) : null;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setApertoId(c.id)}
                      className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left transition-colors hover:bg-muted/50 ${i > 0 ? "border-t" : ""}`}
                    >
                      <span className="min-w-[140px] font-medium text-sm">{c.nome} {c.cognome}</span>
                      {fase ? (
                        <Badge variant="outline" className="gap-1 text-[11px]">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: fase.colore ?? "#94A3B8" }} />
                          {fase.nome}
                        </Badge>
                      ) : (
                        <Badge className={`${ESITI[es].classe} border-0 text-[11px]`}>{ESITI[es].label}</Badge>
                      )}
                      <Stelle valore={c.valutazione} />
                      {c.cv_path && <span className="flex items-center gap-1 text-xs text-slate-500"><FileText className="h-3.5 w-3.5" /> CV</span>}
                      <span className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {c.telefono && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.telefono}</span>}
                        {c.email && <span className="hidden sm:flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                        {c.citta && <span className="hidden md:flex items-center gap-1"><MapPin className="h-3 w-3" />{c.citta}</span>}
                        <span className="text-[11px]">{FONTI_CANDIDATO[c.fonte]}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <NuovoCandidatoDialog open={nuovoAperto} onOpenChange={setNuovoAperto} fasi={fasi} onCreato={(c) => setApertoId(c.id)} />
      <GestisciFasiDialog open={fasiAperte} onOpenChange={setFasiAperte} fasi={fasi} candidati={candidati} />
      <ModuliSitoDialog open={moduliAperti} onOpenChange={setModuliAperti} />
      <PuliziaPrivacyDialog open={privacyAperta} onOpenChange={setPrivacyAperta} candidati={candidati} />
      {aperto && <SchedaCandidato key={aperto.id} candidato={aperto} fasi={fasi} onClose={() => setApertoId(null)} vaiAlTest={vaiAlTest} vaiOrganigramma={vaiOrganigramma} />}
    </div>
  );
}
