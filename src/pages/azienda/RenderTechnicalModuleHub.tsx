import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import {
  ArrowLeft,
  CheckCircle2,
  GalleryHorizontalEnd,
  Hammer,
  Layers3,
  ShieldCheck,
  Sparkles,
  TreePine,
  Upload,
  Wand2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type TechnicalModuleId =
  | "ristrutturazioni"
  | "pavimenti-esterni"
  | "giardini"
  | "porte-blindate"
  | "porte-interne";

interface ModuleDefinition {
  title: string;
  eyebrow: string;
  description: string;
  color: string;
  icon: LucideIcon;
  bullets: string[];
  routeHint: string;
}

const MODULES: Record<TechnicalModuleId, ModuleDefinition> = {
  ristrutturazioni: {
    title: "Render ristrutturazioni",
    eyebrow: "Orchestratore multi-sistema",
    description:
      "Coordina bagno, stanza, pavimenti, facciata, tetto e aperture dentro una sola scena compatibile, evitando render ibridi.",
    color: "from-indigo-600 to-blue-700",
    icon: Hammer,
    routeHint: "Scene router, manifest globale, dependency graph e conflict resolver.",
    bullets: ["Scene classification", "Target map globale", "Preservation map", "Conflict resolver"],
  },
  "pavimenti-esterni": {
    title: "Render pavimenti esterni",
    eyebrow: "Outdoor hardscape",
    description:
      "Gestisce patio, vialetti, deck, coping piscina, gradini, soglie e drenaggio apparente preservando l'immobile reale.",
    color: "from-lime-600 to-emerald-700",
    icon: Layers3,
    routeHint: "Target surface map, buildability envelope e drainage logic.",
    bullets: ["Gres outdoor", "Deck WPC/legno", "Masselli carrabili", "Coping e gradini"],
  },
  giardini: {
    title: "Render giardini",
    eyebrow: "Landscape design",
    description:
      "Progetta prato, aiuole, siepi, alberi, percorsi e zone relax con scala vegetale realistica e spazi funzionali.",
    color: "from-green-600 to-teal-700",
    icon: TreePine,
    routeHint: "Garden zoning, planting envelope e regole di manutenzione percepita.",
    bullets: ["Prato realistico", "Aiuole e bordure", "Siepi e alberi", "Camminamenti"],
  },
  "porte-blindate": {
    title: "Render porte blindate",
    eyebrow: "Security doors",
    description:
      "Sostituisce la porta d'ingresso nel vano reale con telaio, soglia, coprifili, ferramenta e lato visibile coerenti.",
    color: "from-slate-700 to-slate-900",
    icon: ShieldCheck,
    routeHint: "Target opening map, buildability envelope e security-door manifest.",
    bullets: ["Porta moderna/classica", "Rasomuro", "Fiancoluce/sopraluce", "Maniglie e defender"],
  },
  "porte-interne": {
    title: "Render porte interne",
    eyebrow: "Interior openings",
    description:
      "Gestisce porte battenti, scorrevoli, rasomuro, vetrate, doppie ante e tutta altezza senza cambiare la stanza.",
    color: "from-violet-600 to-fuchsia-700",
    icon: Wand2,
    routeHint: "Opening compatibility envelope e regole anti-collisione per scorrevoli.",
    bullets: ["Battente", "Scorrevole", "Rasomuro", "Vetrata"],
  },
};

export default function RenderTechnicalModuleHub({ moduleId }: { moduleId: TechnicalModuleId }) {
  const navigate = useNavigate();
  const module = MODULES[moduleId];
  const Icon = module.icon;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/azienda/render" className="hover:text-foreground">Render AI</Link>
        <span>/</span>
        <span className="text-foreground">{module.title.replace("Render ", "")}</span>
      </div>

      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${module.color} p-6 sm:p-8 text-white`}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => navigate("/azienda/render")}
          className="absolute left-4 top-4 text-white/80 hover:text-white hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Indietro
        </Button>
        <div className="pt-10 sm:pt-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-3">
              <Icon className="h-5 w-5 text-white/85" />
              <span className="text-sm font-medium text-white/85 uppercase tracking-wider">{module.eyebrow}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{module.title}</h1>
            <p className="mt-3 text-white/85 text-sm leading-relaxed">{module.description}</p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <RenderCreditsWidget />
            <Button className="bg-white text-slate-900 hover:bg-white/90" disabled>
              <Upload className="h-4 w-4 mr-2" />
              Generazione in collegamento
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Motore tecnico pronto</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {module.routeHint} Il modulo è visibile nel centro render e usa già la stessa tassonomia commerciale
              degli altri render, così non scompare dalla navigazione.
            </p>
            <div className="flex flex-wrap gap-2">
              {module.bullets.map((item) => (
                <Badge key={item} variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {item}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <GalleryHorizontalEnd className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Stato operativo</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Ho evitato di far puntare questi moduli a tabelle o bucket non ancora esistenti: meglio una pagina stabile
              che un upload rotto. Il prossimo aggancio sicuro è creare le session table e la relativa edge function per
              ciascun modulo.
            </p>
            <Button variant="outline" onClick={() => navigate("/azienda/render")} className="w-full">
              Torna al centro render
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
