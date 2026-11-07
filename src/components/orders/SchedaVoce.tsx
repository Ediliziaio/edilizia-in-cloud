// src/components/orders/SchedaVoce.tsx
// Tutto di una voce in una finestra grande: si apre dalla riga e si scorre alla voce dopo senza chiuderla.
import { useEffect, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, CheckCircle2, ChevronLeft, ChevronRight, ListChecks, MoreHorizontal, Pencil, Trash2, Users } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { dateValide, type RigaDistinta } from "@/lib/orders/distintaLavorazioni";
import { conAliquota } from "@/lib/orders/ivaCommessa";
import type { DatiVoce } from "@/hooks/useSottofasi";
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

interface RapportinoVoce { id: string; data: string; stato: string; chi: string; ore: number | null; cosa: string }

/**
 * Chi ci ha lavorato, quando e quanto: dai rapportini (inviati o approvati, i rifiutati no) che nominano questa
 * sottofase. Il nome è di chi ha scritto il rapportino; la squadra si legge dalle sue presenze.
 */
function RapportiniVoce({ orderId, sottofaseId, unita }: { orderId: string; sottofaseId: string; unita?: string | null }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["rapportini-sottofase", orderId, sottofaseId],
    staleTime: 60_000,
    queryFn: async (): Promise<RapportinoVoce[]> => {
      const { data: righe, error } = await db
        .from("campo_rapportini")
        .select("id, data_lavoro, stato, user_id, ore_lavorate, presenze, fasi_lavorate")
        .eq("order_id", orderId)
        .neq("stato", "rifiutato")
        .order("data_lavoro", { ascending: false })
        .limit(500);
      if (error) throw error;
      type Riga = { id: string; data_lavoro: string; stato: string; user_id: string | null; ore_lavorate: number | null; presenze: unknown; fasi_lavorate: unknown };
      type Voce = { sottofasi_fatte?: string[]; sottofasi_lavorate?: string[]; sottofasi_avanzate?: Array<{ id: string; quantita?: number; percentuale?: number }> };
      const della = (r: Riga): Voce | undefined => (Array.isArray(r.fasi_lavorate) ? (r.fasi_lavorate as Voce[]) : []).find((f) =>
        f?.sottofasi_fatte?.includes(sottofaseId) || f?.sottofasi_lavorate?.includes(sottofaseId) || f?.sottofasi_avanzate?.some((a) => a.id === sottofaseId));
      const scelte = ((righe ?? []) as Riga[]).filter((r) => della(r)).slice(0, 20);
      const ids = [...new Set(scelte.map((r) => r.user_id).filter((x): x is string => !!x))];
      const nomi = new Map<string, string>();
      if (ids.length) {
        const { data: profili } = await db.from("profiles").select("id, first_name, last_name").in("id", ids);
        for (const p of (profili ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) nomi.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || "Senza nome");
      }
      return scelte.map((r) => {
        const v = della(r)!;
        const avanzata = v.sottofasi_avanzate?.find((a) => a.id === sottofaseId);
        const presenze = Array.isArray(r.presenze) ? (r.presenze as Array<{ nome?: string }>).map((x) => x?.nome).filter(Boolean) : [];
        const cosa = v.sottofasi_fatte?.includes(sottofaseId) ? "finita" : avanzata?.quantita ? `+${avanzata.quantita.toLocaleString("it-IT")}${unita ? ` ${unita}` : ""}` : avanzata?.percentuale ? `fino al ${avanzata.percentuale}%` : "ci ha lavorato";
        return { id: r.id, data: r.data_lavoro, stato: r.stato, chi: presenze.length > 1 ? `${nomi.get(r.user_id ?? "") ?? "—"} e squadra (${presenze.length})` : nomi.get(r.user_id ?? "") ?? "—", ore: r.ore_lavorate, cosa };
      });
    },
  });
  if (isLoading) return <p className="text-xs text-muted-foreground">Carico i rapportini…</p>;
  if (isError) return <p role="alert" className="text-xs text-muted-foreground">Rapportini non disponibili.</p>;
  if (!data?.length) return <p className="text-xs text-muted-foreground">Nessun rapportino dichiara questa voce.</p>;
  const persone = [...new Set(data.map((r) => r.chi))];
  return (
    <div className="space-y-1">
      <p className="text-xs">Ci hanno lavorato: <span className="font-medium">{persone.join(", ")}</span></p>
      <ul className="divide-y">
        {data.map((r) => (
          <li key={r.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] gap-2 py-0.5 text-xs">
            <span className="tabular-nums">{giorno(r.data)}</span>
            <span className="min-w-0 truncate" title={r.chi}>{r.chi}{r.ore ? ` · ${r.ore} h` : ""}</span>
            <span className={r.stato === "approvato" ? "text-muted-foreground" : "text-amber-700"}>{r.cosa}{r.stato === "approvato" ? "" : " · da approvare"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A che punto è la voce: i pulsanti salvano subito, il campo col «Salva» che compare solo se si cambia. */
function Avanzamento({ riga: r, puoModificare, onAvanza, onSegna }: { riga: RigaDistinta; puoModificare: boolean; onAvanza: Props["onAvanza"]; onSegna: Props["onSegna"] }) {
  const eseguita = quantitaEseguita(r);
  const [quantita, setQuantita] = useState(eseguita === null ? "" : String(eseguita));
  const [pct, setPct] = useState(String(r.percentuale));
  const misurabile = !!r.quantita && r.quantita > 0;
  const nQuantita = quantita === "" ? null : Number(quantita);
  const nPct = Number(pct);
  const pctValida = pct !== "" && Number.isInteger(nPct) && nPct >= 0 && nPct <= 100;
  const quantitaValida = nQuantita !== null && Number.isFinite(nQuantita) && nQuantita >= 0;
  const cambiata = misurabile && quantita !== (eseguita === null ? "" : String(eseguita));
  const cambiataPct = !misurabile && pct !== String(r.percentuale);
  const scegli = (p: number) => onAvanza(r.sottofaseId!, { percentuale: p, quantita_fatta: misurabile ? Math.round((r.quantita! * p) / 100 * 1000) / 1000 : null });
  const salva = () => {
    if (cambiata && quantitaValida) onAvanza(r.sottofaseId!, { percentuale: percentualeDaQuantita(nQuantita!, r.quantita)!, quantita_fatta: nQuantita });
    else if (cambiataPct && pctValida) scegli(nPct);
  };
  const valido = cambiata ? quantitaValida : cambiataPct && pctValida;
  if (r.fatta) {
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Fatta</p>
        {puoModificare && <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSegna(r.sottofaseId!, false)}>Riapri</Button>}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div role="progressbar" aria-label="Avanzamento della voce" aria-valuenow={r.percentuale} aria-valuemin={0} aria-valuemax={100} className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${r.percentuale}%` }} />
        </div>
        <span className="w-10 text-right text-sm font-semibold tabular-nums">{r.percentuale}%</span>
      </div>
      {puoModificare && (
        <>
          <div className="flex gap-1">
            {[0, 25, 50, 75].map((p) => (
              <Button key={p} type="button" size="sm" variant={r.percentuale === p ? "secondary" : "outline"} aria-pressed={r.percentuale === p} className="h-7 flex-1 px-0 text-xs tabular-nums" onClick={() => scegli(p)}>{p}%</Button>
            ))}
            <Button type="button" size="sm" variant="outline" className="h-7 flex-1 gap-1 px-0 text-xs text-emerald-700" onClick={() => onSegna(r.sottofaseId!, true)}><Check className="h-3.5 w-3.5" aria-hidden="true" />Fatta</Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {misurabile ? (
              <label className="flex min-w-0 flex-1 items-center gap-1.5">Fatti
                <Input type="number" min={0} step="any" value={quantita} onChange={(e) => setQuantita(e.target.value)} aria-label={`Fatti, su ${r.quantita}`} className="h-7 w-24 px-1.5 text-xs" />
                <span className="truncate">su {r.quantita!.toLocaleString("it-IT", { maximumFractionDigits: 2 })}{r.unita ? ` ${r.unita}` : ""}</span>
              </label>
            ) : (
              <label className="flex min-w-0 flex-1 items-center gap-1.5">Percentuale
                <Input type="number" min={0} max={100} value={pct} onChange={(e) => setPct(e.target.value)} className="h-7 w-20 px-1.5 text-xs" />%
              </label>
            )}
            {valido && <Button type="button" size="sm" className="h-7 text-xs" onClick={salva}>Salva</Button>}
          </div>
          {cambiata && quantitaValida && nQuantita! > r.quantita! && <p className="text-xs text-amber-700">Più del previsto: la voce risulterà finita.</p>}
        </>
      )}
    </div>
  );
}

const numero = (t: string) => {
  const n = Number(t.replace(",", "."));
  return t.trim() === "" ? 0 : Number.isFinite(n) && n >= 0 ? n : null;
};
const testoDi = (n: number | null | undefined) => (n ? String(n) : "");

/** Quantità e prezzi: una sottofase scritta a mano parte vuota, e con questi campi nasce la sua voce. */
function DatiLavorazione({ riga: r, vedeVenduto, puoModificare, onSalva }: { riga: RigaDistinta; vedeVenduto: boolean; puoModificare: boolean; onSalva?: Props["onSalvaVoce"] }) {
  const inizio = { q: testoDi(r.quantita), u: r.unita ?? "", i: testoDi(r.venduto), l: testoDi(r.costoManodopera), m: testoDi(r.costoMateriali) };
  const [c, setC] = useState(inizio);
  // Su una commessa grande il dato torna dopo qualche secondo: il secondo clic creerebbe una voce doppia.
  const [inviato, setInviato] = useState(false);
  // Se il salvataggio non va, il pulsante torna disponibile dopo qualche secondo.
  useEffect(() => { if (!inviato) return undefined; const t = window.setTimeout(() => setInviato(false), 8000); return () => window.clearTimeout(t); }, [inviato]);
  const cambia = (k: keyof typeof c) => (e: { target: { value: string } }) => { setInviato(false); setC((x) => ({ ...x, [k]: e.target.value })); };
  const q = numero(c.q), i = numero(c.i), l = numero(c.l), m = numero(c.m);
  const valido = q !== null && i !== null && l !== null && m !== null;
  const cambiato = (Object.keys(c) as Array<keyof typeof c>).some((k) => c[k] !== inizio[k]);
  const previsto = valido ? (q ?? 0) * ((l ?? 0) + (m ?? 0)) : 0;
  const campo = (k: keyof typeof c, etichetta: string, tipo: "number" | "text" = "number") => (
    <label className="min-w-0 space-y-0.5 text-xs text-muted-foreground">{etichetta}
      <Input type={tipo} min={tipo === "number" ? 0 : undefined} step="any" value={c[k]} disabled={!puoModificare} onChange={cambia(k)} maxLength={tipo === "text" ? 15 : undefined} className="h-8 px-1.5 text-xs" />
    </label>
  );
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {campo("q", "Quantità")}
        {campo("u", "Unità", "text")}
        {vedeVenduto && campo("i", "Imponibile totale €")}
        {campo("l", "Lavoro €/unità")}
        {campo("m", "Materiali €/unità")}
      </div>
      {previsto > 0 && <p className="text-xs text-muted-foreground">Costo previsto: {formatCurrency(previsto)}</p>}
      {!valido && <p role="alert" className="text-xs text-rose-700">Scrivi numeri non negativi.</p>}
      {puoModificare && cambiato && onSalva && (
        <Button type="button" size="sm" className="h-7 text-xs" disabled={!valido || inviato}
          onClick={() => { setInviato(true); onSalva(r, { quantita: q ?? 0, unita: c.u.trim() || null, costoManodopera: l ?? 0, costoMateriali: m ?? 0, ...(vedeVenduto ? { importo: i || null } : {}) }); }}>
          {inviato ? "Salvataggio…" : "Salva quantità e prezzi"}
        </Button>
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
  onSalvaVoce?: (riga: RigaDistinta, dati: DatiVoce) => void;
  /** Chi fa questa sottofase; disponibile solo quando il database ha la tabella. */
  chiSottofase?: Array<{ id: string; nome: string }>;
  chiDisponibile?: boolean;
  opzioniChi?: { persone: ReadonlyArray<{ id: string; nome: string }>; squadre: ReadonlyArray<{ id: string; nome: string }>; ditte: ReadonlyArray<{ id: string; nome: string }> };
  onAggiungiChi?: (valore: string) => void;
  onTogliChi?: (id: string) => void;
  onRisorse?: (id: string, persone: number | null) => void;
  onParallelo?: (id: string, insieme: boolean) => void;
  oggi?: string;
  onPianifica: (id: string, piano: { data_inizio: string | null; data_fine: string | null; giorni: number | null }) => void;
  onRinomina: (id: string, nome: string) => void;
  onSposta: (riga: RigaDistinta, verso: -1 | 1) => void;
  onElimina: (riga: RigaDistinta) => void;
  onAssegna: (faseId: string) => void;
  onCreaSottofasi: (faseId: string) => void;
  onApriScheda: (faseId: string) => void;
}

/** I campi ripartono dai valori salvati con la `key`: cambiando voce, o quando il database completa le date. */
function Contenuto({ riga: r, orderId, aliquota, chiLaFa, consuntivoFase, vedeVenduto, vedeCosti, vedeMargini, puoModificare, oggi, onSalvaVoce, chiSottofase = [], chiDisponibile, opzioniChi, onAggiungiChi, onTogliChi, onRisorse, onParallelo, onSegna, onAvanza, onPianifica, onAssegna, onCreaSottofasi }: Omit<Props, "riga" | "posizione" | "onChiudi" | "onVicina"> & { riga: RigaDistinta }) {
  const [inizio, setInizio] = useState(r.inizio ?? "");
  const [fine, setFine] = useState(r.fine ?? "");
  const [giorni, setGiorni] = useState(r.giorni ? String(r.giorni) : "");
  const [prezzi, setPrezzi] = useState(false);
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
  const quantita = r.quantita !== null ? `${r.quantita.toLocaleString("it-IT", { maximumFractionDigits: 2 })}${r.unita ? ` ${r.unita}` : ""}` : null;
  const ritardo = !r.fatta && !!r.fine && !!oggi && r.fine < oggi;
  const lavoro = [r.iniziataIl ? `iniziata il ${giorno(r.iniziataIl)}` : null, r.giorniLavorati > 0 ? `${r.giorniLavorati} ${r.giorniLavorati === 1 ? "giorno" : "giorni"} dai rapportini` : null].filter(Boolean).join(" · ");

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-3">
        <Riquadro titolo="Stato dei lavori">
          {r.sottofaseId ? (
            <>
              <Avanzamento key={`${r.percentuale}|${r.quantitaFatta}|${r.fatta}`} riga={r} puoModificare={puoModificare} onAvanza={onAvanza} onSegna={onSegna} />
              {lavoro && <p className="text-xs text-muted-foreground">{lavoro}</p>}
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Questa voce non ha ancora una sottofase: senza, non ha date né stato.</p>
              {puoModificare && <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => onCreaSottofasi(r.faseId)}><ListChecks className="h-3.5 w-3.5" aria-hidden="true" />Crea le sottofasi della fase</Button>}
            </div>
          )}
        </Riquadro>

        {r.sottofaseId && (
          <Riquadro titolo="Quando">
            <div className="grid grid-cols-[1fr_1fr_4.5rem] gap-2">
              <label className="space-y-0.5 text-xs text-muted-foreground">Dal<Input type="date" value={inizio} disabled={!puoModificare} onChange={(e) => setInizio(e.target.value)} className="h-8 px-1 text-xs" /></label>
              <label className="space-y-0.5 text-xs text-muted-foreground">Al<Input type="date" value={fine} disabled={!puoModificare} onChange={(e) => setFine(e.target.value)} className="h-8 px-1 text-xs" /></label>
              <label className="space-y-0.5 text-xs text-muted-foreground">Giorni<Input type="number" min={1} max={3650} value={giorni} disabled={!puoModificare} onChange={(e) => setGiorni(e.target.value)} className="h-8 px-1 text-xs" /></label>
            </div>
            {!dateOk && <p role="alert" className="text-xs text-rose-700">La fine viene prima dell'inizio.</p>}
            {ritardo && <p className="text-xs font-medium text-rose-700">In ritardo: doveva finire il {giorno(r.fine!)}</p>}
            {(onRisorse || onParallelo) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {onRisorse && (
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">Persone
                    <Input key={String(r.risorse)} type="number" min={1} max={999} defaultValue={r.risorse ?? ""} disabled={!puoModificare} aria-label="Persone che ci lavorano"
                      onBlur={(e) => {
                        const n = e.target.value === "" ? null : Number(e.target.value);
                        if (n === (r.risorse ?? null) || (n !== null && (!Number.isInteger(n) || n < 1))) return;
                        onRisorse(r.sottofaseId!, n);
                      }}
                      className="h-7 w-14 px-1 text-xs" />
                  </label>
                )}
                {onParallelo && (
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input type="checkbox" checked={r.inParallelo} disabled={!puoModificare} onChange={(e) => onParallelo(r.sottofaseId!, e.target.checked)} />
                    Insieme alla precedente
                  </label>
                )}
              </div>
            )}
            {puoModificare && cambiato && (
              <Button type="button" size="sm" className="h-7 text-xs" disabled={!dateOk || !giorniValidi} onClick={salvaDate}>Salva le date</Button>
            )}
          </Riquadro>
        )}
      </div>

      <div className="space-y-3">
        {(vedeVenduto || vedeCosti) && (
          <Riquadro titolo="Economia">
            <dl className="space-y-0.5">
              <Dato etichetta="Quantità" valore={quantita ?? "—"} />
              {vedeVenduto && <Dato etichetta="Imponibile" valore={r.venduto ? formatCurrency(r.venduto) : "—"} forte />}
              {vedeVenduto && r.venduto ? <Dato etichetta={`Con IVA ${aliquota.toLocaleString("it-IT")}%`} valore={formatCurrency(conAliquota(r.venduto, aliquota).totale)} /> : null}
              {vedeCosti && <Dato etichetta="Costo previsto" valore={r.previsto !== null ? formatCurrency(r.previsto) : "Da definire"} />}
              {vedeMargini && vedeVenduto && vedeCosti && margine !== null && <Dato etichetta="Margine previsto" valore={`${formatCurrency(margine)} · ${Math.round((margine / r.venduto!) * 100)}%`} />}
              {vedeCosti && !!consuntivoFase && <Dato etichetta="Speso sulla fase" valore={formatCurrency(consuntivoFase)} />}
            </dl>
            {vedeCosti && (r.sottofaseId || r.voceId) && puoModificare && (
              prezzi
                ? <DatiLavorazione key={`${r.voceId}|${r.quantita}|${r.unita}|${r.venduto}|${r.costoManodopera}|${r.costoMateriali}`} riga={r} vedeVenduto={vedeVenduto} puoModificare={puoModificare} onSalva={onSalvaVoce} />
                : <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setPrezzi(true)}><Pencil className="h-3 w-3" aria-hidden="true" />{r.voceId ? "Modifica quantità e prezzi" : "Aggiungi quantità e prezzi"}</Button>
            )}
          </Riquadro>
        )}
        <Riquadro titolo="Chi la fa">
          {chiDisponibile && r.sottofaseId && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1">
                {chiSottofase.length === 0 && <span className="text-xs text-muted-foreground">Nessuno su questa sottofase: vale chi è sulla fase.</span>}
                {chiSottofase.map((c) => (
                  <span key={c.id} className="flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-900">
                    {c.nome}
                    {puoModificare && onTogliChi && <button type="button" aria-label={`Togli ${c.nome}`} onClick={() => onTogliChi(c.id)} className="rounded-full hover:text-rose-700">×</button>}
                  </span>
                ))}
              </div>
              {puoModificare && onAggiungiChi && opzioniChi && (
                <select aria-label="Aggiungi chi fa questa sottofase" value="" onChange={(e) => e.target.value && onAggiungiChi(e.target.value)} className="h-7 w-full rounded border bg-background px-1 text-xs">
                  <option value="">+ Aggiungi persona, squadra o ditta…</option>
                  {opzioniChi.squadre.length > 0 && <optgroup label="Squadre">{opzioniChi.squadre.map((o) => <option key={o.id} value={`d:${o.id}`}>{o.nome}</option>)}</optgroup>}
                  {opzioniChi.persone.length > 0 && <optgroup label="Persone">{opzioniChi.persone.map((o) => <option key={o.id} value={`p:${o.id}`}>{o.nome}</option>)}</optgroup>}
                  {opzioniChi.ditte.length > 0 && <optgroup label="Ditte">{opzioniChi.ditte.map((o) => <option key={o.id} value={`d:${o.id}`}>{o.nome}</option>)}</optgroup>}
                </select>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 text-xs text-muted-foreground">{chiDisponibile ? "Sulla fase: " : ""}<span className="text-sm text-foreground">{chiLaFa.join(", ") || <span className="text-amber-700">nessuno</span>}</span></p>
            {puoModificare && <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 gap-1 text-xs" onClick={() => onAssegna(r.faseId)}><Users className="h-3.5 w-3.5" aria-hidden="true" />Assegna alla fase</Button>}
          </div>
        </Riquadro>
        {r.sottofaseId && orderId && (
          <Riquadro titolo="Chi ci ha lavorato"><RapportiniVoce orderId={orderId} sottofaseId={r.sottofaseId} unita={r.unita} /></Riquadro>
        )}
      </div>
    </div>
  );
}

export function SchedaVoce({ riga, posizione, onChiudi, onVicina, ...resto }: Props) {
  const [nome, setNome] = useState<string | null>(null);
  // Le frecce passano alla voce vicina, se non si sta scrivendo in un campo.
  const frecce = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("input, textarea, select")) return;
    if (e.key === "ArrowLeft" && posizione.numero > 1) onVicina(-1);
    if (e.key === "ArrowRight" && posizione.numero < posizione.totale) onVicina(1);
  };
  return (
    <Dialog open={!!riga} onOpenChange={(a) => { if (!a) onChiudi(); }}>
      <DialogContent className="max-h-[92vh] gap-3 overflow-y-auto sm:max-w-4xl" onKeyDown={frecce}>
        {riga && (
          <>
            <DialogHeader className="space-y-1">
              <div className="flex items-center justify-between gap-2 pr-6 text-xs text-muted-foreground">
                <span className="min-w-0 truncate uppercase tracking-wide">{riga.faseNome}{riga.codice ? ` · ${riga.codice}` : ""}</span>
                <span className="flex shrink-0 items-center gap-1 tabular-nums">
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => resto.onApriScheda(riga.faseId)}>Apri la fase</Button>
                  {resto.puoModificare && riga.sottofaseId && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label="Altro per questa voce"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setNome(riga.descrizione.slice(0, 160))}><Pencil className="mr-2 h-3.5 w-3.5" />Rinomina</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => resto.onSposta(riga, -1)}><ArrowUp className="mr-2 h-3.5 w-3.5" />Sposta su</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => resto.onSposta(riga, 1)}><ArrowDown className="mr-2 h-3.5 w-3.5" />Sposta giù</DropdownMenuItem>
                        <DropdownMenuItem className="text-rose-700" onClick={() => resto.onElimina(riga)}><Trash2 className="mr-2 h-3.5 w-3.5" />Elimina</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={posizione.numero <= 1} aria-label="Voce prima" onClick={() => onVicina(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                  {posizione.numero} di {posizione.totale}
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={posizione.numero >= posizione.totale} aria-label="Voce dopo" onClick={() => onVicina(1)}><ChevronRight className="h-4 w-4" /></Button>
                </span>
              </div>
              {nome !== null ? (
                <div className="flex items-center gap-1.5">
                  <Input autoFocus value={nome} maxLength={160} aria-label="Nuovo nome" onChange={(e) => setNome(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && nome.trim()) { resto.onRinomina(riga.sottofaseId!, nome.trim()); setNome(null); } else if (e.key === "Escape") setNome(null); }}
                    className="h-8 text-sm" />
                  <Button type="button" size="sm" className="h-8 text-xs" disabled={!nome.trim()} onClick={() => { resto.onRinomina(riga.sottofaseId!, nome.trim()); setNome(null); }}>Salva</Button>
                </div>
              ) : (
                <DialogTitle className="line-clamp-3 text-base font-semibold leading-snug" title={riga.descrizione}>{riga.descrizione}</DialogTitle>
              )}
              <DialogDescription className="sr-only">Stato, date, importi e rapportini di questa voce.</DialogDescription>
            </DialogHeader>
            <Contenuto key={`${riga.key}|${riga.inizio}|${riga.fine}|${riga.giorni}`} riga={riga} {...resto} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
