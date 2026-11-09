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
  ArrowRight,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useDocumentPdfTemplates } from "@/hooks/useDocumentPdfTemplates";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import {
  TIPI_MODELLI_PDF,
  NOMI_MODELLI_PDF,
  modelloPdfStandard,
  normalizzaModelloPdf,
  type ModelloPdf,
  type TipoModelloPdf,
} from "@/lib/modelliPdf/catalogo";
import type { ModelloPdfSalvato } from "@/lib/modelliPdf/repository";
import { anteprimaModello } from "@/lib/modelliPdf/anteprima";
import { createPdfPreviewUrl } from "@/lib/pdfPreviewSource";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
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
    if (saving || !conferma()) return;
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
      ) : query.error ? (
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
          canEdit={canEdit}
          onDirty={setDirty}
          onSaving={setSaving}
          save={query.save}
          reload={async () => {
            if (conferma()) {
              setDirty(false);
              await query.refetch();
            }
          }}
        />
      )}
    </div>
  );
}
function EditorModello({
  tipo,
  record,
  canEdit,
  onDirty,
  onSaving,
  save,
  reload,
}: {
  tipo: TipoModelloPdf;
  record?: ModelloPdfSalvato;
  canEdit: boolean;
  onDirty: (v: boolean) => void;
  onSaving: (v: boolean) => void;
  save: ReturnType<typeof useDocumentPdfTemplates>["save"];
  reload: () => Promise<void>;
}) {
  const { effectiveCompany } = useAuth();
  const savingGuard = useRef(false);
  const [base, setBase] = useState(() =>
    normalizzaModelloPdf(tipo, record?.config),
  );
  const [draft, setDraft] = useState(base);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(record?.updated_at ?? null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
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
      return;
    }
    savingGuard.current = true;
    setBusy(true);
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
      setBusy(false);
      onSaving(false);
    }
  };
  const render = async () =>
    createPdfPreviewUrl(await anteprimaModello(tipo, draft, effectiveCompany!));
  const isRapporto = tipo === "rapportino" || tipo === "fine_lavori";
  return (
    <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)]">
      <Card className="min-w-0 xl:max-h-[calc(75vh+32px)] xl:overflow-y-auto">
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Palette className="h-5 w-5 text-orange-500" />
              {NOMI_MODELLI_PDF[tipo]}
            </CardTitle>
            <Badge variant={dirty ? "outline" : "secondary"}>
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
            Le modifiche salvate verranno usate nelle nuove generazioni. Il PDF
            di esempio si aggiorna mentre lavori.
          </p>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          {!canEdit && (
            <p
              role="status"
              className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
            >
              Puoi consultare i modelli. Per modificarli serve il permesso di
              modifica delle impostazioni cantieri.
            </p>
          )}
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
                <select
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
                </select>
              </div>
            </div>
            <div className="space-y-3 rounded-xl border bg-slate-50/60 p-4">
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
                  <select
                    id="pdf-margini"
                    className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                    value={draft.margine}
                    onChange={(e) => patch({ margine: Number(e.target.value) })}
                  >
                    <option value={0}>Standard del documento</option>
                    <option value={10}>Stretti · 10 mm</option>
                    <option value={14}>Medi · 14 mm</option>
                    <option value={18}>Ampi · 18 mm</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pdf-dimensione">
                    Dimensione testi liberi
                  </Label>
                  <select
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
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pdf-scala-logo">Dimensione del logo</Label>
                  <select
                    id="pdf-scala-logo"
                    className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                    value={draft.scalaLogo}
                    onChange={(e) =>
                      patch({ scalaLogo: Number(e.target.value) })
                    }
                  >
                    <option value={70}>Piccolo · 70%</option>
                    <option value={85}>Medio · 85%</option>
                    <option value={100}>Standard · 100%</option>
                  </select>
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
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <Label htmlFor="pdf-logo">Mostra il logo aziendale</Label>
              <Switch
                id="pdf-logo"
                checked={draft.mostraLogo}
                onCheckedChange={(value) => patch({ mostraLogo: value })}
              />
            </div>
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
              <div className="space-y-2">
                <Label htmlFor="pdf-condizioni">Condizioni predefinite</Label>
                <Textarea
                  id="pdf-condizioni"
                  rows={5}
                  maxLength={4000}
                  placeholder="Condizioni da usare quando il documento non ne specifica altre…"
                  value={draft.condizioni}
                  onChange={(e) => patch({ condizioni: e.target.value })}
                />
                <p className="text-xs text-slate-500">
                  Le condizioni specifiche del documento hanno precedenza. La
                  dicitura sui prezzi da confermare rimane automatica.
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
            {!isRapporto && (
              <>
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <Label htmlFor="pdf-firma">Spazio per l’accettazione</Label>
                  <Switch
                    id="pdf-firma"
                    checked={draft.mostraFirma}
                    onCheckedChange={(value) => patch({ mostraFirma: value })}
                  />
                </div>
                {draft.mostraFirma && (
                  <div className="space-y-2">
                    <Label htmlFor="pdf-etichetta-firma">
                      Dicitura della firma
                    </Label>
                    <Input
                      id="pdf-etichetta-firma"
                      maxLength={90}
                      placeholder="Dicitura standard"
                      value={draft.etichettaFirma}
                      onChange={(e) =>
                        patch({ etichettaFirma: e.target.value })
                      }
                    />
                  </div>
                )}
              </>
            )}
          </fieldset>
          <div className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            {isRapporto
              ? "Attività, foto e firme registrate restano collegate al rapportino originale. I dati aziendali sono riportati in basso, su massimo due righe."
              : "Fornitore, commessa, destinazione e importi vengono compilati dal documento. I dati aziendali sono riportati nel piè di pagina, su massimo due righe."}
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              type="button"
              onClick={salva}
              disabled={!dirty || busy || !canEdit}
            >
              <Save className="mr-2 h-4 w-4" />
              {busy ? "Salvataggio…" : "Salva modello"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!canEdit || busy}
              onClick={() => patch(modelloPdfStandard(tipo))}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Ripristina standard
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={reload}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Ricarica
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="min-w-0">
        <div className="mb-3 flex items-center gap-2 text-sm text-slate-600">
          <ArrowRight className="h-4 w-4 text-orange-500" />
          Anteprima con dati di esempio
        </div>
        <div className="h-[75vh] min-h-[480px] overflow-hidden rounded-xl border bg-white">
          <PdfBlobLivePreviewPanel
            renderBlobUrl={render}
            depsKey={JSON.stringify([
              effectiveCompany?.id,
              effectiveCompany?.logo_url,
              tipo,
              draft,
            ])}
            downloadFileName={`anteprima-${tipo}.pdf`}
            allowOpenInNewTab={false}
            showDownloadOnMobile
            debounceMs={650}
          />
        </div>
      </div>
    </div>
  );
}
