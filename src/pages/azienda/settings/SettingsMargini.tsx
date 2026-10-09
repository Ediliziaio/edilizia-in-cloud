import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  AmbitoImpostazione,
  IndiceSezioni,
  RigaImpostazione,
  RigaInterruttore,
  SezioneImpostazione,
  type VoceIndice,
} from "@/components/impostazioni/SezioneImpostazione";
import { useVaiASezione } from "@/hooks/useVaiASezione";
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
// (soglia_margine_visibile e visibilita_margini non li legge più nessuno: chi vede i margini lo decidono i
// permessi. La pagina non li mostra, e non li riscrive.)
interface PreventivoImpostazioni {
  id?: string;
  company_id: string;
  overhead_percentuale?: number | null;
  margine_minimo_percentuale?: number | null;
  margine_target_default?: number | null;
  soglia_margine_visibile?: number | null; // non si mostra più; si scrive null solo alla creazione della riga (vedi handleManualSave)
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

// Le sezioni, nell'ordine in cui compaiono: prima quello che si cerca di più (il prezzo), poi le soglie, poi le
// abitudini del preventivo generico. L'indice in cima porta alla sezione (e così fa l'indirizzo con l'àncora).
const SEZIONI: VoceIndice[] = [
  { id: "prezzo", etichetta: "Prezzo" },
  { id: "margini", etichetta: "Margini" },
  { id: "posa-e-trasporto", etichetta: "Posa e trasporto" },
  { id: "numerazione", etichetta: "Numero" },
  { id: "pdf-e-firma", etichetta: "PDF e firma" },
];

// ─── Prezzo scritto a mano ────────────────────────────────────────────────────
// Questa opzione si applica subito con una funzione dedicata del database;
// non deve riscrivere le altre opzioni (posa automatica, sconti nel PDF…).
function PrezzoFinaleAManoRiga({ companyId }: { companyId: string }) {
  const { data: attivo = false, isLoading } = usePrezzoFinaleAMano(companyId);
  const imposta = useImpostaPrezzoFinaleAMano(companyId);
  return (
    <RigaImpostazione
      titolo="Scrivi a mano il prezzo del preventivo"
      htmlFor="prezzo-a-mano"
      ambito={<AmbitoImpostazione>Tutti i preventivatori</AmbitoImpostazione>}
      descrizione="Per chi non carica i prezzi del listino: le voci restano a 0 € e il prezzo si scrive in Economia, IVA esclusa. Sconto e IVA si calcolano sopra."
      comando={
        <Switch
          id="prezzo-a-mano"
          checked={attivo}
          disabled={isLoading || imposta.isPending}
          aria-describedby="prezzo-a-mano-descrizione"
          onCheckedChange={(v) =>
            imposta.mutate(v, {
              onSuccess: () => toast.success(v ? "Prezzo scritto a mano acceso" : "Prezzo scritto a mano spento"),
              onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Salvataggio non riuscito"),
            })
          }
        />
      }
    >
      <details className="mt-1 text-xs text-muted-foreground">
        <summary className="cursor-pointer py-1">Dove vale</summary>
        <p className="mt-1">
          Serramenti, Ristrutturazione, Bagni, Tetti, Climatizzazione, Elettrico, Termoidraulico, Pavimenti, Piscine e
          preventivo generico (Marketing → Preventivi, dove serve anche scegliere l'aliquota IVA). Il Fotovoltaico ha
          già il suo prezzo a corpo.
        </p>
      </details>
    </RigaImpostazione>
  );
}

// ─── Prezzo e margini ─────────────────────────────────────────────────────────
function PrezzoEMarginiForm({
  companyId,
  categorie,
  puoModificareListino,
  puoVedereSconti,
  onDirtyChange,
}: {
  companyId: string;
  categorie: Categoria[];
  /** Margini, PDF, numerazione e margine per categoria li cambia chi può
   *  modificare il listino: è la regola del database dal 26/09/2026. Per gli
   *  altri la scheda resta in sola lettura (niente falso «aggiornato»). */
  puoModificareListino: boolean;
  puoVedereSconti: boolean;
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
  const { evidenziata, vai } = useVaiASezione(!isLoading);

  // ── Local state (mirrors DB columns) ──
  const [overheadPct, setOverheadPct] = useState("");
  const [margineMin, setMargineMin] = useState("");
  const [margineTarget, setMargineTarget] = useState("");
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
    overheadPct, margineMin, margineTarget,
    aggPosa, chiediPiano, chiediSmaltimento, chiediTrasporto,
    pdfPrezziRiga, pdfSoloTotale, pdfSconti, pdfImmagini,
    pdfSchedeTecniche, firmaAbilitata, numeroPrefisso,
    };
    return {
      overhead_percentuale: percentualeImpostazione(s.overheadPct, "Spese generali"),
      margine_minimo_percentuale: percentualeImpostazione(s.margineMin, "Margine minimo", 99.99),
      margine_target_default: percentualeImpostazione(s.margineTarget, "Margine target", 99.99),
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
      // Prima riga dell'azienda: la colonna ha come predefinito 20 e «Marginalità cantieri» la usa come ripiego del
      // margine obiettivo. La pagina non la mostra più, ma alla creazione la scrive vuota come ha sempre fatto.
      saveMutation.mutate(imp ? changes : { ...changes, soglia_margine_visibile: null });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Controlla i valori inseriti.");
    }
  };

  const makeToggle = (setter: (v: boolean) => void) => (v: boolean) => {
    setter(v);
    markDirty();
  };

  return (
    <div className="space-y-4 max-w-3xl">
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
      {/* Indice e salvataggio restano in vista mentre si scorre: prima il pulsante era in cima e, cambiato un
          interruttore in fondo, bisognava risalire per salvare. */}
      <div className="sticky top-2 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card/95 px-3 py-2 shadow-sm backdrop-blur">
        <IndiceSezioni voci={SEZIONI} onVai={vai} />
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {/* A riposo lo stato lo legge solo il lettore di schermo: la barra serve alle scorciatoie e al pulsante. */}
          <p role="status" className={cn("text-xs max-sm:sr-only", isLoading || saveMutation.isPending || dirty ? "text-muted-foreground" : "sr-only", dirty && !saveMutation.isPending && "font-medium text-amber-700 dark:text-amber-400")}>{isLoading ? "Caricamento…" : saveMutation.isPending ? "Salvataggio…" : dirty ? "Modifiche non salvate" : "Nessuna modifica da salvare"}</p>
          <Button
            size="sm"
            onClick={handleManualSave}
            disabled={saveMutation.isPending || !dirty}
          >
            <Save className="h-4 w-4 sm:mr-2" />
            {/* Da telefono resta l'icona: la riga serve all'indice. Il nome lo legge comunque il lettore di schermo. */}
            <span className="max-sm:sr-only">Salva modifiche</span>
          </Button>
        </div>
      </div>

      {/* Prezzo: quello che si cerca di più sta per primo */}
      <SezioneImpostazione
        id="prezzo"
        titolo="Prezzo del preventivo"
        descrizione="Come si arriva al prezzo e chi può cambiarlo."
        azione={<span>L'interruttore si salva subito</span>}
        evidenziata={evidenziata === "prezzo"}
      >
        <PrezzoFinaleAManoRiga companyId={companyId} />
        {puoVedereSconti && (
          <RigaImpostazione
            titolo="Limiti di sconto"
            descrizione="Quanto sconto può fare ogni venditore, per importo e per categoria di cliente."
            comando={<Button asChild variant="outline" size="sm"><Link to="/azienda/impostazioni/scontistica">Apri Sconti</Link></Button>}
          />
        )}
        <RigaImpostazione
          titolo="Seconda firma e avvisi"
          descrizione="Oltre quale importo serve una seconda approvazione, e quando una commessa segnala che costi o margine non tornano."
          comando={<Button asChild variant="outline" size="sm"><Link to="/azienda/impostazioni/approvazioni">Apri Approvazioni</Link></Button>}
        />
      </SezioneImpostazione>

      {/* Margini */}
      <SezioneImpostazione
        id="margini"
        titolo="Margini"
        descrizione="Le soglie dei semafori del preventivo e dell'analisi dei margini."
        evidenziata={evidenziata === "margini"}
      >
        <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="margini-overhead">Spese generali %</Label>
            <Input
              id="margini-overhead"
              type="number" min="0" max="100" placeholder="5"
              value={overheadPct}
              onChange={(e) => { setOverheadPct(e.target.value); markDirty(); }}
            />
            <p className="text-xs text-muted-foreground mt-1">Aggiunte al costo di acquisto</p>
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
        </div>

        {/* Margine per categoria */}
        {categorie.length > 0 && (
          <details className="px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">Margine per categoria <span className="text-xs font-normal text-muted-foreground">({categorie.length})</span></summary>
            <div className="mt-3 space-y-3">
              <p className="text-sm text-muted-foreground">
                Imposta un margine target specifico per categoria. Se vuoto, usa il default ({margineTarget || "25"}%). Le categorie si creano e si colorano dal{" "}
                <Link to="/azienda/impostazioni/listino" className="text-primary underline">Listino</Link>.
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
            </div>
          </details>
        )}

        {/* Come si leggono i numeri */}
        <details className="px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">Margine, ricarico e spese generali: come leggerli</summary>
          <dl className="mt-3 space-y-2 text-xs text-muted-foreground">
            <div>
              <dt className="font-semibold text-foreground">Spese generali</dt>
              <dd>Costo fisso aziendale spalmato sul prodotto (ammortamento, spese di struttura). Si somma al costo prima del margine.</dd>
            </div>
            <div>
              <dt className="font-semibold text-foreground">Margine minimo e target</dt>
              <dd>Il minimo è la soglia di controllo. Il target è il margine desiderato sul prezzo di vendita, non il ricarico sul costo.</dd>
            </div>
            <div>
              <dt className="font-semibold text-foreground">Come si calcola</dt>
              <dd>
                <span className="font-mono">Margine % = (Prezzo − Costo) / Prezzo × 100</span>. Costo 100 € e prezzo 130 €: ricarico 30%,
                margine 23,08%. Le soglie non modificano i preventivi già salvati.
              </dd>
            </div>
          </dl>
        </details>
      </SezioneImpostazione>

      {/* Posa, trasporto, smaltimento */}
      <SezioneImpostazione
        id="posa-e-trasporto"
        titolo="Posa, trasporto e smaltimento"
        descrizione="Cosa aggiunge o chiede da solo il preventivo."
        ambito={<AmbitoImpostazione>Preventivo generico</AmbitoImpostazione>}
        evidenziata={evidenziata === "posa-e-trasporto"}
      >
        <RigaInterruttore
          id="posa-automatica"
          titolo="Aggiungi la posa automaticamente"
          descrizione="Aggiungendo un prodotto con posa separata, il preventivo aggiunge da solo la riga di posa."
          checked={aggPosa}
          onCheckedChange={makeToggle(setAggPosa)}
        />
        <RigaInterruttore
          id="chiedi-piano"
          titolo="Chiedi il piano di installazione"
          descrizione="Il preventivo chiede a che piano si installa: serve alle tariffe di tiro al piano."
          checked={chiediPiano}
          onCheckedChange={makeToggle(setChiediPiano)}
        />
        <RigaInterruttore
          id="chiedi-smaltimento"
          titolo="Chiedi lo smaltimento dei materiali"
          descrizione="Dopo ogni prodotto il preventivo chiede se aggiungere lo smaltimento del materiale vecchio."
          checked={chiediSmaltimento}
          onCheckedChange={makeToggle(setChiediSmaltimento)}
        />
        <RigaInterruttore
          id="chiedi-trasporto"
          titolo="Chiedi il trasporto"
          descrizione="Il preventivo chiede la distanza del cantiere in km. Se il listino ha tariffe al km la chiede comunque."
          checked={chiediTrasporto}
          onCheckedChange={makeToggle(setChiediTrasporto)}
        />
      </SezioneImpostazione>

      {/* Numerazione */}
      <SezioneImpostazione
        id="numerazione"
        titolo="Numero del preventivo"
        descrizione="Come si chiamano i preventivi: prefisso, anno e progressivo."
        ambito={<AmbitoImpostazione>Preventivo generico</AmbitoImpostazione>}
        evidenziata={evidenziata === "numerazione"}
      >
        <div className="space-y-2 px-4 py-3">
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
        </div>
      </SezioneImpostazione>

      {/* PDF e firma */}
      <SezioneImpostazione
        id="pdf-e-firma"
        titolo="PDF e firma"
        descrizione="Cosa mostra il PDF di un nuovo preventivo: nel singolo preventivo si può cambiare."
        ambito={<AmbitoImpostazione>Preventivo generico</AmbitoImpostazione>}
        evidenziata={evidenziata === "pdf-e-firma"}
      >
        <RigaInterruttore
          id="pdf-prezzi-riga"
          titolo="Mostra i prezzi di ogni riga"
          descrizione="Colonne prezzo, sconto e IVA su ogni riga. Se spento: solo nome, quantità e totale."
          checked={pdfPrezziRiga}
          onCheckedChange={makeToggle(setPdfPrezziRiga)}
        />
        <RigaInterruttore
          id="pdf-solo-totale"
          titolo="Mostra solo il totale finale"
          descrizione="Niente tabella delle righe: il cliente vede soltanto il totale."
          checked={pdfSoloTotale}
          onCheckedChange={makeToggle(setPdfSoloTotale)}
        />
        <RigaInterruttore
          id="pdf-sconti"
          titolo="Mostra gli sconti applicati"
          descrizione="Colonna sconto e riga dello sconto globale. Vale anche per il PDF dei serramenti."
          checked={pdfSconti}
          onCheckedChange={makeToggle(setPdfSconti)}
        />
        <RigaInterruttore
          id="pdf-immagini"
          titolo="Mostra le immagini dei prodotti"
          descrizione="Una miniatura su ogni riga, se il prodotto ha la foto nel listino."
          checked={pdfImmagini}
          onCheckedChange={makeToggle(setPdfImmagini)}
        />
        <RigaInterruttore
          id="pdf-schede-tecniche"
          titolo="Allega le schede tecniche"
          descrizione="Aggiunge al PDF le schede tecniche dei prodotti scelti."
          checked={pdfSchedeTecniche}
          onCheckedChange={makeToggle(setPdfSchedeTecniche)}
        />
        <RigaInterruttore
          id="firma-digitale"
          titolo="Firma elettronica sui preventivi"
          descrizione="Il cliente firma il preventivo online, con il codice OTP, dal link che riceve. Il PDF non porta più il codice QR."
          checked={firmaAbilitata}
          onCheckedChange={makeToggle(setFirmaAbilitata)}
        />
        <p className="px-4 py-3 text-xs text-muted-foreground">
          I PDF di Serramenti, Bagni, Fotovoltaico e degli altri preventivatori si personalizzano in{" "}
          <Link to="/azienda/impostazioni/template-preventivi?tab=moduli-vendita" className="text-primary underline">Modelli → Moduli</Link>; clausole e firma
          elettronica sono in{" "}
          <Link to="/azienda/impostazioni/condizioni-firma" className="text-primary underline">Firma e condizioni</Link>.
        </p>
      </SezioneImpostazione>
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
  const [draftDirty, setDraftDirty] = useState(false);
  useSettingsDraftGuard(draftDirty);
  // 13/7/2026: la pagina rispetta il permesso Impostazioni dedicato (prima solo ruolo admin,
  // e il toggle dato dall'admin non apriva nulla). Modifica ⇒ tutte le azioni; Visualizza ⇒ accesso.
  const isAdmin = role === "company_admin" || role === "super_admin" || permissions.canEditSettingsPricing;
  const puoVedereSconti = Boolean(permissions.isAdmin || permissions.canViewSettingsScontistica);

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
    <div className="space-y-4">
      {isError && (
        <Alert variant="destructive">
          <AlertDescription>Errore nel caricamento. Ricarica la pagina.</AlertDescription>
        </Alert>
      )}
      <PrezzoEMarginiForm
        key={companyId}
        companyId={companyId}
        categorie={categorie}
        puoModificareListino={isAdmin}
        puoVedereSconti={puoVedereSconti}
        onDirtyChange={setDraftDirty}
      />
    </div>
  );
}
