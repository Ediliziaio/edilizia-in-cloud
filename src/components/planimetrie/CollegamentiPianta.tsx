import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, CheckCircle2, ClipboardList, ContactRound, ExternalLink, FileSpreadsheet, FileText, LayoutPanelTop, Link2, Loader2, Pencil, RotateCcw, Search, Unlink2, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { AnteprimaPianta } from "@/lib/planimetrie/anteprime";
import { useDebounce } from "@/hooks/useDebounce";
import { usePermissions } from "@/hooks/usePermissions";
import { aggiornaDatiPlanimetria, chiaviPlanimetrie, type AssociazioniPlanimetria, type RigaPlanimetria } from "@/lib/planimetrie/archivio";
import { accessiCollegamenti, cercaCollegamentiPianta, DEFINIZIONI_COLLEGAMENTI, TIPI_COLLEGAMENTO, type MappaCollegamenti, type SceltaCollegamento, type TipoCollegamento } from "@/lib/planimetrie/collegamenti";

export function RiferimentiPianta({ riga, mappa }: { riga: RigaPlanimetria; mappa?: MappaCollegamenti }) {
  const permessi = usePermissions();
  const accessi = accessiCollegamenti(permessi);
  const tipi = TIPI_COLLEGAMENTO.filter((tipo) => riga[DEFINIZIONI_COLLEGAMENTI[tipo].colonna]);
  if (!tipi.length) return <span className="text-xs text-muted-foreground">Nessun collegamento</span>;
  return <div className="flex flex-wrap gap-1.5">{tipi.map((tipo) => {
    const id = riga[DEFINIZIONI_COLLEGAMENTI[tipo].colonna]!;
    const scelta = mappa?.[tipo][id];
    return <Badge key={tipo} variant="outline" className="max-w-full font-normal">
      {accessi[tipo] && scelta ? scelta.percorso ? <Link to={scelta.percorso} title={`${DEFINIZIONI_COLLEGAMENTI[tipo].titolo}: ${scelta.nome}`} className="truncate hover:underline">{DEFINIZIONI_COLLEGAMENTI[tipo].titolo}: {scelta.nome}</Link>
        : <span className="truncate">{DEFINIZIONI_COLLEGAMENTI[tipo].titolo}: {scelta.nome}</span> : `${DEFINIZIONI_COLLEGAMENTI[tipo].titolo} collegato`}
    </Badge>;
  })}</div>;
}

const ORDINE_ASSOCIAZIONI: TipoCollegamento[] = ["cliente", "preventivo", "commessa", "computo", "contatto"];
const PRESENTAZIONE: Record<TipoCollegamento, { icona: LucideIcon; descrizione: string; ricerca: string; nessuno: string; azione: string }> = {
  cliente: { icona: Users, descrizione: "La persona o l’azienda a cui si riferisce il progetto.", ricerca: "Cerca per nome, ragione sociale o email…", nessuno: "Nessun cliente associato", azione: "Associa cliente" },
  preventivo: { icona: FileText, descrizione: "L’offerta che comprende i lavori di questa planimetria.", ricerca: "Cerca per numero o titolo del preventivo…", nessuno: "Nessun preventivo associato", azione: "Associa preventivo" },
  commessa: { icona: ClipboardList, descrizione: "Il lavoro in cui viene utilizzata questa planimetria.", ricerca: "Cerca per codice o descrizione della commessa…", nessuno: "Nessuna commessa associata", azione: "Associa commessa" },
  computo: { icona: FileSpreadsheet, descrizione: "Il computo che usa questa pianta come riferimento per le misure.", ricerca: "Cerca per titolo o nome del file…", nessuno: "Nessun computo associato", azione: "Associa computo" },
  contatto: { icona: ContactRound, descrizione: "Il contatto commerciale di riferimento nel CRM.", ricerca: "Cerca per nome, azienda o email…", nessuno: "Nessun contatto CRM associato", azione: "Associa contatto CRM" },
};

export function CollegamentiProgetto({ riga, mappa, onAssocia }: {
  riga: RigaPlanimetria; mappa?: MappaCollegamenti; onAssocia: (tipo?: TipoCollegamento) => void;
}) {
  const permessi = usePermissions();
  const accessi = accessiCollegamenti(permessi);
  const associati = ORDINE_ASSOCIAZIONI.filter((tipo) => riga[DEFINIZIONI_COLLEGAMENTI[tipo].colonna]);
  const puoModificare = !permessi.solaLettura && ORDINE_ASSOCIAZIONI.some((tipo) => accessi[tipo]);

  return <section className="overflow-hidden rounded-2xl border bg-card" aria-label="Collegamenti del progetto">
    <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/5 text-primary"><Link2 className="h-4 w-4" /></span>
        <div className="min-w-0"><h2 className="text-sm font-semibold">Collegamenti del progetto</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{associati.length ? `${associati.length} ${associati.length === 1 ? "scheda associata" : "schede associate"} a questa planimetria` : "Associa cliente, preventivo, commessa o computo già presenti in azienda."}</p></div>
      </div>
      {puoModificare && <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => onAssocia()}><Link2 className="h-3.5 w-3.5" />{associati.length ? "Gestisci collegamenti" : "Associa scheda"}</Button>}
    </div>
    {associati.length > 0 && <ul className="grid gap-2 border-t bg-muted/10 p-3 sm:grid-cols-2 lg:grid-cols-3">{associati.map((tipo) => {
      const id = riga[DEFINIZIONI_COLLEGAMENTI[tipo].colonna]!;
      const scelta = accessi[tipo] ? mappa?.[tipo][id] : undefined;
      const Icona = PRESENTAZIONE[tipo].icona;
      const contenuto = <><span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><Icona className="h-3.5 w-3.5" />{DEFINIZIONI_COLLEGAMENTI[tipo].titolo}</span><span className="block truncate text-sm font-medium">{scelta?.titolo ?? scelta?.nome ?? "Scheda associata"}</span>{scelta?.sottotitolo && <span className="mt-1 block truncate text-xs text-muted-foreground">{scelta.sottotitolo}</span>}</>;
      return <li key={tipo} className="flex min-w-0 items-center gap-2 rounded-xl border bg-background p-3">
        {scelta?.percorso ? <Link to={scelta.percorso} className="min-w-0 flex-1 rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={`Apri ${scelta.nome}`}>{contenuto}</Link> : <div className="min-w-0 flex-1">{contenuto}</div>}
        {puoModificare && accessi[tipo] && <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" aria-label={`Modifica associazione ${DEFINIZIONI_COLLEGAMENTI[tipo].titolo}`} onClick={() => onAssocia(tipo)}><Pencil className="h-3.5 w-3.5" /></Button>}
      </li>;
    })}</ul>}
  </section>;
}

function DettaglioAssociazione({ tipo, companyId, value, salvata, modificata, disabled, onChange }: {
  tipo: TipoCollegamento; companyId: string; value: SceltaCollegamento | null; salvata: SceltaCollegamento | null;
  modificata: boolean; disabled: boolean; onChange: (value: SceltaCollegamento | null) => void;
}) {
  const [inRicerca, setInRicerca] = useState(false);
  const [testo, setTesto] = useState("");
  const ricerca = useDebounce(testo, 250);
  const { data = [], isFetching, isError, refetch } = useQuery({
    queryKey: ["planimetrie-scelta-collegamento", companyId, tipo, ricerca],
    queryFn: () => cercaCollegamentiPianta(companyId, tipo, ricerca),
    enabled: inRicerca && !disabled && !!companyId,
    staleTime: 30_000,
    retry: 1,
  });
  const titolo = DEFINIZIONI_COLLEGAMENTI[tipo].titolo;
  const presentazione = PRESENTAZIONE[tipo];
  const Icona = presentazione.icona;
  const cercando = isFetching || testo !== ricerca;

  return <section id="dettaglio-associazione" className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain" aria-label={`Associazione ${titolo}`}>
    <div className="mb-5 shrink-0">
      <h3 className="text-lg font-semibold">{inRicerca ? `Scegli ${tipo === "commessa" ? "la commessa" : tipo === "contatto" ? "il contatto CRM" : `il ${titolo.toLocaleLowerCase("it-IT")}`}` : titolo}</h3>
      <p className={cn("mt-1 text-sm leading-relaxed text-muted-foreground", inRicerca && "hidden sm:block")}>{presentazione.descrizione}</p>
    </div>

    {inRicerca ? <>
      <div className="relative mb-4 shrink-0">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input aria-label={`Cerca ${titolo}`} placeholder={presentazione.ricerca} value={testo} onChange={(event) => setTesto(event.target.value)} disabled={disabled} className="h-10 pl-9" />
      </div>
      <div className="shrink-0 pr-1 sm:min-h-0 sm:flex-1 sm:shrink sm:overflow-y-auto sm:overscroll-contain" aria-busy={cercando}>
        {cercando ? <div role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cerco le schede esistenti…</div>
          : isError ? <div role="alert" className="rounded-xl border p-5"><p className="text-sm">La ricerca non è disponibile in questo momento.</p><Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Riprova</Button></div>
            : data.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center"><Search className="mx-auto mb-3 h-6 w-6 text-muted-foreground/50" /><p className="text-sm font-medium">Nessuna scheda trovata</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{testo.trim() ? "Prova con un altro nome o codice." : "Le schede già presenti in azienda compariranno qui."}</p></div>
              : <ul className="space-y-2" aria-label={`Risultati ${titolo}`}>{data.map((scelta) => <li key={scelta.id}>
                <button type="button" disabled={disabled} onClick={() => { onChange(scelta); setInRicerca(false); }} aria-label={`Seleziona ${scelta.nome}`}
                  className={cn("group flex w-full items-center gap-3 rounded-xl border bg-card p-3.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50", value?.id === scelta.id && "border-primary/40 bg-primary/5")}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/70"><Icona className="h-4 w-4 text-muted-foreground" /></span>
                  <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium leading-snug">{scelta.titolo ?? scelta.nome}</span>{scelta.sottotitolo && <span className="mt-1 line-clamp-2 block break-words text-xs leading-relaxed text-muted-foreground">{scelta.sottotitolo}</span>}</span>
                  {value?.id === scelta.id ? <Check className="h-4 w-4 shrink-0 text-primary" /> : <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-primary" />}
                </button>
              </li>)}</ul>}
      </div>
      <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
        {!cercando && data.length === 20 && <p className="text-xs text-muted-foreground">Primi 20 risultati. Scrivi per restringere la ricerca.</p>}
        {(value || salvata) && <Button variant="ghost" size="sm" onClick={() => setInRicerca(false)}>Torna al collegamento</Button>}
      </div>
    </> : value ? <div className="shrink-0 space-y-4">
      <div className={cn("rounded-2xl border p-4 sm:p-5", modificata ? "border-primary/25 bg-primary/[0.03]" : "bg-muted/15")}>
        <div className="mb-4 flex items-center gap-2 text-xs font-medium text-muted-foreground"><CheckCircle2 className={cn("h-4 w-4", modificata ? "text-primary" : "text-emerald-600")} />{modificata ? "Da associare al progetto" : "Associato a questo progetto"}</div>
        <div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-background"><Icona className="h-5 w-5 text-primary" /></span><div className="min-w-0"><p className="break-words text-base font-semibold leading-snug">{value.titolo ?? value.nome}</p>{value.sottotitolo && <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">{value.sottotitolo}</p>}</div></div>
        {value.percorso && <Link to={value.percorso} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">Apri scheda<ExternalLink className="h-3 w-3" /></Link>}
      </div>
      {!disabled && <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setInRicerca(true)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Cambia</Button><Button variant="ghost" size="sm" aria-label={`Scollega ${titolo}`} onClick={() => onChange(null)} className="text-muted-foreground"><Unlink2 className="mr-1.5 h-3.5 w-3.5" />Rimuovi associazione</Button></div>}
    </div> : <div className="shrink-0 rounded-2xl border border-dashed p-6">
      <Icona className="mb-3 h-6 w-6 text-muted-foreground/50" />
      <p className="text-sm font-medium">{salvata ? "L’associazione verrà rimossa" : presentazione.nessuno}</p>
      {salvata && <p className="mt-2 break-words text-sm text-muted-foreground">{salvata.nome}</p>}
      {!disabled && <div className="mt-4 flex flex-wrap gap-2">{salvata && <Button variant="outline" size="sm" onClick={() => onChange(salvata)}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Annulla rimozione</Button>}<Button variant={salvata ? "ghost" : "outline"} size="sm" className="gap-1.5" onClick={() => setInRicerca(true)}><Link2 className="h-3.5 w-3.5" />{salvata ? "Scegli un’altra scheda" : presentazione.azione}</Button></div>}
    </div>}
  </section>;
}

/** Un pannello del progetto, con una categoria alla volta e modifiche esplicite. */
export function AssociazioniPiantaPanel({ riga: corrente, mappa, anteprima, tipoIniziale, onChiudi }: {
  riga: RigaPlanimetria; mappa?: MappaCollegamenti; anteprima?: AnteprimaPianta; tipoIniziale?: TipoCollegamento; onChiudi: () => void;
}) {
  const [riga] = useState(corrente);
  const permessi = usePermissions();
  const accessi = accessiCollegamenti(permessi);
  const tipiConsentiti = ORDINE_ASSOCIAZIONI.filter((tipo) => accessi[tipo]);
  const [tipoScelto, setTipoScelto] = useState<TipoCollegamento | null>(tipoIniziale ?? null);
  const tipoAttivo = tipoScelto && accessi[tipoScelto] ? tipoScelto : tipiConsentiti.find((tipo) => riga[DEFINIZIONI_COLLEGAMENTI[tipo].colonna]) ?? tipiConsentiti[0] ?? null;
  const client = useQueryClient();
  const [iniziali] = useState(() => Object.fromEntries(TIPI_COLLEGAMENTO.map((tipo) => {
    const id = riga[DEFINIZIONI_COLLEGAMENTI[tipo].colonna];
    return [tipo, id ? mappa?.[tipo][id] ?? { id, nome: `${DEFINIZIONI_COLLEGAMENTI[tipo].titolo} collegato` } : null];
  })) as Record<TipoCollegamento, SceltaCollegamento | null>);
  const [scelte, setScelte] = useState(iniziali);
  const dettagli = (tipo: TipoCollegamento, scelta: SceltaCollegamento | null) => scelta ? mappa?.[tipo][scelta.id] ?? scelta : null;
  const cambiati = TIPI_COLLEGAMENTO.filter((tipo) => accessi[tipo] && (scelte[tipo]?.id ?? null) !== (iniziali[tipo]?.id ?? null));
  const puoSalvare = !permessi.solaLettura && cambiati.length > 0;
  const salva = useMutation({
    mutationFn: async () => {
      if (!puoSalvare) return;
      const dati: AssociazioniPlanimetria = {};
      for (const tipo of cambiati) dati[DEFINIZIONI_COLLEGAMENTI[tipo].campo] = scelte[tipo]?.id ?? null;
      await aggiornaDatiPlanimetria(riga.id, dati, { companyId: riga.company_id, updatedAt: riga.updated_at });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: chiaviPlanimetrie.tutte });
      toast.success("Associazioni della planimetria salvate");
      onChiudi();
    },
  });
  const solaLettura = permessi.solaLettura || salva.isPending;

  return <Sheet open onOpenChange={(open) => { if (!open && !salva.isPending) onChiudi(); }}>
    <SheetContent side="right" className="flex h-dvh w-full flex-col gap-0 overflow-hidden p-0 sm:w-full sm:max-w-[820px]">
      <SheetHeader className="shrink-0 border-b px-5 pb-4 pt-5 text-left sm:px-6 sm:pb-5 sm:pt-6">
        <SheetTitle className="pr-6 text-xl">Collegamenti del progetto</SheetTitle>
        <SheetDescription className="sr-only sm:not-sr-only">Scegli le schede esistenti da associare alla planimetria.</SheetDescription>
        <div className="!mt-4 flex items-center gap-3 rounded-xl border bg-muted/20 p-3">
          <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-background p-1.5 sm:h-16 sm:w-20">
            {anteprima ? <img src={anteprima.src} alt={`Anteprima di ${riga.titolo}`} className="h-full w-full object-contain" /> : <LayoutPanelTop className="h-6 w-6 text-muted-foreground" />}
          </div>
          <div className="min-w-0"><p className="line-clamp-2 break-words text-sm font-semibold leading-snug">{riga.titolo}</p><p className="mt-1 text-xs text-muted-foreground">Planimetria · Versione {riga.versione_corrente}{anteprima ? ` · ${anteprima.superficie.toLocaleString("it-IT", { maximumFractionDigits: 1 })} m²` : ""}</p></div>
        </div>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <nav aria-label="Tipo di associazione" className="grid shrink-0 grid-cols-3 gap-1.5 border-b bg-muted/15 p-3 sm:flex sm:w-52 sm:flex-col sm:border-b-0 sm:border-r">
          {tipiConsentiti.map((tipo) => {
            const Icona = PRESENTAZIONE[tipo].icona;
            const modificato = cambiati.includes(tipo);
            return <button key={tipo} type="button" disabled={salva.isPending} aria-pressed={tipo === tipoAttivo} aria-controls="dettaglio-associazione" onClick={() => setTipoScelto(tipo)}
              className={cn("flex min-w-0 items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3 sm:py-3", tipo === tipoAttivo && "border-primary/15 bg-primary/[0.07] text-primary")}>
              <Icona className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1"><span className="block text-xs font-medium sm:text-sm">{DEFINIZIONI_COLLEGAMENTI[tipo].titolo}</span><span className="mt-1 hidden truncate text-[11px] text-muted-foreground sm:block">{modificato ? scelte[tipo] ? "Da salvare" : "Da rimuovere" : dettagli(tipo, scelte[tipo])?.nome ?? "Non associato"}</span></span>
              {modificato ? <span aria-label="Modifica da salvare" className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" /> : scelte[tipo] ? <Check className="hidden h-3.5 w-3.5 shrink-0 text-emerald-600 sm:block" /> : null}
            </button>;
          })}
        </nav>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-5 sm:p-6">
          {tipoAttivo ? <DettaglioAssociazione key={tipoAttivo} tipo={tipoAttivo} companyId={riga.company_id} value={dettagli(tipoAttivo, scelte[tipoAttivo])} salvata={dettagli(tipoAttivo, iniziali[tipoAttivo])} modificata={cambiati.includes(tipoAttivo)} disabled={solaLettura} onChange={(value) => setScelte((prev) => ({ ...prev, [tipoAttivo]: value }))} />
            : <p className="text-sm text-muted-foreground">Non hai accesso alle schede associabili a questo progetto.</p>}
        </div>
      </div>
      <div className="shrink-0 space-y-3 border-t bg-background px-5 py-4 sm:px-6">
        {salva.error && <p role="alert" className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">{salva.error instanceof Error ? salva.error.message : "Salvataggio non riuscito."}</p>}
        {cambiati.length > 0 && <div className="max-h-20 overflow-y-auto text-xs sm:max-h-28" aria-label="Modifiche da salvare"><p className="mb-2 font-medium">{cambiati.length} {cambiati.length === 1 ? "modifica da salvare" : "modifiche da salvare"}</p><div className="flex flex-wrap gap-1.5">{cambiati.map((tipo) => <Badge key={tipo} variant="outline" className="max-w-full font-normal" title={`${DEFINIZIONI_COLLEGAMENTI[tipo].titolo}: ${scelte[tipo]?.nome ?? "Rimuovi associazione"}`}><span className="truncate">{DEFINIZIONI_COLLEGAMENTI[tipo].titolo}: {scelte[tipo]?.nome ?? "Rimuovi associazione"}</span></Badge>)}</div></div>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={cn("text-xs text-muted-foreground", !permessi.solaLettura && "hidden sm:block")}>{permessi.solaLettura ? "Accesso in sola lettura" : "Le scelte vengono applicate con Salva."}</p>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto"><Button variant="outline" disabled={salva.isPending} onClick={onChiudi}>{cambiati.length ? "Annulla" : "Chiudi"}</Button><Button disabled={!puoSalvare || salva.isPending} onClick={() => salva.mutate()}>{salva.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}Salva associazioni</Button></div>
        </div>
      </div>
    </SheetContent>
  </Sheet>;
}
