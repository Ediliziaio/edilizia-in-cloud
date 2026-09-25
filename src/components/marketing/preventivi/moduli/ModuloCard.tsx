import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ArrowRight, FilePenLine, FolderOpen, Lock, AlertCircle } from "lucide-react";
import type { ModuloVenditaView } from "@/lib/moduli-vendita";
import { MODULE_PRESENTATION, MODULES_SETTINGS_HREF } from "@/lib/moduli-vendita/presentation";

interface ModuloCardProps {
  view: ModuloVenditaView;
  onLockedClick: (view: ModuloVenditaView) => void;
  canCreate?: boolean;
  canRead?: boolean;
  canConfigure?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
  isSavingVisibility?: boolean;
}

export function ModuloCard({ view, onLockedClick, canCreate = false, canRead = true, canConfigure = false, onVisibilityChange, isSavingVisibility = false }: ModuloCardProps) {
  const { modulo, stato } = view;
  const content = MODULE_PRESENTATION[modulo.slug];
  const Icon = modulo.icon;
  const [failedImage, setFailedImage] = useState(false);
  const active = !view.isError && stato === "attivo";
  const comingSoon = stato === "coming_soon";
  const titleId = `module-${modulo.slug}`;

  return (
    <article aria-labelledby={titleId} className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-950">
      {!comingSoon && <div className="relative h-36 overflow-hidden bg-gradient-to-br from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-900">
        {content.image && !failedImage
          ? <img src={content.image} alt="" loading="lazy" width={480} height={240} onError={() => setFailedImage(true)} className="h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105" />
          : <Icon aria-hidden="true" className="absolute right-6 top-6 h-24 w-24 text-slate-400/30" />}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 to-transparent" />
        <div className="absolute bottom-3 left-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white/95 text-orange-600 shadow-sm"><Icon className="h-5 w-5" aria-hidden="true" /></div>
        <Badge className={`absolute right-3 top-3 border-0 shadow-sm ${view.isError ? "bg-amber-50 text-amber-900 hover:bg-amber-50" : active ? "bg-white text-emerald-800 hover:bg-white" : "bg-white text-slate-700 hover:bg-white"}`}>
          {view.isError ? <><AlertCircle className="mr-1 h-3 w-3" />Da verificare</> : active ? "Attivo" : <><Lock className="mr-1 h-3 w-3" />Da attivare</>}
        </Badge>
      </div>}
      <div className="flex flex-1 flex-col p-5">
        {comingSoon && <div className="mb-3 flex items-center justify-between"><Icon className="h-5 w-5 text-slate-500" aria-hidden="true" /><Badge variant="secondary">In arrivo</Badge></div>}
        <h3 id={titleId} className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">{content.title}</h3>
        {active && onVisibilityChange && <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
          <label htmlFor={`module-enabled-${modulo.slug}`} className="cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300">Attivo per la squadra</label>
          <Switch id={`module-enabled-${modulo.slug}`} aria-label={`Attiva o disattiva ${content.title} per la squadra`} checked disabled={isSavingVisibility} onCheckedChange={onVisibilityChange} />
        </div>}
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{content.summary}</p>
        {!comingSoon && <ul aria-label={`Lavorazioni ${content.title}`} className="mb-5 mt-4 flex flex-wrap gap-1.5">
          {content.topics.map((topic) => <li key={topic} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{topic}</li>)}
        </ul>}
        <div className="mt-auto pt-3">
          {view.isError ? <p className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">Non riusciamo a verificare l'accesso. Riprova: non è una richiesta di acquisto.</p>
            : comingSoon ? <p className="text-xs text-muted-foreground">Non ancora disponibile. Ti mostreremo qui quando sarà pronto.</p>
            : active ? <>
              {(canCreate || canRead) ? <Button asChild className="h-10 w-full bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900">
                <Link to={canCreate ? `${modulo.href}/nuovo` : modulo.href} aria-label={`${canCreate ? "Crea preventivo" : "Apri modulo"} ${content.title}`}>
                  {canCreate ? "Crea preventivo" : "Apri modulo"}<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button> : <p className="text-xs text-muted-foreground">Il tuo ruolo non permette di aprire i preventivi di questo modulo.</p>}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-xs">
                {canCreate && canRead && <Link to={modulo.href} aria-label={`Vedi preventivi ${content.title}`} className="inline-flex min-h-8 items-center gap-1.5 rounded text-slate-600 hover:text-orange-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 dark:text-slate-300"><FolderOpen className="h-3.5 w-3.5" />Preventivi</Link>}
                {canConfigure && <Link to={`${MODULES_SETTINGS_HREF}&modulo=${modulo.slug}`} aria-label={`Personalizza PDF ${content.title}`} className="inline-flex min-h-8 items-center gap-1.5 rounded text-slate-600 hover:text-orange-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 dark:text-slate-300"><FilePenLine className="h-3.5 w-3.5" />Personalizza PDF</Link>}
              </div>
            </> : <Button variant="outline" className="h-10 w-full" onClick={() => onLockedClick(view)} aria-label={`Scopri modulo ${content.title}`}>Scopri il modulo<ArrowRight className="ml-2 h-4 w-4" /></Button>}
        </div>
      </div>
    </article>
  );
}
