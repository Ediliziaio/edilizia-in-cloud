/**
 * Tab "Candidati" — la banca dati della selezione.
 *
 * Elenco diviso per ruolo: CV, colloqui, valutazione. Serve a chi assume
 * senza il modulo test attitudinale (che resta nella tab Selezioni, a
 * pagamento) e a ritrovare i candidati vecchi quando si riapre una ricerca.
 */
import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { uploadHrFile, getHrFileUrl } from "@/hooks/useHrDocumenti";
import {
  useHrCandidati, useUpsertCandidato, useDeleteCandidato,
  useColloquiCandidato, useAddColloquio, useDeleteColloquio,
  STATI_CANDIDATO, FONTI_CANDIDATO, TIPI_COLLOQUIO, ESITI_COLLOQUIO,
  type HrCandidato, type CandidatoStato, type CandidatoFonte, type ColloquioTipo, type ColloquioEsito,
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
  BrainCircuit, Download, FileText, HardHat, Mail, MapPin, Phone, Plus,
  Search, Star, Trash2, Upload, UserRoundSearch, Users,
} from "lucide-react";

const RUOLI_SUGGERITI = [
  "Muratore", "Manovale", "Capocantiere", "Posatore serramenti", "Carpentiere",
  "Elettricista", "Idraulico", "Imbianchino", "Geometra", "Impiegato/a ufficio",
  "Commerciale", "Altro",
];

function Stelle({ valore, onChange, size = "h-4 w-4" }: { valore: number | null; onChange?: (v: number | null) => void; size?: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(valore === n ? null : n)}
          className={onChange ? "cursor-pointer" : "cursor-default"}
          aria-label={`${n} stelle`}
        >
          <Star className={`${size} ${valore != null && n <= valore ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
        </button>
      ))}
    </div>
  );
}

/** Form nuovo candidato (i dettagli fini si aggiungono dalla scheda). */
function NuovoCandidatoDialog({ open, onOpenChange, onCreato }: { open: boolean; onOpenChange: (v: boolean) => void; onCreato: (c: HrCandidato) => void }) {
  const upsert = useUpsertCandidato();
  const [form, setForm] = useState({ nome: "", cognome: "", ruolo: "Muratore", email: "", telefono: "", citta: "", fonte: "manuale" as CandidatoFonte });
  const salva = async () => {
    if (!form.nome.trim()) { toast.error("Serve almeno il nome"); return; }
    const creato = await upsert.mutateAsync({
      nome: form.nome.trim(),
      cognome: form.cognome.trim(),
      ruolo: form.ruolo || "Altro",
      email: form.email.trim() || null,
      telefono: form.telefono.trim() || null,
      citta: form.citta.trim() || null,
      fonte: form.fonte,
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
          <div>
            <Label>Ruolo cercato</Label>
            <Select value={form.ruolo} onValueChange={(v) => setForm({ ...form, ruolo: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{RUOLI_SUGGERITI.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
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

/** Scheda candidato: dati, stato, valutazione, CV, colloqui, aggancio test. */
function SchedaCandidato({ candidato, onClose, vaiAlTest }: { candidato: HrCandidato; onClose: () => void; vaiAlTest: () => void }) {
  const companyId = useEffectiveCompanyId();
  const upsert = useUpsertCandidato();
  const del = useDeleteCandidato();
  const { data: colloqui = [], isLoading: colloquiLoading } = useColloquiCandidato(candidato.id);
  const addColloquio = useAddColloquio(candidato.id);
  const delColloquio = useDeleteColloquio(candidato.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [caricandoCv, setCaricandoCv] = useState(false);
  const [confermaElimina, setConfermaElimina] = useState(false);
  const [nuovoColloquio, setNuovoColloquio] = useState({ data_colloquio: new Date().toLocaleDateString("en-CA"), tipo: "conoscitivo" as ColloquioTipo, esito: "" as "" | ColloquioEsito, note: "" });

  const aggiorna = (patch: Partial<HrCandidato>) => upsert.mutate({ ...patch, id: candidato.id, nome: candidato.nome });

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
    window.open(url, "_blank");
  };

  const rimuoviCv = async () => {
    if (!candidato.cv_path) return;
    await supabase.storage.from("hr-documenti").remove([candidato.cv_path]);
    aggiorna({ cv_path: null, cv_nome: null });
  };

  const registraColloquio = () => {
    if (!nuovoColloquio.data_colloquio) { toast.error("Serve la data del colloquio"); return; }
    addColloquio.mutate(
      { data_colloquio: nuovoColloquio.data_colloquio, tipo: nuovoColloquio.tipo, esito: nuovoColloquio.esito || null, note: nuovoColloquio.note.trim() || null },
      { onSuccess: () => setNuovoColloquio((p) => ({ ...p, note: "", esito: "" })) },
    );
  };

  const st = STATI_CANDIDATO[candidato.stato];
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>{candidato.nome} {candidato.cognome}</span>
            <Badge className={`${st.classe} border-0`}>{st.label}</Badge>
            <Badge variant="outline" className="gap-1"><HardHat className="h-3 w-3" />{candidato.ruolo}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Stato + valutazione: le due leve che si toccano più spesso */}
          <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-slate-50 p-3">
            <div className="min-w-[160px]">
              <Label className="text-xs">Stato selezione</Label>
              <Select value={candidato.stato} onValueChange={(v) => aggiorna({ stato: v as CandidatoStato })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATI_CANDIDATO).map(([v, s]) => <SelectItem key={v} value={v}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Valutazione</Label>
              <div className="pt-1.5"><Stelle valore={candidato.valutazione} onChange={(v) => aggiorna({ valutazione: v })} size="h-5 w-5" /></div>
            </div>
            <div className="min-w-[160px]">
              <Label className="text-xs">Ruolo cercato</Label>
              <Select value={RUOLI_SUGGERITI.includes(candidato.ruolo) ? candidato.ruolo : "Altro"} onValueChange={(v) => aggiorna({ ruolo: v })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{RUOLI_SUGGERITI.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Contatti */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
                    <span className="font-medium whitespace-nowrap">{new Date(`${c.data_colloquio}T00:00:00`).toLocaleDateString("it-IT")}</span>
                    <span className="text-slate-600 whitespace-nowrap">{TIPI_COLLOQUIO[c.tipo]}</span>
                    {c.esito && <span className={`font-semibold ${ESITI_COLLOQUIO[c.esito].classe}`}>{ESITI_COLLOQUIO[c.esito].label}</span>}
                    {c.note && <span className="text-slate-500 flex-1">{c.note}</span>}
                    <button type="button" className="ml-auto text-slate-400 hover:text-destructive" onClick={() => delColloquio.mutate(c.id)} aria-label="Elimina colloquio">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-end gap-2 border-t pt-2">
              <div><Label className="text-[11px]">Data</Label><Input type="date" className="h-8 w-[140px]" value={nuovoColloquio.data_colloquio} onChange={(e) => setNuovoColloquio({ ...nuovoColloquio, data_colloquio: e.target.value })} /></div>
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
          </div>

          {/* Note libere */}
          <div>
            <Label htmlFor="sc-note" className="text-xs">Note sul candidato</Label>
            <Textarea id="sc-note" rows={2} defaultValue={candidato.note ?? ""} placeholder="Esperienze, referenze, disponibilità, impressioni…" onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== candidato.note) aggiorna({ note: v }); }} />
          </div>

          {/* Ponte verso il test attitudinale (modulo a parte, non per tutti) */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <BrainCircuit className="h-4 w-4 text-orange-500" />
              <span>{candidato.talent_candidate_id ? "Ha un test attitudinale collegato." : "Vuoi anche il profilo attitudinale? È nella scheda Selezioni."}</span>
            </div>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-orange-600 hover:text-orange-700" onClick={() => { onClose(); vaiAlTest(); }}>
              Apri Selezioni →
            </Button>
          </div>

          <div className="flex justify-between pt-1">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive gap-1" onClick={() => setConfermaElimina(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Elimina candidato
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>Chiudi</Button>
          </div>
        </div>

        <AlertDialog open={confermaElimina} onOpenChange={setConfermaElimina}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminare {candidato.nome} {candidato.cognome}?</AlertDialogTitle>
              <AlertDialogDescription>Spariscono anche colloqui e CV. Se può servire in futuro, meglio lo stato "In archivio".</AlertDialogDescription>
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

export function TabCandidati() {
  const { data: candidati = [], isLoading } = useHrCandidati();
  const [, setSearchParams] = useSearchParams();
  const [ricerca, setRicerca] = useState("");
  const [filtroRuolo, setFiltroRuolo] = useState("tutti");
  const [filtroStato, setFiltroStato] = useState("attivi");
  const [nuovoAperto, setNuovoAperto] = useState(false);
  const [apertoId, setApertoId] = useState<string | null>(null);

  const ruoliPresenti = useMemo(() => [...new Set(candidati.map((c) => c.ruolo))].sort(), [candidati]);

  const filtrati = useMemo(() => {
    const q = ricerca.trim().toLowerCase();
    return candidati.filter((c) => {
      if (filtroRuolo !== "tutti" && c.ruolo !== filtroRuolo) return false;
      if (filtroStato === "attivi" && (c.stato === "scartato" || c.stato === "archiviato" || c.stato === "assunto")) return false;
      if (filtroStato !== "attivi" && filtroStato !== "tutti" && c.stato !== filtroStato) return false;
      if (q && !`${c.nome} ${c.cognome} ${c.email ?? ""} ${c.telefono ?? ""} ${c.citta ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [candidati, ricerca, filtroRuolo, filtroStato]);

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
    inSelezione: candidati.filter((c) => ["nuovo", "in_valutazione", "colloquio", "offerta"].includes(c.stato)).length,
    assunti: candidati.filter((c) => c.stato === "assunto").length,
    inArchivio: candidati.filter((c) => c.stato === "archiviato").length,
  }), [candidati]);

  const aperto = apertoId ? candidati.find((c) => c.id === apertoId) ?? null : null;
  const vaiAlTest = () => setSearchParams((p) => { const n = new URLSearchParams(p); n.set("tab", "selezioni"); return n; });

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Candidati totali", val: kpi.totale, icona: UserRoundSearch },
          { label: "In selezione", val: kpi.inSelezione, icona: Users },
          { label: "Assunti", val: kpi.assunti, icona: HardHat },
          { label: "In archivio", val: kpi.inArchivio, icona: FileText },
        ].map(({ label, val, icona: Icona }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><Icona className="h-4.5 w-4.5" /></div>
              <div>
                <p className="text-xl font-bold leading-none">{val}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 pl-8" placeholder="Cerca per nome, telefono, email…" value={ricerca} onChange={(e) => setRicerca(e.target.value)} />
        </div>
        <Select value={filtroRuolo} onValueChange={setFiltroRuolo}>
          <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i ruoli</SelectItem>
            {ruoliPresenti.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroStato} onValueChange={setFiltroStato}>
          <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="attivi">In selezione</SelectItem>
            <SelectItem value="tutti">Tutti gli stati</SelectItem>
            {Object.entries(STATI_CANDIDATO).map(([v, s]) => <SelectItem key={v} value={v}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="brand" className="ml-auto gap-1" onClick={() => setNuovoAperto(true)}><Plus className="h-4 w-4" /> Nuovo candidato</Button>
      </div>

      {/* Elenco per ruolo */}
      {isLoading ? (
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
                  const st = STATI_CANDIDATO[c.stato];
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setApertoId(c.id)}
                      className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left transition-colors hover:bg-muted/50 ${i > 0 ? "border-t" : ""}`}
                    >
                      <span className="min-w-[140px] font-medium text-sm">{c.nome} {c.cognome}</span>
                      <Badge className={`${st.classe} border-0 text-[11px]`}>{st.label}</Badge>
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

      <NuovoCandidatoDialog open={nuovoAperto} onOpenChange={setNuovoAperto} onCreato={(c) => setApertoId(c.id)} />
      {aperto && <SchedaCandidato key={aperto.id} candidato={aperto} onClose={() => setApertoId(null)} vaiAlTest={vaiAlTest} />}
    </div>
  );
}
