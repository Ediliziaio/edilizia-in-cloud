// src/components/orders/RapportiniUfficio.tsx
import { VociRapportinoUfficio } from "@/components/orders/VociRapportinoUfficio";
import { ArrivoRapportino } from "@/components/orders/ArrivoRapportino";
import { ARRIVI_VUOTI, mezzoStradale } from "@/lib/campo/arrivoRapportino";
import { usePermissions } from "@/hooks/usePermissions";
import { useMemo, useState, type ReactNode } from "react";
import { useCatalogoVociRapportino } from "@/hooks/useCatalogoVociRapportino";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Camera, Check, FileUp, Hammer, Loader2, NotebookPen, Plus, Sparkles, Trash2, Truck, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { CampiModulo } from "@/components/campo/CampiModulo";
import { useModuloRapportino } from "@/hooks/useModuliCantiere";
import { campiPerContesto } from "../../../supabase/functions/_shared/moduliCantiere";
import { useAuth } from "@/contexts/AuthContext";
import { useOrderWorkPhases } from "@/hooks/useOrderWorkPhases";
import { useSottofasi } from "@/hooks/useSottofasi";
import { useMezzi, useMezziDellaCommessa } from "@/hooks/useMezzi";
import { nomeAccesso, useAccessiCommessa } from "@/hooks/useAccessiCommessa";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import { refreshRapportinoQueries } from "@/lib/orders/refreshRapportinoQueries";
import { messaggioErrore } from "@/lib/orders/sottofasi";
import { giornoLocale } from "@/lib/orders/cronoprogramma";
import { compressImage } from "@/lib/campo/compressImage";
import { applicaParti, commessaDeiTrasporti, fasiDelGiorno, senzaViaggiVuoti, voceViaggioNuova, type TipoRapportinoUfficio,
  METEO, caricoRapportini, erroriGiorni, giornoDaLetto, giorniDaPeriodo, giornoVuoto,
  type GiornoUfficio, type PersonaPresenza, type RapportinoLetto,
} from "@/lib/campo/rapportiniUfficio";
import { OfficeSelect } from "./OfficeSelect";
import { Blocco } from "./BloccoTitolato";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

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
export function RapportiniUfficio({ orderId, className, aperta: apertaFuori, onApertaChange, senzaPulsante = false }: {
  orderId: string; className?: string;
  /** Aperto da fuori: il menu «Silvio AI» della commessa porta qui per i rapportini dai documenti. */
  aperta?: boolean; onApertaChange?: (v: boolean) => void;
  /** Solo la finestra: i pulsanti stanno nell'elenco dei rapportini (NuoviRapportiniUfficio). */
  senzaPulsante?: boolean;
}) {
  const t = useT();
  const [apertaDentro, setApertaDentro] = useState(false);
  const aperta = apertaFuori ?? apertaDentro;
  const setAperta = (v: boolean) => { setApertaDentro(v); onApertaChange?.(v); };
  return (
    <>
      {!senzaPulsante && (
        <Button variant="ghost" size="sm" className={cn("h-8", className)} onClick={() => setAperta(true)}>
          <NotebookPen className="mr-1.5 h-4 w-4" />{t("Scrivi rapportini")}
        </Button>
      )}
      <FinestraRapportiniUfficio orderId={orderId} aperta={aperta} onApertaChange={setAperta} />
    </>
  );
}

/**
 * I due pulsanti in testa all'elenco dei rapportini della commessa (25/11/2026): si parte già dal tipo giusto,
 * senza cercare «Scrivi rapportini» e poi la scelta dentro.
 */
export function NuoviRapportiniUfficio({ orderId }: { orderId: string }) {
  const t = useT();
  const { canViewCosts } = usePermissions();
  const [tipo, setTipo] = useState<TipoRapportinoUfficio | null>(null);
  return (
    <>
      <Button size="sm" className="h-9" onClick={() => setTipo("lavori")}>
        <Plus className="mr-1.5 h-4 w-4" />{t("Rapportino lavori")}
      </Button>
      <Button size="sm" variant="outline" className="h-9" onClick={() => setTipo("trasporti")} disabled={!canViewCosts}
        title={canViewCosts ? undefined : t("Serve il permesso Costi o Acquisti")}>
        <Truck className="mr-1.5 h-4 w-4" />{t("Rapportino trasporti")}
      </Button>
      <FinestraRapportiniUfficio key={tipo ?? "chiusa"} orderId={orderId} aperta={!!tipo} tipo={tipo ?? undefined}
        onApertaChange={(v) => { if (!v) setTipo(null); }} />
    </>
  );
}

function FinestraRapportiniUfficio({ orderId, aperta, onApertaChange, tipo }: {
  orderId: string; aperta: boolean; onApertaChange: (v: boolean) => void; tipo?: TipoRapportinoUfficio;
}) {
  const t = useT();
  return (
    <Dialog open={aperta} onOpenChange={onApertaChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("Rapportini dall'ufficio")}</DialogTitle>
          <DialogDescription>{t("Come quelli del cantiere, anche più giorni insieme. Entrano da approvare: all'approvazione le ore di ognuno diventano costo.")}</DialogDescription>
        </DialogHeader>
        {aperta && <Finestra orderId={orderId} tipoIniziale={tipo} onFatto={() => onApertaChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

const dbx = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

function Finestra({ orderId, onFatto, tipoIniziale }: { orderId: string; onFatto: () => void; tipoIniziale?: TipoRapportinoUfficio }) {
  const tr = useT();
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { canViewCosts } = usePermissions();
  // Le parti e i campi che l'azienda usa: l'ufficio vede tutti i campi, anche quelli solo del capo.
  const { schema: moduloCantiere } = useModuloRapportino(orderId);
  const parti = moduloCantiere.blocchi;
  const campiModulo = useMemo(() => campiPerContesto(moduloCantiere, { ruolo: "ufficio", momento: "giornaliero", subappaltatore: false, soloOre: false }), [moduloCantiere]);
  const oggi = giornoLocale(new Date().toISOString());
  const { phases, unassigned, employees } = useOrderWorkPhases(orderId);
  const { perFase: sottofasiDi } = useSottofasi(orderId);
  const { data: accessi = [] } = useAccessiCommessa(orderId);
  const mezziQuery = useMezzi();
  const tuttiMezzi = mezziQuery.data ?? [];
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
  // Commessa dei trasporti (24/11/2026): ogni giorno parte con la voce del viaggio, coi prezzi del catalogo.
  const commessa = useQuery({
    queryKey: ["rapportini-ufficio-commessa", orderId],
    queryFn: async () => {
      const { data, error } = await dbx.from("orders").select("description").eq("id", orderId).maybeSingle();
      if (error) throw error;
      return (data ?? null) as { description: string | null } | null;
    },
  });
  const catalogoVoci = useCatalogoVociRapportino(companyId, canViewCosts);
  // Lavori o trasporti (25/11/2026): si sceglie su ogni commessa; sulle commesse «TRASPORTI…» parte già su trasporti.
  // Il viaggio è una voce del rapportino: serve chi vede i costi (Costi o Acquisti), come per le altre voci.
  const [tipoScelto, setTipoScelto] = useState<TipoRapportinoUfficio | null>(tipoIniziale ?? null);
  const tipo: TipoRapportinoUfficio = tipoScelto ?? (canViewCosts && commessaDeiTrasporti(commessa.data?.description) ? "trasporti" : "lavori");
  const pronto = canViewCosts && commessa.isFetched && (catalogoVoci.isFetched || catalogoVoci.isError);
  const trasporti = pronto && tipo === "trasporti";
  const conViaggio = (g: GiornoUfficio): GiornoUfficio =>
    trasporti && !(g.voci ?? []).some((v) => v.viaggio) ? { ...g, voci: [voceViaggioNuova(crypto.randomUUID(), catalogoVoci.data?.voci ?? []), ...(g.voci ?? [])] } : g;
  // A ogni cambio di tipo: con «trasporti» i giorni senza viaggio lo ricevono, con «lavori» si tolgono i viaggi vuoti.
  const [tipoApplicato, setTipoApplicato] = useState<TipoRapportinoUfficio>("lavori");
  const [tentato, setTentato] = useState(false);
  const [caricando, setCaricando] = useState<string | null>(null);
  if (pronto && tipoApplicato !== tipo) {
    setTipoApplicato(tipo);
    setGiorni((gs) => gs.map(tipo === "trasporti" ? conViaggio : senzaViaggiVuoti));
  }
  const [periodo, setPeriodo] = useState<{ dal: string; al: string; feriali: boolean } | null>(null);
  const [lettura, setLettura] = useState<{ stato: "legge" } | { stato: "letto"; n: number; avvisi: string[] } | null>(null);
  // Il primo giorno ancora vuoto si sostituisce, invece di restare lì in cima.
  const soloVuoto = giorni.length === 1 && !giorni[0].descrizione.trim() && !Object.keys(giorni[0].presenze ?? {}).length;
  const nomiFasi = useMemo(() => new Map(phases.map((p) => [p.id, p.name])), [phases]);
  const giorniDaSalvare = useMemo(() => giorni.map((g) => applicaParti(g, parti)), [giorni, parti]);
  const errori = erroriGiorni(giorniDaSalvare, oggi, campiModulo, nomiFasi);
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
    if (falliti) toast.error(falliti === 1 ? tr("Una foto non è stata caricata") : tr("{n} foto non caricate", { n: falliti }));
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
        let messaggio = tr("Non sono riuscito a leggere i documenti. Riprova.");
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
      toast.error(e instanceof Error ? e.message : tr("Non sono riuscito a leggere i documenti."));
    }
  };

  const salva = useMutation({
    mutationFn: async () => {
      const carico = caricoRapportini(giorniDaSalvare, phases.map((p) => ({ id: p.id, percentuale: p.percentuale })), sottofasiDi,
        { persone, mezzi, materiali: articoli.data ?? [], campi: campiModulo, nomiFasi });
      const { data, error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(
        "ufficio_crea_rapportini", { p_order_id: orderId, p_rapportini: carico });
      if (error) throw error;
      return Number(data) || 0;
    },
    onSuccess: (n) => {
      refreshWorkQueries(qc, orderId);
      refreshRapportinoQueries(qc, orderId, companyId);
      void qc.invalidateQueries({ predicate: ({ queryKey }) => typeof queryKey[0] === "string" && queryKey[0].includes("rapportini") });
      toast.success(n === 1 ? tr("Rapportino scritto: è da approvare") : tr("{n} rapportini scritti: sono da approvare", { n }));
      onFatto();
    },
    onError: (e) => toast.error(messaggioErrore(e, tr("Rapportini non salvati. Riprova."))),
  });

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label={tr("Tipo di rapportino")} className="grid gap-2 sm:grid-cols-2">
        {([
          { v: "lavori" as const, icona: Hammer, titolo: tr("Rapportino lavori"), sotto: tr("Lavori, ore, mezzi e materiali della giornata") },
          { v: "trasporti" as const, icona: Truck, titolo: tr("Rapportino trasporti"),
            sotto: canViewCosts ? tr("Ogni giorno un viaggio: carico, scarico, mezzo, DDT, km") : tr("Serve il permesso Costi o Acquisti") },
        ]).map(({ v, icona: Icona, titolo, sotto }) => (
          <button key={v} type="button" role="radio" aria-checked={tipo === v} disabled={v === "trasporti" && !canViewCosts}
            onClick={() => setTipoScelto(v)}
            className={cn("flex items-start gap-2 rounded-lg border p-2.5 text-left disabled:cursor-not-allowed disabled:opacity-60",
              tipo === v ? "border-blue-600 bg-blue-50 text-blue-950" : "border-border hover:bg-slate-50")}>
            <Icona className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0"><span className="block text-sm font-medium">{titolo}</span>
              <span className="block text-xs text-muted-foreground">{sotto}</span></span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="h-8" aria-expanded={!!periodo}
          onClick={() => setPeriodo(periodo ? null : { dal: giorni[giorni.length - 1].data, al: oggi, feriali: true })}>
          <CalendarRange className="mr-1.5 h-4 w-4" />{tr("Più giorni insieme")}
        </Button>
        <label className={cn("inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-sm hover:bg-slate-50", lettura?.stato === "legge" && "pointer-events-none opacity-60")}>
          {lettura?.stato === "legge" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4 text-violet-600" />}
          {lettura?.stato === "legge" ? tr("Leggo i documenti…") : tr("Leggi da documenti")}
          <input type="file" multiple className="sr-only" aria-label={tr("Documenti da leggere")}
            accept="image/*,application/pdf,.pdf,.xlsx,.xlsm,.csv,.txt"
            onChange={(e) => { void leggiDocumenti(e.target.files); e.target.value = ""; }} />
        </label>
        <span className="text-xs text-muted-foreground">{tr("Foto di rapportini di carta, fogli presenze, PDF, Excel: fino a 5 file.")}</span>
      </div>
      {periodo && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
          <label className="grid gap-1 text-xs text-muted-foreground">{tr("Dal")}
            <Input type="date" max={oggi} value={periodo.dal} onChange={(e) => setPeriodo({ ...periodo, dal: e.target.value })} className="h-9 w-40" aria-label={tr("Periodo dal")} />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">{tr("Al")}
            <Input type="date" max={oggi} value={periodo.al} onChange={(e) => setPeriodo({ ...periodo, al: e.target.value })} className="h-9 w-40" aria-label={tr("Periodo al")} />
          </label>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input type="checkbox" checked={periodo.feriali} onChange={(e) => setPeriodo({ ...periodo, feriali: e.target.checked })} />
            {tr("Senza sabato e domenica")}
          </label>
          <Button type="button" size="sm" className="h-9" disabled={!daPeriodo.length} onClick={creaPeriodo}>
            {daPeriodo.length ? tr(daPeriodo.length === 1 ? "Crea {n} giorno" : "Crea {n} giorni", { n: daPeriodo.length }) : tr("Nessun giorno nel periodo")}
          </Button>
          <p className="w-full text-xs text-muted-foreground">{tr("Ogni giorno prende lo stesso lavoro, le stesse fasi, persone e mezzi dell'ultimo rapportino qui sotto: poi correggi i giorni diversi.")}</p>
        </div>
      )}
      {lettura?.stato === "letto" && (
        <div role="status" className="space-y-1 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950">
          <p className="flex items-center gap-1.5 font-medium"><FileUp className="h-4 w-4" />
            {lettura.n ? tr(lettura.n === 1 ? "Letti {n} rapportino dai documenti: controllali prima di salvare." : "Letti {n} rapportini dai documenti: controllali prima di salvare.", { n: lettura.n }) : tr("Nei documenti non ho trovato rapportini da creare.")}
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
          <section key={g.chiave} aria-label={tr("Rapportino {n}", { n: i + 1 })} className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-xs text-muted-foreground">{tr("Giorno")}
                <Input type="date" max={oggi} value={g.data} onChange={(e) => cambia(g.chiave, { data: e.target.value })} className="h-9 w-40" aria-label={tr("Giorno del rapportino {n}", { n: i + 1 })} />
              </label>
              <label className="grid min-w-[11rem] flex-1 gap-1 text-xs text-muted-foreground">{tr("A nome di")}
                <OfficeSelect value={g.autore} onValueChange={(v) => cambia(g.chiave, { autore: v })} label={tr("A nome di, rapportino {n}", { n: i + 1 })}
                  className="h-9 text-foreground"
                  options={[{ value: "", label: tr("Ufficio (chi scrive)") }, ...autori.map((a) => ({ value: a.user_id, label: `${nomeAccesso(a)}${a.is_capocantiere ? ` · ${tr("capocantiere")}` : ""}` }))]} />
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">{tr("Meteo")}
                <OfficeSelect value={g.meteo ?? ""} onValueChange={(v) => cambia(g.chiave, { meteo: v })} label={tr("Meteo, rapportino {n}", { n: i + 1 })}
                  className="h-9 text-foreground"
                  options={[{ value: "", label: "—" }, ...METEO.map((m) => ({ value: m.value, label: tr(m.label) }))]} />
              </label>
              {giorni.length > 1 && (
                <Button variant="ghost" size="icon" className="h-9 w-9 text-rose-600" aria-label={tr("Togli il rapportino {n}", { n: i + 1 })} onClick={() => setGiorni((gs) => gs.filter((x) => x.chiave !== g.chiave))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            <label className="grid gap-1 text-xs text-muted-foreground">{tr("Cosa si è fatto")}
              <Textarea rows={2} maxLength={4000} value={g.descrizione} onChange={(e) => cambia(g.chiave, { descrizione: e.target.value })}
                placeholder={tr("Es. smontaggio manto lato nord, posa guaina")} aria-label={tr("Cosa si è fatto, rapportino {n}", { n: i + 1 })} />
            </label>

            {parti.fasi && phases.length > 0 && (
              <Blocco titolo={tr("Fasi lavorate")}>
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
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">{tr("Avanzamento")}
                            <Input type="number" min={0} max={100} className="h-8 w-20" aria-label={tr("Avanzamento di {nome}", { nome: fase?.name ?? "" })}
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
                                <button type="button" aria-pressed={stato === "lavorata"} aria-label={tr("{nome}: lavorata", { nome: s.name })} onClick={() => imposta("lavorata")}
                                  className={cn("flex items-center gap-1 rounded-md border px-2 py-1", stato === "lavorata" ? "border-blue-600 bg-blue-50 text-blue-900" : "border-border text-muted-foreground")}>
                                  <Hammer className="h-3.5 w-3.5" />{tr("Lavorata")}
                                </button>
                                <button type="button" aria-pressed={stato === "finita"} aria-label={tr("{nome}: finita", { nome: s.name })} onClick={() => imposta("finita")}
                                  className={cn("flex items-center gap-1 rounded-md border px-2 py-1", stato === "finita" ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-border text-muted-foreground")}>
                                  <Check className="h-3.5 w-3.5" />{tr("Finita")}
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

            <Blocco titolo={tr("Chi ha lavorato")} destra={oreTotali > 0 ? tr("{n} ore", { n: oreTotali.toLocaleString(intlCampo()) }) : undefined}>
              <RigheConValore
                etichetta={tr("persona")}
                voci={persone.map((p) => ({ id: p.chiave, nome: p.nome, gruppo: p.subappaltatore_id ? tr("Ditte") : p.employee_id && assegnati.has(p.employee_id) ? tr("Su questa commessa") : tr("Altri dipendenti") }))}
                valori={presenze}
                segnaposto={tr("ore")}
                valoreNuovo="8"
                onCambia={(v) => cambia(g.chiave, { presenze: v })}
                extra={proposti.length > 0 && (
                  <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => cambia(g.chiave, {
                    presenze: { ...presenze, ...Object.fromEntries(proposti.map((p) => [p.chiave, "8"])) },
                  })}>
                    <Users className="mr-1 h-3.5 w-3.5" />{sulleFasi.size ? tr("Chi lavora sulle fasi scelte") : tr("Tutti quelli della commessa")} ({proposti.length})
                  </Button>
                )}
              />
            </Blocco>

            {parti.mezzi && <ArrivoRapportino valore={g.arrivo ?? ARRIVI_VUOTI} onChange={arrivo => cambia(g.chiave, { arrivo })}
              mezzi={tuttiMezzi.filter(mezzoStradale)} suggeriti={tuttiMezzi.filter(m =>
                Object.hasOwn(g.mezzi ?? {}, m.id) || (g.data === oggi && idQui.has(m.id))).map(m => m.id)}
              caricamento={mezziQuery.isLoading} errore={mezziQuery.isError}
              riprova={() => void mezziQuery.refetch()} />}

            {parti.mezzi && <Blocco titolo={tr("Mezzi e attrezzi usati")}>
              <RigheConValore etichetta={tr("mezzo")} voci={mezzi.map((m) => ({ id: m.id, nome: m.nome, gruppo: m.qui ? tr("Su questo cantiere") : tr("Altri del parco") }))}
                valori={g.mezzi ?? {}} segnaposto={tr("ore (facolt.)")} valoreNuovo="" onCambia={(v) => cambia(g.chiave, { mezzi: v })} />
            </Blocco>}

            {parti.materiali && (articoli.data?.length ?? 0) > 0 && (
              <Blocco titolo={tr("Materiali usati")}>
                <RigheConValore etichetta={tr("materiale")} voci={(articoli.data ?? []).map((a) => ({ id: a.id, nome: a.nome, coda: a.unita ?? undefined }))}
                  valori={g.materiali ?? {}} segnaposto={tr("quantità")} valoreNuovo="1" onCambia={(v) => cambia(g.chiave, { materiali: v })} />
              </Blocco>
            )}

            {canViewCosts && (
              <Blocco titolo={tr("Voci e costi")}>
                <VociRapportinoUfficio companyId={companyId} orderId={orderId} giorno={g.data} voci={g.voci ?? []} onCambia={(voci) => setGiorni((p) => p.map((x) => (x.chiave === g.chiave ? { ...x, voci } : x)))} />
              </Blocco>
            )}
            {campiModulo.length > 0 && <Blocco titolo={tr("Altre informazioni")}>
              <div className="space-y-3">
                <CampiModulo campi={campiModulo.filter((c) => c.livello !== "fase" || !parti.fasi || g.fasi.length === 0)} valori={g.campi ?? {}} mostraErrori={tentato}
                  onChange={(k, v) => cambia(g.chiave, { campi: { ...(g.campi ?? {}), [k]: v } })} />
                {campiModulo.some((c) => c.livello === "fase") && fasiDelGiorno(applicaParti(g, parti), nomiFasi).map((f) => (
                  <div key={f.id} className="space-y-1.5 rounded-md border p-2">
                    <p className="text-xs font-medium">{f.nome}</p>
                    <CampiModulo campi={campiModulo.filter((c) => c.livello === "fase")} phaseId={f.id} valori={g.campi ?? {}} mostraErrori={tentato}
                      onChange={(k, v) => cambia(g.chiave, { campi: { ...(g.campi ?? {}), [k]: v } })} />
                  </div>
                ))}
              </div>
            </Blocco>}

            {parti.foto && <Blocco titolo={tr("Foto")}>
              <div className="flex flex-wrap items-center gap-2">
                {(g.foto ?? []).map((u) => (
                  <div key={u} className="relative h-16 w-16 overflow-hidden rounded-md border">
                    <img src={u} alt="" className="h-full w-full object-cover" />
                    <button type="button" aria-label={tr("Togli la foto")} onClick={() => cambia(g.chiave, { foto: (g.foto ?? []).filter((x) => x !== u) })}
                      className="absolute right-0.5 top-0.5 rounded-full bg-white/90 p-0.5 text-slate-700"><X className="h-3 w-3" /></button>
                  </div>
                ))}
                <label className={cn("flex h-16 cursor-pointer items-center gap-1.5 rounded-md border border-dashed px-3 text-xs text-muted-foreground hover:bg-slate-50", caricando === g.chiave && "pointer-events-none opacity-60")}>
                  {caricando === g.chiave ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  {caricando === g.chiave ? tr("Carico…") : tr("Aggiungi foto")}
                  <input type="file" accept="image/*" multiple className="sr-only" aria-label={tr("Foto, rapportino {n}", { n: i + 1 })}
                    onChange={(e) => { void caricaFoto(g, e.target.files); e.target.value = ""; }} />
                </label>
              </div>
            </Blocco>}

            <label className="grid gap-1 text-xs text-muted-foreground">{tr("Note (facoltative)")}
              <Input value={g.note} maxLength={4000} onChange={(e) => cambia(g.chiave, { note: e.target.value })} aria-label={tr("Note, rapportino {n}", { n: i + 1 })} />
            </label>
          </section>
        );
      })}
      <Button variant="outline" size="sm" disabled={giorni.length >= 31}
        onClick={() => setGiorni((gs) => [...gs, conViaggio(giornoVuoto(oggi, `g${Date.now()}`, gs[gs.length - 1]))])}>
        <Plus className="mr-1 h-4 w-4" />{tr("Aggiungi un altro giorno")}
      </Button>
      {tentato && errori.length > 0 && <ul role="alert" className="list-disc pl-5 text-xs text-rose-700">{errori.map((e) => <li key={e}>{e}</li>)}</ul>}
      <DialogFooter>
        <Button variant="ghost" onClick={onFatto}>{tr("Annulla")}</Button>
        <Button disabled={salva.isPending || !!caricando} onClick={() => { setTentato(true); if (!errori.length) salva.mutate(); }}>
          {salva.isPending ? tr("Salvo…") : giorni.length === 1 ? tr("Salva il rapportino") : tr("Salva {n} rapportini", { n: giorni.length })}
        </Button>
      </DialogFooter>
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
  const t = useT();
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
                <button type="button" aria-label={t("Togli {nome}", { nome: voce?.nome ?? etichetta })} className="text-muted-foreground hover:text-rose-600"
                  onClick={() => { const n = { ...valori }; delete n[id]; onCambia(n); }}><X className="h-4 w-4" /></button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {libere.length > 0 && (
          <OfficeSelect value="" label={t("Aggiungi {cosa}", { cosa: etichetta })} onValueChange={(v) => { if (v) onCambia({ ...valori, [v]: valoreNuovo }); }}
            className="h-8 min-w-[12rem] flex-1 text-muted-foreground"
            placeholder={t("+ Aggiungi {cosa}…", { cosa: etichetta })}
            options={gruppi.flatMap((gr) => gr
              ? libere.filter((v) => v.gruppo === gr).map((v) => ({ value: v.id, label: v.nome, group: gr }))
              : libere.filter((v) => !v.gruppo).map((v) => ({ value: v.id, label: v.nome })))}
          />
        )}
        {extra}
      </div>
    </div>
  );
}
