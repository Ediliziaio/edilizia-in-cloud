/**
 * Mezzi sul cantiere, dentro la commessa: quali mezzi ci sono adesso, quali ci
 * sono stati e per quanti giorni, con una stima di quanto sono costati. La
 * stima è informativa: alimenta la lettura gestionale, non il consuntivo.
 *
 * Si vede solo a chi ha il permesso dei mezzi. Il parco vuoto mostra il
 * percorso per registrare il primo mezzo, anche a noleggio.
 */
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { Loader2, Plus, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useAssegnaMezzoACommessa, useCostiParco, useMezzi, useMezziDellaCommessa, useMezziDisponibilita, useMontaQuantita,
  useMontaggiDellaCommessa,
} from "@/hooks/useMezzi";
import { formatCurrency } from "@/lib/formatters";
import { IconaMezzo } from "@/components/mezzi/IconaMezzo";
import {
  POSSESSI, aggiungiGiorni, costoAnnuoMezzo, formatData, formatQuantita, giornoItaliano, giorniSovrapposti, giorniTra,
  numeroLetto, oggiIso, unitaBreve,
} from "@/types/mezzi";
import { useDistanzeCantieri } from "@/hooks/useDistanzaCantieri";
import { TIPI_CHE_VIAGGIANO, formatKm, giorniLavorativiSovrapposti, kmStimati } from "@/lib/manodopera/km";
import { TimelineUso } from "@/components/mezzi/TimelineUso";
import { ViaggiCommessa } from "@/components/mezzi/ViaggiMezzoWorkspace";

interface Props {
  orderId: string;
  compact?: boolean;
  /** Statistics view: no assignment, movement or removal commands. */
  readOnly?: boolean;
  /**
   * Dentro l'elenco unico dei mezzi del cantiere (31/10/2026): solo quello che
   * è già passato (rientri, viaggi, utilizzo e stime). Chi c'è adesso e i
   * comandi stanno nell'elenco sopra.
   */
  storico?: boolean;
}

function descriviPeriodi(periodi: Array<{ dal: string; al: string | null }>): string {
  return periodi
    .map((p) => (p.al ? `dal ${formatData(giornoItaliano(p.dal))} al ${formatData(giornoItaliano(p.al))}` : `dal ${formatData(giornoItaliano(p.dal))}`))
    .join(", ");
}

export function MezziCommessaCard({ orderId, compact: compactProp = false, readOnly = false, storico = false }: Props) {
  const compact = compactProp || storico;
  const perms = usePermissions();
  const puoVedere = perms.canViewMezzi || perms.isAdmin;
  const puoModificare = !readOnly && (perms.canEditMezzi || perms.isAdmin) && !perms.solaLettura;
  const vedeCosti = perms.canViewCosts === true;

  const { data: mezzi = [], isLoading: loadingParco, isError: parcoError, refetch: refetchParco } = useMezzi();
  const { data: sulCantiere = [], isLoading, error, refetch } = useMezziDellaCommessa(puoVedere ? orderId : undefined);
  const { data: costiParco, isError: costiError } = useCostiParco(puoVedere && vedeCosti);
  const { data: montaggi = [], isLoading: loadingMontaggi, isError: montaggiError, refetch: refetchMontaggi } = useMontaggiDellaCommessa(puoVedere ? orderId : undefined);
  const { data: disponibilita } = useMezziDisponibilita();
  const assegna = useAssegnaMezzoACommessa();
  const monta = useMontaQuantita();
  const [quantita, setQuantita] = useState("");

  const [aperto, setAperto] = useState(false);
  const [scelto, setScelto] = useState<string>("");
  const [mostraStorico, setMostraStorico] = useState(false);

  const oggi = oggiIso();
  const { data: distanze } = useDistanzeCantieri(puoVedere && sulCantiere.length > 0 ? [orderId] : []);
  const distanza = distanze?.[orderId] ?? null;
  const righe = useMemo(() => {
    return sulCantiere.map((m) => {
      const giorni = m.periodi.reduce((t, p) => t + giorniSovrapposti(p.dal, p.al, "2000-01-01", oggi), 0);
      // I mezzi che guidano fino al cantiere: andata e ritorno ogni giorno lavorativo.
      const giorniLavoro = m.periodi.reduce((t, p) => t + giorniLavorativiSovrapposti(p.dal, p.al, "2000-01-01", oggi), 0);
      const km = TIPI_CHE_VIAGGIANO.has(m.tipo) ? kmStimati(giorniLavoro, distanza?.km) : null;
      const costo = costiParco
        ? costoAnnuoMezzo(
            { rata_mensile: m.rata_mensile },
            costiParco.documenti.filter((d) => d.mezzo_id === m.mezzo_id),
            costiParco.manutenzioni.filter((x) => x.mezzo_id === m.mezzo_id),
            oggi,
          )
        : null;
      // Dal totale annuo, arrotondando una volta sola alla fine.
      const stima = costo && costo.totale > 0 ? Math.round(((costo.totale * giorni) / 365) * 100) / 100 : null;
      return { ...m, giorni, giorniLavoro, km, stima };
    });
  }, [sulCantiere, costiParco, oggi, distanza?.km]);

  // Ponteggi e attrezzature a quantità: il costo annuo pesato sulla parte montata e sui giorni.
  const righeMontaggi = useMemo(() => {
    return montaggi.map((g) => {
      const fine = g.al && g.al < oggi ? g.al : oggi;
      const giorni = Math.max(0, giorniTra(g.dal, fine) + 1);
      const costo = costiParco
        ? costoAnnuoMezzo(
            { rata_mensile: g.rata_mensile },
            costiParco.documenti.filter((d) => d.mezzo_id === g.mezzo_id),
            costiParco.manutenzioni.filter((x) => x.mezzo_id === g.mezzo_id),
            oggi,
          )
        : null;
      const quota = g.quantita_totale > 0 ? g.quantita / g.quantita_totale : 0;
      const stima = costo && costo.totale > 0 ? Math.round(((costo.totale * giorni * quota) / 365) * 100) / 100 : null;
      return { ...g, giorni, stima };
    });
  }, [montaggi, costiParco, oggi]);

  const stimaTotale = righe.reduce((t, r) => t + (r.stima ?? 0), 0) + righeMontaggi.reduce((t, r) => t + (r.stima ?? 0), 0);
  const kmTotali = righe.reduce((t, r) => t + (r.km ?? 0), 0);
  const inizioTimeline = righe.length
    ? righe.flatMap((r) => r.periodi.map((p) => giornoItaliano(p.dal))).sort()[0]
    : oggi;
  // Almeno due settimane di asse, così un mezzo arrivato ieri non riempie tutto.
  const daTimeline = inizioTimeline < aggiungiGiorni(oggi, -14) ? inizioTimeline : aggiungiGiorni(oggi, -14);
  const giaQui = new Set(righe.filter((r) => r.adesso).map((r) => r.mezzo_id));
  // Si mettono sul cantiere i mezzi che lavorano; un attrezzo a bordo di un
  // furgone segue il furgone e non si sposta da solo.
  // Le attrezzature a quantità (ponteggi, transenne) non vanno «sul cantiere»
  // intere: se ne monta una parte (m², pezzi), se ce n'è ancora in magazzino.
  const liberoDi = (m: (typeof mezzi)[number]) => disponibilita?.get(m.id)?.disponibile ?? Number(m.quantita_totale ?? 0);
  const disponibili = mezzi.filter((m) =>
    m.stato !== "fuori_servizio" &&
    (m.gestione === "quantita" ? liberoDi(m) > 0 : !giaQui.has(m.id) && !m.su_mezzo_id));
  const sceltoInfo = mezzi.find((m) => m.id === scelto);
  const aQuantita = sceltoInfo?.gestione === "quantita";
  const libero = sceltoInfo ? liberoDi(sceltoInfo) : 0;
  const nQuantita = numeroLetto(quantita);
  const quantitaValida = !aQuantita || (nQuantita != null && nQuantita > 0 && nQuantita <= libero);
  const storici = righe.filter(r => !r.adesso).length + righeMontaggi.filter(g => !g.adesso).length;
  const righeVisibili = storico ? righe.filter(r => !r.adesso) : compact && !mostraStorico ? righe.filter(r => r.adesso) : righe;
  const montaggiVisibili = storico ? righeMontaggi.filter(g => !g.adesso) : compact && !mostraStorico ? righeMontaggi.filter(g => g.adesso) : righeMontaggi;

  if (!puoVedere) return null;

  const conferma = async () => {
    if (!puoModificare || assegna.isPending || monta.isPending || !scelto || !quantitaValida) return;
    try {
      if (aQuantita) await monta.mutateAsync({ mezzoId: scelto, order_id: orderId, quantita: nQuantita! });
      else await assegna.mutateAsync({ mezzoId: scelto, orderId });
      setAperto(false);
      setScelto("");
      setQuantita("");
    } catch {
      // l'errore lo mostra la mutation
    }
  };

  // Dentro il piano mezzi (compact, 31/10/2026): senza un secondo titolo «Mezzi e attrezzature»,
  // il riquadro è già quello della pianificazione.
  return (
    <Card className={compact ? "border-0 bg-transparent shadow-none" : undefined}>
      {!compact && <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 max-sm:p-3 max-sm:pb-2">
        <CardTitle className="flex min-w-0 items-center gap-2 text-base sm:text-lg">
          <Truck className="h-4 w-4 shrink-0 text-slate-600" />
          <span>{readOnly ? "Utilizzo di mezzi e attrezzature" : "Mezzi e attrezzature"}</span>
          {righe.length + righeMontaggi.length > 0 && <span className="shrink-0 text-xs font-normal text-muted-foreground">({righe.length + righeMontaggi.length})</span>}
        </CardTitle>
        {puoModificare && (
          <Button size="sm" variant="outline" className="min-h-11 shrink-0 border-slate-300 font-semibold text-blue-950" onClick={() => setAperto(true)} disabled={loadingParco || parcoError || disponibili.length === 0}>
            <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
            <span>Assegna mezzo o attrezzo</span>
          </Button>
        )}
      </CardHeader>}
      <CardContent className={cn("space-y-3", compact ? "p-0" : "max-sm:p-3 max-sm:pt-0")}>
        {!storico && <div className="flex flex-col items-start gap-3 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 flex-1 text-xs text-slate-600">{readOnly ? "Storico di utilizzo sul cantiere. Gestisci le assegnazioni in Lavorazioni. I costi sono stime, non nuove registrazioni contabili." : compact ? "Assegnazioni fisiche al cantiere; valgono per tutta la commessa. I mezzi al seguito delle persone sono indicati nelle rispettive fasi." : "Mezzi propri, in leasing o a noleggio. Le assegnazioni indicano dove sono; i costi qui mostrati sono stime, non fatture di noleggio."}</p>
          <div className="flex flex-wrap gap-2">
            {compact && puoModificare && (
              <Button size="sm" variant="outline" className="min-h-11 border-slate-300 font-semibold text-blue-950" onClick={() => setAperto(true)} disabled={loadingParco || parcoError || disponibili.length === 0}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />Assegna mezzo o attrezzo
              </Button>
            )}
            <Button asChild variant="outline" size="sm" className="min-h-11 border-slate-300 font-semibold text-blue-950">
              <Link to="/azienda/manodopera?tab=mezzi">Parco mezzi e noleggi</Link>
            </Button>
          </div>
        </div>}
        {compact && !storico && storici > 0 && <Button variant="outline" size="sm" aria-expanded={mostraStorico} onClick={() => setMostraStorico(v => !v)}>{mostraStorico ? "Nascondi storico" : `Mostra storico (${storici})`}</Button>}
        {isLoading || loadingParco || loadingMontaggi ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : error || parcoError || montaggiError ? (
          <p className="text-sm text-red-700">
            Non riesco a caricare i mezzi.{" "}
            <button type="button" className="font-semibold underline" onClick={() => { void refetch(); void refetchParco(); void refetchMontaggi(); }}>Riprova</button>
          </p>
        ) : storico && righeVisibili.length + montaggiVisibili.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun mezzo è ancora rientrato da questo cantiere.</p>
        ) : righe.length === 0 && righeMontaggi.length === 0 ? (
          <p className="text-sm text-muted-foreground max-sm:text-xs">{mezzi.length === 0 ? "Il parco mezzi è vuoto. Registra prima il mezzo o l'attrezzatura, anche a noleggio, poi assegnalo al cantiere." : "Nessun mezzo è ancora passato da questo cantiere."}</p>
        ) : (
          <ul className="divide-y">
            {righeVisibili.map((r) => (
              <li key={r.mezzo_id} className="flex items-center gap-3 py-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                  <IconaMezzo tipo={r.tipo} className="h-4 w-4 text-slate-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <Link to={`/azienda/mezzi/${r.mezzo_id}`} className="truncate text-sm font-medium hover:underline">
                      {r.nome}
                    </Link>
                    {r.targa && <span className="font-mono text-xs text-muted-foreground">{r.targa}</span>}
                    {mezzi.find(m => m.id === r.mezzo_id)?.possesso && <Badge variant="outline" className="text-[11px]">
                      {POSSESSI.find(p => p.value === mezzi.find(m => m.id === r.mezzo_id)?.possesso)?.label}
                    </Badge>}
                    {r.adesso && (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[11px] text-emerald-700">Qui adesso</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {descriviPeriodi(r.periodi)} · {r.giorni === 1 ? "1 giorno" : `${r.giorni} giorni`}
                    {r.km != null && <> · circa {formatKm(r.km)}</>}
                    {vedeCosti && !compact && r.stima != null && <> · circa {formatCurrency(r.stima)}</>}
                  </p>
                </div>
                {puoModificare && r.adesso && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 shrink-0"
                    onClick={() => assegna.mutate({ mezzoId: r.mezzo_id, orderId: null })}
                    disabled={assegna.isPending}
                    aria-label={`Togli ${r.nome} dal cantiere`}
                    title="Togli dal cantiere"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {compact && !storico && !mostraStorico && righeVisibili.length + montaggiVisibili.length === 0 && storici > 0 && <p className="text-sm text-muted-foreground">Nessun mezzo presente adesso. Le assegnazioni precedenti sono nello storico.</p>}
        {!montaggiError && !loadingMontaggi && montaggiVisibili.length > 0 && (
          <ul className="divide-y border-t">
            {montaggiVisibili.map((g) => (
              <li key={g.id} className="flex items-center gap-3 py-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                  <IconaMezzo tipo="attrezzatura" className="h-4 w-4 text-slate-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <Link to={`/azienda/mezzi/${g.mezzo_id}`} className="truncate text-sm font-medium hover:underline">{g.nome}</Link>
                    <span className="text-xs font-medium text-slate-700">{formatQuantita(g.quantita, g.unita_misura)}</span>
                    {g.adesso && (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[11px] text-emerald-700">Montato adesso</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {g.al ? `dal ${formatData(g.dal)} al ${formatData(g.al)}` : `dal ${formatData(g.dal)}`} · {g.giorni === 1 ? "1 giorno" : `${g.giorni} giorni`}
                    {vedeCosti && !compact && g.stima != null && <> · circa {formatCurrency(g.stima)}</>}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <ViaggiCommessa orderId={orderId} mezzi={mezzi} readOnly={!puoModificare} vedeCosti={vedeCosti} />
        {!error && !parcoError && !montaggiError && <details open={compact && !storico ? undefined : true} className={compact && !storico ? "rounded-lg border px-3 py-2" : ""}>
        {compact && !storico && <summary className="cursor-pointer text-sm font-medium">Storico utilizzo, viaggio{vedeCosti ? " e stime di costo" : ""}</summary>}
        <div className={compact && !storico ? "mt-3 space-y-3" : "space-y-3"}>
        {righe.length > 1 && (
          <TimelineUso
            className="rounded-lg border bg-white px-3 py-2.5"
            da={daTimeline}
            a={oggi}
            righe={righe.map((r) => ({
              id: r.mezzo_id,
              etichetta: r.nome,
              colore: TIPI_CHE_VIAGGIANO.has(r.tipo) ? "#F97316" : "#64748B",
              periodi: r.periodi.map((p) => ({ dal: giornoItaliano(p.dal), al: p.al ? giornoItaliano(p.al) : null })),
              dettaglio: r.km != null ? formatKm(r.km) : r.giorni === 1 ? "1 giorno" : `${r.giorni} giorni`,
            }))}
          />
        )}
        {distanza && (
          <p className="text-xs text-muted-foreground">
            Dalla sede al cantiere: <span className="font-medium text-foreground">{formatKm(distanza.km)}</span>
            {distanza.minuti != null && <> · {distanza.minuti} min</>} su strada.
            {kmTotali > 0 && <> Km stimati dei mezzi su questo cantiere, andata e ritorno nei giorni lavorativi: <span className="font-medium text-foreground">{formatKm(kmTotali)}</span>.</>}
          </p>
        )}
        {vedeCosti && costiError && <p className="text-xs text-amber-800">Stime di costo non disponibili. Nessun costo viene registrato da questa vista.</p>}
        {vedeCosti && !costiError && stimaTotale > 0 && (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Costo stimato dei mezzi su questo cantiere: <span className="font-medium text-foreground">{formatCurrency(stimaTotale)}</span>.
            Viene da assicurazione, bollo, rate e interventi dell'ultimo anno, divisi per i giorni sul cantiere. Compare nella lettura gestionale, senza modificare il margine diretto contabilizzato.
          </p>
        )}
        </div></details>}
      </CardContent>

      <Dialog open={aperto} onOpenChange={(o) => { setAperto(o); if (!o) { setScelto(""); setQuantita(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Metti un mezzo sul cantiere</DialogTitle>
            <DialogDescription>Da oggi il mezzo risulta su questa commessa. Lo storico lo segna da solo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="mezzo-commessa">Mezzo</Label>
            <Select value={scelto} onValueChange={(v) => { setScelto(v); setQuantita(""); }}>
              <SelectTrigger id="mezzo-commessa"><SelectValue placeholder="Scegli un mezzo" /></SelectTrigger>
              <SelectContent>
                {disponibili.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome}{m.targa ? ` · ${m.targa}` : ""}
                    {m.gestione === "quantita" ? ` · ${formatQuantita(liberoDi(m), m.unita_misura)} in magazzino` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {aQuantita && sceltoInfo && (
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="mezzo-commessa-quantita">Quanto ne monti su questo cantiere ({unitaBreve(sceltoInfo.unita_misura)})</Label>
                <Input
                  id="mezzo-commessa-quantita"
                  inputMode="decimal"
                  value={quantita}
                  onChange={(e) => setQuantita(e.target.value)}
                  placeholder={`al massimo ${formatQuantita(libero, sceltoInfo.unita_misura)}`}
                  aria-invalid={nQuantita != null && nQuantita > libero}
                />
                {nQuantita != null && nQuantita > libero && (
                  <p className="text-xs text-red-700">In magazzino ce ne sono {formatQuantita(libero, sceltoInfo.unita_misura)}.</p>
                )}
              </div>
            )}
            {sceltoInfo?.assegnato_commessa && (
              <p className="text-xs text-amber-800">Adesso è su {sceltoInfo.assegnato_commessa}: lo sposto qui.</p>
            )}
            {sceltoInfo?.stato === "in_officina" && (
              <p className="text-xs text-amber-800">Risulta in officina.</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAperto(false)}>Annulla</Button>
            <Button onClick={conferma} disabled={!puoModificare || !scelto || !quantitaValida || (aQuantita && !quantita.trim()) || assegna.isPending || monta.isPending}>
              {(assegna.isPending || monta.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {aQuantita ? "Segna il montaggio" : "Metti sul cantiere"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
