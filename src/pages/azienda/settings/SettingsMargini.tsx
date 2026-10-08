import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { Save, Info, Percent, Target, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GovernanceThresholdsCard } from "@/components/settings/GovernanceThresholdsCard";
import { useImpostaPrezzoFinaleAMano, usePrezzoFinaleAMano } from "@/hooks/usePrezzoFinaleAMano";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { campiMarginiModificati, percentualeImpostazione } from "@/lib/impostazioni/salvataggioMargini";

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

// ─── Prezzo scritto a mano ────────────────────────────────────────────────────
// Questa opzione si applica subito con una funzione dedicata del database;
// non deve riscrivere le altre opzioni (posa automatica, sconti nel PDF…).
function PrezzoFinaleAManoCard({ companyId }: { companyId: string }) {
  const { data: attivo = false, isLoading } = usePrezzoFinaleAMano(companyId);
  const imposta = useImpostaPrezzoFinaleAMano(companyId);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Prezzo del preventivo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-3">
          <Switch
            checked={attivo}
            disabled={isLoading || imposta.isPending}
            aria-label="Scrivi a mano il prezzo del preventivo"
            onCheckedChange={(v) =>
              imposta.mutate(v, {
                onSuccess: () => toast.success(v ? "Prezzo scritto a mano acceso" : "Prezzo scritto a mano spento"),
                onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Salvataggio non riuscito"),
              })
            }
          />
          <span className="text-sm">Scrivi a mano il prezzo del preventivo</span>
        </div>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer py-1">Come funziona · applicazione immediata</summary>
          <p className="mt-2">
          Per chi usa il preventivatore per il documento ma non carica i prezzi del listino: le voci
          possono restare a 0 € e il prezzo si scrive nella fase Economia, IVA esclusa. Sconto e IVA
          si calcolano sopra quel prezzo. Vale nei preventivatori Serramenti, Ristrutturazione, Bagni,
          Tetti, Climatizzazione, Elettrico, Termoidraulico, Pavimenti, Piscine e nel preventivo
          generico (Marketing → Preventivi, dove serve anche scegliere l'aliquota IVA); il
          Fotovoltaico ha già il suo prezzo a corpo.
          </p>
        </details>
      </CardContent>
    </Card>
  );
}

// ─── Margini & PDF Tab ────────────────────────────────────────────────────────
function MarginiPdfTab({
  companyId,
  categorie,
  puoModificareListino,
  onDirtyChange,
}: {
  companyId: string;
  categorie: Categoria[];
  /** Margini, PDF, numerazione e margine per categoria li cambia chi può
   *  modificare il listino: è la regola del database dal 26/09/2026. Per gli
   *  altri la scheda resta in sola lettura (niente falso «aggiornato»). */
  puoModificareListino: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [filtroCategorie, setFiltroCategorie] = useState("");
  const { data: imp, isError, isLoading, refetch } = useQuery({
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
  const dirtyRef = useRef(false);
  const baselineRef = useRef<Record<string, unknown>>({});
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);

  // Populate from DB
  useEffect(() => {
    if (!imp || dirtyRef.current) return;
    baselineRef.current = {
      overhead_percentuale: imp.overhead_percentuale ?? null,
      margine_minimo_percentuale: imp.margine_minimo_percentuale ?? null,
      margine_target_default: imp.margine_target_default ?? null,
      soglia_margine_visibile: imp.soglia_margine_visibile ?? null,
      aggiungi_posa_automatica: !!imp.aggiungi_posa_automatica,
      chiedi_piano_installazione: !!imp.chiedi_piano_installazione,
      chiedi_smaltimento: !!imp.chiedi_smaltimento,
      chiedi_trasporto: !!imp.chiedi_trasporto,
      pdf_mostra_prezzi_per_riga: !!imp.pdf_mostra_prezzi_per_riga,
      pdf_mostra_solo_totale: !!imp.pdf_mostra_solo_totale,
      pdf_mostra_sconti: !!imp.pdf_mostra_sconti,
      pdf_mostra_immagini: !!imp.pdf_mostra_immagini,
      pdf_includi_schede_tecniche: !!imp.pdf_includi_schede_tecniche,
      firma_digitale_abilitata: !!imp.firma_digitale_abilitata,
      numero_prefisso: imp.numero_prefisso || "OFF",
    };
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
      if (!puoModificareListino || isLoading || isError) throw new Error("Carica le impostazioni prima di salvarle.");
      const { error } = await (supabase.from("preventivo_impostazioni") as any)
        .upsert({ company_id: companyId, ...payload }, { onConflict: "company_id" }).select("id").single();
      if (error) throw error;
    },
    onSuccess: async () => {
      dirtyRef.current = false;
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["preventivo-impostazioni", companyId] });
      toast.success("Impostazioni salvate");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Il salvataggio esplicito legge l'ultima versione del form.
  const buildPayload = (): Partial<PreventivoImpostazioni> => {
    const s = {
    overheadPct, margineMin, margineTarget, soglia,
    aggPosa, chiediPiano, chiediSmaltimento, chiediTrasporto,
    pdfPrezziRiga, pdfSoloTotale, pdfSconti, pdfImmagini,
    pdfSchedeTecniche, firmaAbilitata, numeroPrefisso,
    };
    return {
      overhead_percentuale: percentualeImpostazione(s.overheadPct, "Spese generali"),
      margine_minimo_percentuale: percentualeImpostazione(s.margineMin, "Margine minimo", 99.99),
      margine_target_default: percentualeImpostazione(s.margineTarget, "Margine target", 99.99),
      soglia_margine_visibile: percentualeImpostazione(s.soglia, "Soglia di visibilità"),
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
  };

  const markDirty = useCallback(() => {
    if (!puoModificareListino || isLoading || isError) return;
    dirtyRef.current = true;
    setDirty(true);
  }, [puoModificareListino, isLoading, isError]);

  const handleManualSave = () => {
    if (!puoModificareListino || isLoading || isError || saveMutation.isPending) return;
    try {
      const payload = buildPayload();
      if (payload.margine_minimo_percentuale != null && payload.margine_target_default != null && payload.margine_minimo_percentuale > payload.margine_target_default) {
        throw new Error("Il margine minimo non può superare il margine target.");
      }
      const changes = campiMarginiModificati(payload as Record<string, unknown>, baselineRef.current);
      if (!Object.keys(changes).length) { dirtyRef.current = false; setDirty(false); return; }
      saveMutation.mutate(changes);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Controlla i valori inseriti.");
    }
  };

  const makeToggle = (setter: (v: boolean) => void) => (v: boolean) => {
    setter(v);
    markDirty();
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {isError && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center gap-3">Non riesco a leggere le impostazioni. Nessuna modifica verrà salvata.<Button size="sm" variant="outline" onClick={() => refetch()}>Riprova</Button></AlertDescription>
        </Alert>
      )}
      {!puoModificareListino && (
        <Alert>
          <AlertDescription>
            Stai consultando le impostazioni: le cambia chi ha il permesso «Listino &amp; Prezzi» in modifica.
          </AlertDescription>
        </Alert>
      )}
      {/* disabled su un fieldset spegne ogni campo e pulsante che contiene. */}
      <fieldset disabled={!puoModificareListino || isLoading || isError || saveMutation.isPending} className="m-0 min-w-0 space-y-6 border-0 p-0">
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
        <p role="status" className="text-xs text-muted-foreground">{isLoading ? "Caricamento…" : saveMutation.isPending ? "Salvataggio…" : dirty ? "Modifiche non salvate" : "Nessuna modifica da salvare"}</p>
        <Button
          size="sm"
          onClick={handleManualSave}
          disabled={saveMutation.isPending || !dirty}
        >
          <Save className="h-4 w-4 mr-2" />
          Salva modifiche
        </Button>
      </div>

      {/* Margini di calcolo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Margini & Overhead</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="margini-overhead">Overhead (spese generali) %</Label>
            <Input
              id="margini-overhead"
              type="number" min="0" max="100" placeholder="5"
              value={overheadPct}
              onChange={(e) => { setOverheadPct(e.target.value); markDirty(); }}
            />
            <p className="text-xs text-muted-foreground mt-1">Aggiunto al costo di acquisto</p>
          </div>
          <div>
            <Label htmlFor="margini-minimo">Margine minimo %</Label>
            <Input
              id="margini-minimo" type="number" min="0" max="99.99" step="0.01" placeholder="15"
              value={margineMin}
              onChange={(e) => { setMargineMin(e.target.value); markDirty(); }}
            />
            <p className="text-xs text-muted-foreground mt-1">Semaforo rosso sotto questa soglia</p>
          </div>
          <div>
            <Label htmlFor="margini-target">Margine target default %</Label>
            <Input
              id="margini-target" type="number" min="0" max="99.99" step="0.01" placeholder="25"
              value={margineTarget}
              onChange={(e) => { setMargineTarget(e.target.value); markDirty(); }}
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
          <div className="flex flex-wrap items-center gap-3">
            <Label htmlFor="margini-visibilita">Mostra solo se margine ≥</Label>
            <Input
              id="margini-visibilita"
              type="number" className="w-24" placeholder="—" min="0" max="100"
              value={soglia}
              onChange={(e) => { setSoglia(e.target.value); markDirty(); }}
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

      <PrezzoFinaleAManoCard companyId={companyId} />

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
                markDirty();
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
          <details>
            <summary className="cursor-pointer p-6 text-sm font-semibold">Margine per categoria <span className="text-xs font-normal text-muted-foreground">({categorie.length})</span></summary>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Imposta un margine target specifico per categoria. Se vuoto, usa il default ({margineTarget || "25"}%).
            </p>
            <Input value={filtroCategorie} onChange={e => setFiltroCategorie(e.target.value)} placeholder="Cerca una categoria…" aria-label="Cerca una categoria" />
            <p className="text-xs text-muted-foreground">Questi valori si salvano quando esci dal campo.</p>
            {categorie.filter(cat => cat.nome.toLowerCase().includes(filtroCategorie.trim().toLowerCase())).map((cat) => (
              <div key={cat.id} className="flex items-center gap-3">
                {cat.colore && (
                  <span
                    className="inline-block h-3 w-3 rounded-full flex-shrink-0"
                    style={{ background: cat.colore }}
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-sm" title={cat.nome}>{cat.nome}</span>
                <Input
                  key={`${cat.id}-${cat.margine_target_percentuale ?? ""}`}
                  type="number"
                  placeholder={margineTarget || "25"}
                  defaultValue={cat.margine_target_percentuale ?? ""}
                  className="w-20 shrink-0"
                  aria-label={`Margine target ${cat.nome}`}
                  min="0" max="99.99" step="0.01"
                  disabled={!puoModificareListino}
                  onBlur={async (e) => {
                    if (!puoModificareListino) return;
                    let val: number | null;
                    try { val = percentualeImpostazione(e.target.value, "Margine categoria", 99.99); }
                    catch (error) { toast.error(error instanceof Error ? error.message : "Margine non valido"); return; }
                    if (val === (cat.margine_target_percentuale ?? null)) return;
                    const { error } = await (supabase.from("listino_categorie") as any)
                      .update({ margine_target_percentuale: val })
                      .eq("id", cat.id).eq("company_id", companyId).select("id").single();
                    if (error) toast.error(error.message);
                    else {
                      toast.success(`Margine target aggiornato per ${cat.nome}`);
                      queryClient.invalidateQueries({ queryKey: ["listino-categorie", companyId] });
                    }
                  }}
                />
                <span className="text-sm">%</span>
              </div>
            ))}
          </CardContent>
          </details>
        </Card>
      )}
      </fieldset>
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
  const [tab, setTab] = useState("margini");
  const [draftDirty, setDraftDirty] = useState(false);
  const confermaUscita = useSettingsDraftGuard(draftDirty);
  // 13/7/2026: la pagina rispetta il permesso Impostazioni dedicato (prima solo ruolo admin,
  // e il toggle dato dall'admin non apriva nulla). Modifica ⇒ tutte le azioni; Visualizza ⇒ accesso.
  const isAdmin = role === "company_admin" || role === "super_admin" || permissions.canEditSettingsPricing;

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
      <p className="hidden text-sm text-muted-foreground md:block">
        Spese generali, margine minimo e target (anche per linea del listino), PDF e numerazione dei preventivi. Le linee si creano e si colorano dal Listino.
      </p>

      {/* Glossary card — aiuta a capire cosa configurare */}
      <details className="rounded-lg border bg-card">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Margine, ricarico e spese generali: come leggerli</summary>
      <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-3">
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
                <p className="text-xs mt-0.5">Min = soglia di controllo. Target = margine desiderato sul prezzo di vendita, non ricarico sul costo.</p>
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
                  Margine % = (Prezzo − Costo) / Prezzo × 100
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Costo 100 € e prezzo 130 €: ricarico 30%, margine 23,08%. Le soglie non modificano i preventivi già salvati.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      </details>

      {isError && (
        <Alert variant="destructive">
          <AlertDescription>Errore nel caricamento. Ricarica la pagina.</AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(value) => { if (value === tab || confermaUscita()) { setDraftDirty(false); setTab(value); } }}>
        <TabsList>
          <TabsTrigger value="margini">Margini &amp; PDF</TabsTrigger>
          <TabsTrigger value="governance">Regole e approvazioni</TabsTrigger>
        </TabsList>
        <TabsContent value="margini" className="mt-6">
          <MarginiPdfTab key={companyId} companyId={companyId} categorie={categorie} puoModificareListino={isAdmin} onDirtyChange={setDraftDirty} />
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
