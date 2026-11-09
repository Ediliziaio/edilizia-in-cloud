// Una persona su più cantieri (09/11/2026): le sue giornate del mese e, in un popup solo,
// «Luciano, oggi: A 2 h, B 3 h, C 3 h». Ogni riga è una registrazione di ufficio_registra_ore,
// lo stesso registro di «Ore e persone»: controlla doppioni e 24 ore, e riprovare non duplica.
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { OfficeSelect } from "@/components/orders/OfficeSelect";
import { useDailyHours } from "@/hooks/useDailyHours";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { campoDayWindow, summarizeCampoTime, type CampoPunch } from "@/lib/campo/timeSummary";
import { campoWorkDay } from "@/lib/campo/workDay";
import { controlloGiornata, giornatePersona, orarioNormale, oreScritte } from "@/lib/orders/giornataPersona";
import type { RapportinoRiga } from "@/lib/orders/rapportiniMese";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const oreIt = (n: number): string => `${n.toLocaleString("it-IT", { maximumFractionDigits: 2 })} h`;
const giornoIt = (d: string): string => {
  const s = format(parseISO(d), "EEE d MMM", { locale: it });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Il mese di una persona, giorno per giorno. */
export function GiornatePersonaPopup({ persona, righe, puoScrivere, onChiudi, onApriRapportino, onVediRapportini, onSegna }: {
  persona: { chiave: string; nome: string; ditta: boolean };
  righe: readonly RapportinoRiga[];
  puoScrivere: boolean;
  onChiudi: () => void;
  onApriRapportino: (id: string) => void;
  onVediRapportini: () => void;
  onSegna: (employeeId: string) => void;
}): ReactElement {
  const giorni = useMemo(() => giornatePersona(righe, persona.chiave), [righe, persona.chiave]);
  const employeeId = persona.chiave.startsWith("e:") ? persona.chiave.slice(2) : null;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onChiudi(); }}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-3xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle>{persona.nome}</DialogTitle>
          <DialogDescription>Dove ha lavorato ogni giorno del mese.</DialogDescription>
        </DialogHeader>
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto rounded-lg border">
          {giorni.map((g) => (
            <li key={g.giorno} className="flex items-start gap-3 px-3 py-2">
              <span className="w-20 shrink-0 pt-0.5 text-sm font-medium">{giornoIt(g.giorno)}</span>
              <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                {g.cantieri.map((c) => (
                  <button key={c.orderId} type="button" onClick={() => onApriRapportino(c.rapportinoId)}
                    className="tap-compact max-w-full truncate rounded-md border bg-muted/30 px-2 py-0.5 text-left text-xs hover:bg-muted">
                    {c.nome}{persona.ditta ? "" : <span className="ml-1 font-semibold tabular-nums">{oreIt(c.ore)}</span>}
                  </button>
                ))}
              </span>
              {!persona.ditta && <span className="shrink-0 pt-0.5 text-sm font-semibold tabular-nums">{oreIt(g.totale)}</span>}
            </li>
          ))}
          {giorni.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nessuna giornata in questo mese.</li>}
        </ul>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onVediRapportini}>Vedi i suoi rapportini</Button>
          {puoScrivere && employeeId && <Button size="sm" onClick={() => onSegna(employeeId)}>Segna una giornata</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface Riga { chiave: string; requestId: string; orderId: string; ore: string; nota: string }
const nuovaRiga = (): Riga => ({ chiave: crypto.randomUUID(), requestId: crypto.randomUUID(), orderId: "", ore: "", nota: "" });
const rigaVuota = (r: Riga): boolean => !r.orderId && !r.ore.trim() && !r.nota.trim();

/** Ricerca nell'elenco, senza menu a comparsa: dentro un popup quelli danno problemi di scorrimento. */
function ScegliCantiere({ valore, opzioni, recenti, onScegli }: {
  valore: string;
  opzioni: ReadonlyArray<{ id: string; name: string }>;
  recenti: readonly string[];
  onScegli: (id: string) => void;
}): ReactElement {
  const [testo, setTesto] = useState("");
  const [aperto, setAperto] = useState(false);
  const scelto = opzioni.find((o) => o.id === valore);
  const risultati = useMemo(() => {
    const parole = testo.toLowerCase().split(/\s+/).filter(Boolean);
    const trovati = opzioni.filter((o) => parole.every((p) => o.name.toLowerCase().includes(p)));
    const peso = (id: string): number => { const i = recenti.indexOf(id); return i < 0 ? recenti.length : i; };
    return [...trovati].sort((a, b) => peso(a.id) - peso(b.id)).slice(0, 8);
  }, [opzioni, recenti, testo]);
  if (scelto) {
    return (
      <div className="flex h-9 min-w-0 items-center justify-between gap-2 rounded-md border bg-muted/30 pl-3 pr-1">
        <span className="truncate text-sm">{scelto.name}</span>
        <button type="button" aria-label="Cambia cantiere" className="tap-compact rounded p-1 text-muted-foreground hover:text-foreground" onClick={() => { onScegli(""); setTesto(""); }}><X className="h-3.5 w-3.5" /></button>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <Input className="h-9" placeholder="Cerca il cantiere" aria-label="Cerca il cantiere" value={testo}
        onChange={(e) => setTesto(e.target.value)} onFocus={() => setAperto(true)} onBlur={() => setAperto(false)} />
      {aperto && (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover text-sm">
          {risultati.map((o) => (
            <li key={o.id}>
              <button type="button" className="tap-compact block w-full truncate px-3 py-1.5 text-left hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()} onClick={() => { onScegli(o.id); setAperto(false); }}>{o.name}</button>
            </li>
          ))}
          {risultati.length === 0 && <li className="px-3 py-2 text-muted-foreground">Nessun cantiere trovato</li>}
        </ul>
      )}
    </div>
  );
}

/** Le ore timbrate da una persona in un giorno, su tutti i cantieri. Null se non ha timbrato. */
function useTimbrateDelGiorno(userId: string | null | undefined, giorno: string): number | null {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { data } = useQuery({
    queryKey: ["giornata-persona-timbrate", companyId, userId, giorno],
    enabled: !!companyId && !!userId && !!giorno,
    staleTime: 60_000,
    queryFn: async (): Promise<number | null> => {
      const finestra = campoDayWindow(giorno);
      const { data: righe, error } = await db.from("campo_timbrature").select("id, user_id, tipo, timestamp_evento, order_id, in_sede, sede_id")
        .eq("company_id", companyId).eq("user_id", userId).gte("timestamp_evento", finestra.start.toISOString()).lt("timestamp_evento", finestra.end.toISOString()).limit(200);
      if (error) throw error;
      const punches = (righe ?? []) as CampoPunch[];
      if (punches.length === 0) return null;
      const esito = summarizeCampoTime(punches, { start: finestra.start, end: finestra.end, now: new Date() });
      const minuti = [...esito.byOrder.values()].reduce((t, v) => t + v.workMinutes, 0);
      return Math.round((minuti / 60) * 100) / 100;
    },
  });
  return data ?? null;
}

/** Una persona, un giorno, più cantieri: una riga per cantiere. */
export function SegnaGiornataPersona({ employeeId, onChiudi }: { employeeId?: string; onChiudi: () => void }): ReactElement {
  const qc = useQueryClient();
  const registro = useDailyHours();
  const { setMonth } = registro;
  const oggi = campoWorkDay();
  const [persona, setPersona] = useState(employeeId ?? "");
  const [giorno, setGiorno] = useState(oggi);
  const [righe, setRighe] = useState<Riga[]>(() => [nuovaRiga()]);
  const [inCorso, setInCorso] = useState(false);
  const mese = giorno.slice(0, 7);
  useEffect(() => { if (/^\d{4}-\d{2}$/.test(mese)) setMonth(mese); }, [mese, setMonth]);

  const dati = registro.data;
  const scelta = dati?.people.find((p) => p.id === persona);
  const nomeCantiere = (id: string): string => dati?.orders.find((o) => o.id === id)?.name ?? "Cantiere";
  const linee = useMemo(() => (dati?.lines ?? []).filter((l) => l.employeeId === persona), [dati?.lines, persona]);
  const giaQuelGiorno = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of linee) if (l.day === giorno) m.set(l.orderId, (m.get(l.orderId) ?? 0) + l.hours);
    return m;
  }, [linee, giorno]);
  // Prima i cantieri dove ha lavorato di più in questo mese.
  const recenti = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of linee) m.set(l.orderId, (m.get(l.orderId) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }, [linee]);
  const timbrate = useTimbrateDelGiorno(scelta?.userId, giorno);

  const piene = righe.filter((r) => !rigaVuota(r));
  const scritte = piene.reduce((t, r) => t + (oreScritte(r.ore) ?? 0), 0);
  const gia = [...giaQuelGiorno.values()].reduce((t, n) => t + n, 0);
  const totale = Math.round((gia + scritte) * 100) / 100;
  const controllo = controlloGiornata({ totale, normale: orarioNormale(scelta?.weeklyHours), timbrate });
  const contate = new Map<string, number>();
  for (const r of piene) if (r.orderId) contate.set(r.orderId, (contate.get(r.orderId) ?? 0) + 1);
  const problemaDi = (r: Riga): string | null => {
    if (r.orderId && giaQuelGiorno.has(r.orderId)) return `Ha già ${oreIt(giaQuelGiorno.get(r.orderId)!)} su questo cantiere: correggi quelle.`;
    if (r.orderId && (contate.get(r.orderId) ?? 0) > 1) return "Questo cantiere è già in un’altra riga.";
    return null;
  };
  const pronte = !!persona && !!giorno && giorno <= oggi && piene.length > 0 && !controllo.oltre24
    && piene.every((r) => r.orderId && oreScritte(r.ore) != null && !problemaDi(r));

  const cambia = (chiave: string, patch: Partial<Riga>): void => setRighe((p) => p.map((r) => (r.chiave === chiave ? { ...r, ...patch } : r)));

  const salva = async (): Promise<void> => {
    setInCorso(true);
    let fatte = 0;
    let daValorizzare = 0;
    try {
      for (const r of piene) {
        try {
          const esito = await registro.save({ requestId: r.requestId, orderId: r.orderId, employeeId: persona, day: giorno, hours: oreScritte(r.ore)!, note: r.nota.trim() });
          fatte += 1;
          if (esito.da_valorizzare) daValorizzare += 1;
          setRighe((p) => p.filter((x) => x.chiave !== r.chiave));
        } catch (e) {
          const motivo = e instanceof Error ? e.message : "Non salvato.";
          toast.error(`${nomeCantiere(r.orderId)}: ${motivo}${fatte ? ` Gli altri ${fatte} sono salvati.` : ""}`);
          return;
        }
      }
      toast.success(daValorizzare
        ? `Ore segnate. Su ${daValorizzare} ${daValorizzare === 1 ? "cantiere restano" : "cantieri restano"} da approvare: manca il costo orario.`
        : `Ore segnate su ${fatte} ${fatte === 1 ? "cantiere" : "cantieri"}.`);
      onChiudi();
    } finally {
      setInCorso(false);
      void qc.invalidateQueries({ predicate: ({ queryKey }) => typeof queryKey[0] === "string" && queryKey[0].includes("rapportini") });
    }
  };

  const persone = (dati?.activePeople ?? []).map((p) => ({ value: p.id, label: p.name }));
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !inCorso) onChiudi(); }}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-3xl flex-col gap-3 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Segna la giornata di una persona</DialogTitle>
          <DialogDescription>Una riga per ogni cantiere in cui ha lavorato.</DialogDescription>
        </DialogHeader>
        {registro.error ? <p role="alert" className="text-sm text-destructive">{registro.error}</p> : registro.loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" aria-label="Caricamento" /> : (
          <>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
              <OfficeSelect label="Persona" value={persona} onValueChange={setPersona} placeholder="Scegli la persona" options={persone} />
              <Input type="date" className="h-9" aria-label="Giorno" max={oggi} value={giorno} onChange={(e) => setGiorno(e.target.value)} />
            </div>
            {giaQuelGiorno.size > 0 && (
              <p className="text-xs text-muted-foreground">Già segnate quel giorno: {[...giaQuelGiorno.entries()].map(([id, n]) => `${nomeCantiere(id)} ${oreIt(n)}`).join(" · ")}</p>
            )}
            <div className="space-y-2">
              {righe.map((r, i) => {
                const problema = problemaDi(r);
                return (
                  <div key={r.chiave} className="space-y-1">
                    <div className="grid items-start gap-2 sm:grid-cols-[minmax(0,1.3fr)_5rem_minmax(0,1fr)_2rem]">
                      <ScegliCantiere valore={r.orderId} opzioni={dati?.orders ?? []} recenti={recenti} onScegli={(id) => cambia(r.chiave, { orderId: id })} />
                      <Input className="h-9" inputMode="decimal" placeholder="Ore" aria-label={`Ore della riga ${i + 1}`} value={r.ore} onChange={(e) => cambia(r.chiave, { ore: e.target.value })} />
                      <Input className="h-9" placeholder="Cosa ha fatto (facoltativo)" aria-label={`Cosa ha fatto, riga ${i + 1}`} value={r.nota} onChange={(e) => cambia(r.chiave, { nota: e.target.value })} />
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 max-sm:justify-self-end" aria-label={`Togli la riga ${i + 1}`} disabled={righe.length === 1} onClick={() => setRighe((p) => p.filter((x) => x.chiave !== r.chiave))}><X className="h-4 w-4" /></Button>
                    </div>
                    {problema && <p role="alert" className="text-xs text-destructive">{problema}</p>}
                  </div>
                );
              })}
              <Button type="button" variant="outline" size="sm" onClick={() => setRighe((p) => [...p, nuovaRiga()])}><Plus className="mr-1.5 h-4 w-4" />Aggiungi cantiere</Button>
            </div>
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold tabular-nums">Totale della giornata: {oreIt(totale)}</p>
                {controllo.avvisi.map((a) => (
                  <p key={a} className={cn("mt-0.5 flex items-start gap-1 text-xs", controllo.oltre24 ? "text-destructive" : "text-amber-700")}><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{a}</p>
                ))}
              </div>
              <Button size="sm" disabled={!pronte || inCorso || !registro.canEdit} onClick={() => void salva()}>
                {inCorso && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Salva
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
