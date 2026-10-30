// src/components/orders/generali/contratto/MisureOrdini.tsx
// Un ordine di lavoro prezzato dall'elenco: le voci con la quantità prevista (computo), quello che
// le misure dicono eseguito e quanto manca; l'importo dell'ordine si allinea all'elenco con un tocco.
// Le misure entrano nel SAL fino al giorno scelto e da lì non si cambiano più.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronsUpDown, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAggiungiMisura, useComputo, useEliminaMisura, useElencoPrezzi, useMisure, usePrezzaFiglia, useSalvaComputo,
} from "@/hooks/useGeneraleContrattoElenco";
import type { FigliaGenerale } from "@/lib/orders/commesseGenerali";
import {
  avanzamentoMisure, importoDaElenco, importoVoce, messaggioContratto, oggiIso, type SalContratto, type VoceElenco,
} from "@/lib/orders/generali/contratto";
import { leggiNumero } from "@/lib/orders/generali/contrattoElenco";
import { cn } from "@/lib/utils";
import { Campo, CampoNumero, ProssimoPasso } from "./campi";
import { dataIt, euro, numeroIt } from "./formato";

const etichettaVoce = (v: VoceElenco) => `${v.codice ? `${v.codice} · ` : ""}${v.descrizione}`;

/** Scegli una voce dell'elenco cercandola per codice o descrizione (gli elenchi hanno centinaia di voci). */
function ScegliVoce({ elenco, valore, onChange, etichetta }: { elenco: VoceElenco[]; valore: string | null; onChange: (id: string) => void; etichetta: string }) {
  const [aperto, setAperto] = useState(false);
  const scelta = elenco.find((v) => v.id === valore);
  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={aperto} aria-label={etichetta} className="h-10 w-full justify-between font-normal">
          <span className="truncate">{scelta ? etichettaVoce(scelta) : "Scegli la voce dell'elenco"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(32rem,90vw)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Cerca codice o descrizione" />
          <CommandList>
            <CommandEmpty>Nessuna voce trovata.</CommandEmpty>
            {elenco.map((v) => (
              <CommandItem key={v.id} value={`${v.codice ?? ""} ${v.descrizione} ${v.id}`} onSelect={() => { onChange(v.id); setAperto(false); }}>
                <Check className={cn("mr-2 h-4 w-4", v.id === valore ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{etichettaVoce(v)}</span>
                <span className="ml-auto pl-2 text-xs text-muted-foreground">{v.unitaMisura}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function MisureOrdini({ generaleId, figlie, ribassoPct, sal, puoModificare }: {
  generaleId: string; figlie: FigliaGenerale[]; ribassoPct: number; sal: SalContratto[]; puoModificare: boolean;
}) {
  const elenco = useElencoPrezzi(generaleId);
  const computo = useComputo(generaleId);
  const misure = useMisure(generaleId);
  const [figliaId, setFigliaId] = useState<string | null>(figlie[0]?.id ?? null);
  const figlia = figlie.find((f) => f.id === figliaId) ?? null;

  if (elenco.isLoading || computo.isLoading || misure.isLoading) return <Skeleton className="h-48 w-full rounded-lg" />;
  if (elenco.isError || computo.isError || misure.isError) {
    return <p role="alert" className="rounded-lg border p-4 text-sm">Non riesco a leggere elenco e misure. Ricarica la pagina.</p>;
  }
  const voci = elenco.data ?? [];
  if (voci.length === 0) return <ProssimoPasso testo="Prima incolla l'elenco prezzi: le misure si scrivono sulle sue voci." />;
  if (figlie.length === 0) return <ProssimoPasso testo="Aggiungi gli ordini di lavoro: le misure si scrivono ordine per ordine." />;

  return (
    <section aria-labelledby="misure-titolo" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="misure-titolo" className="text-sm font-semibold">Ordini prezzati dall'elenco e misure</h3>
          <p className="text-xs text-muted-foreground">Un ordine con voci dell'elenco va a misure nel SAL; gli altri vanno ad avanzamento.</p>
        </div>
        <div className="w-72">
          <Campo etichetta="Ordine di lavoro">
            {(id) => (
              <Select value={figliaId ?? undefined} onValueChange={setFigliaId}>
                <SelectTrigger id={id}><SelectValue placeholder="Scegli l'ordine" /></SelectTrigger>
                <SelectContent>
                  {figlie.map((f) => <SelectItem key={f.id} value={f.id}>{f.codice ? `${f.codice} · ${f.nome}` : f.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </Campo>
        </div>
      </div>
      {figlia && (
        <Ordine
          key={figlia.id}
          generaleId={generaleId}
          figlia={figlia}
          elenco={voci}
          computo={(computo.data ?? []).filter((r) => r.figliaId === figlia.id)}
          misure={(misure.data ?? []).filter((m) => m.figliaId === figlia.id)}
          ribassoPct={ribassoPct}
          numeroSal={new Map(sal.map((s) => [s.id, s.numero]))}
          puoModificare={puoModificare}
        />
      )}
    </section>
  );
}

function Ordine({ generaleId, figlia, elenco, computo, misure, ribassoPct, numeroSal, puoModificare }: {
  generaleId: string; figlia: FigliaGenerale; elenco: VoceElenco[];
  computo: { voceId: string; quantita: number }[]; misure: { id: string; voceId: string; data: string; quantita: number; descrizione: string | null; salId: string | null }[];
  ribassoPct: number; numeroSal: Map<string, number>; puoModificare: boolean;
}) {
  const perId = useMemo(() => new Map(elenco.map((v) => [v.id, v])), [elenco]);
  const avanzamento = avanzamentoMisure(computo, misure);
  const importo = importoDaElenco(computo, perId, ribassoPct);
  const salvaComputo = useSalvaComputo(generaleId);
  const prezza = usePrezzaFiglia(generaleId);
  const aggiungi = useAggiungiMisura(generaleId);
  const elimina = useEliminaMisura(generaleId);
  const confirm = useConfirm();
  const [nuovaVoce, setNuovaVoce] = useState<string | null>(null);
  const [nuovaQuantita, setNuovaQuantita] = useState<number | null>(null);
  const [misura, setMisura] = useState<{ voceId: string | null; data: string; quantita: number | null; descrizione: string }>({ voceId: null, data: oggiIso(), quantita: null, descrizione: "" });
  const [chiaveMisura, setChiaveMisura] = useState(0);
  const voceIds = [...avanzamento.keys()];
  const disallineato = computo.length > 0 && figlia.importo !== null && Math.abs(figlia.importo - importo) >= 0.01;

  const salvaRiga = (voceId: string, quantita: number | null) => salvaComputo.mutate({ figliaId: figlia.id, voceId, quantita }, {
    onError: (e) => toast.error(messaggioContratto(e, "la voce dell'ordine")),
  });

  const aggiungiMisura = () => {
    if (!misura.voceId || misura.quantita === null || Number.isNaN(misura.quantita) || misura.quantita === 0) return;
    aggiungi.mutate({ figliaId: figlia.id, voceId: misura.voceId, data: misura.data, quantita: misura.quantita, descrizione: misura.descrizione.trim() || null }, {
      onSuccess: () => { toast.success("Misura aggiunta"); setMisura((m) => ({ ...m, quantita: null, descrizione: "" })); setChiaveMisura((k) => k + 1); },
      onError: (e) => toast.error(messaggioContratto(e, "la misura")),
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h4 className="text-sm font-semibold">
              <Link to={`/azienda/ordini/${figlia.id}`} className="hover:underline">{figlia.codice ?? figlia.nome}</Link> · voci e quantità previste
            </h4>
            <p className="text-xs text-muted-foreground">
              Dall'elenco: <strong className="tabular-nums">{euro(importo)}</strong> · importo dell'ordine {euro(figlia.importo)}
            </p>
          </div>
          {puoModificare && disallineato && (
            <Button size="sm" variant="outline" disabled={prezza.isPending} onClick={() => prezza.mutate(figlia.id, {
              onSuccess: (v) => toast.success(`Importo dell'ordine: ${euro(v)}`),
              onError: (e) => toast.error(messaggioContratto(e, "l'importo dell'ordine")),
            })}>
              {prezza.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Usa {euro(importo)} come importo dell'ordine
            </Button>
          )}
        </header>
        {voceIds.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Nessuna voce: questo ordine va ad avanzamento. Aggiungi le voci dell'elenco per prezzarlo e misurarlo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Voce</th>
                  <th className="px-2 py-2 text-right font-medium">Previsto</th>
                  <th className="px-2 py-2 text-right font-medium">Eseguito</th>
                  <th className="px-2 py-2 text-right font-medium">A finire</th>
                  <th className="px-2 py-2 text-right font-medium">Importo previsto</th>
                  {puoModificare && <th className="w-10 px-2 py-2"><span className="sr-only">Azioni</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {voceIds.map((id) => {
                  const v = perId.get(id);
                  const a = avanzamento.get(id)!;
                  const nelComputo = computo.some((r) => r.voceId === id);
                  return (
                    <tr key={id}>
                      <td className="max-w-[24rem] px-4 py-1.5">{v ? etichettaVoce(v) : "Voce tolta dall'elenco"} <span className="text-xs text-muted-foreground">{v?.unitaMisura}</span></td>
                      <td className="px-2 py-1.5 text-right">
                        {puoModificare && v ? (
                          <QuantitaInLinea etichetta={`Quantità prevista di ${etichettaVoce(v)}`} valore={nelComputo ? a.prevista : null} onSalva={(q) => salvaRiga(id, q)} />
                        ) : <span className="tabular-nums">{numeroIt(a.prevista, 3)}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{numeroIt(a.eseguita, 3) || "0"}</td>
                      <td className={cn("px-2 py-1.5 text-right tabular-nums", a.aFinire < 0 && "text-destructive")}>
                        {a.aFinire < 0 ? `oltre di ${numeroIt(-a.aFinire, 3)}` : numeroIt(a.aFinire, 3) || "0"}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{v && nelComputo ? euro(importoVoce(a.prevista, v, ribassoPct)) : "—"}</td>
                      {puoModificare && (
                        <td className="px-2 py-1.5">
                          {nelComputo && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label="Togli la voce dall'ordine" onClick={() => salvaRiga(id, null)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {puoModificare && (
          <form
            className="flex flex-wrap items-end gap-2 border-t px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!nuovaVoce || nuovaQuantita === null || Number.isNaN(nuovaQuantita)) return;
              salvaRiga(nuovaVoce, nuovaQuantita);
              setNuovaVoce(null);
              setNuovaQuantita(null);
            }}
          >
            <div className="min-w-[16rem] flex-1"><ScegliVoce elenco={elenco} valore={nuovaVoce} onChange={setNuovaVoce} etichetta="Voce da aggiungere all'ordine" /></div>
            <div className="w-36"><QuantitaInLinea key={nuovaVoce ?? "nessuna"} etichetta="Quantità prevista" valore={nuovaQuantita} onSalva={setNuovaQuantita} grande /></div>
            <Button type="submit" size="sm" className="h-10" disabled={!nuovaVoce || nuovaQuantita === null || salvaComputo.isPending}><Plus className="mr-1.5 h-3.5 w-3.5" /> Aggiungi all'ordine</Button>
          </form>
        )}
      </div>

      <div className="rounded-lg border bg-card">
        <header className="border-b px-4 py-3">
          <h4 className="text-sm font-semibold">Misure di {figlia.codice ?? figlia.nome}</h4>
          <p className="text-xs text-muted-foreground">Le quantità eseguite, come nel libretto delle misure. Una detrazione si scrive col meno.</p>
        </header>
        {puoModificare && (
          <form key={chiaveMisura} className="grid gap-2 border-b px-4 py-3 sm:grid-cols-[1fr_9rem_8rem] lg:grid-cols-[1fr_9rem_8rem_1fr_auto]" onSubmit={(e) => { e.preventDefault(); aggiungiMisura(); }}>
            <Campo etichetta="Voce">{() => <ScegliVoce elenco={elenco} valore={misura.voceId} onChange={(id) => setMisura((m) => ({ ...m, voceId: id }))} etichetta="Voce misurata" />}</Campo>
            <Campo etichetta="Data">{(id) => <Input id={id} type="date" value={misura.data} onChange={(e) => setMisura((m) => ({ ...m, data: e.target.value }))} />}</Campo>
            <CampoNumero etichetta="Quantità" valore={misura.quantita} decimali={3} segno onChange={(q) => setMisura((m) => ({ ...m, quantita: q }))} />
            <Campo etichetta="Dove o come">{(id) => <Input id={id} value={misura.descrizione} onChange={(e) => setMisura((m) => ({ ...m, descrizione: e.target.value }))} placeholder="Aula 3, piano terra" />}</Campo>
            <div className="flex items-end">
              <Button type="submit" className="h-10" disabled={aggiungi.isPending || !misura.voceId || misura.quantita === null || Number.isNaN(misura.quantita) || misura.quantita === 0}>
                {aggiungi.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />} Aggiungi
              </Button>
            </div>
          </form>
        )}
        {misure.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Nessuna misura per questo ordine.</p>
        ) : (
          <ul className="divide-y text-sm">
            {misure.map((m) => {
              const v = perId.get(m.voceId);
              const nelSal = m.salId ? numeroSal.get(m.salId) : undefined;
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">{dataIt(m.data)}</span>
                  <span className="min-w-0 flex-1 truncate">{v ? etichettaVoce(v) : "Voce"}{m.descrizione && <span className="text-xs text-muted-foreground"> · {m.descrizione}</span>}</span>
                  <span className={cn("shrink-0 tabular-nums", m.quantita < 0 && "text-destructive")}>{numeroIt(m.quantita, 3)} {v?.unitaMisura}</span>
                  {m.salId ? (
                    <Badge variant="secondary" className="shrink-0 font-normal">{nelSal ? `nel SAL n. ${nelSal}` : "in un SAL"}</Badge>
                  ) : puoModificare ? (
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" aria-label="Togli la misura" disabled={elimina.isPending} onClick={async () => {
                      if (!(await confirm({ title: "Togliere questa misura?", confirmLabel: "Togli", variant: "destructive" }))) return;
                      elimina.mutate(m.id, { onError: (e) => toast.error(messaggioContratto(e, "la misura")) });
                    }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Una quantità che si salva quando si esce dal campo (o con Invio). Vuoto = togli. */
function QuantitaInLinea({ etichetta, valore, onSalva, grande }: { etichetta: string; valore: number | null; onSalva: (q: number | null) => void; grande?: boolean }) {
  const [testo, setTesto] = useState(numeroIt(valore, 3));
  const q = testo.trim() === "" ? null : leggiNumero(testo);
  const sbagliato = testo.trim() !== "" && (q === null || q < 0);
  const conferma = () => {
    if (sbagliato || q === valore) return;
    onSalva(q);
  };
  return (
    <Input
      aria-label={etichetta}
      inputMode="decimal"
      className={cn("text-right", grande ? "h-10" : "ml-auto h-8 w-28")}
      value={testo}
      aria-invalid={sbagliato || undefined}
      placeholder="0"
      onChange={(e) => { setTesto(e.target.value); if (grande) { const n = e.target.value.trim() === "" ? null : leggiNumero(e.target.value); onSalva(n !== null && n >= 0 ? n : null); } }}
      onBlur={grande ? undefined : conferma}
      onKeyDown={(e) => { if (!grande && e.key === "Enter") { e.preventDefault(); conferma(); } }}
    />
  );
}
