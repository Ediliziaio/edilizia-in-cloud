// src/components/orders/RapportiniUfficio.tsx
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Camera, Check, FileUp, Hammer, Loader2, NotebookPen, Plus, Sparkles, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrderWorkPhases } from "@/hooks/useOrderWorkPhases";
import { useSottofasi } from "@/hooks/useSottofasi";
import { useMezzi, useMezziDellaCommessa } from "@/hooks/useMezzi";
import { nomeAccesso, useAccessiCommessa } from "@/hooks/useAccessiCommessa";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import { messaggioErrore } from "@/lib/orders/sottofasi";
import { giornoLocale } from "@/lib/orders/cronoprogramma";
import { compressImage } from "@/lib/campo/compressImage";
import {
  METEO, caricoRapportini, erroriGiorni, giornoDaLetto, giorniDaPeriodo, giornoVuoto,
  type GiornoUfficio, type PersonaPresenza, type RapportinoLetto,
} from "@/lib/campo/rapportiniUfficio";

/** Un file in base64, senza il prefisso «data:…;base64,». */
const inBase64 = (b: Blob) => new Promise<string>((ok, ko) => {
  const fr = new FileReader();
  fr.onload = () => ok(String(fr.result).split(",")[1] ?? "");
  fr.onerror = () => ko(fr.error);
  fr.readAsDataURL(b);
});

/** Un foglio Excel in testo, riga per riga (le celle separate da « | »). */
async function excelInTesto(file: File): Promise<string> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const righe: string[] = [];
  wb.eachSheet((foglio) => {
    righe.push(`# ${foglio.name}`);
    foglio.eachRow((riga) => {
      const celle = (riga.values as unknown[]).slice(1).map((v) => {
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (v && typeof v === "object" && "result" in (v as object)) return String((v as { result: unknown }).result ?? "");
        if (v && typeof v === "object" && "text" in (v as object)) return String((v as { text: unknown }).text ?? "");
        return v == null ? "" : String(v);
      });
      if (celle.some((c) => c.trim())) righe.push(celle.join(" | "));
    });
  });
  return righe.join("\n");
}

/**
 * «Scrivi rapportini» dalla commessa (31/10/2026): l'ufficio scrive il rapportino
 * di uno o più giorni completo come quello del cantiere — cosa si è fatto, fasi
 * con l'avanzamento e le sottofasi, chi ha lavorato e quante ore, mezzi usati,
 * materiali, foto, meteo, note — a nome suo o di chi lavora in cantiere con
 * l'app. Entrano da approvare: all'approvazione le ore di ognuno diventano costo
 * col suo costo orario, come per il capocantiere.
 */
export function RapportiniUfficio({ orderId, className }: { orderId: string; className?: string }) {
  const [aperta, setAperta] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" className={cn("h-8", className)} onClick={() => setAperta(true)}>
        <NotebookPen className="mr-1.5 h-4 w-4" />Scrivi rapportini
      </Button>
      <Dialog open={aperta} onOpenChange={setAperta}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Rapportini dall'ufficio</DialogTitle>
            <DialogDescription>Come quelli del cantiere, anche più giorni insieme. Entrano da approvare: all'approvazione le ore di ognuno diventano costo.</DialogDescription>
          </DialogHeader>
          {aperta && <Finestra orderId={orderId} onFatto={() => setAperta(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

const dbx = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

function Finestra({ orderId, onFatto }: { orderId: string; onFatto: () => void }) {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const oggi = giornoLocale(new Date().toISOString());
  const { phases, unassigned, employees } = useOrderWorkPhases(orderId);
  const { perFase: sottofasiDi } = useSottofasi(orderId);
  const { data: accessi = [] } = useAccessiCommessa(orderId);
  const { data: tuttiMezzi = [] } = useMezzi();
  const { data: mezziQui = [] } = useMezziDellaCommessa(orderId);
  const autori = accessi.filter((a) => a.role_type === "employee");

  // Ditte della commessa, come presenza (le ore delle ditte non sono costo orario).
  const ditte = useQuery({
    queryKey: ["rapportini-ufficio-ditte", companyId, orderId],
    enabled: !!companyId,
    queryFn: async (): Promise<PersonaPresenza[]> => {
      const { data, error } = await dbx.from("order_external_teams").select("team:external_teams(name, subappaltatore_id)").eq("order_id", orderId);
      if (error) throw error;
      const visti = new Set<string>();
      return ((data ?? []) as Array<{ team: { name: string; subappaltatore_id: string | null } | null }>)
        .filter((r) => r.team?.subappaltatore_id && !visti.has(r.team.subappaltatore_id) && visti.add(r.team.subappaltatore_id))
        .map((r) => ({ chiave: `s:${r.team!.subappaltatore_id}`, nome: r.team!.name, subappaltatore_id: r.team!.subappaltatore_id! }));
    },
  });
  const articoli = useQuery({
    queryKey: ["rapportini-ufficio-articoli", companyId, orderId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await dbx.from("order_items").select("id, name, unita_misura").eq("order_id", orderId).order("name").limit(500);
      if (error) throw error;
      return ((data ?? []) as Array<{ id: string; name: string | null; unita_misura: string | null }>)
        .filter((a) => a.name?.trim())
        .map((a) => ({ id: a.id, nome: a.name!.trim(), unita: a.unita_misura }));
    },
  });

  // Prima chi è assegnato a questa commessa, poi tutti gli altri dipendenti.
  const assegnati = useMemo(() => new Set(
    [...phases.flatMap((p) => p.assignments), ...unassigned].map((a) => a.employee_id).filter((x): x is string => !!x),
  ), [phases, unassigned]);
  const persone: PersonaPresenza[] = useMemo(() => [
    ...employees.filter((e) => assegnati.has(e.id)).map((e) => ({ chiave: `e:${e.id}`, nome: e.label, employee_id: e.id })),
    ...(ditte.data ?? []),
    ...employees.filter((e) => !assegnati.has(e.id)).map((e) => ({ chiave: `e:${e.id}`, nome: e.label, employee_id: e.id })),
  ], [employees, assegnati, ditte.data]);
  const idQui = new Set(mezziQui.map((m) => m.mezzo_id));
  const mezzi = [...tuttiMezzi.filter((m) => idQui.has(m.id)), ...tuttiMezzi.filter((m) => !idQui.has(m.id))]
    .map((m) => ({ id: m.id, nome: `${m.nome}${m.targa ? ` · ${m.targa}` : ""}`, qui: idQui.has(m.id) }));

  const [giorni, setGiorni] = useState<GiornoUfficio[]>(() => [giornoVuoto(oggi, "g0")]);
  const [tentato, setTentato] = useState(false);
  const [caricando, setCaricando] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<{ dal: string; al: string; feriali: boolean } | null>(null);
  const [lettura, setLettura] = useState<{ stato: "legge" } | { stato: "letto"; n: number; avvisi: string[] } | null>(null);
  // Il primo giorno ancora vuoto si sostituisce, invece di restare lì in cima.
  const soloVuoto = giorni.length === 1 && !giorni[0].descrizione.trim() && !Object.keys(giorni[0].presenze ?? {}).length;
  const errori = erroriGiorni(giorni, oggi);
  const cambia = (chiave: string, patch: Partial<GiornoUfficio>) => setGiorni((gs) => gs.map((g) => (g.chiave === chiave ? { ...g, ...patch } : g)));

  const caricaFoto = async (g: GiornoUfficio, files: FileList | null) => {
    if (!files?.length || !companyId) return;
    setCaricando(g.chiave);
    const nuove: string[] = [];
    let falliti = 0;
    for (const file of Array.from(files).slice(0, 10)) {
      if (file.size > 15 * 1024 * 1024) { falliti++; continue; }
      try {
        const blob = (await compressImage(file).catch((): null => null)) ?? file;
        // La stessa cartella delle foto del cantiere: il database accetta solo queste.
        const path = `${companyId}/${orderId}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from("campo-rapportini").upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (error) throw error;
        nuove.push(supabase.storage.from("campo-rapportini").getPublicUrl(path).data.publicUrl);
      } catch {
        falliti++;
      }
    }
    setGiorni((gs) => gs.map((x) => (x.chiave === g.chiave ? { ...x, foto: [...(x.foto ?? []), ...nuove] } : x)));
    setCaricando(null);
    if (falliti) toast.error(falliti === 1 ? "Una foto non è stata caricata" : `${falliti} foto non caricate`);
  };

  // Più giorni insieme: lo stesso lavoro dell'ultimo giorno, per ogni giorno del periodo.
  const daPeriodo = periodo ? giorniDaPeriodo(giorni[giorni.length - 1], periodo.dal, periodo.al, oggi, periodo.feriali,
    soloVuoto ? [] : giorni.map((g) => g.data)) : [];
  const creaPeriodo = () => {
    if (!daPeriodo.length) return;
    setGiorni((gs) => (soloVuoto ? daPeriodo : [...gs, ...daPeriodo]).slice(0, 31));
    setPeriodo(null);
  };

  // Leggi da documenti: foto e PDF al modello come file, Excel e testo come testo.
  const leggiDocumenti = async (files: FileList | null) => {
    if (!files?.length || !companyId) return;
    setLettura({ stato: "legge" });
    try {
      const allegati: Array<{ base64: string; mime: string; name: string }> = [];
      const testi: string[] = [];
      for (const f of Array.from(files).slice(0, 5)) {
        const nome = f.name.toLowerCase();
        if (/\.(xlsx|xlsm)$/.test(nome)) testi.push(`## ${f.name}\n${await excelInTesto(f)}`);
        else if (/\.(csv|txt)$/.test(nome) || f.type.startsWith("text/")) testi.push(`## ${f.name}\n${await f.text()}`);
        else if (f.type.startsWith("image/")) {
          const blob = (await compressImage(f, 2000, 0.8).catch((): null => null)) ?? f;
          allegati.push({ base64: await inBase64(blob), mime: blob === f ? f.type : "image/jpeg", name: f.name });
        } else allegati.push({ base64: await inBase64(f), mime: f.type || "application/pdf", name: f.name });
      }
      const { data, error } = await supabase.functions.invoke("ai-rapportini-da-documento", {
        body: { order_id: orderId, company_id: companyId, files: allegati, testo: testi.join("\n\n").slice(0, 60_000) },
      });
      if (error) {
        let messaggio = "Non sono riuscito a leggere i documenti. Riprova.";
        try {
          const corpo = await (error as { context?: Response }).context?.json?.();
          if (typeof corpo?.error === "string") messaggio = corpo.error;
        } catch { /* messaggio generico */ }
        throw new Error(messaggio);
      }
      const letti = ((data as { rapportini?: RapportinoLetto[] })?.rapportini ?? []);
      const avvisi = ((data as { avvisi?: string[] })?.avvisi ?? []);
      const nuovi = letti.map((r, i) => giornoDaLetto(r, `ai-${Date.now()}-${i}`));
      if (nuovi.length) setGiorni((gs) => (soloVuoto ? nuovi : [...gs, ...nuovi]).slice(0, 31));
      setLettura({ stato: "letto", n: nuovi.length, avvisi });
    } catch (e) {
      setLettura(null);
      toast.error(e instanceof Error ? e.message : "Non sono riuscito a leggere i documenti.");
    }
  };

  const salva = useMutation({
    mutationFn: async () => {
      const carico = caricoRapportini(giorni, phases.map((p) => ({ id: p.id, percentuale: p.percentuale })), sottofasiDi,
        { persone, mezzi, materiali: articoli.data ?? [] });
      const { data, error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(
        "ufficio_crea_rapportini", { p_order_id: orderId, p_rapportini: carico });
      if (error) throw error;
      return Number(data) || 0;
    },
    onSuccess: (n) => {
      refreshWorkQueries(qc, orderId);
      void qc.invalidateQueries({ predicate: ({ queryKey }) => typeof queryKey[0] === "string" && queryKey[0].includes("rapportini") });
      toast.success(n === 1 ? "Rapportino scritto: è da approvare" : `${n} rapportini scritti: sono da approvare`);
      onFatto();
    },
    onError: (e) => toast.error(messaggioErrore(e, "Rapportini non salvati. Riprova.")),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="h-8" aria-expanded={!!periodo}
          onClick={() => setPeriodo(periodo ? null : { dal: giorni[giorni.length - 1].data, al: oggi, feriali: true })}>
          <CalendarRange className="mr-1.5 h-4 w-4" />Più giorni insieme
        </Button>
        <label className={cn("inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-sm hover:bg-slate-50", lettura?.stato === "legge" && "pointer-events-none opacity-60")}>
          {lettura?.stato === "legge" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4 text-violet-600" />}
          {lettura?.stato === "legge" ? "Leggo i documenti…" : "Leggi da documenti"}
          <input type="file" multiple className="sr-only" aria-label="Documenti da leggere"
            accept="image/*,application/pdf,.pdf,.xlsx,.xlsm,.csv,.txt"
            onChange={(e) => { void leggiDocumenti(e.target.files); e.target.value = ""; }} />
        </label>
        <span className="text-xs text-muted-foreground">Foto di rapportini di carta, fogli presenze, PDF, Excel: fino a 5 file.</span>
      </div>
      {periodo && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
          <label className="grid gap-1 text-xs text-muted-foreground">Dal
            <Input type="date" max={oggi} value={periodo.dal} onChange={(e) => setPeriodo({ ...periodo, dal: e.target.value })} className="h-9 w-40" aria-label="Periodo dal" />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">Al
            <Input type="date" max={oggi} value={periodo.al} onChange={(e) => setPeriodo({ ...periodo, al: e.target.value })} className="h-9 w-40" aria-label="Periodo al" />
          </label>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input type="checkbox" checked={periodo.feriali} onChange={(e) => setPeriodo({ ...periodo, feriali: e.target.checked })} />
            Senza sabato e domenica
          </label>
          <Button type="button" size="sm" className="h-9" disabled={!daPeriodo.length} onClick={creaPeriodo}>
            {daPeriodo.length ? `Crea ${daPeriodo.length} ${daPeriodo.length === 1 ? "giorno" : "giorni"}` : "Nessun giorno nel periodo"}
          </Button>
          <p className="w-full text-xs text-muted-foreground">Ogni giorno prende lo stesso lavoro, le stesse fasi, persone e mezzi dell'ultimo rapportino qui sotto: poi correggi i giorni diversi.</p>
        </div>
      )}
      {lettura?.stato === "letto" && (
        <div role="status" className="space-y-1 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950">
          <p className="flex items-center gap-1.5 font-medium"><FileUp className="h-4 w-4" />
            {lettura.n ? `Letti ${lettura.n} ${lettura.n === 1 ? "rapportino" : "rapportini"} dai documenti: controllali prima di salvare.` : "Nei documenti non ho trovato rapportini da creare."}
          </p>
          {lettura.avvisi.length > 0 && <ul className="list-disc pl-5 text-xs">{lettura.avvisi.map((a, i) => <li key={i}>{a}</li>)}</ul>}
        </div>
      )}
      {giorni.map((g, i) => {
        const presenze = g.presenze ?? {};
        // Con le fasi scelte, si propone chi lavora su quelle; senza, chi è sulla commessa (31/10/2026).
        const sulleFasi = new Set(phases.filter((p) => g.fasi.includes(p.id)).flatMap((p) => p.assignments).map((a) => a.employee_id).filter((x): x is string => !!x));
        const proposti = persone.filter((p) => p.employee_id && (sulleFasi.size ? sulleFasi.has(p.employee_id) : assegnati.has(p.employee_id)) && !(p.chiave in presenze));
        const oreTotali = Object.values(presenze).reduce((t, v) => t + (Number(v.replace(",", ".")) || 0), 0);
        return (
          <section key={g.chiave} aria-label={`Rapportino ${i + 1}`} className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-xs text-muted-foreground">Giorno
                <Input type="date" max={oggi} value={g.data} onChange={(e) => cambia(g.chiave, { data: e.target.value })} className="h-9 w-40" aria-label={`Giorno del rapportino ${i + 1}`} />
              </label>
              <label className="grid min-w-[11rem] flex-1 gap-1 text-xs text-muted-foreground">A nome di
                <select value={g.autore} onChange={(e) => cambia(g.chiave, { autore: e.target.value })} aria-label={`A nome di, rapportino ${i + 1}`}
                  className="h-9 rounded-md border bg-background px-2 text-sm text-foreground">
                  <option value="">Ufficio (chi scrive)</option>
                  {autori.map((a) => <option key={a.user_id} value={a.user_id}>{nomeAccesso(a)}{a.is_capocantiere ? " · capocantiere" : ""}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">Meteo
                <select value={g.meteo ?? ""} onChange={(e) => cambia(g.chiave, { meteo: e.target.value })} aria-label={`Meteo, rapportino ${i + 1}`}
                  className="h-9 rounded-md border bg-background px-2 text-sm text-foreground">
                  <option value="">—</option>
                  {METEO.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
              {giorni.length > 1 && (
                <Button variant="ghost" size="icon" className="h-9 w-9 text-rose-600" aria-label={`Togli il rapportino ${i + 1}`} onClick={() => setGiorni((gs) => gs.filter((x) => x.chiave !== g.chiave))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            <label className="grid gap-1 text-xs text-muted-foreground">Cosa si è fatto
              <Textarea rows={2} maxLength={4000} value={g.descrizione} onChange={(e) => cambia(g.chiave, { descrizione: e.target.value })}
                placeholder="Es. smontaggio manto lato nord, posa guaina" aria-label={`Cosa si è fatto, rapportino ${i + 1}`} />
            </label>

            {phases.length > 0 && (
              <Blocco titolo="Fasi lavorate">
                <div className="flex flex-wrap gap-1.5">
                  {phases.map((p) => {
                    const si = g.fasi.includes(p.id);
                    return (
                      <button key={p.id} type="button" aria-pressed={si} onClick={() => cambia(g.chiave, { fasi: si ? g.fasi.filter((x) => x !== p.id) : [...g.fasi, p.id] })}
                        className={cn("rounded-full border px-2.5 py-1 text-xs", si ? "border-blue-600 bg-blue-50 font-medium text-blue-900" : "border-border text-muted-foreground hover:bg-slate-50")}>
                        {p.name}
                      </button>
                    );
                  })}
                </div>
                {g.fasi.map((id) => {
                  const fase = phases.find((p) => p.id === id);
                  const sotto = (sottofasiDi.get(id) ?? []).filter((s) => !s.fatta);
                  return (
                    <div key={id} className="rounded-md bg-slate-50 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-medium">{fase?.name}</p>
                        {!sotto.length && (
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">Avanzamento
                            <Input type="number" min={0} max={100} className="h-8 w-20" aria-label={`Avanzamento di ${fase?.name}`}
                              value={g.percentuali?.[id] ?? fase?.percentuale ?? 0}
                              onChange={(e) => cambia(g.chiave, { percentuali: { ...g.percentuali, [id]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } })} />%
                          </label>
                        )}
                      </div>
                      {sotto.length > 0 && (
                        <ul className="mt-1 space-y-1">
                          {sotto.map((s) => {
                            const stato = g.sottofasi[s.id];
                            const imposta = (v: "lavorata" | "finita") => {
                              const nuove = { ...g.sottofasi };
                              if (stato === v) delete nuove[s.id]; else nuove[s.id] = v;
                              cambia(g.chiave, { sottofasi: nuove });
                            };
                            return (
                              <li key={s.id} className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="min-w-0 flex-1">{s.name}</span>
                                <button type="button" aria-pressed={stato === "lavorata"} aria-label={`${s.name}: lavorata`} onClick={() => imposta("lavorata")}
                                  className={cn("flex items-center gap-1 rounded-md border px-2 py-1", stato === "lavorata" ? "border-blue-600 bg-blue-50 text-blue-900" : "border-border text-muted-foreground")}>
                                  <Hammer className="h-3.5 w-3.5" />Lavorata
                                </button>
                                <button type="button" aria-pressed={stato === "finita"} aria-label={`${s.name}: finita`} onClick={() => imposta("finita")}
                                  className={cn("flex items-center gap-1 rounded-md border px-2 py-1", stato === "finita" ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-border text-muted-foreground")}>
                                  <Check className="h-3.5 w-3.5" />Finita
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </Blocco>
            )}

            <Blocco titolo="Chi ha lavorato" destra={oreTotali > 0 ? `${oreTotali.toLocaleString("it-IT")} ore` : undefined}>
              <RigheConValore
                etichetta="persona"
                voci={persone.map((p) => ({ id: p.chiave, nome: p.nome, gruppo: p.subappaltatore_id ? "Ditte" : p.employee_id && assegnati.has(p.employee_id) ? "Su questa commessa" : "Altri dipendenti" }))}
                valori={presenze}
                segnaposto="ore"
                valoreNuovo="8"
                onCambia={(v) => cambia(g.chiave, { presenze: v })}
                extra={proposti.length > 0 && (
                  <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => cambia(g.chiave, {
                    presenze: { ...presenze, ...Object.fromEntries(proposti.map((p) => [p.chiave, "8"])) },
                  })}>
                    <Users className="mr-1 h-3.5 w-3.5" />{sulleFasi.size ? "Chi lavora sulle fasi scelte" : "Tutti quelli della commessa"} ({proposti.length})
                  </Button>
                )}
              />
            </Blocco>

            <Blocco titolo="Mezzi e attrezzi usati">
              <RigheConValore etichetta="mezzo" voci={mezzi.map((m) => ({ id: m.id, nome: m.nome, gruppo: m.qui ? "Su questo cantiere" : "Altri del parco" }))}
                valori={g.mezzi ?? {}} segnaposto="ore (facolt.)" valoreNuovo="" onCambia={(v) => cambia(g.chiave, { mezzi: v })} />
            </Blocco>

            {(articoli.data?.length ?? 0) > 0 && (
              <Blocco titolo="Materiali usati">
                <RigheConValore etichetta="materiale" voci={(articoli.data ?? []).map((a) => ({ id: a.id, nome: a.nome, coda: a.unita ?? undefined }))}
                  valori={g.materiali ?? {}} segnaposto="quantità" valoreNuovo="1" onCambia={(v) => cambia(g.chiave, { materiali: v })} />
              </Blocco>
            )}

            <Blocco titolo="Foto">
              <div className="flex flex-wrap items-center gap-2">
                {(g.foto ?? []).map((u) => (
                  <div key={u} className="relative h-16 w-16 overflow-hidden rounded-md border">
                    <img src={u} alt="" className="h-full w-full object-cover" />
                    <button type="button" aria-label="Togli la foto" onClick={() => cambia(g.chiave, { foto: (g.foto ?? []).filter((x) => x !== u) })}
                      className="absolute right-0.5 top-0.5 rounded-full bg-white/90 p-0.5 text-slate-700"><X className="h-3 w-3" /></button>
                  </div>
                ))}
                <label className={cn("flex h-16 cursor-pointer items-center gap-1.5 rounded-md border border-dashed px-3 text-xs text-muted-foreground hover:bg-slate-50", caricando === g.chiave && "pointer-events-none opacity-60")}>
                  {caricando === g.chiave ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  {caricando === g.chiave ? "Carico…" : "Aggiungi foto"}
                  <input type="file" accept="image/*" multiple className="sr-only" aria-label={`Foto, rapportino ${i + 1}`}
                    onChange={(e) => { void caricaFoto(g, e.target.files); e.target.value = ""; }} />
                </label>
              </div>
            </Blocco>

            <label className="grid gap-1 text-xs text-muted-foreground">Note (facoltative)
              <Input value={g.note} maxLength={4000} onChange={(e) => cambia(g.chiave, { note: e.target.value })} aria-label={`Note, rapportino ${i + 1}`} />
            </label>
          </section>
        );
      })}
      <Button variant="outline" size="sm" disabled={giorni.length >= 31}
        onClick={() => setGiorni((gs) => [...gs, giornoVuoto(oggi, `g${Date.now()}`, gs[gs.length - 1])])}>
        <Plus className="mr-1 h-4 w-4" />Aggiungi un altro giorno
      </Button>
      {tentato && errori.length > 0 && <ul role="alert" className="list-disc pl-5 text-xs text-rose-700">{errori.map((e) => <li key={e}>{e}</li>)}</ul>}
      <DialogFooter>
        <Button variant="ghost" onClick={onFatto}>Annulla</Button>
        <Button disabled={salva.isPending || !!caricando} onClick={() => { setTentato(true); if (!errori.length) salva.mutate(); }}>
          {salva.isPending ? "Salvo…" : giorni.length === 1 ? "Salva il rapportino" : `Salva ${giorni.length} rapportini`}
        </Button>
      </DialogFooter>
    </div>
  );
}

function Blocco({ titolo, destra, children }: { titolo: string; destra?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{titolo}</p>
        {destra && <p className="text-xs tabular-nums text-muted-foreground">{destra}</p>}
      </div>
      {children}
    </div>
  );
}

/** Un elenco di righe «nome + valore»: si aggiunge da una tendina, si scrive il valore, si toglie. */
function RigheConValore({ etichetta, voci, valori, segnaposto, valoreNuovo, onCambia, extra }: {
  etichetta: string;
  voci: Array<{ id: string; nome: string; gruppo?: string; coda?: string }>;
  valori: Record<string, string>;
  segnaposto: string;
  valoreNuovo: string;
  onCambia: (v: Record<string, string>) => void;
  extra?: ReactNode;
}) {
  const libere = voci.filter((v) => !(v.id in valori));
  const gruppi = [...new Set(libere.map((v) => v.gruppo ?? ""))];
  return (
    <div className="space-y-1.5">
      {Object.keys(valori).length > 0 && (
        <ul className="divide-y rounded-md border">
          {Object.entries(valori).map(([id, v]) => {
            const voce = voci.find((x) => x.id === id);
            return (
              <li key={id} className="flex items-center gap-2 px-2 py-0.5">
                <span className="min-w-0 flex-1 truncate text-sm">{voce?.nome ?? "—"}</span>
                <Input value={v} inputMode="decimal" placeholder={segnaposto} aria-label={`${voce?.nome ?? etichetta}: ${segnaposto}`}
                  onChange={(e) => onCambia({ ...valori, [id]: e.target.value })} className="h-7 w-20 text-right" />
                {voce?.coda && <span className="w-8 text-xs text-muted-foreground">{voce.coda}</span>}
                <button type="button" aria-label={`Togli ${voce?.nome ?? etichetta}`} className="text-muted-foreground hover:text-rose-600"
                  onClick={() => { const n = { ...valori }; delete n[id]; onCambia(n); }}><X className="h-4 w-4" /></button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {libere.length > 0 && (
          <select value="" aria-label={`Aggiungi ${etichetta}`} onChange={(e) => { if (e.target.value) onCambia({ ...valori, [e.target.value]: valoreNuovo }); }}
            className="h-8 min-w-[12rem] flex-1 rounded-md border bg-background px-2 text-sm text-muted-foreground">
            <option value="">+ Aggiungi {etichetta}…</option>
            {gruppi.map((gr) => gr ? (
              <optgroup key={gr} label={gr}>
                {libere.filter((v) => v.gruppo === gr).map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </optgroup>
            ) : libere.filter((v) => !v.gruppo).map((v) => <option key={v.id} value={v.id}>{v.nome}</option>))}
          </select>
        )}
        {extra}
      </div>
    </div>
  );
}
