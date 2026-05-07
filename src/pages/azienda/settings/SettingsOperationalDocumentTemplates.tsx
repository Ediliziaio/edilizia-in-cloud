import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileSignature,
  FileText,
  FolderKanban,
  Link2,
  PackageCheck,
  PenLine,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DocumentiList } from "@/components/documenti/DocumentiList";
import { useDocumentoSessioni } from "@/hooks/useDocumentoSessioni";
import { useDocumentoTemplates } from "@/hooks/useDocumentoTemplates";
import type { DocumentoTemplate, DocumentoTipo } from "@/types/fea";

const OPERATIONAL_TYPES: DocumentoTipo[] = [
  "contratto",
  "verbale",
  "modulo",
  "sal",
  "ddt",
  "variante",
  "generico",
];

const FLOW_STEPS = [
  {
    title: "Origine operativa",
    description: "Cliente, ordine o commessa sono il punto di partenza. Il documento non vive mai scollegato.",
    icon: FolderKanban,
  },
  {
    title: "Template corretto",
    description: "Collaudo, DDT, SAL, verbale o contratto prendono campi e segnaposto dal template.",
    icon: FileText,
  },
  {
    title: "Invio firma",
    description: "Il PDF generato passa alla firma elettronica con link, OTP e scadenza controllata.",
    icon: PenLine,
  },
  {
    title: "Archivio unico",
    description: "Quando viene firmato, resta legato a cliente, ordine/commessa, documenti e registro FEA.",
    icon: ShieldCheck,
  },
];

const OPERATIVE_MODULES: Array<{
  title: string;
  type: DocumentoTipo;
  area: string;
  signer: string;
  association: string;
  description: string;
  icon: typeof FileText;
}> = [
  {
    title: "Modulo collaudo / fine lavori",
    type: "modulo",
    area: "Cantieri & Lavori",
    signer: "Cliente, operaio o subappaltatore",
    association: "Cliente + commessa + rapportino",
    description: "Per chiudere posa, intervento o consegna con evidenza firmata e recuperabile.",
    icon: ClipboardCheck,
  },
  {
    title: "DDT e consegna materiali",
    type: "ddt",
    area: "Magazzino / cantiere",
    signer: "Cliente, fornitore o responsabile cantiere",
    association: "Commessa + magazzino + fornitore",
    description: "Per tracciare cosa è stato consegnato, dove e da chi è stato accettato.",
    icon: PackageCheck,
  },
  {
    title: "Contratto di commessa / subappalto",
    type: "contratto",
    area: "Cantieri & Lavori",
    signer: "Cliente o subappaltatore",
    association: "Cliente + ordine + subappaltatore",
    description: "Per accordi operativi, subappalti e condizioni firmate prima dell'esecuzione.",
    icon: FileSignature,
  },
  {
    title: "Verbale sopralluogo / variante",
    type: "verbale",
    area: "Cantiere",
    signer: "Cliente o tecnico",
    association: "Cliente + commessa + calendario",
    description: "Per cristallizzare note, misure, varianti e decisioni operative prese sul posto.",
    icon: Users,
  },
];

function getOperationalTemplates(templates: DocumentoTemplate[]) {
  return templates.filter((template) => OPERATIONAL_TYPES.includes(template.tipo_doc));
}

function getSignedOperationalCount(sessioni: ReturnType<typeof useDocumentoSessioni>["sessioni"]) {
  return sessioni.filter((sessione) => sessione.stato === "firmato" && OPERATIONAL_TYPES.includes(sessione.template?.tipo_doc ?? "generico")).length;
}

export default function SettingsOperationalDocumentTemplates() {
  const navigate = useNavigate();
  const { templates, isLoading: templatesLoading } = useDocumentoTemplates();
  const { sessioni } = useDocumentoSessioni();

  const operationalTemplates = useMemo(() => getOperationalTemplates(templates), [templates]);
  const signedCount = useMemo(() => getSignedOperationalCount(sessioni), [sessioni]);
  const activeTypes = useMemo(
    () => new Set(operationalTemplates.map((template) => template.tipo_doc)),
    [operationalTemplates],
  );

  const stats = [
    {
      label: "Template operativi",
      value: String(operationalTemplates.length),
      hint: "contratti, DDT, collaudi, SAL e moduli",
      icon: FileText,
      tone: "blue",
    },
    {
      label: "Tipi coperti",
      value: `${activeTypes.size}/${OPERATIONAL_TYPES.length}`,
      hint: "categorie operative configurate",
      icon: ClipboardCheck,
      tone: "green",
    },
    {
      label: "Documenti firmati",
      value: String(signedCount),
      hint: "sessioni operative chiuse con firma",
      icon: CheckCircle2,
      tone: "emerald",
    },
    {
      label: "Collegamento",
      value: "Cliente + Commessa",
      hint: "associazione obbligatoria nel flusso",
      icon: Link2,
      tone: "orange",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <Badge className="w-fit border-white/15 bg-white/10 text-white hover:bg-white/10">
              Cantieri & Costi
            </Badge>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Template Documenti Operativi</h2>
              <p className="mt-2 text-sm leading-6 text-white/75">
                Qui governi i modelli che generano documenti di cantiere da far firmare: collaudi, DDT,
                verbali, SAL, varianti e contratti operativi. Il documento nasce dal template, viene collegato
                a cliente e commessa, passa alla firma elettronica e rimane archiviato nello stesso flusso.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="border-white/25 bg-white/10 text-white hover:bg-white/15 hover:text-white"
              onClick={() => navigate("/azienda/firma-elettronica-cantieri?tab=template")}
            >
              Apri archivio firme
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              className="bg-orange-500 text-white hover:bg-orange-600"
              onClick={() => navigate("/azienda/firma-elettronica/nuovo-template?scope=cantieri&returnTo=/azienda/impostazioni/template-documenti-operativi")}
            >
              <FileSignature className="mr-2 h-4 w-4" />
              Nuovo template operativo
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{stat.label}</p>
                    <p className="mt-1 text-xl font-bold text-slate-950">{stat.value}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{stat.hint}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Flusso corretto</CardTitle>
          <CardDescription>
            Il template operativo deve sempre sapere da dove nasce e dove viene archiviato dopo la firma.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            {FLOW_STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="relative rounded-lg border bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-semibold text-slate-400">0{index + 1}</span>
                  </div>
                  <p className="font-semibold text-slate-950">{step.title}</p>
                  <p className="mt-1 text-sm leading-5 text-slate-600">{step.description}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Documenti da governare</CardTitle>
            <CardDescription>
              Questi sono i principali moduli operativi che devono partire da template e arrivare alla firma.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {OPERATIVE_MODULES.map((module) => {
              const Icon = module.icon;
              const configured = operationalTemplates.some((template) => template.tipo_doc === module.type);
              return (
                <div key={module.title} className="rounded-lg border p-4 transition-colors hover:border-orange-200 hover:bg-orange-50/30">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-950">{module.title}</p>
                        <Badge variant={configured ? "default" : "outline"} className={configured ? "bg-green-600" : ""}>
                          {configured ? "configurato" : "da creare"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{module.description}</p>
                      <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
                        <span><strong className="text-slate-700">Area:</strong> {module.area}</span>
                        <span><strong className="text-slate-700">Firma:</strong> {module.signer}</span>
                        <span><strong className="text-slate-700">Collega:</strong> {module.association}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Libreria template operativi</CardTitle>
            <CardDescription>
              Lista dei template già caricati per cantieri, costi, magazzino e documenti operativi.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {templatesLoading ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">
                Caricamento template...
              </div>
            ) : (
              <DocumentiList
                scope="cantieri"
                emptyTitle="Nessun template operativo ancora"
                emptyDescription="Carica collaudi, DDT, verbali, SAL o contratti operativi da collegare alle firme."
                onSelect={(template) => navigate(`/azienda/firma-elettronica/nuovo-template?templateId=${template.id}&scope=cantieri&returnTo=/azienda/impostazioni/template-documenti-operativi`)}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
