import { useRef, useState } from "react";
import { ArrowDown, ChevronDown, Search, Wallet } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { UniformSelect } from "@/components/ui/uniform-select";
import { useGeneralePianoNumeri } from "@/hooks/useGeneralePiano";
import { formatCurrency } from "@/lib/formatters";
import { categorieFiltro, totaliRigheFiltrate } from "@/lib/orders/generali/filtriGrafici";
import type { RigaConfronto, RigaReale, TotaliColonne } from "@/lib/orders/generali/pianoConti";
import { cercaNellOperazione } from "@/lib/orders/generali/registroOperazione";
import { cn } from "@/lib/utils";
import type { PropsScheda } from "../tipiScheda";
import { dataBreve, euro, euroSegno, nomeMese, tonoScostamento } from "./formato";
import { gruppiPerCategoria, nomeCategoria } from "./TabellaVoci";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const statiVersione = { bozza: "Bozza", approvata: "Approvata", superata: "Superata" };
const PER_PAGINA = 10;

export function PianoEconomicoMobile({ riepilogo }: PropsScheda) {
  const t = useT();
  const [parametri, setParametri] = useSearchParams();
  const sezioneCosti = useRef<HTMLElement>(null);
  const n = useGeneralePianoNumeri(riepilogo, { versioneId: parametri.get("versione-piano"), preferenza: "bozza" });
  if (!riepilogo.permessi.margini) return <p className="generale-panel p-4 text-sm">{t("Piano economico riservato a chi può vedere i margini.")}</p>;
  if (n.isError) return <div role="alert" className="generale-panel flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
    {t("Piano economico non disponibile.")}
    <Button size="sm" variant="outline" onClick={n.refetch}>{t("Riprova")}</Button>
  </div>;
  if (n.vuoto) return <p className="generale-panel p-4 text-sm text-muted-foreground">{t("Nessuna versione del piano economico.")}</p>;
  if (n.isLoading || !n.piano || !n.inVista) return <Skeleton className="h-56 w-full rounded-xl" />;

  const { piano, inVista } = n;
  const { confronto } = piano;
  const vedeCosti = riepilogo.permessi.costi && n.reale?.permessi.costi !== false;
  const realeCompleto = n.reale?.permessi.costi !== false && n.reale?.permessi.importi !== false;
  const parziale = piano.budgetCompleto === false;
  const vista = parametri.get("vista-piano");
  const categorie = categorieFiltro(parametri.get("categorie-costo"));
  const righe = categorie.length ? confronto.costi.filter(r => categorie.includes(r.categoria)) : confronto.costi;
  const cerca = parametri.get("piano-cerca-costi")?.slice(0, 100) ?? "";
  const scriviParametro = (chiave: string, valore?: string) => {
    const p = new URLSearchParams(parametri);
    if (valore) p.set(chiave, valore);
    else p.delete(chiave);
    if (chiave === "categorie-costo") p.delete("base-costi");
    setParametri(p, { replace: true, preventScrollReset: true });
  };

  return <div className="space-y-3">
    <header className="generale-panel space-y-2 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <h2 className="text-base font-semibold">{t("Piano economico")}</h2>
        <span className="text-xs text-muted-foreground">{t("Importi al netto dell’IVA")}</span>
      </div>
      {n.versioni.length > 1 ? <UniformSelect aria-label={t("Versione del piano")} className="h-10 w-full min-w-0 text-sm"
        value={inVista.id} onChange={e => scriviParametro("versione-piano", e.target.value)}>
        {n.versioni.map(v => <option key={v.id} value={v.id}>{t("Versione {numero} · {stato}", { numero: v.numero, stato: t(statiVersione[v.stato]) })}</option>)}
      </UniformSelect> : <p className="text-xs text-muted-foreground">{t("Versione {numero} · {stato}", { numero: inVista.numero, stato: t(statiVersione[inVista.stato]) })}</p>}
      {parziale && <p role="status" className="rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        {t("Budget incompleto · le stime di costi e margine sono parziali.")}
      </p>}
      {piano.chiusa && <p className="text-xs text-muted-foreground">{t("Operazione chiusa · valori finali dal registrato.")}</p>}
    </header>

    <section aria-label={t("Costi e margine del piano")} className="grid gap-2.5 min-[680px]:grid-cols-2">
      {vedeCosti && <div className="generale-panel min-w-0 p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{t("Costi")}</h3>
          <Button type="button" size="sm" variant="ghost" className="h-10 px-2 text-xs text-primary" onClick={() => {
            sezioneCosti.current?.focus({ preventScroll: true });
            sezioneCosti.current?.scrollIntoView({ block: "start" });
          }}>
            {t("Voci di costo")} <ArrowDown className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
        <ValoriPiano valori={confronto.totali.costi} />
        {!piano.chiusa && <dl className="mt-2 border-t pt-1"><Valore titolo={t("Da sostenere")} cifra={confronto.totali.costi.aFinire} /></dl>}
      </div>}
      <div className="generale-panel min-w-0 border-blue-200 p-3 dark:border-blue-900">
        <h3 className="mb-1 text-sm font-semibold">{t("Margine")}</h3>
        <ValoriPiano valori={confronto.totali.margine} margine realeDisponibile={realeCompleto} />
        {!parziale && realeCompleto && !piano.chiusa && <dl className="mt-2 border-t pt-1">
          <Valore titolo={t("Scostamento dal previsto")} cifra={confronto.totali.margine.scostamento} delta />
        </dl>}
      </div>
    </section>

    {vista === "cassa" && vedeCosti && riepilogo.permessi.importi && realeCompleto && <section aria-label={t("Indicatori di cassa")} className="generale-panel p-3">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Wallet className="size-4 text-primary" aria-hidden="true" /> {t("Cassa")}</h3>
      <dl className="divide-y">
        <Valore titolo={t("Capitale investito a oggi")} cifra={piano.capitale.investitoOggi} />
        <Valore titolo={t("Picco stimato")} cifra={piano.calendarioCompleto === false ? null : piano.capitale.massimoStima} />
      </dl>
      {piano.calendarioCompleto !== false && piano.capitale.meseMassimoStima && <p className="text-xs text-muted-foreground">{t("Picco a {mese}", { mese: nomeMese(piano.capitale.meseMassimoStima) })}</p>}
    </section>}

    {vista === "comuni" && vedeCosti && <section aria-label={t("Costi comuni")} className="generale-panel overflow-hidden">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b p-3">
        <h3 className="text-sm font-semibold">{t("Costi comuni registrati")}</h3>
        <strong className="text-sm tabular-nums">{euro(piano.costiComuni.totale)}</strong>
      </header>
      {piano.costiComuni.ripartizione.quote.length > 0 && <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-medium">
          {t("Riparto per unità o lavoro")} <ChevronDown className="size-4 shrink-0 text-muted-foreground group-open:rotate-180" aria-hidden="true" />
        </summary>
        <dl className="divide-y border-t px-3">
          {piano.costiComuni.ripartizione.quote.map(q => <Valore key={q.figliaId} titolo={q.nome} cifra={q.importo} />)}
        </dl>
      </details>}
    </section>}

    {vedeCosti && <section ref={sezioneCosti} tabIndex={-1} aria-labelledby="piano-mobile-voci"
      className="generale-panel scroll-mt-[calc(var(--generale-nav-height,49px)+0.5rem)] overflow-hidden focus-visible:outline-primary">
      <div className="space-y-2 border-b px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="piano-mobile-voci" className="text-sm font-semibold">{t("Voci di costo")}</h3>
          {categorie.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => scriviParametro("categorie-costo")}>
            {t("Azzera filtro categorie")}
          </Button>}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-3 size-4 text-muted-foreground" aria-hidden="true" />
          <Input type="search" aria-label={t("Cerca nelle voci di costo")} placeholder={t("Cerca voce o movimento…")}
            className="h-10 pl-8 text-base" maxLength={100} value={cerca}
            onChange={e => scriviParametro("piano-cerca-costi", e.target.value)} />
        </div>
      </div>
      <VociCostoMobile righe={righe} ricerca={cerca.trim()} />
    </section>}
  </div>;
}

function VociCostoMobile({ righe, ricerca }: { righe: RigaConfronto[]; ricerca: string }) {
  const t = useT();
  const gruppi = gruppiPerCategoria(righe).map(({ categoria, righe }) => {
    const nome = nomeCategoria(categoria);
    const voci = righe.flatMap(riga => {
      if (!ricerca || cercaNellOperazione(ricerca, [nome, riga.etichetta])) return [{ riga, movimenti: riga.righe }];
      const movimenti = riga.righe.filter(m => cercaNellOperazione(ricerca, [nome, riga.etichetta, m.descrizione]));
      return movimenti.length ? [{ riga, movimenti }] : [];
    });
    return { categoria, nome, voci, totale: totaliRigheFiltrate(righe), riepilogaCategoria: righe.length > 1 };
  }).filter(gruppo => gruppo.voci.length > 0);
  const numero = gruppi.reduce((totale, gruppo) => totale + gruppo.voci.length, 0);
  return <div className="divide-y">
    {ricerca ? <p role="status" className="px-3 py-1.5 text-xs text-muted-foreground">
      {numero === 0 ? t("Nessuna voce trovata.") : t(numero === 1 ? "{n} voce trovata" : "{n} voci trovate", { n: numero })}
    </p> : !numero && <p className="p-3 text-sm text-muted-foreground">{t("Nessun costo per questa selezione.")}</p>}
    {gruppi.map(({ categoria, ...gruppo }) => <CategoriaCostoMobile key={`${categoria}:${ricerca}`} {...gruppo} ricercaAttiva={!!ricerca} />)}
  </div>;
}

function CategoriaCostoMobile({ nome, voci, totale, riepilogaCategoria, ricercaAttiva }: {
  nome: string;
  voci: { riga: RigaConfronto; movimenti: RigaReale[] }[];
  totale: TotaliColonne;
  riepilogaCategoria: boolean;
  ricercaAttiva: boolean;
}) {
  const t = useT();
  const [aperta, setAperta] = useState(ricercaAttiva);
  const [limite, setLimite] = useState(PER_PAGINA);
  return <details className="group" open={aperta} onToggle={e => setAperta(e.currentTarget.open)}>
    <summary className="grid min-h-12 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_1rem] items-center gap-2 px-3 py-2.5">
      <span className="min-w-0 break-words text-sm font-medium">{t(nome)}</span>
      <span className="text-right text-sm tabular-nums">{euro(totale.stima)}<span className="block text-[11px] text-muted-foreground">{t("stima categoria")}</span></span>
      <ChevronDown className="size-4 text-muted-foreground group-open:rotate-180" aria-hidden="true" />
    </summary>
    {aperta && <div className="border-t bg-muted/20 p-3">
      {riepilogaCategoria && <ValoriPiano valori={totale} />}
      <ul aria-label={t("Voci di {nome}", { nome: t(nome) })} className={cn("space-y-2", riepilogaCategoria && "mt-2")}>
        {voci.slice(0, limite).map(({ riga, movimenti }) => <li key={riga.chiave} className="space-y-1 rounded-md border bg-card px-2.5 py-1.5">
          <p className="break-words text-sm font-medium">{riga.etichetta}</p>
          <ValoriPiano valori={riga} />
          {movimenti.length > 0 && <MovimentiCostoMobile movimenti={movimenti} filtrati={movimenti.length !== riga.righe.length} />}
        </li>)}
      </ul>
      {voci.length > limite && <Button type="button" size="sm" variant="outline" className="mt-2 h-10"
        onClick={() => setLimite(n => n + PER_PAGINA)}>{t("Altre voci ({n})", { n: voci.length - limite })}</Button>}
    </div>}
  </details>;
}

function MovimentiCostoMobile({ movimenti, filtrati }: { movimenti: RigaReale[]; filtrati: boolean }) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const [limite, setLimite] = useState(PER_PAGINA);
  return <details className="group/movimenti border-t" open={aperto} onToggle={e => setAperto(e.currentTarget.open)}>
    <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-primary">
      {t(filtrati ? "Movimenti trovati ({n})" : "Movimenti registrati ({n})", { n: movimenti.length })}
      <ChevronDown className="size-3.5 shrink-0 group-open/movimenti:rotate-180" aria-hidden="true" />
    </summary>
    {aperto && <>
      <ul className="divide-y border-t">
        {movimenti.slice(0, limite).map(m => <li key={m.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 py-2 text-xs">
          <span className="break-words">{m.descrizione}</span>
          <span className="font-medium tabular-nums">{formatCurrency(m.importo)}</span>
          {m.data && <time dateTime={m.data} className="text-muted-foreground">{dataBreve(m.data)}</time>}
        </li>)}
      </ul>
      {movimenti.length > limite && <Button type="button" size="sm" variant="outline" className="my-1 h-10"
        onClick={() => setLimite(n => n + PER_PAGINA)}>{t("Altri movimenti ({n})", { n: movimenti.length - limite })}</Button>}
    </>}
  </details>;
}

function ValoriPiano({ valori, margine = false, realeDisponibile = true }: {
  valori: Pick<TotaliColonne, "previsto" | "reale" | "stima">;
  margine?: boolean;
  realeDisponibile?: boolean;
}) {
  const t = useT();
  return <dl className="divide-y">
    <Valore titolo={t("Previsto")} cifra={valori.previsto} />
    <Valore titolo={margine ? t("A oggi") : t("Registrato")} cifra={realeDisponibile ? valori.reale : null} />
    <Valore titolo={t("Stima finale")} cifra={realeDisponibile ? valori.stima : null} principale />
  </dl>;
}

function Valore({ titolo, cifra, principale, delta }: { titolo: string; cifra: number | null; principale?: boolean; delta?: boolean }) {
  return <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
    <dt className={cn("min-w-0 break-words text-xs text-muted-foreground", principale && "font-semibold text-foreground")}>{titolo}</dt>
    <dd className={cn("ml-auto max-w-full break-words text-right text-sm tabular-nums", principale && "text-base font-semibold",
      delta && cifra !== null && tonoScostamento(cifra, "margine"))}>{delta && cifra !== null ? euroSegno(cifra) : euro(cifra)}</dd>
  </div>;
}
