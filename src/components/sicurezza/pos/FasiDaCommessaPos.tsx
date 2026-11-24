import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useFasiFascicolo } from "@/hooks/useFascicoloCantiere";
import { supabase } from "@/integrations/supabase/client";
import { leggiComputoPerPos } from "../../../../supabase/functions/_shared/posComputo";
import { chiaveFasePos, chiaveVoceComputoPos, chiaviFontiLavorazionePos, type FontiSchedaPos } from "../../../../supabase/functions/_shared/posFontiScheda";
import { applicaValutazione, lavorazioneVuota, valutazioneDaElenchi, type Lavorazione } from "../../../../supabase/functions/_shared/posModello";
import {
  nuovaDaSchedaStandard, SCHEDE_STANDARD_POS, suggerisciSchedePos, testoRicercaSchedePos,
} from "../../../../supabase/functions/_shared/posSchedeStandard";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  companyId: string;
  orderId: string;
  lavorazioni: Lavorazione[];
  puoLeggereComputo?: boolean;
  ditte?: string[];
  onAggiungi: (lavorazioni: Lavorazione[]) => void;
}

interface Voce {
  chiave: string;
  titolo: string;
  dettaglio?: string;
  faseId?: string;
  computo?: FontiSchedaPos["computo"];
}

const bloccoVoci = 50;
const statoComputo: Record<string, string> = { contrattuale: "Contrattuale", verificato: "Verificato", bozza: "Bozza" };
const formattaQuantita = { format: (n: number) => new Intl.NumberFormat(intlCampo(), { maximumFractionDigits: 4 }).format(n) };

export function FasiDaCommessaPos(props: Props) {
  const [aperto, setAperto] = useState(false);
  const t = useT();
  const etichetta = props.puoLeggereComputo ? t("Fasi e computo") : t("Dalle fasi");
  return (
    <Dialog open={aperto} onOpenChange={setAperto}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="gap-1.5">
          <Layers className="size-4" aria-hidden="true" /> {etichetta}
        </Button>
      </DialogTrigger>
      {aperto && <SceltaLavorazioni {...props} chiudi={() => setAperto(false)} />}
    </Dialog>
  );
}

function SceltaLavorazioni({ companyId, orderId, lavorazioni, puoLeggereComputo, ditte, onAggiungi, chiudi }: Props & { chiudi: () => void }) {
  const tr = useT();
  const fasi = useFasiFascicolo(companyId, orderId);
  const [fonte, setFonte] = useState<"fasi" | "computo">("fasi");
  const computo = useQuery({
    queryKey: ["pos-computo", companyId, orderId],
    enabled: puoLeggereComputo === true && fonte === "computo",
    queryFn: async () => {
      const lettura = await leggiComputoPerPos(supabase, companyId, orderId, true);
      if (lettura.errore) throw new Error(lettura.avviso);
      return lettura;
    },
    staleTime: 60_000,
    retry: false,
  });
  const [ricerca, setRicerca] = useState("");
  const [limite, setLimite] = useState(bloccoVoci);
  const [selezionate, setSelezionate] = useState<Set<string>>(() => new Set());
  const [schede, setSchede] = useState<Record<string, string>>({});
  const [assegnazioni, setAssegnazioni] = useState<Record<string, string>>({});
  const imprese = [...new Set(ditte?.map(nome => nome.trim()).filter(Boolean))];
  const giaCollegate = useMemo(() => new Set(lavorazioni.flatMap(chiaviFontiLavorazionePos)), [lavorazioni]);
  const righeFasi = useMemo<Voce[]>(() => (fasi.data ?? []).map(fase => ({
    chiave: chiaveFasePos(fase.id), titolo: fase.name, faseId: fase.id,
  })), [fasi.data]);
  const documento = puoLeggereComputo ? computo.data?.fonte : undefined;
  const righeComputo = useMemo<Voce[]>(() => documento?.voci.map(voce => ({
    titolo: voce.titolo, chiave: chiaveVoceComputoPos(documento.id, voce.id),
    dettaglio: [voce.codice, voce.capitolo, voce.quantita == null ? null : [formattaQuantita.format(voce.quantita), voce.unita].filter(Boolean).join(" ")].filter(Boolean).join(" · "),
    computo: { id: documento.id, titolo: documento.titolo, voci: [voce] },
  })) ?? [], [documento]);
  const daComputo = fonte === "computo";
  const query = daComputo ? computo : fasi;
  const righe = daComputo ? righeComputo : righeFasi;
  const termini = testoRicercaSchedePos(ricerca).split(" ").filter(Boolean);
  const visibili = righe.filter(voce => {
    const testo = testoRicercaSchedePos([voce.titolo, voce.dettaglio].filter(Boolean).join(" "));
    return termini.every(t => testo.includes(t));
  });
  const daInserire = [...righeFasi, ...righeComputo].filter(voce => selezionate.has(voce.chiave) && !giaCollegate.has(voce.chiave));
  const schedaScelta = (voce: Voce, proposte = suggerisciSchedePos(voce.titolo)) =>
    schede[voce.chiave] ?? (proposte.length === 1 ? proposte[0].id : "");
  const richiedeAssegnazione = puoLeggereComputo || imprese.length > 0;
  const daAssegnare = richiedeAssegnazione ? daInserire.filter(voce => !assegnazioni[voce.chiave]) : [];
  const erroreSelezione = (fasi.isError && daInserire.some(voce => voce.faseId))
    || (computo.isError && daInserire.some(voce => voce.computo));

  function cambiaFonte(prossima: typeof fonte) {
    setFonte(prossima);
    setRicerca("");
    setLimite(bloccoVoci);
  }

  function inserisci() {
    onAggiungi(daInserire.map(voce => {
      const id = crypto.randomUUID();
      const scheda = SCHEDE_STANDARD_POS.find(s => s.id === schedaScelta(voce));
      const lavorazione = scheda ? nuovaDaSchedaStandard(scheda, id) : lavorazioneVuota(id);
      if (!scheda) applicaValutazione(lavorazione, valutazioneDaElenchi(lavorazione));
      const assegnazione = assegnazioni[voce.chiave];
      return {
        ...lavorazione,
        titolo: voce.titolo,
        fase_id: voce.faseId ?? null,
        ...(voce.computo && { fonti_scheda: { ...lavorazione.fonti_scheda, computo: voce.computo } }),
        ...(assegnazione?.startsWith("ditta:") && { svolgimento: "subappalto", svolgimento_con: assegnazione.slice(6) }),
      };
    }));
    chiudi();
  }

  return (
    <DialogContent className="flex max-h-[90dvh] min-h-0 max-w-3xl flex-col gap-0 p-0">
      <DialogHeader className="shrink-0 space-y-1 px-5 pb-3 pt-5 pr-10">
        <DialogTitle>{puoLeggereComputo ? tr("Prepara lavorazioni") : tr("Prepara lavorazioni dalle fasi")}</DialogTitle>
        <DialogDescription>{tr("Seleziona le lavorazioni che rientrano in questo POS. Puoi scegliere il testo di partenza per ognuna.")}</DialogDescription>
      </DialogHeader>
      {puoLeggereComputo && <div className="flex shrink-0 flex-wrap items-center gap-2 px-5 pb-3">
        <Button type="button" size="sm" variant={daComputo ? "outline" : "secondary"} aria-pressed={!daComputo} onClick={() => cambiaFonte("fasi")}>{tr("Fasi della commessa")}</Button>
        <Button type="button" size="sm" variant={daComputo ? "secondary" : "outline"} aria-pressed={daComputo} onClick={() => cambiaFonte("computo")}>{tr("Computo")}</Button>
      </div>}
      {daComputo && documento && <p className="mx-5 mb-2 shrink-0 break-words text-xs text-muted-foreground">
        {documento.titolo} · {statoComputo[documento.stato] ? tr(statoComputo[documento.stato]) : documento.stato} · {tr(righe.length === 1 ? "{n} voce" : "{n} voci", { n: righe.length })}
      </p>}
      {righe.length > 0 && <div className="relative mx-5 mb-3 shrink-0">
        <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
        <Input type="search" className="pl-9" aria-label={daComputo ? tr("Cerca nelle voci del computo") : tr("Cerca nelle fasi della commessa")}
          placeholder={daComputo ? tr("Cerca una voce, un codice o un capitolo") : tr("Cerca una fase")}
          value={ricerca} onChange={event => { setRicerca(event.target.value); setLimite(bloccoVoci); }} />
      </div>}
      <div className="min-h-0 overflow-y-auto border-y px-5 py-3">
        {query.isLoading && <p role="status" className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" /> {daComputo ? tr("Caricamento computo…") : tr("Caricamento fasi…")}
        </p>}
        {query.isError && <div role="alert" className="flex flex-wrap items-center gap-2 py-2 text-sm">
          {daComputo ? tr("Impossibile caricare il computo.") : tr("Impossibile caricare le fasi.")}
          <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>{tr("Riprova")}</Button>
        </div>}
        {!query.isLoading && !query.isError && righe.length === 0 && <p className="py-2 text-sm text-muted-foreground">
          {daComputo ? computo.data?.avviso : tr("La commessa non ha fasi. Puoi partire dalle schede standard o creare una scheda vuota.")}
        </p>}
        {righe.length > 0 && <ul className="divide-y">
          {!visibili.length && <li className="py-2 text-sm text-muted-foreground">{tr("Nessuna corrispondenza.")}</li>}
          {visibili.slice(0, limite).map(voce => {
            const selezionata = selezionate.has(voce.chiave);
            const collegata = giaCollegate.has(voce.chiave);
            const proposte = suggerisciSchedePos(voce.titolo);
            const opzioniSuggerite = new Set(proposte.map(s => s.id));
            return <li key={voce.chiave} className="grid items-start gap-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <label className="flex min-w-0 items-start gap-2 text-sm">
                <Checkbox aria-label={voce.titolo} className="mt-0.5 shrink-0" checked={collegata || selezionata}
                  disabled={collegata || query.isError} onCheckedChange={checked => setSelezionate(prev => {
                    const prossime = new Set(prev);
                    if (checked === true) prossime.add(voce.chiave);
                    else prossime.delete(voce.chiave);
                    return prossime;
                  })} />
                <span className="min-w-0 break-words">
                  {voce.titolo}
                  {voce.dettaglio && <span className="block text-xs text-muted-foreground">{voce.dettaglio}</span>}
                  {collegata && <span className="block text-xs text-muted-foreground">{tr("Già nel POS")}</span>}
                </span>
              </label>
              {!collegata && !selezionata && <p className="min-w-0 pl-6 text-xs text-muted-foreground sm:pl-0">
                {proposte.length === 1 ? tr("Suggerita: {titolo}", { titolo: String(proposte[0].titolo ?? "") })
                  : proposte.length > 1 ? tr("{n} schede suggerite", { n: proposte.length }) : tr("Solo il titolo")}
              </p>}
              {!collegata && selezionata && <div className="grid min-w-0 gap-2">
                <select aria-label={tr("Testo di partenza per {titolo}", { titolo: String(voce.titolo ?? "") })}
                  className="h-9 min-w-0 w-full rounded-md border bg-background px-2 text-sm"
                  value={schedaScelta(voce, proposte)} disabled={query.isError}
                  onChange={event => setSchede(prev => ({ ...prev, [voce.chiave]: event.target.value }))}>
                  <option value="">{tr("Solo il titolo")}</option>
                  {proposte.length > 0 && <optgroup label={tr("Schede suggerite")}>
                    {proposte.map(s => <option key={s.id} value={s.id}>{s.titolo}</option>)}
                  </optgroup>}
                  <optgroup label={tr("Altre schede standard")}>
                    {SCHEDE_STANDARD_POS.filter(s => !opzioniSuggerite.has(s.id)).map(s =>
                      <option key={s.id} value={s.id}>{s.titolo}</option>)}
                  </optgroup>
                </select>
                {richiedeAssegnazione && <select aria-label={tr("Chi svolge {titolo}", { titolo: String(voce.titolo ?? "") })}
                  className="h-9 min-w-0 w-full rounded-md border bg-background px-2 text-sm"
                  value={assegnazioni[voce.chiave] ?? ""} disabled={query.isError}
                  onChange={event => setAssegnazioni(prev => ({ ...prev, [voce.chiave]: event.target.value }))}>
                  <option value="">{tr("Chi svolge la lavorazione?")}</option>
                  <option value="diretto">{tr("Impresa di questo POS")}</option>
                  {imprese.map(nome => <option key={nome} value={`ditta:${nome}`}>{tr("{nome} · Subappalto", { nome: String(nome ?? "") })}</option>)}
                </select>}
              </div>}
            </li>;
          })}
        </ul>}
        {visibili.length > limite && <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setLimite(limite + bloccoVoci)}>{tr("Mostra altre voci ({n})", { n: visibili.length - limite })}</Button>}
      </div>
      {daAssegnare.length > 0 && <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 px-5 pt-2">
        <p role="status" className="text-xs text-muted-foreground">{tr("{n} da assegnare su {n2} selezionate", { n: daAssegnare.length, n2: daInserire.length })}</p>
        {daAssegnare.length > 1 && <Button type="button" size="sm" variant="ghost" className="max-w-full whitespace-normal"
          onClick={() => setAssegnazioni(prev => ({
            ...prev, ...Object.fromEntries(daAssegnare.map(voce => [voce.chiave, "diretto"])),
          }))}>{tr("Assegna le rimanenti all’impresa del POS")}</Button>}
      </div>}
      <DialogFooter className="shrink-0 items-center gap-2 px-5 py-4">
        <Button type="button" variant="outline" onClick={chiudi}>{tr("Annulla")}</Button>
        <Button type="button" disabled={!daInserire.length || daAssegnare.length > 0 || erroreSelezione} onClick={inserisci}>
          {daInserire.length === 1 ? tr("Inserisci 1 lavorazione") : tr("Inserisci {n} lavorazioni", { n: daInserire.length })}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
