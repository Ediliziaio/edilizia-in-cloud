import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Search,
  Monitor,
  FileText,
  Check,
  Copy,
  Settings2,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ID_AVVISO_SOLA_LETTURA_MODULI, TESTO_SOLA_LETTURA } from "@/pages/azienda/settings/SettingsQuoteTemplates/constants";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useCompanyAnagraficaForTemplate } from "@/hooks/useCompanyAnagraficaForTemplate";
import { usePermissions } from "@/hooks/usePermissions";
import { useModuliVisibilita } from "@/lib/moduli-vendita";
import {
  SALES_AREAS,
  findSalesArea,
  type SalesArea,
  type SalesIntervention,
} from "@/lib/moduli-vendita/areas";
import {
  AREA_DESIGN,
  documentImage,
  DOCUMENT_MODULE_COUNT,
} from "@/lib/moduli-vendita/moduleDocuments";
import { loadModuleDocument } from "@/lib/moduli-vendita/localModuleDocuments";
import { MODELLO_NON_ONLINE, modelliDaMandareOnline, sincronizzaModelliAzienda } from "@/lib/moduli-vendita/archivioModelli";
import { loadLocalSerramentiTemplate } from "@/lib/moduli-vendita/localSerramentiTemplates";
import { findSerramentiTemplateModule } from "@/lib/moduli-vendita/serramentiTemplateModules";
import { loadLocalTettiTemplate } from "@/lib/moduli-vendita/localTettiTemplates";
import { findTettiTemplateModule } from "@/lib/moduli-vendita/tettiTemplateModules";
import { loadLocalFvTemplate } from "@/lib/moduli-vendita/localFvTemplates";
import { isFullFvModuleId } from "@/lib/moduli-vendita/fullFvModules";
import { fullModuleCover } from "@/lib/moduli-vendita/fullModuleCatalog";
import { isFullRstModuleId } from "@/lib/moduli-vendita/fullRstModules";
import { loadLocalRstTemplate } from "@/lib/moduli-vendita/localRstTemplates";
import { isFullBgnModuleId } from "@/lib/moduli-vendita/fullBgnModules";
import { loadLocalBgnTemplate } from "@/lib/moduli-vendita/localBgnTemplates";
import { isFullIdrModuleId } from "@/lib/moduli-vendita/fullIdrModules";
import { loadLocalIdrTemplate } from "@/lib/moduli-vendita/localIdrTemplates";
import { isFullClmModuleId } from "@/lib/moduli-vendita/fullClmModules";
import { loadLocalClmTemplate } from "@/lib/moduli-vendita/localClmTemplates";
import { isFullEltModuleId } from "@/lib/moduli-vendita/fullEltModules";
import { loadLocalEltTemplate } from "@/lib/moduli-vendita/localEltTemplates";
import { isFullPavModuleId } from "@/lib/moduli-vendita/fullPavModules";
import { loadLocalPavTemplate } from "@/lib/moduli-vendita/localPavTemplates";
import { isFullPscModuleId } from "@/lib/moduli-vendita/fullPscModules";
import { loadLocalPscTemplate } from "@/lib/moduli-vendita/localPscTemplates";
const Climatizzazione = lazy(() => import("@/components/climatizzazione/ClmModuleTemplatePanel").then(m => ({ default: m.ClmModuleTemplatePanel })));
const Elettrico = lazy(() => import("@/components/elettrico/EltModuleTemplatePanel").then(m => ({ default: m.EltModuleTemplatePanel })));
const Pavimenti = lazy(() => import("@/components/pavimenti/PavModuleTemplatePanel").then(m => ({ default: m.PavModuleTemplatePanel })));
const Piscine = lazy(() => import("@/components/piscine/PscModuleTemplatePanel").then(m => ({ default: m.PscModuleTemplatePanel })));
const Termoidraulico = lazy(() => import("@/components/termoidraulico/IdrModuleTemplatePanel").then(m => ({ default: m.IdrModuleTemplatePanel })));
const Bagni = lazy(() => import("@/components/bagni/BgnModuleTemplatePanel").then(m => ({ default: m.BgnModuleTemplatePanel })));
const Ristrutturazioni = lazy(() => import("@/components/ristrutturazione/RstModuleTemplatePanel").then(m => ({ default: m.RstModuleTemplatePanel })));

const Fotovoltaico = lazy(() => import("@/components/fotovoltaico/FvModuleTemplatePanel").then(m => ({ default: m.FvModuleTemplatePanel })));

/**
 * La miniatura verticale della cover, se esiste per convenzione di nome.
 * Ogni `public/module-art/<slug>-cover.jpg` ha un pari
 * `public/module-thumbs/<slug>-cover-thumb.webp` (480×720 WebP, ~50 KB
 * invece dei ~400 KB della cover a piena grandezza). La libreria dei
 * modelli fa scrolling con tante card: caricare 33 miniature invece di 33
 * cover intere è ~15 MB in meno di traffico. Per le vecchie cover senza
 * `-cover.jpg` alla fine (path storici come `/module-art/bagni.jpg`)
 * lasciamo la cover originale — nessun thumb esiste, e vale il fallback.
 */
function coverThumb(cover: string): string {
  if (!cover.endsWith("-cover.jpg")) return cover;
  return cover.replace("/module-art/", "/module-thumbs/").replace(/-cover\.jpg$/, "-cover-thumb.webp");
}

const Serramenti = lazy(() =>
  import("@/components/serramenti/SerramentiModuleTemplatesPanel").then(
    (m) => ({ default: m.SerramentiModuleTemplatesPanel }),
  ),
);
const Tetti = lazy(() =>
  import("@/components/tetti/TettiModuleTemplatesPanel").then((m) => ({
    default: m.TettiModuleTemplatesPanel,
  })),
);
const Editor = lazy(() =>
  import("./LocalModuleDocumentEditor").then((m) => ({
    default: m.LocalModuleDocumentEditor,
  })),
);
// La copia trascina il registro dei modelli (tutte le factory): si carica solo
// al primo clic su «Copia configurazione su…», non all'apertura della libreria.
const CopiaDialog = lazy(() =>
  import("./CopiaConfigurazioneDialog").then((m) => ({
    default: m.CopiaConfigurazioneDialog,
  })),
);
/** C'è un modello salvato per il tipo attivo, quindi qualcosa da copiare. */
const puoiCopiare = (status: string) =>
  status === "Salvato" || status.includes("aggiorna la copia");
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function savedStatus(company: string | null, area: string, module: string) {
  if (!company) return "Da personalizzare";
  try {
    const nativeSaved =
      area === "climatizzazione" && isFullClmModuleId(module) ? loadLocalClmTemplate(company, module) :
      area === "elettrico" && isFullEltModuleId(module) ? loadLocalEltTemplate(company, module) :
      (area === "pavimenti" || area === "giardini") && isFullPavModuleId(module) ? loadLocalPavTemplate(company, module) :
      area === "piscine" && isFullPscModuleId(module) ? loadLocalPscTemplate(company, module) : undefined;
    if (nativeSaved !== undefined) return nativeSaved ? "Salvato" : loadModuleDocument(company, area, module) ? "Nuova edizione disponibile · bozza precedente conservata" : "Da personalizzare";
    if (area === "termoidraulica" && isFullIdrModuleId(module)) return loadLocalIdrTemplate(company, module) ? "Salvato" : "Da personalizzare";
    if (area === "bagni" && isFullBgnModuleId(module)) {
      if (loadLocalBgnTemplate(company, module)) return "Salvato";
      return loadModuleDocument(company, area, module) ? "Edizione completa disponibile · bozza precedente conservata" : "Da personalizzare";
    }
    if ((area === "ristrutturazioni" || area === "pareti-soffitti" || area === "pergole" || area === "facciate") && isFullRstModuleId(module)) {
      if (loadLocalRstTemplate(company, module)) return "Salvato";
      return loadModuleDocument(company, area, module) ? "Edizione completa disponibile · bozza precedente conservata" : "Da personalizzare";
    }
    if (area === "fotovoltaico" && isFullFvModuleId(module)) return loadLocalFvTemplate(company, module) ? "Salvato" : "Da personalizzare";
    const sr = area === "serramenti" && findSerramentiTemplateModule(module);
    const tet = area === "tetti" && findTettiTemplateModule(module);
    const saved = sr
      ? loadLocalSerramentiTemplate(company, sr.id)
      : tet
        ? loadLocalTettiTemplate(company, tet.id)
        : loadModuleDocument(company, area, module);
    if (saved && (sr || tet) && fullModuleCover(area, module)) {
      const edition = "template" in saved ? saved.template.pdf_blocchi?.modulo_edizione : undefined;
      if (edition !== 2) return "Edizione completa disponibile · aggiorna la copia";
    }
    return saved ? "Salvato" : "Da personalizzare";
  } catch {
    return "Modello da verificare";
  }
}

/**
 * Allinea i modelli dell'azienda (database ↔ browser) all'apertura della libreria
 * e a ogni «Riprova». Stato proprio, senza React Query: la libreria si monta
 * anche fuori dall'app (anteprime, test).
 */
function useSincroniaModelli(companyId: string | null | undefined) {
  const [giro, setGiro] = useState(0);
  const [concluso, setConcluso] = useState<{ chiave: string; errore: boolean } | null>(null);
  const chiave = companyId ? `${companyId}:${giro}` : null;
  useEffect(() => {
    if (!companyId) return undefined;
    let attivo = true;
    const questo = `${companyId}:${giro}`;
    sincronizzaModelliAzienda(companyId).then(
      () => { if (attivo) setConcluso({ chiave: questo, errore: false }); },
      (e: unknown) => {
        console.warn("[modelli libreria] sincronizzazione non riuscita:", e instanceof Error ? e.message : e);
        if (attivo) setConcluso({ chiave: questo, errore: true });
      },
    );
    return () => { attivo = false; };
  }, [companyId, giro]);
  // Un salvataggio dall'editor che non arriva online: lo si dice subito, e
  // l'avviso «da mandare online» della libreria si aggiorna.
  const [, setMancatiOnline] = useState(0);
  useEffect(() => {
    const avvisa = () => {
      setMancatiOnline((n) => n + 1);
      toast.error("Modello salvato solo in questo browser", {
        description: "Non riesco a mandarlo online: i colleghi non lo vedono ancora. Dalla libreria dei modelli puoi riprovare.",
      });
    };
    window.addEventListener(MODELLO_NON_ONLINE, avvisa);
    return () => window.removeEventListener(MODELLO_NON_ONLINE, avvisa);
  }, []);
  const inCorso = !!chiave && concluso?.chiave !== chiave;
  return { inCorso, errore: !inCorso && !!concluso?.errore, riprova: () => setGiro((g) => g + 1) };
}

export default function ModuleTemplateLibrary({
  renderLegacy,
}: {
  renderLegacy: () => ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [copiaSorgente, setCopiaSorgente] = useState<{ areaId: string; moduleId: string; titolo: string; areaTitolo: string } | null>(null);
  const companyId = useEffectiveCompanyId();
  const company = useCompanyAnagraficaForTemplate();
  const permessi = usePermissions();
  const canEdit = permessi.canEditSettingsPricing;
  // L'avviso di sola lettura (e il perché dei pulsanti spenti) non compare mentre i permessi si caricano.
  const mostraAvvisoSolaLettura = !canEdit && !permessi.isLoading;
  const spiegaSolaLettura = !canEdit ? ID_AVVISO_SOLA_LETTURA_MODULI : undefined;
  const { isModuloVisibile, setModuloVisibile, isSaving, isLoading } =
    useModuliVisibilita();
  // I modelli sono dell'azienda (modelli_libreria_azienda): all'apertura le copie
  // online più recenti tornano nel browser e quelle rimaste qui vanno online.
  const sincronia = useSincroniaModelli(companyId);
  const daMandareOnline = companyId && !sincronia.inCorso ? modelliDaMandareOnline(companyId) : [];
  // Alcune aree hanno lo stesso preventivatore: «ristrutturazione» (Ristrutturazioni, Pareti e soffitti, Pergole e tende,
  // Facciate) e «pavimenti» (Pavimenti, Giardini). `modulo` dice il preventivatore; per le aree che non sono la prima di quel
  // preventivatore l'indirizzo porta anche `area=<id>`. Conta solo se è coerente con `modulo`: un `area` rimasto da prima si ignora.
  const areaScelta = findSalesArea(params.get("area"));
  const area = areaScelta && areaScelta.sourceModule === params.get("modulo") ? areaScelta : findSalesArea(params.get("modulo"));
  const selected = params.get("modello");
  const module = area?.interventions.find((m) => m.id === selected);
  const navigate = (a?: SalesArea, m?: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", "moduli-vendita");
    next.delete("section");
    next.delete("edizione");
    if (a) {
      next.set("modulo", a.sourceModule);
      if (findSalesArea(a.sourceModule)?.id !== a.id) next.set("area", a.id);
      else next.delete("area");
    } else {
      next.delete("modulo");
      next.delete("area");
    }
    if (m) {
      next.set("modello", m);
      if (a && m !== "generale" && fullModuleCover(a.id, m)) next.set("section", "page_cover");
    }
    else next.delete("modello");
    setParams(next);
    setQuery("");
  };
  if (selected === "generale" && area && area.id !== "facciate") {
    // Anche scrivendo l'indirizzo a mano: chi non può modificare non apre l'editor del modello dell'area.
    if (!canEdit)
      return (
        <div role="alert" className="rounded-xl border p-5">
          Non hai i permessi per modificare i modelli.
          <Button variant="link" onClick={() => navigate(area)}>
            Torna ai moduli
          </Button>
        </div>
      );
    return (
      <>
        <Button variant="ghost" className="mb-4" onClick={() => navigate(area)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Moduli dell'area {area.title}
        </Button>
        {renderLegacy()}
      </>
    );
  }
  if (module && area) {
    if (!canEdit)
      return (
        <div role="alert" className="rounded-xl border p-5">
          Non hai i permessi per modificare i modelli.
          <Button variant="link" onClick={() => navigate(area)}>
            Torna ai moduli
          </Button>
        </div>
      );
    if (!companyId) return <p role="status">Caricamento azienda…</p>;
    if (sincronia.inCorso) return <p role="status">Caricamento dei modelli dell'azienda…</p>;
    return (
      <Suspense fallback={<p role="status">Caricamento editor e anteprima…</p>}>
        {area.id === "serramenti" ? (
          <Serramenti />
        ) : area.id === "tetti" ? (
          <Tetti />
        ) : area.id === "fotovoltaico" && isFullFvModuleId(module.id) && params.get("edizione") !== "precedente" ? (
          <Fotovoltaico moduleId={module.id} />
        ) : (area.id === "ristrutturazioni" || area.id === "pareti-soffitti" || area.id === "pergole" || area.id === "facciate") && isFullRstModuleId(module.id) && params.get("edizione") !== "precedente" ? (
          <Ristrutturazioni moduleId={module.id} />
        ) : area.id === "bagni" && isFullBgnModuleId(module.id) && params.get("edizione") !== "precedente" ? (
          <Bagni moduleId={module.id} />
        ) : area.id === "termoidraulica" && isFullIdrModuleId(module.id) && params.get("edizione") !== "precedente" ? (
          <Termoidraulico moduleId={module.id} />
        ) : area.id === "climatizzazione" && isFullClmModuleId(module.id) && params.get("edizione") !== "precedente" ? (
          <Climatizzazione moduleId={module.id} />
        ) : area.id === "elettrico" && isFullEltModuleId(module.id) && params.get("edizione") !== "precedente" ? (
          <Elettrico moduleId={module.id} />
        ) : (area.id === "pavimenti" || area.id === "giardini") && isFullPavModuleId(module.id) && params.get("edizione") !== "precedente" ? (
          <Pavimenti moduleId={module.id} />
        ) : area.id === "piscine" && isFullPscModuleId(module.id) && params.get("edizione") !== "precedente" ? (
          <Piscine moduleId={module.id} />
        ) : (
          <Editor
            key={`${companyId}:${area.id}:${module.id}`}
            companyId={companyId}
            areaId={area.id}
            moduleId={module.id}
            company={{
              name: company?.ragione_sociale ?? "",
              address: company?.indirizzo_completo ?? "",
              email: company?.email ?? "",
              phone: company?.telefono ?? "",
            }}
            onBack={() => navigate(area)}
          />
        )}
      </Suspense>
    );
  }
  const scope = area ? [area] : SALES_AREAS;
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  const results = scope
    .flatMap((a) => a.interventions.map((m) => ({ a, m })))
    .filter(({ a, m }) =>
      words.every((w) =>
        normalize(
          `${a.title} ${m.title} ${m.summary} ${m.fields.join(" ")}`,
        ).includes(w),
      ),
    );
  const card = (a: SalesArea, m: SalesIntervention, i: number) => {
    const status = savedStatus(companyId, a.id, m.id);
    const cover = fullModuleCover(a.id, m.id);
    return (
      <article
        key={`${a.id}/${m.id}`}
        className="flex flex-col overflow-hidden rounded-2xl border bg-white transition-shadow hover:shadow-md"
      >
        {cover && <div className="relative h-36 overflow-hidden">
          <img src={coverThumb(cover)} alt={`Copertina illustrativa — ${m.title}`} loading="lazy" className="h-full w-full object-cover object-center" />
          <span className="absolute bottom-2 left-3 rounded-full bg-black/65 px-2 py-1 text-[10px] text-white">Immagine del modello · illustrativa</span>
        </div>}
        <div className="flex items-center gap-3 border-b bg-slate-50/60 px-5 py-4">
          <span
            style={{ color: AREA_DESIGN[a.id].color }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-white text-sm font-semibold"
          >
            {String(i + 1).padStart(2, "0")}
          </span>
          <div>
            <p className="text-xs text-muted-foreground">{a.title}</p>
            <p
              className={`text-xs ${status === "Salvato" ? "text-emerald-700" : "text-muted-foreground"}`}
            >
              {status}
            </p>
          </div>
        </div>
        <div className="flex flex-1 flex-col p-5">
          <span className={`mb-3 w-fit rounded-full px-2 py-1 text-xs ${cover ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{cover ? "PDF con pagine dedicate" : "Edizione essenziale · da completare"}</span>
          <h3 className="text-lg font-semibold leading-snug">{m.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {m.summary}
          </p>
          <ul className="my-5 space-y-2">
            {m.fields.map((f) => (
              <li key={f} className="flex gap-2 text-xs text-slate-600">
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-auto space-y-2">
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => navigate(a, m.id)}
              disabled={!canEdit || !companyId}
              aria-describedby={spiegaSolaLettura}
            >
              Personalizza PDF
              <ArrowRight className="h-4 w-4" />
            </Button>
            {canEdit && companyId && puoiCopiare(status) && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between text-xs text-slate-600"
                onClick={() => setCopiaSorgente({ areaId: a.id, moduleId: m.id, titolo: m.title, areaTitolo: a.title })}
              >
                <span className="inline-flex items-center gap-1"><Copy className="h-3.5 w-3.5" /> Copia configurazione su…</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </article>
    );
  };
  return (
    <div className="space-y-6">
      {/* Chi non può modificare lo legge per primo; i pulsanti spenti qui sotto rimandano a questa frase. */}
      {mostraAvvisoSolaLettura && (
        <Alert id={ID_AVVISO_SOLA_LETTURA_MODULI}>
          <AlertDescription>{TESTO_SOLA_LETTURA}</AlertDescription>
        </Alert>
      )}
      <header>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <button className="hover:underline" onClick={() => navigate()}>
            Moduli
          </button>
          {area && (
            <>
              <span>/</span>
              <span>{area.title}</span>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            {/* Il titolo della pagina è nel layout (h1): quello di questa scheda è un h2. */}
            <h2 className="text-lg font-semibold tracking-tight">
              {area ? `Moduli ${area.title}` : "Un modello per ogni intervento"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {area
                ? "Scegli l’intervento: ogni modello ha testi, immagini e pagine dedicati. Personalizza i contenuti e controlla l’anteprima PDF."
                : `${DOCUMENT_MODULE_COUNT} modelli in ${SALES_AREAS.length} aree. Trova l’intervento, adatta i contenuti alla tua azienda e verifica l’anteprima.`}
            </p>
            {!area && (
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Gli interruttori «Area nel menu Nuovo preventivo» decidono quali preventivi compaiono ai tuoi colleghi.
              </p>
            )}
          </div>
          {area && (
            <Button variant="outline" onClick={() => navigate()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Tutte le aree
            </Button>
          )}
        </div>
      </header>
      <div className="flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-3 text-xs leading-relaxed text-sky-950">
        <Monitor className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <strong>Modelli dell&apos;azienda.</strong> Le personalizzazioni si
          salvano online e le vedono tutti i colleghi. Quando crei un preventivo
          da un intervento, il PDF usa il suo modello. Fanno eccezione solo le
          Facciate, che non hanno ancora un preventivatore. Il modello dell&apos;area
          resta invariato.
        </p>
      </div>
      {sincronia.errore && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
          <span>Non riesco a leggere i modelli salvati online: stai vedendo le copie di questo browser.</span>
          <Button variant="outline" size="sm" className="h-8 bg-white" onClick={sincronia.riprova}>Riprova</Button>
        </div>
      )}
      {daMandareOnline.length > 0 && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
          <span>
            {daMandareOnline.length === 1
              ? "Un modello è salvato solo in questo browser: non è ancora online e i colleghi non lo vedono."
              : `${daMandareOnline.length} modelli sono salvati solo in questo browser: non sono ancora online e i colleghi non li vedono.`}
          </span>
          <Button variant="outline" size="sm" className="h-8 bg-white" onClick={sincronia.riprova}>Riprova</Button>
        </div>
      )}
      {selected && !module && (
        <p role="alert" className="text-sm text-amber-800">
          Modello non disponibile. Scegli uno degli interventi dell'area.
        </p>
      )}
      {area && (
        <div className="grid overflow-hidden rounded-2xl border bg-[#f8f6f2] md:grid-cols-[minmax(0,1fr)_minmax(240px,0.55fr)]">
          <div className="p-5">
            <p
              style={{ color: AREA_DESIGN[area.id].color }}
              className="text-xs font-semibold uppercase tracking-widest"
            >
              {area.interventions.length} modelli · {area.interventions.filter(m => fullModuleCover(area.id, m.id)).length} PDF con pagine dedicate
            </p>
            <h3 className="mt-2 text-xl font-semibold">
              {AREA_DESIGN[area.id].intro}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">{area.summary}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Immagine illustrativa dell'area, generata con AI.
            </p>
          </div>
          <img
            src={documentImage(area.id, "")}
            alt={`Illustrazione dell'area ${area.title}`}
            className="h-36 w-full object-cover md:h-full md:max-h-44"
          />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Cerca un modulo"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            placeholder={
              area
                ? "Cerca tra gli interventi dell’area…"
                : "Cerca: zanzariere, vasca, accumulo…"
            }
          />
        </div>
        <span role="status" className="text-xs text-muted-foreground">
          {query.trim()
            ? `${results.length} ${results.length === 1 ? "modello trovato" : "modelli trovati"}`
            : area
              ? `${area.interventions.length} modelli`
              : `${SALES_AREAS.length} aree · ${DOCUMENT_MODULE_COUNT} modelli`}
        </span>
      </div>
      {!area && !query.trim() ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {SALES_AREAS.map((a) => (
            <article
              key={a.id}
              className="overflow-hidden rounded-2xl border bg-white transition-shadow hover:shadow-md"
            >
              <button
                className="w-full text-left"
                onClick={() => navigate(a)}
                aria-label={`Apri area ${a.title}`}
              >
                <img
                  src={`/module-art/${a.id}-thumb.jpg`}
                  alt=""
                  loading="lazy"
                  className="h-36 w-full object-cover"
                />
                <div className="p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold">{a.title}</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                      {a.interventions.length} modelli
                    </span>
                  </div>
                  <p className="mt-2 min-h-10 text-sm text-muted-foreground">
                    {a.summary}
                  </p>
                  <span
                    className="mt-4 flex items-center justify-between text-sm font-medium"
                    style={{ color: AREA_DESIGN[a.id].color }}
                  >
                    Scegli l’intervento
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </button>
              {a.id !== "facciate" && (
                <div className="flex items-center justify-between gap-2 border-t px-5 py-1">
                  {/* L'etichetta è alta quanto un dito: l'interruttore da solo è alto 24 px. */}
                  <label
                    htmlFor={`area-active-${a.id}`}
                    className="flex min-h-11 flex-1 cursor-pointer items-center text-xs text-muted-foreground"
                  >
                    Area nel menu Nuovo preventivo
                  </label>
                  <Switch
                    id={`area-active-${a.id}`}
                    checked={isModuloVisibile(a.sourceModule)}
                    disabled={!canEdit || !companyId || isLoading || isSaving}
                    aria-describedby={spiegaSolaLettura}
                    onCheckedChange={(v) =>
                      setModuloVisibile(a.sourceModule, v)
                    }
                  />
                </div>
              )}
            </article>
          ))}
        </div>
      ) : results.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {results.map(({ a, m }, i) => card(a, m, i))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Search className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
          <p>Nessun modulo trovato.</p>
          <Button variant="link" onClick={() => setQuery("")}>
            Mostra tutti i moduli
          </Button>
        </div>
      )}
      {area && area.id !== "facciate" && (
        <details className="rounded-xl border bg-slate-50 p-4">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Modello dell&apos;area e visibilità
          </summary>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Switch
                id="area-active-detail"
                checked={isModuloVisibile(area.sourceModule)}
                disabled={!canEdit || !companyId || isLoading || isSaving}
                aria-describedby={spiegaSolaLettura}
                onCheckedChange={(v) => setModuloVisibile(area.sourceModule, v)}
              />
              <label htmlFor="area-active-detail" className="text-xs">
                Area visibile nel menu Nuovo preventivo · impostazione online
              </label>
            </div>
            <Button
              variant="outline"
              disabled={!canEdit}
              aria-describedby={spiegaSolaLettura}
              onClick={() => navigate(area, "generale")}
            >
              <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
              Apri il modello dell&apos;area
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Il modello dell&apos;area è quello usato dal preventivatore attuale. Non
            viene sostituito dai modelli degli interventi qui sopra.
          </p>
        </details>
      )}
      {!area && (
        <p className="text-xs text-muted-foreground">
          Le immagini delle aree sono illustrative, generate con AI: non
          rappresentano lavori eseguiti o prodotti inclusi nell'offerta.
        </p>
      )}
      {companyId && copiaSorgente && (
        <Suspense fallback={null}>
          <CopiaDialog
            open
            onOpenChange={(o) => { if (!o) setCopiaSorgente(null); }}
            companyId={companyId}
            anagrafica={{
              name: company?.ragione_sociale ?? "",
              address: company?.indirizzo_completo ?? "",
              email: company?.email ?? "",
              phone: company?.telefono ?? "",
            }}
            sorgente={copiaSorgente}
          />
        </Suspense>
      )}
    </div>
  );
}
