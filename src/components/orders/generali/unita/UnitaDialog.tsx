// src/components/orders/generali/unita/UnitaDialog.tsx
// Dettaglio dell’unità dal tabellone o dalla tabella. Le schede di consultazione
// sono accessibili anche da telefono, secondo i permessi dell’utente.
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, ClipboardList, ExternalLink, FileText, GitBranch, HardHat, Scissors, ShieldAlert, Tag, TrendingUp, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentGenerale as DialogContent } from "@/components/orders/generali/design/DialogGenerale";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CambioStato } from "@/components/orders/generali/unita/CambioStato";
import { DatiUnita } from "@/components/orders/generali/unita/DatiUnita";
import { MargineUnita } from "@/components/orders/generali/unita/MargineUnita";
import { PagamentiUnita } from "@/components/orders/generali/unita/PagamentiUnita";
import { VariantiUnita } from "@/components/orders/generali/varianti/VariantiUnita";
import { STILE_STATO, dataBreve, euro } from "@/components/orders/generali/unita/aspetto";
import { MaterialeUnita } from "@/components/orders/generali/vendita/MaterialeUnita";
import { SchedaVendita } from "@/components/orders/generali/vendita/SchedaVendita";
import { NOMI_STATO, etichettaPiano, prezzoConVarianti, type ElencoUnita, type UnitaGenerale } from "@/lib/orders/generali/unita";
import { formattaNumero, pagamentiUnita, type ContiUnita } from "@/lib/orders/generali/unitaConti";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import "./unita-dialog.css";

interface Props {
  generaleId: string;
  /** Il nome dell'operazione, per la scheda vendita. */
  operazione: string;
  unita: UnitaGenerale | null;
  elenco: ElencoUnita;
  conti: ContiUnita;
  /** Pagamenti, dati e divisione: da tablet e computer, con il permesso. */
  gestisci: boolean;
  telefono: boolean;
  linkCantiere?: string;
  onChiudi: () => void;
  onDividi: (orderId: string) => void;
}

export function UnitaDialog({ unita, onChiudi, ...props }: Props) {
  const ritorno = useRef<HTMLElement | null>(null);
  return <Dialog open={!!unita} onOpenChange={aperto => { if (!aperto) onChiudi(); }}>
    <DialogContent struttura="contenuta" className={cn("unita-dettaglio-dialog gap-0 p-0", props.telefono && "unita-dettaglio-mobile")}
      onOpenAutoFocus={() => { ritorno.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
      onCloseAutoFocus={evento => {
        if (ritorno.current?.isConnected && !document.querySelector('[role="dialog"][data-state="open"]')) {
          evento.preventDefault();
          ritorno.current.focus({ preventScroll: true });
        }
      }}>
      {unita && <Contenuto key={unita.orderId} {...props} u={unita} />}
    </DialogContent>
  </Dialog>;
}

function Contenuto({ generaleId, operazione, u, elenco, conti, gestisci, telefono, linkCantiere, onDividi }: Omit<Props, "unita" | "onChiudi"> & { u: UnitaGenerale }) {
  const t = useT();
  const corpo = useRef<HTMLDivElement>(null);
  const [scheda, setScheda] = useState("vendita");
  const cambiaScheda = (id: string) => {
    setScheda(id);
    if (corpo.current) corpo.current.scrollTop = 0;
  };
  const permessi = elenco.permessi;
  const garanzia = elenco.modello === "sviluppo" && (u.stato === "prenotata" || u.stato === "compromesso")
    && u.movimenti.some(m => m.tipo !== "saldo");
  const divisibile = gestisci && !u.divisaIl && u.stato === "libera" && u.movimenti.length === 0;
  const conMargine = permessi.margini && (conti.perUnita.get(u.orderId)?.margine ?? null) !== null;
  const vendita = <>
    {garanzia && <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
      <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {t("Immobile da costruire con somme versate prima del rogito: serve la fideiussione (D.Lgs. 122/2005), e al rogito la polizza decennale.")}
    </p>}
    <div className={cn("grid items-start gap-4 lg:gap-5", !u.divisaIl && "md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]")}>
      <section aria-label={t("Vendita dell’unità")} className="min-w-0 rounded-lg border bg-card">
        <h3 className="border-b px-4 py-3 text-sm font-semibold">{t("Stato di vendita")}</h3>
        <div className="space-y-4 p-4">
          <CambioStato generaleId={generaleId} unita={u} permessi={permessi} telefono={telefono} />
          <DettagliVendita u={u} vedeImporti={permessi.importi} />
        </div>
      </section>
      {!u.divisaIl && <MaterialeUnita generaleId={generaleId} modello={elenco.modello}
        orderId={u.orderId} sigla={u.sigla} puoCaricare={gestisci} />}
    </div>
  </>;
  const schede = [
    { id: "vendita", nome: "Vendita", icona: Tag, contenuto: vendita },
    { id: "pagamenti", nome: "Pagamenti", icona: WalletCards, contenuto: permessi.importi &&
      <PagamentiUnita generaleId={generaleId} unita={u} gestisci={gestisci} apriVendita={() => cambiaScheda("vendita")} /> },
    { id: "scheda", nome: "Scheda vendita", icona: FileText, contenuto: !u.divisaIl &&
      <SchedaVendita generaleId={generaleId} modello={elenco.modello} operazione={operazione} unita={u} vedeImporti={permessi.importi} /> },
    { id: "varianti", nome: "Varianti", icona: GitBranch, contenuto: elenco.varianti &&
      <VariantiUnita generaleId={generaleId} unita={u} elenco={elenco} gestisci={gestisci} /> },
    { id: "dati", nome: "Dati", icona: ClipboardList, contenuto: gestisci &&
      <DatiUnita generaleId={generaleId} unita={u} vedeImporti={permessi.importi} /> },
    { id: "margine", nome: "Margine", icona: TrendingUp, contenuto: conMargine && <MargineUnita unita={u} conti={conti} /> },
  ].filter(s => s.contenuto);
  const schedaAttiva = schede.some(s => s.id === scheda) ? scheda : "vendita";

  return <>
    <IntestazioneUnita u={u} vedeImporti={permessi.importi} />
    <Tabs value={schedaAttiva} onValueChange={cambiaScheda}
        className="flex min-h-0 flex-1 flex-col">
        <div className="unita-dettaglio-nav shrink-0 border-y bg-muted/25 px-4 sm:px-6">
          <TabsList aria-label={t("Schede dell’unità")} className="h-auto bg-transparent px-0 py-2">
            {schede.map(({ id, nome, icona: Icona }) => <TabsTrigger key={id} value={id}
              className="gap-1.5 rounded-md px-3 text-sm data-[state=active]:bg-blue-100 data-[state=active]:text-blue-950 data-[state=active]:shadow-none motion-reduce:transition-none dark:data-[state=active]:bg-blue-950 dark:data-[state=active]:text-blue-100">
              <Icona className="size-4" aria-hidden="true" /> {t(nome)}
            </TabsTrigger>)}
          </TabsList>
        </div>
        <div ref={corpo} className="unita-dettaglio-corpo flex-1 px-4 py-4 sm:px-6 sm:py-5">
          {schede.map(({ id, contenuto }) => <TabsContent key={id} value={id}
            forceMount={id === "dati" || id === "scheda" || id === "varianti" ? true : undefined}
            hidden={id !== schedaAttiva}
            className="mt-0 data-[state=inactive]:hidden motion-reduce:animate-none">{contenuto}</TabsContent>)}
        </div>
    </Tabs>
    <footer className="unita-dettaglio-azioni flex shrink-0 flex-wrap items-center gap-2.5 border-t bg-muted/25 px-4 py-3 sm:px-6 sm:py-3.5">
      {linkCantiere && <Button asChild size="sm" className="gap-1.5">
        <Link to={linkCantiere}><HardHat className="size-4" aria-hidden="true" /> {t("Cantiere di questa unità")}</Link>
      </Button>}
      <Button asChild variant="outline" size="sm" className={cn("gap-1.5", telefono && "flex-1")}>
        <Link to={`/azienda/ordini/${u.orderId}`}><ExternalLink className="size-3.5" aria-hidden="true" /> {u.codice && !telefono ? t("Apri la commessa {codice}", { codice: u.codice }) : t("Apri la commessa")}</Link>
      </Button>
      {divisibile && !telefono && <Button variant="ghost" size="sm" className="ml-auto gap-1.5" onClick={() => onDividi(u.orderId)}>
        <Scissors className="size-3.5" aria-hidden="true" /> {t("Dividi {sigla}", { sigla: u.sigla })}
      </Button>}
    </footer>
  </>;
}

function IntestazioneUnita({ u, vedeImporti }: { u: UnitaGenerale; vedeImporti: boolean }) {
  const t = useT();
  const posizione = [u.edificio, u.piano ? etichettaPiano(u.piano) : null, u.mq !== null ? `${formattaNumero(u.mq)} m²` : null,
    u.millesimi !== null ? `${formattaNumero(u.millesimi)} ‰` : null].filter(Boolean).join(" · ");
  const libera = u.stato === "libera";
  const prezzo = prezzoConVarianti(u);
  const pag = pagamentiUnita(u);
  const cifre = [
    { titolo: u.variantiAccettate ? "Prezzo con varianti" : libera ? "Listino" : u.stato === "rogitata" ? "Prezzo di rogito" : "Prezzo trattato", valore: prezzo },
    ...(!libera ? [{ titolo: "Pagato", valore: pag.pagato }, { titolo: "Da incassare", valore: pag.residuo }] : []),
  ].filter(c => c.valore !== null);
  return <DialogHeader className="unita-dettaglio-testata flex-row flex-wrap items-center justify-between gap-x-6 gap-y-3 space-y-0 bg-muted/20 px-4 py-4 pr-12 sm:px-6 sm:py-5 sm:pr-14">
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200">
        <Building2 className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <DialogTitle className="text-xl leading-tight">
            {u.sigla}{u.tipologia && <span className="ml-2 text-sm font-normal text-muted-foreground">{u.tipologia}</span>}
          </DialogTitle>
          <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            u.divisaIl ? "bg-muted text-muted-foreground" : STILE_STATO[u.stato].casella)}>
            {!u.divisaIl && <span className={cn("size-1.5 rounded-full", STILE_STATO[u.stato].punto)} aria-hidden="true" />}
            {u.divisaIl ? t("Divisa") : t(NOMI_STATO[u.stato].una)}
          </span>
        </div>
        <DialogDescription className={cn("mt-1", !posizione && "sr-only")}>{posizione || t("Unità {nome}", { nome: String(u.sigla ?? "") })}</DialogDescription>
      </div>
    </div>
    {vedeImporti && cifre.length > 0 && <dl aria-label={t("Importi dell’unità")} className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-x-6">
      {cifre.map(c => <div key={c.titolo} className="min-w-0 sm:text-right">
        <dt className="text-xs text-muted-foreground">{t(c.titolo)}</dt>
        <dd className="text-lg font-semibold leading-tight tabular-nums">{euro(c.valore)}</dd>
      </div>)}
    </dl>}
  </DialogHeader>;
}

function DettagliVendita({ u, vedeImporti }: { u: UnitaGenerale; vedeImporti: boolean }) {
  const t = useT();
  const righe: [string, string][] = [];
  if (u.acquirente) righe.push([t("Acquirente"), u.acquirente]);
  if (u.dataPrenotazione) righe.push([t("Prenotata il"), dataBreve(u.dataPrenotazione)]);
  if (u.dataCompromesso) righe.push([t("Compromesso il"), dataBreve(u.dataCompromesso)]);
  if (u.rogitoPrevisto && u.stato === "compromesso") righe.push([t("Rogito previsto"), dataBreve(u.rogitoPrevisto)]);
  if (u.dataRogito) righe.push([t("Rogito il"), dataBreve(u.dataRogito)]);
  if (vedeImporti && u.stato !== "libera" && u.listino !== null) righe.push([t("Listino"), euro(u.listino)]);
  if (vedeImporti && u.variantiAccettate) righe.push([t("Varianti accettate"), euro(u.variantiAccettate)]);
  if (u.agenzia) righe.push([t("Agenzia"), u.agenzia]);
  if (!righe.length) return null;
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3">
    {righe.map(([titolo, valore]) => <div key={titolo} className="min-w-0">
      <dt className="text-xs text-muted-foreground">{titolo}</dt>
      <dd className="break-words text-sm font-medium tabular-nums">{valore}</dd>
    </div>)}
  </dl>;
}
