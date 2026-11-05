// src/components/orders/SchedaVoce.tsx
// Tutto di una voce in una finestra grande: si apre dalla riga e si scorre alla voce dopo senza chiuderla.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CheckCircle2, ChevronLeft, ChevronRight, Circle, ListChecks, Pencil, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { dateValide, type RigaDistinta } from "@/lib/orders/distintaLavorazioni";
import { conAliquota } from "@/lib/orders/ivaCommessa";
import { percentualeDaQuantita, quantitaEseguita } from "@/lib/orders/sottofasi";

// La tabella non è nei tipi generati con le colonne usate qui.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const giorno = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

function Riquadro({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5 rounded-lg border p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titolo}</h3>
      {children}
    </section>
  );
}

function Dato({ etichetta, valore, forte }: { etichetta: string; valore: React.ReactNode; forte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{etichetta}</dt>
      <dd className={`text-right tabular-nums ${forte ? "font-semibold" : ""}`}>{valore}</dd>
    </div>
  );
}

/** I rapportini approvati o inviati che dichiarano questa voce: i rifiutati non contano. */
function RapportiniVoce({ orderId, sottofaseId }: { orderId: string; sottofaseId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["rapportini-sottofase", orderId, sottofaseId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: righe, error } = await db
        .from("campo_rapportini")
        .select("id, data_lavoro, stato, fasi_lavorate")
        .eq("order_id", orderId)
        .neq("stato", "rifiutato")
        .order("data_lavoro", { ascending: false })
        .limit(500);
      if (error) throw error;
      const dichiara = (r: { fasi_lavorate: unknown }) => Array.isArray(r.fasi_lavorate) && r.fasi_lavorate.some((f: { sottofasi_fatte?: string[]; sottofasi_lavorate?: string[] }) =>
        f?.sottofasi_fatte?.includes(sottofaseId) || f?.sottofasi_lavorate?.includes(sottofaseId));
      return ((righe ?? []) as Array<{ id: string; data_lavoro: string; stato: string; fasi_lavorate: unknown }>).filter(dichiara).slice(0, 8);
    },
  });
  if (isLoading) return <p className="text-xs text-muted-foreground">Carico i rapportini…</p>;
  if (isError) return <p role="alert" className="text-xs text-muted-foreground">Rapportini non disponibili.</p>;
  if (!data?.length) return <p className="text-xs text-muted-foreground">Nessun rapportino dichiara questa voce.</p>;
  return (
    <ul className="space-y-0.5">
      {data.map((r) => <li key={r.id} className="flex justify-between gap-2 text-xs"><span className="tabular-nums">{giorno(r.data_lavoro)}</span><span className="text-muted-foreground">{r.stato}</span></li>)}
    </ul>
  );
}

/** A che punto è la voce: i pulsanti salvano subito, i campi col «Salva». */
function Avanzamento({ riga: r, puoModificare, onAvanza }: { riga: RigaDistinta; puoModificare: boolean; onAvanza: Props["onAvanza"] }) {
  const eseguita = quantitaEseguita(r);
  const [quantita, setQuantita] = useState(eseguita === null ? "" : String(eseguita));
  const [pct, setPct] = useState(String(r.percentuale));
  const misurabile = !!r.quantita && r.quantita > 0;
  const nQuantita = quantita === "" ? null : Number(quantita);
  const nPct = Number(pct);
  const pctValida = pct !== "" && Number.isInteger(nPct) && nPct >= 0 && nPct <= 100;
  const quantitaValida = nQuantita !== null && Number.isFinite(nQuantita) && nQuantita >= 0;
  const cambiata = misurabile && quantita !== (eseguita === null ? "" : String(eseguita));
  const cambiataPct = pct !== String(r.percentuale);
  const scegli = (p: number) => onAvanza(r.sottofaseId!, { percentuale: p, quantita_fatta: misurabile ? Math.round((r.quantita! * p) / 100 * 1000) / 1000 : null });
  const salva = () => {
    if (cambiata && quantitaValida) onAvanza(r.sottofaseId!, { percentuale: percentualeDaQuantita(nQuantita!, r.quantita)!, quantita_fatta: nQuantita });
    else if (cambiataPct && pctValida) scegli(nPct);
  };
  const valido = cambiata ? quantitaValida : cambiataPct && pctValida;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div role="progressbar" aria-label="Avanzamento della voce" aria-valuenow={r.percentuale} aria-valuemin={0} aria-valuemax={100} className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
          <div className={r.percentuale >= 100 ? "h-full bg-emerald-600" : "h-full bg-primary"} style={{ width: `${r.percentuale}%` }} />
        </div>
        <span className="w-10 text-right text-sm font-semibold tabular-nums">{r.percentuale}%</span>
      </div>
      {puoModificare && (
        <>
          <div className="flex gap-1">
            {[0, 25, 50, 75, 100].map((p) => (
              <Button key={p} type="button" size="sm" variant={r.percentuale === p ? "secondary" : "outline"} aria-pressed={r.percentuale === p} className="h-7 flex-1 px-0 text-xs tabular-nums" onClick={() => scegli(p)}>{p}%</Button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            {misurabile ? (
              <label className="min-w-0 flex-1 space-y-0.5 text-xs text-muted-foreground">
                Fatti, su {r.quantita!.toLocaleString("it-IT", { maximumFractionDigits: 2 })}{r.unita ? ` ${r.unita}` : ""}
                <Input type="number" min={0} step="any" value={quantita} onChange={(e) => setQuantita(e.target.value)} className="h-8 px-2 text-xs" />
              </label>
            ) : (
              <label className="min-w-0 flex-1 space-y-0.5 text-xs text-muted-foreground">
                Percentuale
                <Input type="number" min={0} max={100} value={pct} onChange={(e) => setPct(e.target.value)} className="h-8 px-2 text-xs" />
              </label>
            )}
            <Button type="button" size="sm" className="h-8 text-xs" disabled={!valido} onClick={salva}>Salva</Button>
          </div>
          {cambiata && quantitaValida && nQuantita! > r.quantita! && <p className="text-xs text-amber-700">Più del previsto: la voce risulterà finita.</p>}
        </>
      )}
    </div>
  );
}

interface Props {
  riga: RigaDistinta | null;
  /** Dove sta nell'elenco visibile: serve a passare alla voce vicina. */
  posizione: { numero: number; totale: number };
  orderId?: string;
  aliquota: number;
  chiLaFa: string[];
  consuntivoFase: number | null;
  vedeVenduto: boolean;
  vedeCosti: boolean;
  vedeMargini: boolean;
  puoModificare: boolean;
  onChiudi: () => void;
  onVicina: (verso: -1 | 1) => void;
  onSegna: (id: string, fatta: boolean) => void;
  onAvanza: (id: string, avanzamento: { percentuale: number; quantita_fatta: number | null }) => void;
  onPianifica: (id: string, piano: { data_inizio: string | null; data_fine: string | null; giorni: number | null }) => void;
  onRinomina: (id: string, nome: string) => void;
  onSposta: (riga: RigaDistinta, verso: -1 | 1) => void;
  onElimina: (riga: RigaDistinta) => void;
  onAssegna: (faseId: string) => void;
  onCreaSottofasi: (faseId: string) => void;
  onApriScheda: (faseId: string) => void;
}

/** I campi ripartono dai valori salvati con la `key`: cambiando voce, o quando il database completa le date. */
function Contenuto({ riga: r, orderId, aliquota, chiLaFa, consuntivoFase, vedeVenduto, vedeCosti, vedeMargini, puoModificare, onSegna, onAvanza, onPianifica, onRinomina, onSposta, onElimina, onAssegna, onCreaSottofasi, onApriScheda }: Omit<Props, "riga" | "posizione" | "onChiudi" | "onVicina"> & { riga: RigaDistinta }) {
  const [inizio, setInizio] = useState(r.inizio ?? "");
  const [fine, setFine] = useState(r.fine ?? "");
  const [giorni, setGiorni] = useState(r.giorni ? String(r.giorni) : "");
  const [nome, setNome] = useState<string | null>(null);
  const cambiato = inizio !== (r.inizio ?? "") || fine !== (r.fine ?? "") || giorni !== (r.giorni ? String(r.giorni) : "");
  const nGiorni = giorni === "" ? null : Number(giorni);
  const giorniValidi = nGiorni === null || (Number.isInteger(nGiorni) && nGiorni >= 1 && nGiorni <= 3650);
  const dateOk = dateValide(inizio || null, fine || null);
  // Cambiando i giorni la fine la ricalcola il database, che riempie solo ciò che manca.
  const salvaDate = () => {
    const giorniCambiati = giorni !== (r.giorni ? String(r.giorni) : "");
    const fineCambiata = fine !== (r.fine ?? "");
    onPianifica(r.sottofaseId!, {
      data_inizio: inizio || null,
      data_fine: giorniCambiati && nGiorni !== null && !fineCambiata && inizio ? null : fine || null,
      // I giorni scritti valgono anche cambiando le date (3 giorni in una settimana); se si toglie la fine, tornerebbero a calcolarla.
      giorni: giorniCambiati ? nGiorni : fineCambiata && !fine ? null : r.giorni,
    });
  };
  const margine = r.venduto && r.previsto !== null ? r.venduto - r.previsto : null;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-3">
        <Riquadro titolo="Stato dei lavori">
          {r.sottofaseId ? (
            <>
              <button type="button" role="checkbox" aria-checked={r.fatta} disabled={!puoModificare} onClick={() => onSegna(r.sottofaseId!, !r.fatta)}
                className="flex items-center gap-2 rounded text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default">
                {r.fatta ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Circle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                {r.fatta ? "Fatta" : "Da fare"}
              </button>
              <Avanzamento key={`${r.percentuale}|${r.quantitaFatta}`} riga={r} puoModificare={puoModificare} onAvanza={onAvanza} />
              <dl className="space-y-0.5">
                {r.quantita !== null && <Dato etichetta="Quantità" valore={`${r.quantita.toLocaleString("it-IT", { maximumFractionDigits: 2 })}${r.unita ? ` ${r.unita}` : ""}`} />}
                <Dato etichetta="Giorni dai rapportini" valore={r.giorniLavorati > 0 ? `${r.giorniLavorati}${r.giorni ? ` su ${r.giorni}` : ""}` : "—"} />
              </dl>
            </>
          ) : (
            <div className="space-y-2">
              <dl>{r.quantita !== null && <Dato etichetta="Quantità" valore={`${r.quantita.toLocaleString("it-IT", { maximumFractionDigits: 2 })}${r.unita ? ` ${r.unita}` : ""}`} />}</dl>
              <p className="text-xs text-muted-foreground">Questa voce non ha ancora una sottofase: senza, non ha date né stato.</p>
              {puoModificare && <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => onCreaSottofasi(r.faseId)}><ListChecks className="h-3.5 w-3.5" aria-hidden="true" />Crea le sottofasi della fase</Button>}
            </div>
          )}
        </Riquadro>

        {r.sottofaseId && (
          <Riquadro titolo="Quando">
            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-0.5 text-xs text-muted-foreground">Dal<Input type="date" value={inizio} disabled={!puoModificare} onChange={(e) => setInizio(e.target.value)} className="h-8 px-1 text-xs" /></label>
              <label className="space-y-0.5 text-xs text-muted-foreground">Al<Input type="date" value={fine} disabled={!puoModificare} onChange={(e) => setFine(e.target.value)} className="h-8 px-1 text-xs" /></label>
              <label className="space-y-0.5 text-xs text-muted-foreground">Giorni<Input type="number" min={1} max={3650} value={giorni} disabled={!puoModificare} onChange={(e) => setGiorni(e.target.value)} className="h-8 px-1 text-xs" /></label>
            </div>
            {!dateOk && <p role="alert" className="text-xs text-rose-700">La fine viene prima dell'inizio.</p>}
            {puoModificare && cambiato && (
              <Button type="button" size="sm" className="h-7 text-xs" disabled={!dateOk || !giorniValidi} onClick={salvaDate}>Salva le date</Button>
            )}
          </Riquadro>
        )}

        <Riquadro titolo="Chi la fa">
          <p className="text-sm">{chiLaFa.join(", ") || <span className="text-amber-700">Nessuno assegnato alla fase</span>}</p>
          {puoModificare && <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => onAssegna(r.faseId)}><Users className="h-3.5 w-3.5" aria-hidden="true" />Assegna alla fase</Button>}
        </Riquadro>
      </div>

      <div className="space-y-3">
        {(vedeVenduto || vedeCosti) && (
          <Riquadro titolo="Economia">
            <dl className="space-y-0.5">
              {vedeVenduto && <Dato etichetta="Imponibile" valore={r.venduto ? formatCurrency(r.venduto) : "—"} forte />}
              {vedeVenduto && r.venduto ? <Dato etichetta={`Con IVA ${aliquota.toLocaleString("it-IT")}%`} valore={formatCurrency(conAliquota(r.venduto, aliquota).totale)} /> : null}
              {vedeCosti && <Dato etichetta="Costo previsto" valore={r.previsto !== null ? formatCurrency(r.previsto) : "Da definire"} />}
              {vedeMargini && vedeVenduto && vedeCosti && margine !== null && <Dato etichetta="Margine previsto" valore={`${formatCurrency(margine)} · ${Math.round((margine / r.venduto!) * 100)}%`} />}
              {vedeCosti && <Dato etichetta="Consuntivo della fase" valore={consuntivoFase ? formatCurrency(consuntivoFase) : "—"} />}
            </dl>
          </Riquadro>
        )}
        {r.sottofaseId && orderId && (
          <Riquadro titolo="Rapportini"><RapportiniVoce orderId={orderId} sottofaseId={r.sottofaseId} /></Riquadro>
        )}
        {puoModificare && r.sottofaseId && (
          <Riquadro titolo="Modifica">
            {nome !== null ? (
              <div className="flex items-center gap-1.5">
                <Input autoFocus value={nome} maxLength={160} aria-label="Nuovo nome" onChange={(e) => setNome(e.target.value)} className="h-8 text-xs" />
                <Button type="button" size="sm" className="h-8 text-xs" disabled={!nome.trim()} onClick={() => { onRinomina(r.sottofaseId!, nome.trim()); setNome(null); }}>Salva</Button>
                <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setNome(null)}>Annulla</Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setNome(r.descrizione.slice(0, 160))}><Pencil className="h-3 w-3" aria-hidden="true" />Rinomina</Button>
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => onSposta(r, -1)}><ArrowUp className="h-3 w-3" aria-hidden="true" />Su</Button>
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => onSposta(r, 1)}><ArrowDown className="h-3 w-3" aria-hidden="true" />Giù</Button>
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs text-rose-700" onClick={() => onElimina(r)}><Trash2 className="h-3 w-3" aria-hidden="true" />Elimina</Button>
              </div>
            )}
          </Riquadro>
        )}
        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => onApriScheda(r.faseId)}>Materiali, mezzi e note: apri la scheda della fase</Button>
      </div>
    </div>
  );
}

export function SchedaVoce({ riga, posizione, onChiudi, onVicina, ...resto }: Props) {
  return (
    <Dialog open={!!riga} onOpenChange={(a) => { if (!a) onChiudi(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        {riga && (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between gap-2 pr-6 text-xs text-muted-foreground">
                <span className="min-w-0 truncate">{riga.faseNome}{riga.codice ? ` · ${riga.codice}` : ""}</span>
                <span className="flex shrink-0 items-center gap-1 tabular-nums">
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={posizione.numero <= 1} aria-label="Voce prima" onClick={() => onVicina(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                  {posizione.numero} di {posizione.totale}
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={posizione.numero >= posizione.totale} aria-label="Voce dopo" onClick={() => onVicina(1)}><ChevronRight className="h-4 w-4" /></Button>
                </span>
              </div>
              <DialogTitle className="text-base font-semibold leading-snug">{riga.descrizione}</DialogTitle>
              <DialogDescription className="sr-only">Stato, date, importi e rapportini di questa voce.</DialogDescription>
            </DialogHeader>
            <Contenuto key={`${riga.key}|${riga.inizio}|${riga.fine}|${riga.giorni}`} riga={riga} {...resto} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
