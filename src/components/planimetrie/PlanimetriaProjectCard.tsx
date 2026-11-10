import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  FileDown,
  ImageIcon,
  Link2,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AnteprimaPianta } from "./AnteprimaPianta";
import { RiferimentiPianta } from "./CollegamentiPianta";
import type { RigaPlanimetria } from "@/lib/planimetrie/archivio";
import type { AnteprimaPianta as Anteprima } from "@/lib/planimetrie/anteprime";
import type { MappaCollegamenti } from "@/lib/planimetrie/collegamenti";
import { STATI_PIANTA } from "@/lib/planimetrie/elenco";
import { percorsoProgettoAssociato } from "@/lib/planimetrie/render/percorsi";

interface Props {
  pianta: RigaPlanimetria;
  anteprima?: Anteprima;
  loading: boolean;
  mappa?: MappaCollegamenti;
  list: boolean;
  returnTo: string;
  onAssocia?: () => void;
}
export function PlanimetriaProjectCard({
  pianta: p,
  anteprima: a,
  loading,
  mappa,
  list,
  returnTo,
  onAssocia,
}: Props) {
  const path = percorsoProgettoAssociato(p.id, returnTo);
  const date = new Date(p.updated_at);
  const updated = Number.isFinite(date.getTime())
    ? date.toLocaleDateString("it-IT", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Data non disponibile";
  const renderPath = `/azienda/render?${new URLSearchParams({ progetto: p.id, vista: "projects" })}`;
  const stats = a
    ? `${a.piano} · ${a.stanze} ${a.stanze === 1 ? "stanza" : "stanze"} · ${a.superficie.toLocaleString("it-IT", { maximumFractionDigits: 1 })} m²${a.piani > 1 ? ` · ${a.piani} piani` : ""}`
    : `Versione ${p.versione_corrente}`;
  return (
    <article
      aria-label={p.titolo}
      className={`overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/40 ${list ? "grid gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_minmax(180px,.65fr)_auto] lg:items-center lg:gap-5" : "flex h-full flex-col"}`}
    >
      <div className={list ? "flex min-w-0 items-center gap-3" : "contents"}>
        <Link
          to={path}
          tabIndex={-1}
          aria-hidden="true"
          className={
            list
              ? "w-24 shrink-0 overflow-hidden rounded-lg border sm:w-32"
              : "block border-b"
          }
        >
          <AnteprimaPianta
            anteprima={a}
            titolo={p.titolo}
            caricando={loading}
            compact={list}
            className={list ? "h-20 p-2 sm:h-24" : "h-48"}
          />
        </Link>
        <div className={`min-w-0 ${list ? "flex-1" : "space-y-2 p-4 pb-3"}`}>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Badge
              variant={p.stato === "in_uso" ? "secondary" : "outline"}
              className={`text-[10px] ${p.stato === "bozza" ? "border-amber-200 bg-amber-50 text-amber-800" : ""}`}
            >
              {STATI_PIANTA[p.stato]}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              v{p.versione_corrente}
            </span>
          </div>
          <h3 className="text-sm font-semibold leading-snug">
            <Link
              to={path}
              aria-label={`Apri ${p.titolo}`}
              className="line-clamp-2 rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {p.titolo}
            </Link>
          </h3>
          <p className="mt-1.5 text-xs text-muted-foreground">{stats}</p>
          {p.descrizione && !list && (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {p.descrizione}
            </p>
          )}
          {list && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Aggiornata {updated}
            </p>
          )}
        </div>
      </div>
      <div className={`min-w-0 ${list ? "lg:border-l lg:pl-5" : "px-4 pb-4"}`}>
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Schede collegate
        </p>
        <RiferimentiPianta riga={p} mappa={mappa} />
      </div>
      <div
        className={`flex flex-wrap items-center gap-1.5 ${list ? "border-t pt-3 lg:max-w-44 lg:justify-end lg:border-0 lg:pt-0" : "mt-auto border-t bg-muted/15 p-3"}`}
      >
        {!list && (
          <p className="mr-auto text-[11px] text-muted-foreground">{updated}</p>
        )}
        {onAssocia && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onAssocia}
            aria-label={`Associa ${p.titolo}`}
            className="h-8 px-2 text-xs"
          >
            <Link2 className="mr-1.5 h-3.5 w-3.5" />
            Collegamenti
          </Button>
        )}
        <Button
          asChild
          size="sm"
          variant="outline"
          className="h-8 px-2 text-xs"
        >
          <Link to={path} aria-label={`Apri progetto ${p.titolo}`}>
            Apri
            <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`Altre azioni per ${p.titolo}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={renderPath}>
                <ImageIcon className="mr-2 h-4 w-4" />
                Render del progetto
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={percorsoProgettoAssociato(p.id, returnTo, true)}>
                <FileDown className="mr-2 h-4 w-4" />
                Fascicolo PDF
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
