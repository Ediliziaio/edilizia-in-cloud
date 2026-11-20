import { UniformSelect } from "@/components/ui/uniform-select";
import { lazy, Suspense, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FileText,
  ShoppingCart,
  Send,
  Truck,
  HardHat,
  ClipboardCheck,
  PenLine,
  RotateCcw,
  Save,
  RefreshCw,
  Palette,
  Check,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useDocumentPdfTemplates } from "@/hooks/useDocumentPdfTemplates";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import {
  TIPI_MODELLI_PDF,
  NOMI_MODELLI_PDF,
  aspettoDelModello,
  modelloPdfStandard,
  normalizzaModelloPdf,
  type ModelloPdf,
  type SceltaClausola,
  type TipoModelloPdf,
} from "@/lib/modelliPdf/catalogo";
import {
  clausoleStandard,
  type TipoDocumentoOperativo,
} from "@/lib/documentiOperativi/modello";
import type { ModelloPdfSalvato } from "@/lib/modelliPdf/repository";
import { anteprimaModello } from "@/lib/modelliPdf/anteprima";
import { createPdfPreviewUrl } from "@/lib/pdfPreviewSource";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import { LogoSizeControl } from "@/components/shared/LogoSizeControl";
import { LogoAlignmentControl } from "@/components/shared/LogoAlignmentControl";
import { DocumentEditorWorkspace } from "@/components/shared/DocumentEditorWorkspace";
import { DiscardDocumentDraft } from "@/components/shared/DiscardDocumentDraft";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
const Contratti = lazy(() => import("./modelliPdf/ModelliContrattiPanel"));
const ICONE = {
  materiali: ShoppingCart,
  richiesta: Send,
  servizi: HardHat,
  trasporti: Truck,
  economia: FileText,
  rapportino: ClipboardCheck,
  fine_lavori: Check,
  contratti: PenLine,
};
const DESCRIZIONI: Record<TipoModelloPdf | "contratti", string> = {
  materiali: "Materiali, fornitore e consegna",
  richiesta: "Articoli e richiesta di quotazione",
  servizi: "Prestazioni e condizioni di lavoro",
  trasporti: "Viaggi, mezzi e quantità",
  economia: "Ore, lavorazioni e riepiloghi",
  rapportino: "Attività, squadra e foto",
  fine_lavori: "Lavori eseguiti e firme",
  contratti: "Clausole e condizioni dei preventivi",
};
export default function SettingsModelliPdf() {
  const { effectiveCompany } = useAuth();
  return effectiveCompany ? <Libreria key={effectiveCompany.id} /> : null;
}
function Libreria() {
  const permissions = usePermissions();
  const query = useDocumentPdfTemplates();
  const [params, setParams] = useSearchParams();
  const richiesto = params.get("modello");
  const selected: TipoModelloPdf | "contratti" =
    richiesto === "contratti"
      ? "contratti"
      : TIPI_MODELLI_PDF.includes(richiesto as TipoModelloPdf)
        ? (richiesto as TipoModelloPdf)
        : "materiali";
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const conferma = useSettingsDraftGuard(dirty);
  const canEdit = permissions.isAdmin || permissions.canEditSettingsOrders;
  const record = query.data?.find((r) => r.document_type === selected);
  const titoli = { ...NOMI_MODELLI_PDF, contratti: "Contratti e condizioni" };
  const select = (tipo: TipoModelloPdf | "contratti") => {
    if (saving || tipo === selected || !conferma()) return;
    setDirty(false);
    setParams({ modello: tipo }, { replace: true });
  };
  return (
    <div className="min-w-0 space-y-6" data-testid="modelli-pdf-pagina">
      <p className="text-sm text-muted-foreground">Scegli il documento da personalizzare. Le modifiche salvate valgono per le nuove generazioni, senza cambiare i PDF già creati.</p>
      <section
        aria-label="Libreria modelli PDF"
        className="grid grid-cols-2 gap-3 xl:grid-cols-4"
      >
        {([...TIPI_MODELLI_PDF, "contratti"] as const).map((tipo) => {
          const Icon = ICONE[tipo];
          const custom = query.data?.some(
            (r) =>
              r.document_type === tipo &&
              JSON.stringify(
                normalizzaModelloPdf(r.document_type, r.config),
              ) !== JSON.stringify(modelloPdfStandard(r.document_type)),
          );
          return (
            <button
              key={tipo}
              type="button"
              disabled={saving}
              onClick={() => select(tipo)}
              aria-pressed={selected === tipo}
              className={cn(
                "min-w-0 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50 focus-visible:outline-primary",
                selected === tipo
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <Icon
                  className={cn(
                    "h-5 w-5",
                    selected === tipo ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {tipo === "contratti"
                    ? "Libreria contratti"
                    : custom
                      ? "Personalizzato"
                      : "Standard"}
                </span>
              </div>
              <h2 className="mt-3 text-sm font-semibold text-slate-900">
                {titoli[tipo]}
              </h2>
              <p className="mt-1 text-xs text-slate-500">{DESCRIZIONI[tipo]}</p>
            </button>
          );
        })}
      </section>
      {selected === "contratti" ? (
        <Suspense fallback={<p>Caricamento contratti…</p>}>
          <Contratti onDirty={setDirty} onSaving={setSaving} />
        </Suspense>
      ) : query.isLoading ? (
        <Card>
          <CardContent className="p-8 text-sm text-slate-600">
            Caricamento dei modelli aziendali…
          </CardContent>
        </Card>
      ) : query.error && !query.data ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p role="alert">{query.error.message}</p>
            <Button onClick={() => query.refetch()}>Riprova caricamento</Button>
          </CardContent>
        </Card>
      ) : (
        <EditorModello
          key={`${selected}:${record?.updated_at ?? "standard"}`}
          tipo={selected}
          record={record}
          altriModelli={(query.data ?? []).filter((modello) => modello.document_type !== selected)}
          canEdit={canEdit}
          onDirty={setDirty}
          onSaving={setSaving}
          save={query.save}
          reload={async () => {
            if (!conferma()) return false;
            const esito = await query.refetch();
            if (esito.isError) throw esito.error;
            return true;
          }}
        />
      )}
    </div>
  );
}
function EditorModello({
  tipo,
  record,
  altriModelli,
  canEdit,
  onDirty,
  onSaving,
  save,
  reload,
}: {
  tipo: TipoModelloPdf;
  record?: ModelloPdfSalvato;
  altriModelli: ModelloPdfSalvato[];
  canEdit: boolean;
  onDirty: (v: boolean) => void;
  onSaving: (v: boolean) => void;
  save: ReturnType<typeof useDocumentPdfTemplates>["save"];
  reload: () => Promise<boolean>;
}) {
  const { effectiveCompany } = useAuth();
  const savingGuard = useRef(false);
  const [base, setBase] = useState(() =>
    normalizzaModelloPdf(tipo, record?.config),
  );
  const [draft, setDraft] = useState(base);
  const [operazione, setOperazione] = useState<"salva" | "ricarica" | null>(null);
  const busy = operazione !== null;
  const [error, setError] = useState("");
  const [version, setVersion] = useState(record?.updated_at ?? null);
  const [sezione, setSezione] = useState("aspetto");
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  const scarta = () => {
    setDraft(base);
    setError("");
    onDirty(false);
  };
  const ricarica = async () => {
    if (savingGuard.current) return;
    savingGuard.current = true;
    setOperazione("ricarica");
    onSaving(true);
    try {
      if (await reload()) scarta();
    } catch {
      setError("Ricarica non riuscita. La bozza è ancora aperta.");
    } finally {
      savingGuard.current = false;
      setOperazione(null);
      onSaving(false);
    }
  };
  const patch = (value: Partial<ModelloPdf>) => {
    const next = { ...draft, ...value };
    setDraft(next);
    setError("");
    onDirty(JSON.stringify(next) !== JSON.stringify(base));
  };
  const salva = async () => {
    if (busy || !canEdit || savingGuard.current) return;
    if (!draft.nome.trim()) {
      setError("Indica il nome del modello.");
      setSezione("aspetto");
      return;
    }
    savingGuard.current = true;
    setOperazione("salva");
    onSaving(true);
    setError("");
    try {
      const r = await save(tipo, draft, version);
      const next = normalizzaModelloPdf(tipo, r.config);
      setBase(next);
      setDraft(next);
      setVersion(r.updated_at);
      onDirty(false);
      toast.success("Modello salvato per questa azienda");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Salvataggio non riuscito.");
    } finally {
      savingGuard.current = false;
      setOperazione(null);
      onSaving(false);
    }
  };
  const render = async () =>
    createPdfPreviewUrl(await anteprimaModello(tipo, draft, effectiveCompany!));
  const isRapporto = tipo === "rapportino" || tipo === "fine_lavori";
  const clausole = isRapporto
    ? []
    : clausoleStandard(tipo as TipoDocumentoOperativo);
  // Il riquadro delle righe da compilare esiste solo dove il documento può partire senza prezzi.
  const haDaIndicare =
    tipo === "richiesta" || tipo === "materiali" || tipo === "servizi";
  const patchClausola = (id: string, value: Partial<SceltaClausola>) => {
    const unite = { ...(draft.clausole[id] ?? {}), ...value };
    const pulita: SceltaClausola = {};
    if (unite.attiva === false) pulita.attiva = false;
    if (unite.testo) pulita.testo = unite.testo;
    const clausole = { ...draft.clausole };
    if (Object.keys(pulita).length) clausole[id] = pulita;
    else delete clausole[id];
    patch({ clausole });
  };
  return (
    <div className="min-w-0 space-y-4">
      <Card>
        <CardHeader className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Palette className="h-5 w-5 text-orange-500" />
              {NOMI_MODELLI_PDF[tipo]}
            </CardTitle>
            <Badge aria-live="polite" variant={dirty ? "outline" : "secondary"}>
              {dirty
                ? "Modifiche da salvare"
                : record &&
                    JSON.stringify(base) !==
                      JSON.stringify(modelloPdfStandard(tipo))
                  ? "Modello aziendale"
                  : "Standard di sistema"}
            </Badge>
          </div>
          <p className="text-xs text-slate-500">
            Salva il modello per usare queste impostazioni nei prossimi PDF di questo tipo.
          </p>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={salva} disabled={!canEdit || !dirty || busy}>
              <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {operazione === "salva" ? "Salvataggio…" : "Salva modello"}
            </Button>
            {canEdit && <DiscardDocumentDraft disabled={!dirty || busy} onDiscard={scarta} />}
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={ricarica}>
              <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {operazione === "ricarica" ? "Ricarico…" : "Ricarica"}
            </Button>
          </div>
        </CardHeader>
      </Card>
      <DocumentEditorWorkspace colonne="xl:grid-cols-[minmax(0,.95fr)_minmax(0,1.05fr)]"
        previewClassName="xl:sticky xl:top-4"
        editor={<Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          {!canEdit && (
            <p
              role="status"
              className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
            >
              Puoi consultare i modelli. Per modificarli serve il permesso di
              modifica delle impostazioni cantieri.
            </p>
          )}
          <Tabs value={sezione} onValueChange={setSezione}>
            <TabsList className="mb-3 flex h-auto flex-wrap justify-start gap-1">
              <TabsTrigger value="aspetto">Aspetto e logo</TabsTrigger>
              <TabsTrigger value="contenuti">Testi e condizioni</TabsTrigger>
              <TabsTrigger value="chiusura">{isRapporto ? "Piè di pagina" : "Firma e piè di pagina"}</TabsTrigger>
            </TabsList>
            <TabsContent value="aspetto">
            <fieldset disabled={!canEdit || busy} className="min-w-0 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="pdf-nome">Nome del modello</Label>
              <Input
                id="pdf-nome"
                maxLength={120}
                value={draft.nome}
                onChange={(e) => patch({ nome: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pdf-titolo">Titolo nel PDF</Label>
              <Input
                id="pdf-titolo"
                placeholder="Titolo standard del documento"
                maxLength={70}
                value={draft.titolo}
                onChange={(e) => patch({ titolo: e.target.value })}
              />
              <p className="text-xs text-slate-500">
                Lascia vuoto per usare il titolo originale.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pdf-colore">Colore principale</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="pdf-colore"
                    type="color"
                    className="h-10 w-16 p-1"
                    value={draft.colore || "#1f3a5d"}
                    onChange={(e) => patch({ colore: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => patch({ colore: "" })}
                  >
                    Standard
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pdf-carattere">Carattere</Label>
                <UniformSelect
                  id="pdf-carattere"
                  className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                  value={draft.carattere}
                  onChange={(e) =>
                    patch({
                      carattere: e.target.value as ModelloPdf["carattere"],
                    })
                  }
                >
                  <option value="helvetica">Helvetica · moderno</option>
                  <option value="times">Times · classico</option>
                  <option value="courier">Courier · tecnico</option>
                </UniformSelect>
              </div>
            </div>
            <div className="space-y-4 rounded-lg border p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="pdf-logo">Mostra il logo aziendale</Label>
                <Switch id="pdf-logo" checked={draft.mostraLogo}
                  onCheckedChange={(mostraLogo) => patch({ mostraLogo })} />
              </div>
              {draft.mostraLogo && <>
                <LogoSizeControl value={draft.scalaLogo} onChange={(scalaLogo) => patch({ scalaLogo })} />
                <LogoAlignmentControl value={draft.allineamentoLogo} onChange={(allineamentoLogo) => patch({ allineamentoLogo })} />
              </>}
            </div>
            {altriModelli.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="pdf-copia-aspetto">Copia l’impaginazione da</Label>
                <UniformSelect id="pdf-copia-aspetto" value="" onChange={(e) => {
                  const sorgente = altriModelli.find((modello) => modello.document_type === e.target.value);
                  if (sorgente) patch(aspettoDelModello(normalizzaModelloPdf(sorgente.document_type, sorgente.config)));
                }} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="">Scegli un modello salvato</option>
                  {altriModelli.map((modello) => <option key={modello.document_type} value={modello.document_type}>
                    {NOMI_MODELLI_PDF[modello.document_type]}
                  </option>)}
                </UniformSelect>
                <p className="text-xs text-muted-foreground">Applica colori, carattere, margini, logo e numerazione alla bozza.</p>
              </div>
            )}
            <div className="space-y-3 rounded-xl border bg-muted/40 p-4">
              <div>
                <h3 className="font-medium">Stile e impaginazione</h3>
                <p className="text-xs text-slate-500">
                  Parti da uno stile, poi regola ogni opzione. I testi già
                  scritti restano tuoi.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    [
                      "Moderno",
                      {
                        colore: "#1f3a5d",
                        coloreRiquadri: "#eef3f8",
                        carattere: "helvetica",
                        margine: 14,
                        dimensioneTesto: 9,
                        righeAlternate: true,
                      },
                    ],
                    [
                      "Classico",
                      {
                        colore: "#343434",
                        coloreRiquadri: "#f3f1ed",
                        carattere: "times",
                        margine: 18,
                        dimensioneTesto: 10,
                        righeAlternate: false,
                      },
                    ],
                    [
                      "Tecnico",
                      {
                        colore: "#165c55",
                        coloreRiquadri: "#edf5f3",
                        carattere: "courier",
                        margine: 10,
                        dimensioneTesto: 8,
                        righeAlternate: true,
                      },
                    ],
                  ] as const
                ).map(([nome, stile]) => (
                  <Button
                    key={nome}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => patch(stile)}
                  >
                    {nome}
                  </Button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pdf-margini">Margini laterali</Label>
                  <UniformSelect
                    id="pdf-margini"
                    className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                    value={draft.margine}
                    onChange={(e) => patch({ margine: Number(e.target.value) })}
                  >
                    <option value={0}>Standard del documento</option>
                    <option value={10}>Stretti · 10 mm</option>
                    <option value={14}>Medi · 14 mm</option>
                    <option value={18}>Ampi · 18 mm</option>
                  </UniformSelect>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pdf-dimensione">
                    Dimensione testi liberi
                  </Label>
                  <UniformSelect
                    id="pdf-dimensione"
                    className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                    value={draft.dimensioneTesto}
                    onChange={(e) =>
                      patch({ dimensioneTesto: Number(e.target.value) })
                    }
                  >
                    <option value={0}>Standard del documento</option>
                    <option value={8}>Compatta · 8 pt</option>
                    <option value={9}>Media · 9 pt</option>
                    <option value={10}>Grande · 10 pt</option>
                  </UniformSelect>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pdf-riquadri">
                    Sfondo riquadri e tabelle
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="pdf-riquadri"
                      type="color"
                      className="h-10 w-16 p-1"
                      value={draft.coloreRiquadri || "#f1f4f8"}
                      onChange={(e) =>
                        patch({ coloreRiquadri: e.target.value })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => patch({ coloreRiquadri: "" })}
                    >
                      Standard
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Scegli una tinta chiara per leggere bene i dati.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="pdf-righe">Righe alternate nelle tabelle</Label>
                <Switch
                  id="pdf-righe"
                  checked={draft.righeAlternate}
                  onCheckedChange={(value) => patch({ righeAlternate: value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => patch(modelloPdfStandard(tipo))}>
                <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />Ripristina standard
              </Button>
              <p className="text-xs text-muted-foreground">Riporta stile e testi ai valori iniziali nella bozza.</p>
            </div>
            </fieldset>
            </TabsContent>
            <TabsContent value="chiusura">
            <fieldset disabled={!canEdit || busy} className="min-w-0 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="pdf-numerazione">Numeri di pagina</Label>
                <Switch
                  id="pdf-numerazione"
                  checked={draft.numerazione}
                  onCheckedChange={(value) => patch({ numerazione: value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pdf-nota-pagina">Nota su ogni pagina</Label>
                <Input
                  id="pdf-nota-pagina"
                  maxLength={100}
                  placeholder="Es. Ufficio acquisti · acquisti@azienda.it"
                  value={draft.notaPagina}
                  onChange={(e) => patch({ notaPagina: e.target.value })}
                />
                <p className="text-xs text-slate-500">
                  Una riga aggiuntiva sotto i dati aziendali, che restano nel
                  piè di pagina.
                </p>
              </div>
            {!isRapporto && (
              <>
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <Label htmlFor="pdf-firma">Spazio per l’accettazione</Label>
                  <Switch id="pdf-firma" checked={draft.mostraFirma}
                    onCheckedChange={(mostraFirma) => patch({ mostraFirma })} />
                </div>
                {draft.mostraFirma && (
                  <div className="space-y-2">
                    <Label htmlFor="pdf-etichetta-firma">Dicitura della firma</Label>
                    <Input id="pdf-etichetta-firma" maxLength={90} placeholder="Dicitura standard"
                      value={draft.etichettaFirma} onChange={(e) => patch({ etichettaFirma: e.target.value })} />
                  </div>
                )}
              </>
            )}
            </fieldset>
            </TabsContent>
            <TabsContent value="contenuti">
            <fieldset disabled={!canEdit || busy} className="min-w-0 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="pdf-introduzione">Testo introduttivo</Label>
              <Textarea
                id="pdf-introduzione"
                rows={3}
                maxLength={1200}
                placeholder="Un messaggio prima dei dati del documento…"
                value={draft.introduzione}
                onChange={(e) => patch({ introduzione: e.target.value })}
              />
            </div>
            {!isRapporto && (
              <div className="space-y-3 rounded-xl border bg-slate-50/60 p-4">
                <div>
                  <h3 className="font-medium">Condizioni stampate sul documento</h3>
                  <p className="text-xs text-slate-500">
                    Spegni l’interruttore per non stamparle. Il testo si può
                    riscrivere: <code>{"{riferimento}"}</code> diventa «numero
                    dell’ordine - Commessa …», <code>{"{numero}"}</code> e{" "}
                    <code>{"{commessa}"}</code> solo l’uno o l’altra.
                  </p>
                </div>
                {clausole.map((c) => {
                  const scelta = draft.clausole[c.id] ?? {};
                  const attiva = scelta.attiva !== false;
                  return (
                    <div
                      key={c.id}
                      className="space-y-2 rounded-lg border bg-white p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <Label
                          htmlFor={`pdf-clausola-${c.id}`}
                          className="text-sm"
                        >
                          {c.etichetta}
                        </Label>
                        <Switch
                          id={`pdf-clausola-${c.id}`}
                          checked={attiva}
                          onCheckedChange={(value) =>
                            patchClausola(c.id, { attiva: value })
                          }
                        />
                      </div>
                      {attiva && (
                        <Textarea
                          aria-label={`Testo della clausola ${c.etichetta}`}
                          rows={2}
                          maxLength={600}
                          placeholder={c.testo}
                          value={scelta.testo ?? ""}
                          onChange={(e) =>
                            patchClausola(c.id, { testo: e.target.value })
                          }
                        />
                      )}
                      {c.soloSenzaPrezzi && (
                        <p className="text-xs text-slate-500">
                          Compare solo sui documenti inviati senza prezzi.
                        </p>
                      )}
                    </div>
                  );
                })}
                {haDaIndicare && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border bg-white p-3">
                    <div className="min-w-0">
                      <Label htmlFor="pdf-da-indicare" className="text-sm">
                        Riquadro «Da indicare nella vostra{" "}
                        {tipo === "richiesta" ? "offerta" : "conferma"}»
                      </Label>
                      <p className="mt-1 text-xs text-slate-500">
                        Le righe vuote per tempi di consegna, validità
                        dell’offerta e trasporto. Solo sui documenti senza
                        prezzi.
                      </p>
                    </div>
                    <Switch
                      id="pdf-da-indicare"
                      checked={draft.mostraDaIndicare}
                      onCheckedChange={(value) =>
                        patch({ mostraDaIndicare: value })
                      }
                    />
                  </div>
                )}
              </div>
            )}
            {!isRapporto && (
              <div className="space-y-2">
                <Label htmlFor="pdf-condizioni">
                  Condizioni predefinite (sostituiscono le clausole)
                </Label>
                <Textarea
                  id="pdf-condizioni"
                  rows={5}
                  maxLength={4000}
                  placeholder="Lascia vuoto per usare le clausole qui sopra…"
                  value={draft.condizioni}
                  onChange={(e) => patch({ condizioni: e.target.value })}
                />
                <p className="text-xs text-slate-500">
                  Se scrivi qui, questo testo prende il posto di tutte le
                  clausole qui sopra. Le condizioni scritte sul singolo
                  documento hanno comunque la precedenza.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="pdf-conclusione">Testo conclusivo</Label>
              <Textarea
                id="pdf-conclusione"
                rows={3}
                maxLength={1200}
                placeholder="Ringraziamenti, istruzioni o indicazioni finali…"
                value={draft.conclusione}
                onChange={(e) => patch({ conclusione: e.target.value })}
              />
            </div>
          </fieldset>
          <div className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            {isRapporto
              ? "Attività, foto e firme registrate restano collegate al rapportino originale. I dati aziendali sono riportati in basso, su massimo due righe."
              : "Fornitore, commessa, destinazione e importi vengono compilati dal documento. I dati aziendali sono riportati nel piè di pagina, su massimo due righe."}
          </div>
          </TabsContent>
          </Tabs>
        </CardContent>
      </Card>}
        anteprima={<section aria-label="Anteprima con dati di esempio">
        <div className="h-[72dvh] min-h-[380px] overflow-hidden rounded-xl border bg-card">
          <PdfBlobLivePreviewPanel
            renderBlobUrl={render}
            depsKey={JSON.stringify([
              effectiveCompany?.id,
              effectiveCompany?.logo_url,
              tipo,
              draft,
            ])}
            downloadFileName={`anteprima-${tipo}.pdf`}
            showDownloadOnMobile
            headerLabel="PDF con dati di esempio"
            debounceMs={650}
          />
        </div>
      </section>}
      />
    </div>
  );
}
