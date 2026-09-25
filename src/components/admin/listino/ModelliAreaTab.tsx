/**
 * Libreria listino → «Modelli di area»: le aree pronte da dare alle aziende.
 * Ogni scheda dice cosa c'è dentro, da dove viene, se ha i prezzi, se le
 * aziende la vedono e dove è già stata installata.
 */
import { useMemo, useState } from "react";
import { Download, Eye, Loader2, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AnteprimaModelloDialog } from "@/components/admin/listino/AnteprimaModelloDialog";
import { InstallaModelloDialog } from "@/components/admin/listino/InstallaModelloDialog";
import { ModificaModelloDialog } from "@/components/admin/listino/ModificaModelloDialog";
import { NuovoModelloDialog } from "@/components/admin/listino/NuovoModelloDialog";
import { iconaArea } from "@/components/listino/iconaArea";
import { useModelliArea, useModelliAreaMutations, type ModelloConInstallazioni } from "@/hooks/useModelliArea";
import { nomeArea } from "@/lib/listino/areeStandard";
import { filtraModelli, testoContenuto } from "@/lib/listino/modelliArea";
import { cn } from "@/lib/utils";

const data = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

export function ModelliAreaTab() {
  const { data: modelli = [], isLoading, isError, error, refetch } = useModelliArea();
  const { rifaiFotografia, modifica, elimina } = useModelliAreaMutations();
  const confirm = useConfirm();
  const [cerca, setCerca] = useState("");
  const [area, setArea] = useState<string | null>(null);
  const [nuovo, setNuovo] = useState(false);
  const [daInstallare, setDaInstallare] = useState<ModelloConInstallazioni | null>(null);
  const [inAnteprima, setInAnteprima] = useState<ModelloConInstallazioni | null>(null);
  const [daModificare, setDaModificare] = useState<ModelloConInstallazioni | null>(null);

  const aree = useMemo(() => [...new Set(modelli.map((m) => m.area))].sort((a, b) => nomeArea(a).localeCompare(nomeArea(b))), [modelli]);
  const visibili = filtraModelli(modelli, cerca, area);

  const pubblica = (m: ModelloConInstallazioni, si: boolean) =>
    modifica.mutate(
      { id: m.id, patch: { pubblicato: si } },
      {
        onSuccess: () => toast.success(si ? `«${m.nome}» è visibile alle aziende` : `«${m.nome}» è nascosto alle aziende`),
        onError: (e) => toast.error("Non salvato", { description: (e as Error).message }),
      },
    );

  const aggiornaDallAzienda = async (m: ModelloConInstallazioni) => {
    const ok = await confirm({
      title: `Aggiornare «${m.nome}»?`,
      description: `Rifà la fotografia dal listino di ${m.origine_nome ?? "dell'azienda di origine"}: il modello prende tipologie e prodotti come sono oggi. Le aziende che l'hanno già installato non cambiano.`,
      confirmLabel: "Aggiorna",
    });
    if (!ok) return;
    rifaiFotografia.mutate(m.id, {
      onSuccess: (r) => toast.success(`«${m.nome}» aggiornato`, { description: testoContenuto(r) }),
      onError: (e) => toast.error("Modello non aggiornato", { description: (e as Error).message }),
    });
  };

  const eliminaModello = async (m: ModelloConInstallazioni) => {
    const ok = await confirm({
      title: `Eliminare «${m.nome}»?`,
      description:
        m.installazioni.length > 0
          ? `Le ${m.installazioni.length === 1 ? "azienda" : `${m.installazioni.length} aziende`} che l'hanno installato tengono i loro prodotti: sono copie loro.`
          : "Nessuna azienda l'ha installato.",
      confirmLabel: "Elimina",
      variant: "destructive",
    });
    if (!ok) return;
    elimina.mutate(m.id, {
      onSuccess: () => toast.success(`«${m.nome}» eliminato`),
      onError: (e) => toast.error("Modello non eliminato", { description: (e as Error).message }),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-muted-foreground">
          Un modello è un&apos;area intera — tipologie, prodotti con foto e schede, varianti — presa dal listino di
          un&apos;azienda. Chi lo installa se ne trova una <span className="font-medium text-foreground">copia sua</span>,
          da modificare: il modello resta com&apos;è.
        </p>
        <Button onClick={() => setNuovo(true)} className="h-10 shrink-0">
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Nuovo modello
        </Button>
      </div>

      {modelli.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Cerca un modello…" value={cerca} onChange={(e) => setCerca(e.target.value)} />
          </div>
          {aree.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtra per area">
              <Button size="sm" variant={area === null ? "default" : "outline"} className="h-8" onClick={() => setArea(null)}>
                Tutte
              </Button>
              {aree.map((a) => (
                <Button key={a} size="sm" variant={area === a ? "default" : "outline"} className="h-8" onClick={() => setArea(a)}>
                  {nomeArea(a)}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {isLoading && (
        <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carico i modelli…
        </p>
      )}
      {isError && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-destructive">
            Non riesco a caricare i modelli{error instanceof Error ? `: ${error.message}` : "."}
          </p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Riprova
          </Button>
        </div>
      )}
      {!isLoading && !isError && modelli.length === 0 && (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="font-medium">Ancora nessun modello</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Parti da un&apos;azienda che ha già un&apos;area fatta bene — per esempio il fotovoltaico con moduli, inverter e
            accumuli — e rendila un modello da dare alle aziende nuove.
          </p>
          <Button className="mt-4" onClick={() => setNuovo(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Crea il primo modello
          </Button>
        </div>
      )}
      {!isLoading && !isError && modelli.length > 0 && visibili.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nessun modello con questa ricerca.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visibili.map((m) => {
          const Icona = iconaArea(m.area);
          const copertina = m.immagine_url ?? m.riepilogo?.copertina ?? null;
          return (
            <Card key={m.id} className="flex flex-col overflow-hidden">
              <button
                type="button"
                onClick={() => setInAnteprima(m)}
                className="group relative flex h-32 items-center justify-center bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                aria-label={`Guarda cosa c'è in ${m.nome}`}
              >
                {copertina ? (
                  <img src={copertina} alt="" loading="lazy" className="h-full w-full object-contain p-3" />
                ) : (
                  <Icona className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
                )}
                <Badge variant="secondary" className="absolute left-2 top-2 gap-1">
                  <Icona className="h-3 w-3" aria-hidden="true" /> {nomeArea(m.area)}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "absolute right-2 top-2 bg-background",
                    m.pubblicato ? "border-emerald-300 text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
                  )}
                >
                  {m.pubblicato ? "Visibile alle aziende" : "Solo per te"}
                </Badge>
                <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-background/90 px-1.5 py-0.5 text-[11px] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Eye className="h-3 w-3" aria-hidden="true" /> Guarda
                </span>
              </button>
              <CardContent className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-tight">{m.nome}</h3>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="-mr-2 -mt-1 h-8 w-8 shrink-0" aria-label={`Altre azioni per ${m.nome}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setInAnteprima(m)}>
                        <Eye className="mr-2 h-4 w-4" /> Guarda cosa c&apos;è dentro
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setDaModificare(m)}>
                        <Pencil className="mr-2 h-4 w-4" /> Nome e descrizione
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={!m.origine_company_id || rifaiFotografia.isPending} onSelect={() => void aggiornaDallAzienda(m)}>
                        <RefreshCw className="mr-2 h-4 w-4" /> Aggiorna dall&apos;azienda
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => void eliminaModello(m)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Elimina
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {m.descrizione && <p className="line-clamp-2 text-sm text-muted-foreground">{m.descrizione}</p>}
                <p className="text-xs">{testoContenuto(m.riepilogo)}</p>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge variant="outline" className="font-normal">
                    {m.con_prezzi_vendita ? "Con prezzi di vendita" : "Senza prezzi"}
                  </Badge>
                  <span>
                    da {m.origine_nome ?? "un'azienda"}, {data(m.fotografato_il)}
                  </span>
                </div>
                {m.installazioni.length > 0 && (
                  <p className="text-xs text-muted-foreground" title={m.installazioni.map((i) => i.azienda).join(", ")}>
                    Installato in {m.installazioni.length === 1 ? "1 azienda" : `${m.installazioni.length} aziende`}:{" "}
                    {m.installazioni
                      .slice(0, 3)
                      .map((i) => i.azienda)
                      .join(", ")}
                    {m.installazioni.length > 3 && "…"}
                  </p>
                )}
                <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={m.pubblicato}
                      disabled={modifica.isPending}
                      onCheckedChange={(v) => pubblica(m, v)}
                      aria-label={`${m.nome}: visibile alle aziende`}
                    />
                    Visibile
                  </label>
                  <Button size="sm" className="h-9" onClick={() => setDaInstallare(m)}>
                    <Download className="mr-1.5 h-4 w-4" aria-hidden="true" /> Installa
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {nuovo && <NuovoModelloDialog nomiEsistenti={modelli.map((m) => m.nome)} onChiudi={() => setNuovo(false)} />}
      {daInstallare && <InstallaModelloDialog modello={daInstallare} onChiudi={() => setDaInstallare(null)} />}
      {inAnteprima && <AnteprimaModelloDialog modello={inAnteprima} onChiudi={() => setInAnteprima(null)} />}
      {daModificare && <ModificaModelloDialog modello={daModificare} onChiudi={() => setDaModificare(null)} />}
    </div>
  );
}
