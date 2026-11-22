import { useAuth } from "@/contexts/AuthContext";
import { misuraRapportino, riferimentiUnici } from "@/lib/campo/correzioneRapportino";
import { UniformSelect } from "@/components/ui/uniform-select";
/**
 * Correggere un rapportino dall'ufficio, e vedere chi ha cambiato cosa.
 * La regola sta nel database (`rapportino_correggi`): su un approvato toglie ore,
 * costi e fasi vecchi e rimette i nuovi in un colpo solo.
 */
import { COLONNE_RAPPORTINO } from "@/lib/campo/colonneRapportino";
import { isClientReport } from "@/lib/campo/reportKind";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Loader2, PenLine, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useNomiFasiCommessa } from "@/hooks/useRapportiniMese";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import { refreshRapportinoQueries } from "@/lib/orders/refreshRapportinoQueries";
import { ArrivoRapportino } from "@/components/orders/ArrivoRapportino";
import { campoArrivo, leggiArrivo, mezzoStradale, type ArrivoRapportino as DatiArrivo } from "@/lib/campo/arrivoRapportino";

type Voce = Record<string, unknown>;
interface Bozza {
  updatedAt: unknown; descrizione: string; note: string; ore: string; straordinario: string; conPresenze: boolean;
  presenze: Voce[]; fasi: Voce[]; materiali: Voce[]; mezzi: Voce[]; motivo: string;
  arrivo: DatiArrivo[];
}
const lista = (v: unknown): Voce[] => (Array.isArray(v) ? (v as Voce[]) : []);

interface Lettura { eq: (a: string, b: string) => Lettura; maybeSingle: () => Promise<{ data: Voce | null; error: Error | null }>; order: (c: string, o: object) => Promise<{ data: Voce[] | null; error: Error | null }> }
const db = supabase as unknown as {
  from: (t: string) => { select: (c: string) => Lettura };
  rpc: (f: string, a: object) => Promise<{ error: Error | null }>;
};
const NUOVO_MATERIALE = { nome: "", quantita: "1", unita: "", provenienza: "acquistato", fase_id: "" };
const titolo = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";

// Fuori dal componente: dentro, ogni tasto ricreerebbe il campo e toglierebbe il cursore.
const Riga = ({ nome, valore, onValore, unita, onTogli }: { nome: string; valore: unknown; onValore: (v: string) => void; unita: string; onTogli?: () => void }) => (
  <li className="flex items-center gap-2 py-1">
    <span className="min-w-0 flex-1 truncate">{nome}</span>
    <Input aria-label={`${nome}: ${unita}`} inputMode="decimal" className="h-8 w-20 text-right text-[13px]" value={String(valore ?? "")} onChange={(e) => onValore(e.target.value)} />
    <span className="w-8 text-xs text-muted-foreground">{unita}</span>
    {onTogli && <button type="button" aria-label={`Togli ${nome}`} onClick={onTogli} className="tap-compact p-1 text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>}
  </li>
);

type PropsCorrezione = { rapportinoId: string; orderId: string; onCorretto?: () => void };
export function CorreggiRapportino(props: PropsCorrezione) {
  const [aperto, setAperto] = useState(false);
  return <>
    <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => setAperto(true)}><PenLine className="mr-1 h-3.5 w-3.5" />Modifica rapportino</Button>
    {aperto && <EditorRapportino {...props} onClose={() => setAperto(false)} />}
  </>;
}
function EditorRapportino(props: PropsCorrezione & { onClose: () => void }) {
  const { rapportinoId, orderId, onClose } = props;
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const aperto = true;
  const riga = useQuery({
    queryKey: ["rapportino-da-correggere", companyId, orderId, rapportinoId],
    enabled: aperto && !!companyId,
    staleTime: 0, gcTime: 0,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn: async () => {
      const { data, error } = await db.from("campo_rapportini").select(COLONNE_RAPPORTINO).eq("id", rapportinoId).eq("company_id", companyId!).eq("order_id", orderId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data || data.company_id !== companyId || data.order_id !== orderId) throw new Error("Rapportino non disponibile in questa commessa.");
      return data;
    },
  });
  if (riga.isPending || riga.isError || !riga.data) return <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}><DialogContent><DialogHeader><DialogTitle>Modifica rapportino</DialogTitle></DialogHeader>
    {riga.isError ? <p role="alert">Impossibile caricare il rapportino. <Button variant="outline" onClick={() => void riga.refetch()}>Riprova</Button></p> : <p role="status">Carico…</p>}
    <DialogFooter><Button variant="outline" onClick={onClose}>Annulla</Button><Button disabled>Salva</Button></DialogFooter></DialogContent></Dialog>;
  return <FormRapportino {...props} riga={riga} />;
}
function FormRapportino({ rapportinoId, orderId, onCorretto, onClose, riga }: PropsCorrezione & { onClose: () => void; riga: UseQueryResult<Voce, Error> }) {
  const qc = useQueryClient();
  const { effectiveCompany, role, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const aperto = true;
  const setAperto = (v: boolean) => { if (!v) onClose(); };
  const [b, setB] = useState<Bozza>(() => { const r = riga.data!; return {
      updatedAt: r.updated_at, descrizione: String(r.descrizione_lavori ?? ""), note: String(r.note ?? ""),
      ore: String(r.ore_lavorate ?? 0), straordinario: String(r.ore_straordinario ?? 0),
      conPresenze: lista(r.presenze).length > 0,
      presenze: lista(r.presenze), fasi: lista(r.fasi_lavorate), materiali: lista(r.materiali_usati), mezzi: lista(r.mezzi_usati), motivo: "",
      arrivo: leggiArrivo(r.campi_extra),
    }; });
  const [nuovo, setNuovo] = useState(NUOVO_MATERIALE);
  const { data: nomiFasi } = useNomiFasiCommessa(orderId);
  const persone = useQuery({
    queryKey: ["rapportino-persone-correzione", companyId], enabled: aperto && !!companyId, retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id, first_name, last_name").eq("company_id", companyId!).eq("is_active", true).order("last_name");
      if (error) throw new Error(error.message);
      return (data ?? []).map((p) => ({ id: p.id, nome: `${p.first_name} ${p.last_name}`.trim() }));
    },
  });
  const mezzi = useQuery({
    queryKey: ["rapportino-mezzi-correzione", companyId], enabled: aperto && !!companyId, retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("mezzi").select("id, nome, targa, tipo, contatore_unita").eq("company_id", companyId!).is("deleted_at", null).order("nome");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const approvato = !!riga.data?.approvato;
  const richiedeApprovazione = approvato && riga.data?.user_id === user?.id && role !== "company_admin" && role !== "super_admin";
  const salva = useMutation({
    mutationFn: async () => {
      if (!b || !riga.data) return;
      if (nuovo.nome.trim()) throw new Error("Aggiungi il materiale al rapportino oppure svuota il campo prima di salvare.");
      if (b.materiali.some((m) => !String(m.nome ?? m.descrizione ?? "").trim())) throw new Error("Scrivi la descrizione dei materiali.");
      riferimentiUnici(b.presenze, "employee_id", "Operai");
      riferimentiUnici(b.mezzi, "mezzo_id", "Mezzi");
      const campi: Voce = {
        descrizione_lavori: b.descrizione, note: b.note,
        presenze: b.presenze.map((p) => ({ ...p, ore: misuraRapportino(p.ore, "Ore operaio", 24) })),
        fasi_lavorate: b.fasi.map((f) => ({ ...f, percentuale: misuraRapportino(f.percentuale, "Avanzamento", 100) })),
        materiali_usati: b.materiali.map((m) => ({ ...m, quantita: misuraRapportino(m.quantita, "Quantità materiale") })),
        mezzi_usati: b.mezzi.map((m) => (m.ore === "" || m.ore == null ? m : { ...m, ore: misuraRapportino(m.ore, "Ore mezzo", 24) })),
      };
      if (b.conPresenze && !b.presenze.length) { campi.ore_lavorate = 0; campi.ore_straordinario = 0; }
      if (!b.conPresenze) { campi.ore_lavorate = misuraRapportino(b.ore, "Ore", 24); campi.ore_straordinario = misuraRapportino(b.straordinario, "Straordinario", 24); }
      const prima = leggiArrivo(riga.data.campi_extra);
      if (JSON.stringify(b.arrivo) !== JSON.stringify(prima)) {
        campi.arrivo_cantiere = campoArrivo(b.arrivo);
      }
      const { error } = await db.rpc("rapportino_correggi", { p_id: rapportinoId, p_updated_at: b.updatedAt, p_campi: campi, p_motivo: b.motivo });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(richiedeApprovazione ? "Rapportino corretto: in attesa di una nuova approvazione" : "Rapportino corretto");
      refreshWorkQueries(qc, orderId);
      refreshRapportinoQueries(qc, orderId, companyId);
      void qc.invalidateQueries({ predicate: ({ queryKey }) => typeof queryKey[0] === "string" && /rappor|appalto-rendiconto/.test(queryKey[0]) });
      setAperto(false);
      onCorretto?.();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Correzione non salvata"),
  });

  const modifica = (k: "presenze" | "fasi" | "materiali" | "mezzi", i: number, campo: string, v: string) =>
    setB((s) => (s ? { ...s, [k]: s[k].map((x, n) => (n === i ? { ...x, [campo]: v } : x)) } : s));
  const togli = (k: "presenze" | "materiali" | "mezzi", i: number) =>
    setB((s) => (s ? { ...s, [k]: s[k].filter((_, n) => n !== i) } : s));

  return (
    <>
      {aperto && (
        <Dialog open onOpenChange={(o) => { if (!o && !salva.isPending) setAperto(false); }}>
          <DialogContent className="max-h-[92dvh] overflow-y-auto text-[13px] sm:max-w-2xl">
            <DialogHeader><DialogTitle className="max-md:text-base">Correggi il rapportino</DialogTitle></DialogHeader>
            {riga.isError ? <p role="alert">Impossibile caricare il rapportino. <Button variant="outline" onClick={() => void riga.refetch()}>Riprova</Button></p> : !b ? <p role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Carico…</p> : (
              <fieldset disabled={salva.isPending} className="space-y-3">
                {approvato && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">{richiedeApprovazione ? "Stai correggendo il tuo rapportino approvato: dopo il salvataggio un altro utente dell’ufficio dovrà approvarlo di nuovo." : "È già approvato: ore, costi, fasi e rendiconto si aggiornano insieme. I documenti confermati o firmati bloccano la correzione."}</p>}
                <div><p className={titolo}>Cosa si è fatto</p><Textarea aria-label="Lavoro svolto" rows={3} className="mt-1 text-[13px]" value={b.descrizione} onChange={(e) => setB({ ...b, descrizione: e.target.value })} /></div>
                {b.conPresenze ? (
                  <div><p className={titolo}>Chi ha lavorato</p><ul className="divide-y">
                    {b.presenze.map((p, i) => <li key={i} className="flex flex-wrap items-center gap-2 py-1">
                      {p.subappaltatore_id ? <span className="flex-1">{String(p.nome ?? "Ditta")}</span> : <UniformSelect aria-label={`Operaio ${i + 1}`} className="min-w-0 flex-1 rounded border bg-background p-1" value={String(p.employee_id ?? "")} onChange={(e) => {
                        const scelta = persone.data?.find((x) => x.id === e.target.value); if (!scelta) return;
                        setB({ ...b, presenze: b.presenze.map((x, n) => n === i ? { ...x, employee_id: scelta.id, nome: scelta.nome } : x) });
                      }}><option value={String(p.employee_id ?? "")}>{String(p.nome ?? "Senza nome")}</option>{persone.data?.filter((x) => x.id !== p.employee_id && !b.presenze.some((v) => v.employee_id === x.id)).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</UniformSelect>}
                      <Input aria-label={`Ore di ${p.nome}`} inputMode="decimal" className="h-8 w-20" value={String(p.ore ?? "")} onChange={(e) => modifica("presenze", i, "ore", e.target.value)} />
                      <button type="button" aria-label={`Togli ${p.nome}`} className="tap-compact" onClick={() => togli("presenze", i)}><X className="h-4 w-4" /></button>
                    </li>)}
                  </ul></div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <label><span className={titolo}>Ore</span><Input inputMode="decimal" className="mt-1 h-8 text-[13px]" value={b.ore} onChange={(e) => setB({ ...b, ore: e.target.value })} /></label>
                    <label><span className={titolo}>Straordinario</span><Input inputMode="decimal" className="mt-1 h-8 text-[13px]" value={b.straordinario} onChange={(e) => setB({ ...b, straordinario: e.target.value })} /></label>
                  </div>
                )}
                <div className="space-y-1">
                  {persone.isError ? <p role="alert">Elenco operai non disponibile. <button type="button" className="underline" onClick={() => void persone.refetch()}>Riprova</button></p> : <UniformSelect aria-label="Aggiungi operaio" value="" className="w-full rounded border bg-background p-2" disabled={persone.isLoading} onChange={(e) => {
                    const p = persone.data?.find((x) => x.id === e.target.value); if (!p) return;
                    // I rapportini senza presenze mantengono le ore dell'autore: non convertirli implicitamente.
                    setB({ ...b, conPresenze: true, presenze: [...b.presenze, { employee_id: p.id, nome: p.nome, ore: "0" }] });
                  }}><option value="">Aggiungi operaio…</option>{persone.data?.filter((x) => !b.presenze.some((v) => v.employee_id === x.id)).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</UniformSelect>}
                  {!b.conPresenze && <p className="text-xs text-muted-foreground">Aggiungendo operai, le ore saranno calcolate dalle presenze: inserisci anche l’autore se ha lavorato.</p>}
                </div>
                {b.fasi.length > 0 && <div><p className={titolo}>Fasi</p><ul className="divide-y">
                  {b.fasi.map((f, i) => <Riga key={i} nome={String(f.nome ?? `Fase ${i + 1}`)} valore={f.percentuale} unita="%" onValore={(v) => modifica("fasi", i, "percentuale", v)} />)}
                </ul></div>}
                <div><p className={titolo}>Materiali</p>{b.materiali.length > 0 && <ul className="divide-y">
                  {b.materiali.map((m, i) => <li key={i} className="grid grid-cols-[minmax(0,1fr)_5rem_4rem_auto] gap-1 py-1">
                    <Input aria-label={`Descrizione materiale ${i + 1}`} value={String(m.nome ?? m.descrizione ?? "")} onChange={(e) => modifica("materiali", i, m.nome != null ? "nome" : "descrizione", e.target.value)} />
                    <Input aria-label={`Quantità materiale ${i + 1}`} inputMode="decimal" value={String(m.quantita ?? "")} onChange={(e) => modifica("materiali", i, "quantita", e.target.value)} />
                    <Input aria-label={`Unità materiale ${i + 1}`} value={String(m.unita ?? m.unita_misura ?? "")} onChange={(e) => modifica("materiali", i, m.unita_misura != null ? "unita_misura" : "unita", e.target.value)} />
                    <button type="button" aria-label={`Togli materiale ${i + 1}`} className="tap-compact" onClick={() => togli("materiali", i)}><X className="h-4 w-4" /></button>
                  </li>)}
                </ul>}
                  <div className="mt-1 grid grid-cols-6 gap-1.5">
                    <Input aria-label="Materiale non previsto" placeholder="Aggiungi materiale" className="col-span-6 h-8 text-[13px]" value={nuovo.nome} onChange={(e) => setNuovo({ ...nuovo, nome: e.target.value })} />
                    {nuovo.nome.trim() && <>
                      <Input aria-label="Quantità" inputMode="decimal" placeholder="Q.tà" className="col-span-1 h-8 px-1.5 text-[13px]" value={nuovo.quantita} onChange={(e) => setNuovo({ ...nuovo, quantita: e.target.value })} />
                      <Input aria-label="Unità" placeholder="Unità" className="col-span-1 h-8 px-1.5 text-[13px]" value={nuovo.unita} onChange={(e) => setNuovo({ ...nuovo, unita: e.target.value })} />
                      <UniformSelect aria-label="Da dove viene" className="col-span-2 h-8 rounded-md border bg-background px-1 text-[13px]" value={nuovo.provenienza} onChange={(e) => setNuovo({ ...nuovo, provenienza: e.target.value })}>
                        <option value="acquistato">Comprato</option>
                        <option value="magazzino">Da magazzino</option>
                        <option value="consumo">Consumo minuto</option>
                      </UniformSelect>
                      <UniformSelect aria-label="Lavorazione" className="col-span-2 h-8 rounded-md border bg-background px-1 text-[13px]" value={nuovo.fase_id} onChange={(e) => setNuovo({ ...nuovo, fase_id: e.target.value })}>
                        <option value="">Lavorazione</option>
                        {[...(nomiFasi ?? new Map<string, string>()).entries()].map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
                      </UniformSelect>
                      <Button type="button" size="sm" variant="outline" className="col-span-6 h-7" onClick={() => {
                        setB({ ...b, materiali: [...b.materiali, { nome: nuovo.nome.trim(), quantita: nuovo.quantita, unita: nuovo.unita.trim(), provenienza: nuovo.provenienza, ...(nuovo.fase_id ? { fase_id: nuovo.fase_id } : {}) }] });
                        setNuovo(NUOVO_MATERIALE);
                      }}>Aggiungi al rapportino</Button>
                    </>}
                  </div>
                </div>
                <div><p className={titolo}>Mezzi</p><ul className="divide-y">
                  {b.mezzi.map((m, i) => <Riga key={i} nome={String(m.nome ?? "Mezzo")} valore={m.ore} unita="ore" onValore={(v) => modifica("mezzi", i, "ore", v)} onTogli={() => togli("mezzi", i)} />)}
                </ul>
                  {mezzi.isError ? <p role="alert">Elenco mezzi non disponibile. <button type="button" className="underline" onClick={() => void mezzi.refetch()}>Riprova</button></p> : <UniformSelect aria-label="Aggiungi mezzo" value="" className="w-full rounded border bg-background p-2" disabled={mezzi.isLoading} onChange={(e) => {
                    const m = mezzi.data?.find((x) => x.id === e.target.value); if (m) setB({ ...b, mezzi: [...b.mezzi, { mezzo_id: m.id, nome: m.nome, ore: "" }] });
                  }}><option value="">Aggiungi mezzo…</option>{mezzi.data?.filter((x) => !b.mezzi.some((m) => m.mezzo_id === x.id)).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</UniformSelect>}
                  <p className="text-xs text-muted-foreground">Per sostituire un mezzo, rimuovilo e aggiungi quello corretto. Ore vuote o pari a zero: si usa la stima prevista dal sistema. Togli i mezzi non utilizzati.</p>
                </div>
                {riga.data && !isClientReport(riga.data) && <ArrivoRapportino valore={b.arrivo} onChange={arrivo => setB({ ...b, arrivo })}
                  mezzi={(mezzi.data ?? []).filter(mezzoStradale)} caricamento={mezzi.isLoading} errore={mezzi.isError}
                  riprova={() => void mezzi.refetch()} />}
                <div><p className={titolo}>Note</p><Textarea aria-label="Note del rapportino" rows={2} className="mt-1 text-[13px]" value={b.note} onChange={(e) => setB({ ...b, note: e.target.value })} /></div>
                <div><p className={titolo}>Motivo della correzione{approvato ? " *" : ""}</p><Input aria-label="Motivo della correzione" className="mt-1 h-8 text-[13px]" value={b.motivo} onChange={(e) => setB({ ...b, motivo: e.target.value })} placeholder="Es. ore sbagliate" /></div>
              </fieldset>
            )}
            <DialogFooter className="flex-row justify-end gap-2">
              <Button variant="outline" disabled={salva.isPending} onClick={() => setAperto(false)}>Annulla</Button>
              <Button disabled={!b || riga.isFetching || riga.isError || salva.isPending || (approvato && !b.motivo.trim())} onClick={() => salva.mutate()}>
                {salva.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salva
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

const ETICHETTE: Record<string, string> = {
  descrizione_lavori: "Lavoro svolto", note: "Note", meteo: "Meteo", ore_lavorate: "Ore", ore_straordinario: "Straordinario",
  presenze: "Persone e ore", fasi_lavorate: "Fasi", materiali_usati: "Materiali", mezzi_usati: "Mezzi",
  voce: "Voce del rapportino", voce_id: "Riferimento voce", percentuale_avanzamento: "Avanzamento", campi_extra: "Campi", foto_urls: "Foto", data_lavoro: "Data",
};

function descrivi(k: string, v: unknown): string {
  if (k === "presenze") return lista(v).map((p) => `${p.nome ?? "?"} ${p.ore ?? 0} h`).join(", ") || "nessuno";
  if (k === "materiali_usati") return lista(v).map((m) => `${m.nome ?? m.descrizione ?? "?"} ${m.quantita ?? ""}`).join(", ") || "nessuno";
  if (k === "mezzi_usati") return lista(v).map((m) => `${m.nome ?? "?"}${m.ore != null ? ` ${m.ore} h` : ""}`).join(", ") || "nessuno";
  if (k === "fasi_lavorate") return lista(v).map((f) => `${f.nome ?? "fase"} ${f.percentuale ?? 0}%`).join(", ") || "nessuna";
  if (k === "voce" && v && typeof v === "object") { const x = v as Voce; return `${x.descrizione ?? "Voce"} · ${x.quantita ?? ""} ${x.unita ?? ""}`; }
  if (Array.isArray(v) || (v && typeof v === "object")) return "modificati";
  return v == null || v === "" ? "vuoto" : String(v);
}

export function StoricoRapportino({ rapportinoId }: { rapportinoId: string }) {
  const storico = useQuery({
    queryKey: ["rapportino-modifiche", rapportinoId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await db.from("rapportino_modifiche").select("id, fatta_da_nome, fatta_il, motivo, prima, dopo").eq("rapportino_id", rapportinoId).order("fatta_il", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  if (storico.isError) return <p role="alert" className="text-xs">Storico non disponibile. <button type="button" className="underline" onClick={() => void storico.refetch()}>Riprova</button></p>;
  const modifiche = (storico.data ?? []).filter((m) => typeof m.fatta_il === "string");
  if (!modifiche.length) return null;
  return (
    <details className="rounded-lg border px-3 py-1.5 text-[13px]">
      <summary className="cursor-pointer text-xs font-medium text-slate-600">Modifiche ({modifiche.length})</summary>
      <ul className="mt-1.5 space-y-2">
        {modifiche.map((m) => (
          <li key={String(m.id)} className="text-xs">
            <p className="font-medium text-slate-800">{String(m.fatta_da_nome || "Sistema")} · {format(parseISO(String(m.fatta_il)), "d MMM yyyy HH:mm", { locale: it })}</p>
            {m.motivo ? <p className="text-slate-600">Motivo: {String(m.motivo)}</p> : null}
            {Object.keys((m.dopo ?? {}) as Voce).map((k) => (
              <p key={k} className="text-muted-foreground">{ETICHETTE[k] ?? k}: {descrivi(k, (m.prima as Voce)?.[k])} → {descrivi(k, (m.dopo as Voce)?.[k])}</p>
            ))}
          </li>
        ))}
      </ul>
    </details>
  );
}
