import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Zap, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ─── Types ────────────────────────────────────────────────────────────────────
// DB columns for preventivo_impostazioni:
// id, company_id, overhead_percentuale, margine_minimo_percentuale, margine_target_percentuale,
// aggiungi_posa_automatica, chiedi_smaltimento, chiedi_piano_installazione, chiedi_trasporto,
// pdf_mostra_prezzi_per_riga, pdf_mostra_solo_totale, pdf_mostra_sconti, pdf_mostra_immagini,
// pdf_includi_schede_tecniche, firma_digitale_abilitata, soglia_margine_visibile,
// numero_prefisso, numero_formato
interface PreventivoImpostazioni {
  id?: string;
  company_id: string;
  overhead_percentuale?: number | null;
  margine_minimo_percentuale?: number | null;
  margine_target_percentuale?: number | null;
  soglia_margine_visibile?: number | null;
  aggiungi_posa_automatica?: boolean;
  chiedi_piano_installazione?: boolean;
  chiedi_smaltimento?: boolean;
  chiedi_trasporto?: boolean;
  pdf_mostra_prezzi_per_riga?: boolean;
  pdf_mostra_solo_totale?: boolean;
  pdf_mostra_sconti?: boolean;
  pdf_mostra_immagini?: boolean;
  pdf_includi_schede_tecniche?: boolean;
  firma_digitale_abilitata?: boolean;
  numero_prefisso?: string | null;
  numero_formato?: string | null;
}

// DB columns for listino_categorie:
// id, company_id, nome, colore, margine_target_percentuale
interface Categoria {
  id: string;
  nome: string;
  colore?: string;
  margine_target_percentuale?: number | null;
}

const DEFAULT_CATEGORIE = [
  "Serramenti/Infissi", "Porte Interne", "Pavimenti e Rivestimenti", "Bagni e Sanitari",
  "Pittura e Tinteggiatura", "Tetti e Coperture", "Impianti Elettrici", "Impianti Idraulici",
  "Fotovoltaico", "Isolamento Termico", "Ristrutturazione Edile", "Arredo Bagno",
  "Trasporto e Logistica", "Pratiche e Permessi", "Varie",
];

// ─── Category Dialog ──────────────────────────────────────────────────────────
function CategoriaDialog({
  open, onClose, editing, companyId, onSaved,
}: {
  open: boolean; onClose: () => void; editing: Categoria | null;
  companyId: string; onSaved: () => void;
}) {
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [colore, setColore] = useState(editing?.colore ?? "#6366f1");
  const [margineTarget, setMargineTarget] = useState(
    editing?.margine_target_percentuale != null ? String(editing.margine_target_percentuale) : ""
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!nome.trim()) { toast.error("Il nome è obbligatorio"); return; }
    setSaving(true);
    try {
      const payload: any = {
        company_id: companyId,
        nome: nome.trim(),
        colore: colore.trim() || null,
        margine_target_percentuale: margineTarget.trim() !== "" ? parseFloat(margineTarget) : null,
      };
      if (editing) {
        const { error } = await (supabase.from("listino_categorie") as any)
          .update(payload).eq("id", editing.id).eq("company_id", companyId);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("listino_categorie") as any)
          .insert(payload);
        if (error) throw error;
      }
      toast.success(editing ? "Categoria aggiornata" : "Categoria creata");
      onSaved(); onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifica categoria" : "Nuova categoria"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <Label>Colore</Label>
            <div className="flex gap-2 mt-1">
              <input
                type="color"
                value={colore}
                onChange={(e) => setColore(e.target.value)}
                className="h-9 w-14 rounded border cursor-pointer"
              />
              <Input
                value={colore}
                onChange={(e) => setColore(e.target.value)}
                className="flex-1"
                placeholder="#6366f1"
              />
            </div>
          </div>
          <div>
            <Label>Margine target %</Label>
            <Input
              type="number"
              value={margineTarget}
              onChange={(e) => setMargineTarget(e.target.value)}
              placeholder="25"
              min="0"
              max="100"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Margini & PDF Tab ────────────────────────────────────────────────────────
function MarginiPdfTab({
  companyId,
  categorie,
}: {
  companyId: string;
  categorie: Categoria[];
}) {
  const queryClient = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Cleanup debounce timer on unmount to prevent stale mutations
  useEffect(() => {
    return () => { clearTimeout(debounceRef.current); };
  }, []);

  const { data: imp } = useQuery({
    queryKey: ["preventivo-impostazioni", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await (supabase.from("preventivo_impostazioni") as any)
        .select("*").eq("company_id", companyId).maybeSingle();
      return (data ?? null) as PreventivoImpostazioni | null;
    },
  });

  // ── Local state (mirrors DB columns) ──
  const [overheadPct, setOverheadPct] = useState("");
  const [margineMin, setMargineMin] = useState("");
  const [margineTarget, setMargineTarget] = useState("");
  const [soglia, setSoglia] = useState("");
  const [aggPosa, setAggPosa] = useState(false);
  const [chiediPiano, setChiediPiano] = useState(false);
  const [chiediSmaltimento, setChiediSmaltimento] = useState(false);
  const [chiediTrasporto, setChiediTrasporto] = useState(false);
  const [pdfPrezziRiga, setPdfPrezziRiga] = useState(false);
  const [pdfSoloTotale, setPdfSoloTotale] = useState(false);
  const [pdfSconti, setPdfSconti] = useState(false);
  const [pdfImmagini, setPdfImmagini] = useState(false);
  const [pdfSchedeTecniche, setPdfSchedeTecniche] = useState(false);
  const [firmaAbilitata, setFirmaAbilitata] = useState(false);
  const [numeroPrefisso, setNumeroPrefisso] = useState("OFF");
  const [numeroFormato, setNumeroFormato] = useState("{PREFIX}-{YYYY}-{NNN}");
  const [dirty, setDirty] = useState(false);

  // Populate from DB
  useEffect(() => {
    if (!imp) return;
    setOverheadPct(imp.overhead_percentuale != null ? String(imp.overhead_percentuale) : "");
    setMargineMin(imp.margine_minimo_percentuale != null ? String(imp.margine_minimo_percentuale) : "");
    setMargineTarget(imp.margine_target_percentuale != null ? String(imp.margine_target_percentuale) : "");
    setSoglia(imp.soglia_margine_visibile != null ? String(imp.soglia_margine_visibile) : "");
    setAggPosa(!!imp.aggiungi_posa_automatica);
    setChiediPiano(!!imp.chiedi_piano_installazione);
    setChiediSmaltimento(!!imp.chiedi_smaltimento);
    setChiediTrasporto(!!imp.chiedi_trasporto);
    setPdfPrezziRiga(!!imp.pdf_mostra_prezzi_per_riga);
    setPdfSoloTotale(!!imp.pdf_mostra_solo_totale);
    setPdfSconti(!!imp.pdf_mostra_sconti);
    setPdfImmagini(!!imp.pdf_mostra_immagini);
    setPdfSchedeTecniche(!!imp.pdf_includi_schede_tecniche);
    setFirmaAbilitata(!!imp.firma_digitale_abilitata);
    setNumeroPrefisso(imp.numero_prefisso ?? "OFF");
    setNumeroFormato(imp.numero_formato ?? "{PREFIX}-{YYYY}-{NNN}");
  }, [imp]);

  const saveMutation = useMutation({
    mutationFn: async (payload: Partial<PreventivoImpostazioni>) => {
      const { error } = await (supabase.from("preventivo_impostazioni") as any)
        .upsert({ company_id: companyId, ...payload }, { onConflict: "company_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["preventivo-impostazioni", companyId] });
      setDirty(false);
      toast.success("Impostazioni salvate");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Use a ref to always read the latest state in the debounced callback
  // (avoids stale-closure bug where setTimeout captures old state)
  const stateRef = useRef({
    overheadPct, margineMin, margineTarget, soglia,
    aggPosa, chiediPiano, chiediSmaltimento, chiediTrasporto,
    pdfPrezziRiga, pdfSoloTotale, pdfSconti, pdfImmagini,
    pdfSchedeTecniche, firmaAbilitata, numeroPrefisso, numeroFormato,
  });
  stateRef.current = {
    overheadPct, margineMin, margineTarget, soglia,
    aggPosa, chiediPiano, chiediSmaltimento, chiediTrasporto,
    pdfPrezziRiga, pdfSoloTotale, pdfSconti, pdfImmagini,
    pdfSchedeTecniche, firmaAbilitata, numeroPrefisso, numeroFormato,
  };

  const buildPayload = useCallback((): Partial<PreventivoImpostazioni> => {
    const s = stateRef.current;
    return {
      overhead_percentuale: s.overheadPct.trim() !== "" ? parseFloat(s.overheadPct) : null,
      margine_minimo_percentuale: s.margineMin.trim() !== "" ? parseFloat(s.margineMin) : null,
      margine_target_percentuale: s.margineTarget.trim() !== "" ? parseFloat(s.margineTarget) : null,
      soglia_margine_visibile: s.soglia.trim() !== "" ? parseFloat(s.soglia) : null,
      aggiungi_posa_automatica: s.aggPosa,
      chiedi_piano_installazione: s.chiediPiano,
      chiedi_smaltimento: s.chiediSmaltimento,
      chiedi_trasporto: s.chiediTrasporto,
      pdf_mostra_prezzi_per_riga: s.pdfPrezziRiga,
      pdf_mostra_solo_totale: s.pdfSoloTotale,
      pdf_mostra_sconti: s.pdfSconti,
      pdf_mostra_immagini: s.pdfImmagini,
      pdf_includi_schede_tecniche: s.pdfSchedeTecniche,
      firma_digitale_abilitata: s.firmaAbilitata,
      numero_prefisso: s.numeroPrefisso || "OFF",
      numero_formato: s.numeroFormato || "{PREFIX}-{YYYY}-{NNN}",
    };
  }, []);

  const triggerAutoSave = useCallback(() => {
    setDirty(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // buildPayload reads from stateRef which is always up-to-date
      saveMutation.mutate(buildPayload());
    }, 600);
  }, [buildPayload, saveMutation]);

  const handleManualSave = () => {
    clearTimeout(debounceRef.current);
    saveMutation.mutate(buildPayload());
  };

  const makeToggle = (setter: (v: boolean) => void) => (v: boolean) => {
    setter(v);
    triggerAutoSave();
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleManualSave}
          disabled={saveMutation.isPending}
        >
          <Save className="h-4 w-4 mr-2" />
          {dirty ? "Salva modifiche" : "Salvato"}
        </Button>
      </div>

      {/* Margini di calcolo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Margini & Overhead</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label>Overhead (spese generali) %</Label>
            <Input
              type="number" min="0" max="100" placeholder="5"
              value={overheadPct}
              onChange={(e) => { setOverheadPct(e.target.value); triggerAutoSave(); }}
            />
            <p className="text-xs text-muted-foreground mt-1">Aggiunto al costo di acquisto</p>
          </div>
          <div>
            <Label>Margine minimo %</Label>
            <Input
              type="number" min="0" max="100" placeholder="15"
              value={margineMin}
              onChange={(e) => { setMargineMin(e.target.value); triggerAutoSave(); }}
            />
            <p className="text-xs text-muted-foreground mt-1">Semaforo rosso sotto questa soglia</p>
          </div>
          <div>
            <Label>Margine target default %</Label>
            <Input
              type="number" min="0" max="100" placeholder="25"
              value={margineTarget}
              onChange={(e) => { setMargineTarget(e.target.value); triggerAutoSave(); }}
            />
            <p className="text-xs text-muted-foreground mt-1">Semaforo verde sopra questo valore</p>
          </div>
        </CardContent>
      </Card>

      {/* Visibilità margini */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Visibilità margini</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Soglia minima di margine per mostrare i dati ai commerciali (lascia vuoto per nessun limite)
          </p>
          <div className="flex items-center gap-3">
            <Label className="whitespace-nowrap">Mostra solo se margine ≥</Label>
            <Input
              type="number" className="w-24" placeholder="—" min="0" max="100"
              value={soglia}
              onChange={(e) => { setSoglia(e.target.value); triggerAutoSave(); }}
            />
            <span className="text-sm">%</span>
          </div>
        </CardContent>
      </Card>

      {/* Comportamento automatico */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comportamento automatico nel preventivo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {([
            { label: "Aggiungi posa automaticamente", val: aggPosa, set: setAggPosa },
            { label: "Chiedi piano di installazione", val: chiediPiano, set: setChiediPiano },
            { label: "Chiedi smaltimento materiali", val: chiediSmaltimento, set: setChiediSmaltimento },
            { label: "Chiedi trasporto", val: chiediTrasporto, set: setChiediTrasporto },
          ] as const).map(({ label, val, set }) => (
            <div key={label} className="flex items-center gap-3">
              <Switch checked={val} onCheckedChange={makeToggle(set)} />
              <span className="text-sm">{label}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* PDF */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Impostazioni PDF</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {([
            { label: "Mostra prezzi per ogni riga", val: pdfPrezziRiga, set: setPdfPrezziRiga },
            { label: "Mostra solo il totale finale", val: pdfSoloTotale, set: setPdfSoloTotale },
            { label: "Mostra sconti applicati", val: pdfSconti, set: setPdfSconti },
            { label: "Mostra immagini prodotto", val: pdfImmagini, set: setPdfImmagini },
            { label: "Includi schede tecniche PDF", val: pdfSchedeTecniche, set: setPdfSchedeTecniche },
            { label: "Firma digitale abilitata", val: firmaAbilitata, set: setFirmaAbilitata },
          ] as const).map(({ label, val, set }) => (
            <div key={label} className="flex items-center gap-3">
              <Switch checked={val} onCheckedChange={makeToggle(set)} />
              <span className="text-sm">{label}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* T5: Numerazione preventivi */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Numerazione Preventivi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-sm">Prefisso</Label>
              <Input
                value={numeroPrefisso}
                onChange={e => { setNumeroPrefisso(e.target.value); triggerAutoSave(); }}
                placeholder="OFF"
                className="w-24 mt-1"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-sm">Formato numero</Label>
              <Input
                value={numeroFormato}
                onChange={e => { setNumeroFormato(e.target.value); triggerAutoSave(); }}
                placeholder="{PREFIX}-{YYYY}-{NNN}"
                className="mt-1"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {'{PREFIX}'} = prefisso · {'{YYYY}'} = anno · {'{YY}'} = anno breve · {'{MM}'} = mese · {'{NNN}'} = contatore 3 cifre · {'{NNNN}'} = 4 cifre
            {" — "}Esempio: <code className="bg-muted px-1 rounded">{
              (numeroFormato || "{PREFIX}-{YYYY}-{NNN}")
                .replace("{PREFIX}", numeroPrefisso || "OFF")
                .replace("{YYYY}", String(new Date().getFullYear()))
                .replace("{YY}", String(new Date().getFullYear()).slice(-2))
                .replace("{MM}", String(new Date().getMonth() + 1).padStart(2, "0"))
                .replace("{NNN}", "001")
                .replace("{NNNN}", "0001")
            }</code>
          </p>
        </CardContent>
      </Card>

      {/* Margini per categoria */}
      {categorie.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Margine target per categoria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Imposta un margine target specifico per categoria. Se vuoto, usa il default ({margineTarget || "25"}%).
            </p>
            {categorie.map((cat) => (
              <div key={cat.id} className="flex items-center gap-3">
                {cat.colore && (
                  <span
                    className="inline-block h-3 w-3 rounded-full flex-shrink-0"
                    style={{ background: cat.colore }}
                  />
                )}
                <span className="text-sm w-48 truncate">{cat.nome}</span>
                <Input
                  key={`${cat.id}-${cat.margine_target_percentuale ?? ""}`}
                  type="number"
                  placeholder={margineTarget || "25"}
                  defaultValue={cat.margine_target_percentuale ?? ""}
                  className="w-24"
                  min="0" max="100"
                  onBlur={async (e) => {
                    const val = e.target.value.trim() === "" ? null : parseFloat(e.target.value);
                    const { error } = await (supabase.from("listino_categorie") as any)
                      .update({ margine_target_percentuale: val })
                      .eq("id", cat.id).eq("company_id", companyId);
                    if (error) toast.error(error.message);
                    else toast.success(`Margine target aggiornato per ${cat.nome}`);
                    queryClient.invalidateQueries({ queryKey: ["listino-categorie", companyId] });
                  }}
                />
                <span className="text-sm">%</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Categorie Tab ────────────────────────────────────────────────────────────
function CategorieTab({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Categoria | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [creatingStandard, setCreatingStandard] = useState(false);

  const { data: categorie = [], isLoading } = useQuery({
    queryKey: ["listino-categorie", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await (supabase.from("listino_categorie") as any)
        .select("id, nome, colore, margine_target_percentuale")
        .eq("company_id", companyId).order("nome");
      return (data ?? []) as Categoria[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: arts } = await supabase
        .from("article_templates")
        .select("id").eq("categoria_id", id).limit(1);
      if (arts?.length) {
        throw new Error("Categoria in uso da prodotti. Rimuovi prima i prodotti associati.");
      }
      const { error } = await (supabase.from("listino_categorie") as any)
        .delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listino-categorie", companyId] });
      toast.success("Categoria eliminata");
      setDeleteId(null);
    },
    onError: (err: any) => { toast.error(err.message); setDeleteId(null); },
  });

  const createStandard = async () => {
    setCreatingStandard(true);
    try {
      const existingNames = new Set(categorie.map((c) => c.nome));
      const toInsert = DEFAULT_CATEGORIE
        .filter((nome) => !existingNames.has(nome))
        .map((nome) => ({ company_id: companyId, nome }));
      if (!toInsert.length) {
        toast.info("Tutte le categorie standard sono già presenti");
        return;
      }
      const { error } = await (supabase.from("listino_categorie") as any).insert(toInsert);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["listino-categorie", companyId] });
      toast.success(`${toInsert.length} categorie create`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreatingStandard(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground">{categorie.length} categorie definite</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={createStandard} disabled={creatingStandard}>
            <Zap className="h-4 w-4 mr-2" />Crea categorie standard
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />Nuova categoria
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="py-4 text-center text-muted-foreground">Caricamento...</p>
      ) : categorie.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <p className="mb-3">Nessuna categoria. Crea le categorie standard o aggiungine una manualmente.</p>
          <Button variant="outline" onClick={createStandard} disabled={creatingStandard}>
            <Zap className="h-4 w-4 mr-2" />Crea categorie standard
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categorie.map((cat) => (
            <Card key={cat.id} className="relative">
              <CardContent className="p-4 flex items-start gap-3">
                <span
                  className="inline-block h-4 w-4 rounded-full mt-0.5 flex-shrink-0"
                  style={{ background: cat.colore ?? "#e5e7eb" }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{cat.nome}</p>
                  {cat.margine_target_percentuale != null && (
                    <p className="text-xs text-muted-foreground">
                      Margine target: {cat.margine_target_percentuale}%
                    </p>
                  )}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => { setEditing(cat); setDialogOpen(true); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                    onClick={() => setDeleteId(cat.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {dialogOpen && (
        <CategoriaDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          editing={editing}
          companyId={companyId}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["listino-categorie", companyId] })}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina categoria</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è irreversibile. La categoria non deve essere in uso da prodotti.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SettingsMargini() {
  const { effectiveCompany } = useAuth() as any;
  const companyId = effectiveCompany?.id as string | undefined;

  const { data: categorie = [] } = useQuery({
    queryKey: ["listino-categorie", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await (supabase.from("listino_categorie") as any)
        .select("id, nome, colore, margine_target_percentuale")
        .eq("company_id", companyId).order("nome");
      return (data ?? []) as Categoria[];
    },
  });

  if (!companyId) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Preventivi & Margini</h1>
        <p className="text-muted-foreground text-sm">
          Configura overhead, margini target, impostazioni PDF e categorie prodotto
        </p>
      </div>

      <Tabs defaultValue="margini">
        <TabsList>
          <TabsTrigger value="margini">Margini & PDF</TabsTrigger>
          <TabsTrigger value="categorie">Categorie</TabsTrigger>
        </TabsList>
        <TabsContent value="margini" className="mt-6">
          <MarginiPdfTab companyId={companyId} categorie={categorie} />
        </TabsContent>
        <TabsContent value="categorie" className="mt-6">
          <CategorieTab companyId={companyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
