import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Zap, Save, TrendingUp, Info, Percent, Target, Calculator } from "lucide-react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GovernanceThresholdsCard } from "@/components/settings/GovernanceThresholdsCard";

// ─── Types ────────────────────────────────────────────────────────────────────
// DB columns for preventivo_impostazioni (nomi REALI, verificati via pg_attribute):
// id, company_id, overhead_percentuale, margine_minimo_percentuale, margine_target_default,
// soglia_margine_visibile, margini_target_categorie, visibilita_margini,
// aggiungi_posa_automatica, chiedi_smaltimento, chiedi_piano_installazione, chiedi_trasporto,
// pdf_mostra_prezzi_per_riga, pdf_mostra_solo_totale, pdf_mostra_sconti, pdf_mostra_immagini,
// pdf_includi_schede_tecniche, firma_digitale_abilitata
interface PreventivoImpostazioni {
  id?: string;
  company_id: string;
  overhead_percentuale?: number | null;
  margine_minimo_percentuale?: number | null;
  margine_target_default?: number | null;
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
}

// DB columns for listino_categorie:
// id, company_id, nome, colore, margine_target_percentuale
interface Categoria {
  id: string;
  nome: string;
  colore?: string;
  immagine_url?: string | null;
  margine_target_percentuale?: number | null;
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

  const { data: imp, isError } = useQuery({
    queryKey: ["preventivo-impostazioni", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("preventivo_impostazioni") as any)
        .select("*").eq("company_id", companyId).maybeSingle();
      if (error) throw error;
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
  // Numerazione: prefisso del numero preventivo (OFF-2026-001 → es. PRV-2026-001).
  const [numeroPrefisso, setNumeroPrefisso] = useState("OFF");
  const [dirty, setDirty] = useState(false);

  // Populate from DB
  useEffect(() => {
    if (!imp) return;
    setOverheadPct(imp.overhead_percentuale != null ? String(imp.overhead_percentuale) : "");
    setMargineMin(imp.margine_minimo_percentuale != null ? String(imp.margine_minimo_percentuale) : "");
    setMargineTarget(imp.margine_target_default != null ? String(imp.margine_target_default) : "");
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
    setNumeroPrefisso(imp.numero_prefisso || "OFF");
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
    pdfSchedeTecniche, firmaAbilitata, numeroPrefisso,
  });
  stateRef.current = {
    overheadPct, margineMin, margineTarget, soglia,
    aggPosa, chiediPiano, chiediSmaltimento, chiediTrasporto,
    pdfPrezziRiga, pdfSoloTotale, pdfSconti, pdfImmagini,
    pdfSchedeTecniche, firmaAbilitata, numeroPrefisso,
  };

  const buildPayload = useCallback((): Partial<PreventivoImpostazioni> => {
    const s = stateRef.current;
    return {
      overhead_percentuale: s.overheadPct.trim() !== "" ? parseFloat(s.overheadPct) : null,
      margine_minimo_percentuale: s.margineMin.trim() !== "" ? parseFloat(s.margineMin) : null,
      margine_target_default: s.margineTarget.trim() !== "" ? parseFloat(s.margineTarget) : null,
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
      numero_prefisso: (s.numeroPrefisso.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "OFF").slice(0, 8),
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
      {isError && (
        <Alert variant="destructive">
          <AlertDescription>Errore nel caricamento. Ricarica la pagina.</AlertDescription>
        </Alert>
      )}
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

      {/* Numerazione */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Numerazione preventivi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-3">
            <Input
              value={numeroPrefisso}
              maxLength={8}
              className="w-32 font-mono uppercase"
              aria-label="Prefisso del numero preventivo"
              onChange={(e) => {
                setNumeroPrefisso(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
                triggerAutoSave();
              }}
            />
            <span className="text-sm text-muted-foreground font-mono">
              {(numeroPrefisso || "OFF")}-{new Date().getFullYear()}-001
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Solo lettere e numeri, fino a 8 caratteri. La numerazione riparte da 001 ogni anno e non
            riusa mai un numero, nemmeno se un preventivo finisce nel cestino.
          </p>
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
                    // Niente write/toast se il valore non è cambiato o non è valido (apri/chiudi senza modifiche).
                    if (val !== null && !Number.isFinite(val)) return;
                    if (val === (cat.margine_target_percentuale ?? null)) return;
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

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SettingsMargini() {
  // Bug fix: rimosso `useAuth() as any` che bypassava i type di AuthContext.
  // Ora usiamo il tipo corretto — se Company cambia, TypeScript ci avvisa.
  const { effectiveCompany, role } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();
  // 13/7/2026: la pagina rispetta il permesso Impostazioni dedicato (prima solo ruolo admin,
  // e il toggle dato dall'admin non apriva nulla). Modifica ⇒ tutte le azioni; Visualizza ⇒ accesso.
  const isAdmin = role === "company_admin" || role === "super_admin" || permissions.canEditSettingsPricing;
  const canView = isAdmin || permissions.canViewSettingsPricing;

  const { data: categorie = [], isError } = useQuery({
    queryKey: ["listino-categorie", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("listino_categorie") as any)
        .select("id, nome, colore, immagine_url, margine_target_percentuale")
        .eq("company_id", companyId).order("nome");
      if (error) throw error;
      return (data ?? []) as Categoria[];
    },
  });

  if (!companyId) return null;

  return (
    <div className="space-y-6">
      {/* Header pattern h-10 w-10 bg-primary/10 */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Margini</h1>
            <p className="text-sm text-muted-foreground">
              Spese generali, margine minimo e target (anche per linea del listino), PDF e numerazione dei preventivi. Le linee si creano e si colorano dal Listino.
            </p>
          </div>
        </div>
      </div>

      {/* Glossary card — aiuta a capire cosa configurare */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-2">
              <Percent className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">Overhead</p>
                <p className="text-xs mt-0.5">Costo fisso aziendale spalmato sul prodotto (ammortamento, spese struttura). Si somma al costo prima del margine.</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-2">
              <Target className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">Margine min / target</p>
                <p className="text-xs mt-0.5">Min = vincolo invalicabile (preventivatore avvisa). Target = margine desiderato, usato per il ricarico di default.</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-2">
              <Calculator className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">Come si compone il prezzo</p>
                <p className="text-xs mt-0.5 font-mono">
                  Prezzo = (Costo + Overhead%) × (1 + Margine%)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertDescription>Errore nel caricamento. Ricarica la pagina.</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="margini">
        <TabsList>
          <TabsTrigger value="margini">Margini &amp; PDF</TabsTrigger>
          <TabsTrigger value="governance">Governance</TabsTrigger>
        </TabsList>
        <TabsContent value="margini" className="mt-6">
          <MarginiPdfTab companyId={companyId} categorie={categorie} />
        </TabsContent>
        <TabsContent value="governance" className="mt-6">
          <GovernanceThresholdsCard companyId={companyId} isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>

      {/* Integrazioni — collegamenti alle altre pagine correlate */}
      <Card className="bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Info className="h-4 w-4" />
            Integrazioni
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1.5">
          <p>
            · Le <strong>regole di scontistica</strong> sono gestite in{" "}
            <a href="/azienda/impostazioni/scontistica" className="text-primary underline font-medium">/scontistica</a>{" "}
            (limiti per commerciale e categoria cliente).
          </p>
          <p>
            · I <strong>template PDF</strong> (layout, logo, colori) sono in{" "}
            <a href="/azienda/impostazioni/template-preventivi" className="text-primary underline font-medium">/template-preventivi</a>.
          </p>
          <p>
            · Le <strong>categorie prodotto</strong> qui sotto servono a raggruppare gli articoli del listino ({" "}
            <a href="/azienda/impostazioni/listino" className="text-primary underline font-medium">/listino</a>) e a
            calcolare margini target specifici.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
