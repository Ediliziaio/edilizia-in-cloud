/**
 * Cantiere → «Ore e persone»: chi ha lavorato sulla commessa, quanti giorni e
 * quante ore, da dove arrivano (rapportino o ufficio, confermate o in attesa) e
 * quante ne ha timbrate sullo stesso cantiere. L'ufficio inserisce le ore a mano
 * per una persona o per più persone e più giorni insieme.
 *
 * Il registro è lo stesso di sempre (ufficio_leggi_ore / ufficio_registra_ore /
 * ufficio_annulla_ore, via useDailyHours): qui cambia solo come si legge.
 */
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDailyHours } from "@/hooks/useDailyHours";
import { allPaymentRows } from "@/hooks/useSupplierPayments";
import { formatCurrency } from "@/lib/formatters";
import { campoWorkDay, shiftWorkDay, workDayStart } from "@/lib/campo/workDay";
import type { CampoPunch } from "@/lib/campo/timeSummary";
import { daGuardare, giorniTra, oreTimbratePerGiorno, periodoCommessa, righePerPersona } from "@/lib/orders/orePersone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const ore = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("it-IT", { maximumFractionDigits: 2 })} h`);
const dataIt = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

/** Ore timbrate sulla commessa per persona (employee_id), nel periodo. */
function useOreTimbrate(orderId: string, da: string, a: string, utenteAPersona: Map<string, string>) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: ["commessa-ore-timbrate", companyId, orderId, da, a, utenteAPersona.size],
    enabled: !!companyId && !!orderId && utenteAPersona.size > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, number>> => {
      const inizio = workDayStart(shiftWorkDay(da, -1)).toISOString();
      const fine = workDayStart(shiftWorkDay(a, 1)).toISOString();
      // Chi ha timbrato su questo cantiere…
      const sulCantiere = await allPaymentRows((x, y) => db.from("campo_timbrature").select("user_id")
        .eq("company_id", companyId).eq("order_id", orderId).gte("timestamp_evento", inizio).lt("timestamp_evento", fine)
        .order("id").range(x, y)) as Array<{ user_id: string }>;
      const utenti = [...new Set(sulCantiere.map((t) => t.user_id))];
      if (utenti.length === 0) return new Map();
      // …e tutte le sue timbrature del periodo: una giornata si ricostruisce intera, poi si guarda la parte su questo cantiere.
      // A blocchi di 50 persone: tutte, non solo le prime 50.
      const blocchi: string[][] = [];
      for (let i = 0; i < utenti.length; i += 50) blocchi.push(utenti.slice(i, i + 50));
      const tutte = (await Promise.all(blocchi.map((blocco) => allPaymentRows((x, y) => db.from("campo_timbrature")
        .select("id, user_id, tipo, timestamp_evento, order_id, in_sede, sede_id")
        .eq("company_id", companyId).in("user_id", blocco).gte("timestamp_evento", inizio).lt("timestamp_evento", fine)
        .order("id").range(x, y))))).flat() as Array<CampoPunch & { user_id: string }>;
      const perPersona = new Map<string, number>();
      for (const utente of utenti) {
        const persona = utenteAPersona.get(utente);
        if (!persona) continue;
        const giorni = oreTimbratePerGiorno(tutte.filter((t) => t.user_id === utente), orderId);
        let totale = 0;
        for (const [giorno, h] of giorni) if (giorno >= da && giorno <= a) totale += h;
        if (totale > 0) perPersona.set(persona, Math.round(totale * 100) / 100);
      }
      return perPersona;
    },
  });
}

type Periodo = "commessa" | "mese";

export function OreEPersone({ orderId, inizioLavori }: { orderId: string; inizioLavori?: string | null }) {
  const oggi = campoWorkDay();
  const [periodo, setPeriodo] = useState<Periodo>("commessa");
  const [mese, setMese] = useState(oggi.slice(0, 7));
  const intervallo = useMemo(() => {
    if (periodo === "commessa") return periodoCommessa(inizioLavori, oggi);
    const fineMese = new Date(Number(mese.slice(0, 4)), Number(mese.slice(5, 7)), 0).getDate();
    const a = `${mese}-${String(fineMese).padStart(2, "0")}`;
    return { da: `${mese}-01`, a: a > oggi ? oggi : a, tagliato: false };
  }, [periodo, mese, inizioLavori, oggi]);
  const c = useDailyHours(orderId, { da: intervallo.da, a: intervallo.a });
  const persone = useMemo(() => c.data?.people ?? [], [c.data]);
  const utenteAPersona = useMemo(() => new Map(persone.filter((p) => p.userId).map((p) => [p.userId as string, p.id])), [persone]);
  const timbrate = useOreTimbrate(orderId, intervallo.da, intervallo.a, utenteAPersona);
  // Chi è assegnato alla commessa viene proposto per primo quando si inseriscono le ore.
  const assegnate = useQuery({
    queryKey: ["commessa-persone-assegnate", orderId],
    enabled: !!orderId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db.from("order_employees").select("employee_id").eq("order_id", orderId).limit(500);
      if (error) throw error;
      return [...new Set(((data ?? []) as { employee_id: string | null }[]).map((r) => r.employee_id).filter(Boolean))] as string[];
    },
  });
  const righe = useMemo(() => righePerPersona(c.data?.lines ?? [], persone, timbrate.data ?? new Map()), [c.data, persone, timbrate.data]);
  const [aperta, setAperta] = useState<string | null>(null);
  const [inserisci, setInserisci] = useState<{ persone: string[] } | null>(null);
  const [annulla, setAnnulla] = useState<string | null>(null);
  const [errore, setErrore] = useState("");
  const [occupato, setOccupato] = useState(false);

  if (!c.allowed) return null;
  const totConfermate = righe.reduce((s, r) => s + r.oreConfermate, 0);
  const totAttesa = righe.reduce((s, r) => s + r.oreInAttesa, 0);
  const totCosto = righe.every((r) => r.costo != null) ? righe.reduce((s, r) => s + (r.costo ?? 0), 0) : null;
  const daControllare = righe.filter(daGuardare).length;

  const confermaAnnulla = async () => {
    const riga = c.data?.lines.find((l) => l.reportId === annulla);
    if (!riga) return;
    setOccupato(true); setErrore("");
    try { await c.cancel(riga.reportId, riga.updatedAt, riga.orderId); setAnnulla(null); }
    catch (e) { setErrore(e instanceof Error ? e.message : "Annullamento non riuscito."); }
    finally { setOccupato(false); }
  };

  return (
    <section className="space-y-4 rounded-xl border bg-white p-4" aria-labelledby="ore-persone-titolo">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="ore-persone-titolo" className="font-semibold">Ore e persone</h3>
          <p className="mt-1 text-sm text-muted-foreground">Chi ha lavorato su questa commessa, quanto, e se torna con le timbrature.</p>
        </div>
        {c.canEdit && <Button onClick={() => setInserisci({ persone: [] })} disabled={c.loading || !!c.error} className="gap-1.5"><Plus className="h-4 w-4" />Inserisci ore</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div role="radiogroup" aria-label="Periodo" className="inline-flex rounded-lg border p-0.5">
          {([["commessa", "Tutta la commessa"], ["mese", "Un mese"]] as const).map(([v, t]) => (
            <button key={v} type="button" role="radio" aria-checked={periodo === v} onClick={() => setPeriodo(v)}
              className={`min-h-9 rounded-md px-3 ${periodo === v ? "bg-primary text-primary-foreground" : ""}`}>{t}</button>
          ))}
        </div>
        {periodo === "mese" && <Input aria-label="Mese" type="month" className="h-9 w-40" value={mese} max={oggi.slice(0, 7)} onChange={(e) => /^\d{4}-\d{2}$/.test(e.target.value) && setMese(e.target.value)} />}
        <span className="text-muted-foreground">{dataIt(intervallo.da)} – {dataIt(intervallo.a)}{intervallo.tagliato ? " · ultimi 12 mesi" : ""}</span>
      </div>

      {c.error ? (
        <p role="alert" className="text-sm text-destructive">{c.error} <Button variant="outline" size="sm" onClick={c.retry}>Riprova</Button></p>
      ) : c.loading ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carico le ore…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Ore confermate", ore(totConfermate)],
              ["In attesa di approvazione", ore(totAttesa)],
              ["Persone", String(righe.length)],
              ...(c.showCosts ? [["Costo confermato", totCosto == null ? "Da completare" : formatCurrency(totCosto)]] : []),
            ].map(([etichetta, valore]) => (
              <div key={etichetta} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-muted-foreground">{etichetta}</p><p className="mt-1 font-semibold tabular-nums">{valore}</p></div>
            ))}
          </div>
          {daControllare > 0 && (
            <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {daControllare === 1 ? "Per 1 persona" : `Per ${daControllare} persone`} le ore registrate non tornano con quelle timbrate.
            </p>
          )}

          {righe.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Nessuna ora in questo periodo. Arrivano dai rapportini approvati o le inserisci tu con «Inserisci ore».</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-2 font-medium">Persona</th>
                    <th className="py-2 pr-2 text-right font-medium">Giorni</th>
                    <th className="py-2 pr-2 text-right font-medium">Ore</th>
                    <th className="py-2 pr-2 font-medium">Da dove</th>
                    <th className="py-2 pr-2 text-right font-medium">Timbrate</th>
                    <th className="py-2 pr-2 font-medium">Ultimo giorno</th>
                    <th className="py-2" aria-label="Azioni" />
                  </tr>
                </thead>
                <tbody>
                  {righe.map((r) => {
                    const espansa = aperta === r.employeeId;
                    const giorni = (c.data?.lines ?? []).filter((l) => l.employeeId === r.employeeId).sort((x, y) => y.day.localeCompare(x.day));
                    return (
                      <Fragment key={r.employeeId}>
                        <tr className="border-b align-top">
                          <td className="py-2 pr-2">
                            <button type="button" className="flex items-center gap-1 text-left font-medium" aria-expanded={espansa} onClick={() => setAperta(espansa ? null : r.employeeId)}>
                              {espansa ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}{r.nome}
                            </button>
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums">{r.giorni}</td>
                          <td className="py-2 pr-2 text-right font-semibold tabular-nums">{ore(r.ore)}</td>
                          <td className="py-2 pr-2 text-xs text-muted-foreground">
                            {[r.oreRapportino > 0 && `rapportini ${ore(r.oreRapportino)}`, r.oreUfficio > 0 && `ufficio ${ore(r.oreUfficio)}`].filter(Boolean).join(" · ") || "—"}
                            {r.oreInAttesa > 0 && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800">{ore(r.oreInAttesa)} in attesa</span>}
                          </td>
                          <td className={`py-2 pr-2 text-right tabular-nums ${daGuardare(r) ? "font-semibold text-amber-700" : ""}`}>
                            {timbrate.isLoading ? "…" : ore(r.oreTimbrate)}
                          </td>
                          <td className="py-2 pr-2 tabular-nums">{dataIt(r.ultimoGiorno)}</td>
                          <td className="py-2 text-right">{c.canEdit && <Button size="sm" variant="ghost" onClick={() => setInserisci({ persone: [r.employeeId] })}>+ ore</Button>}</td>
                        </tr>
                        {espansa && (
                          <tr className="border-b bg-slate-50/60">
                            <td colSpan={7} className="px-2 py-2">
                              {giorni.length === 0 ? <p className="text-xs text-muted-foreground">Ha timbrato ma non ha ore registrate in questo periodo.</p> : (
                                <ul className="space-y-1">
                                  {giorni.map((l) => (
                                    <li key={l.key} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                      <span>{dataIt(l.day)} · <strong>{ore(l.hours)}</strong> · {l.office ? "inserite dall’ufficio" : "da rapportino"} · {l.pending ? "in attesa" : "confermate"}{l.note ? ` · ${l.note}` : ""}</span>
                                      {l.office && c.canEdit && <button type="button" className="text-destructive underline" onClick={() => { setErrore(""); setAnnulla(l.reportId); }}>Annulla</button>}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {timbrate.isError && <p className="text-xs text-muted-foreground">Le ore timbrate non sono disponibili ora: il resto è aggiornato.</p>}
        </>
      )}

      {inserisci && (
        <InserisciOre
          orderId={orderId}
          personeIniziali={inserisci.persone}
          persone={(c.data?.activePeople ?? []).map((p) => ({ id: p.id, name: p.name, assegnata: (assegnate.data ?? []).includes(p.id) }))}
          onClose={() => setInserisci(null)}
          salva={c.save}
        />
      )}

      <Dialog open={!!annulla} onOpenChange={(v) => { if (!v && !occupato) setAnnulla(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Annullare queste ore?</DialogTitle><DialogDescription>Tolgo le ore e il loro costo. Poi puoi inserire la giornata corretta.</DialogDescription></DialogHeader>
          {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={occupato} onClick={() => setAnnulla(null)}>Mantieni</Button>
            <Button variant="destructive" disabled={occupato} onClick={confermaAnnulla}>Annulla ore</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function InserisciOre({ orderId, persone, personeIniziali, onClose, salva }: {
  orderId: string;
  persone: Array<{ id: string; name: string; assegnata: boolean }>;
  personeIniziali: string[];
  onClose: () => void;
  salva: ReturnType<typeof useDailyHours>["save"];
}) {
  const oggi = campoWorkDay();
  const [scelte, setScelte] = useState<string[]>(personeIniziali);
  const [dal, setDal] = useState(oggi);
  const [al, setAl] = useState(oggi);
  const [soloFeriali, setSoloFeriali] = useState(true);
  const [oreGiorno, setOreGiorno] = useState("8");
  const [note, setNote] = useState("");
  const [occupato, setOccupato] = useState(false);
  const [esito, setEsito] = useState<{ ok: number; errori: string[] } | null>(null);
  const ordinate = [...persone].sort((a, b) => Number(b.assegnata) - Number(a.assegnata) || a.name.localeCompare(b.name, "it"));
  const giorni = giorniTra(dal, al > oggi ? oggi : al, soloFeriali);
  // Al massimo 62 giorni alla volta: oltre si fa in più volte, e lo si dice prima di salvare.
  const troppiGiorni = !!dal && !!al && (Date.parse(`${al > oggi ? oggi : al}T12:00:00Z`) - Date.parse(`${dal}T12:00:00Z`)) / 86_400_000 >= 62;
  const numero = Number(oreGiorno.replace(",", "."));
  const valido = !troppiGiorni && scelte.length > 0 && giorni.length > 0 && Number.isFinite(numero) && numero > 0 && numero <= 24;

  const conferma = async () => {
    if (!valido) return;
    setOccupato(true);
    const errori: string[] = [];
    let ok = 0;
    for (const persona of scelte) {
      for (const giorno of giorni) {
        try {
          await salva({ requestId: crypto.randomUUID(), orderId, employeeId: persona, day: giorno, hours: numero, note });
          ok += 1;
        } catch (e) {
          errori.push(`${persone.find((p) => p.id === persona)?.name ?? "Persona"} ${dataIt(giorno)}: ${e instanceof Error ? e.message : "non salvata"}`);
        }
      }
    }
    setOccupato(false);
    setEsito({ ok, errori });
    if (errori.length === 0) onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !occupato) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Inserisci ore</DialogTitle>
          <DialogDescription>Una o più persone, uno o più giorni. Le stesse ore per ogni giorno.</DialogDescription>
        </DialogHeader>
        <fieldset disabled={occupato} className="space-y-4">
          <div>
            <p className="mb-1 text-sm font-medium">Chi</p>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
              {ordinate.map((p) => (
                <label key={p.id} className="flex min-h-9 items-center gap-2 text-sm">
                  <Checkbox checked={scelte.includes(p.id)} onCheckedChange={(v) => setScelte((s) => v === true ? [...s, p.id] : s.filter((x) => x !== p.id))} />
                  <span>{p.name}</span>{p.assegnata && <span className="text-xs text-muted-foreground">· su questa commessa</span>}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="ore-dal">Dal</Label><Input id="ore-dal" type="date" max={oggi} value={dal} onChange={(e) => { setDal(e.target.value); if (e.target.value > al) setAl(e.target.value); }} /></div>
            <div><Label htmlFor="ore-al">Al</Label><Input id="ore-al" type="date" min={dal} max={oggi} value={al} onChange={(e) => setAl(e.target.value)} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={soloFeriali} onCheckedChange={(v) => setSoloFeriali(v === true)} />Salta sabato e domenica</label>
          <div><Label htmlFor="ore-giorno">Ore al giorno</Label><Input id="ore-giorno" inputMode="decimal" value={oreGiorno} onChange={(e) => setOreGiorno(e.target.value)} placeholder="Es. 8 o 7,5" /></div>
          <div><Label htmlFor="ore-note">Note (facoltative)</Label><Textarea id="ore-note" value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} /></div>
          <p className="rounded-lg bg-slate-50 p-3 text-sm">
            {troppiGiorni ? "Al massimo 62 giorni alla volta: dividi il periodo in due." : valido ? `Registro ${giorni.length * scelte.length} ${giorni.length * scelte.length === 1 ? "giornata" : "giornate"}: ${scelte.length} ${scelte.length === 1 ? "persona" : "persone"} × ${giorni.length} ${giorni.length === 1 ? "giorno" : "giorni"} · ${ore(numero)} ciascuna.` : "Scegli almeno una persona, i giorni e le ore (da 0,5 a 24)."}
          </p>
          {esito && esito.errori.length > 0 && (
            <div role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm">
              <p className="font-medium">{esito.ok} salvate, {esito.errori.length} no:</p>
              <ul className="mt-1 list-disc pl-5 text-xs">{esito.errori.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
        </fieldset>
        <DialogFooter>
          <Button variant="outline" disabled={occupato} onClick={onClose}>Chiudi</Button>
          <Button disabled={occupato || !valido} onClick={conferma}>{occupato ? "Salvo…" : "Conferma ore"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
