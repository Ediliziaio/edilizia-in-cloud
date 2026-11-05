/**
 * «Esporta opportunità»: pipeline (questa o tutte), fasi, stati, periodo, colonne e formato.
 * Le colonne scelte e le esportazioni salvate («Persi del mese con il motivo») si ricordano
 * su questo computer, per azienda. L'Excel ha un foglio per fase e il riepilogo dei motivi.
 */
import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COLONNE_OPPORTUNITA, NOMI_DATA_PERIODO, type DataPeriodo } from "@/lib/opportunita/esportaOpportunita";

export type FormatoEsportazioneOpportunita = "xlsx" | "csv";
export interface SceltaDialog {
  fasi: Set<string>;
  stati: Set<string>;
  formato: FormatoEsportazioneOpportunita;
  tuttePipeline: boolean;
  periodo: { da: string; a: string; data: DataPeriodo } | null;
  /** Chiavi delle colonne; vuoto = tutte. Le colonne dei campi personalizzati: «cf». */
  colonne: Set<string>;
  /** Aggiunge le note e gli appuntamenti: colonne e, nell'Excel, un foglio per ciascuno. */
  note: boolean;
  appuntamenti: boolean;
}

interface Props {
  aperto: boolean;
  onChiudi: () => void;
  fasi: Array<{ id: string; name: string }>;
  nomePipeline?: string;
  piuPipeline: boolean;
  /** Quanti filtri della pagina sono attivi (si applicano anche all'esportazione). */
  filtriAttivi: number;
  inCorso: boolean;
  /** Per ricordare colonne ed esportazioni salvate (per azienda). */
  chiaveMemoria: string;
  onEsporta: (s: SceltaDialog) => void;
}

interface Salvata { nome: string; note?: boolean; appuntamenti?: boolean; stati: string[]; fasiNomi: string[]; tuttePipeline: boolean; periodo: { tipo: "mese_scorso" | "settimana_scorsa" | "anno" | "nessuno"; data: DataPeriodo }; colonne: string[]; formato: FormatoEsportazioneOpportunita }

const leggiMemoria = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const scriviMemoria = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* memoria del browser non disponibile: pazienza */ } };
const iso = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(d);

/** Il periodo relativo di un'esportazione salvata, calcolato oggi. */
export function periodoRelativo(tipo: Salvata["periodo"]["tipo"], oggi = new Date()): { da: string; a: string } | null {
  if (tipo === "nessuno") return null;
  if (tipo === "mese_scorso") {
    const inizio = new Date(oggi.getFullYear(), oggi.getMonth() - 1, 1), fine = new Date(oggi.getFullYear(), oggi.getMonth(), 0);
    return { da: iso(inizio), a: iso(fine) };
  }
  if (tipo === "anno") return { da: `${oggi.getFullYear()}-01-01`, a: iso(oggi) };
  // settimana scorsa: da lunedì a domenica
  const g = (oggi.getDay() + 6) % 7;
  const lun = new Date(oggi); lun.setDate(oggi.getDate() - g - 7);
  const dom = new Date(lun); dom.setDate(lun.getDate() + 6);
  return { da: iso(lun), a: iso(dom) };
}

export function EsportaOpportunitaDialog({ aperto, onChiudi, fasi, nomePipeline, piuPipeline, filtriAttivi, inCorso, chiaveMemoria, onEsporta }: Props) {
  const [scelteFasi, setScelteFasi] = useState<Set<string>>(new Set());
  const [stati, setStati] = useState<Set<string>>(new Set());
  const [formato, setFormato] = useState<FormatoEsportazioneOpportunita>("xlsx");
  const [tuttePipeline, setTuttePipeline] = useState(false);
  const [da, setDa] = useState("");
  const [a, setA] = useState("");
  const [dataPeriodo, setDataPeriodo] = useState<DataPeriodo>("chiusura");
  const [colonne, setColonne] = useState<Set<string>>(new Set());
  const [mostraColonne, setMostraColonne] = useState(false);
  const [salvate, setSalvate] = useState<Salvata[]>([]);
  const [nomeSalvata, setNomeSalvata] = useState("");
  const [note, setNote] = useState(false);
  const [appuntamenti, setAppuntamenti] = useState(false);
  const kColonne = `eic.esportaOpportunita.colonne.${chiaveMemoria}`;
  const kSalvate = `eic.esportaOpportunita.salvate.${chiaveMemoria}`;
  const kDettagli = `eic.esportaOpportunita.dettagli.${chiaveMemoria}`;

  useEffect(() => {
    if (!aperto) return;
    setScelteFasi(new Set()); setStati(new Set()); setDa(""); setA(""); setTuttePipeline(false);
    setColonne(new Set(leggiMemoria<string[]>(kColonne, [])));
    setSalvate(leggiMemoria<Salvata[]>(kSalvate, []));
    const dettagli = leggiMemoria<{ note?: boolean; appuntamenti?: boolean }>(kDettagli, {});
    setNote(!!dettagli.note); setAppuntamenti(!!dettagli.appuntamenti);
  }, [aperto, kColonne, kSalvate, kDettagli]);

  const alterna = (s: Set<string>, v: string, on: boolean) => { const n = new Set(s); if (on) n.add(v); else n.delete(v); return n; };
  const tutteLeColonne = useMemo(() => [...COLONNE_OPPORTUNITA.filter((c) => c.key !== "pipeline" || piuPipeline), { key: "cf", label: "Campi personalizzati" }], [piuPipeline]);

  const scelta = (): SceltaDialog => ({ note, appuntamenti, fasi: tuttePipeline ? new Set() : scelteFasi, stati, formato, tuttePipeline, periodo: da || a ? { da, a, data: dataPeriodo } : null, colonne });
  const esporta = () => { scriviMemoria(kColonne, [...colonne]); scriviMemoria(kDettagli, { note, appuntamenti }); onEsporta(scelta()); };
  const applica = (sv: Salvata) => {
    setStati(new Set(sv.stati)); setFormato(sv.formato); setTuttePipeline(sv.tuttePipeline && piuPipeline);
    setScelteFasi(new Set(fasi.filter((f) => sv.fasiNomi.includes(f.name)).map((f) => f.id)));
    setColonne(new Set(sv.colonne));
    setNote(!!sv.note); setAppuntamenti(!!sv.appuntamenti);
    const p = periodoRelativo(sv.periodo.tipo);
    setDa(p?.da ?? ""); setA(p?.a ?? ""); setDataPeriodo(sv.periodo.data);
  };
  const salva = () => {
    const nome = nomeSalvata.trim();
    if (!nome) return;
    // il periodo si salva come «relativo»: «mese scorso» resta il mese scorso anche fra un anno
    const oggi = new Date();
    const tipo = (["mese_scorso", "settimana_scorsa", "anno"] as const).find((t) => { const p = periodoRelativo(t, oggi); return p && p.da === da && p.a === a; }) ?? "nessuno";
    const nuova: Salvata = { nome, note, appuntamenti, stati: [...stati], fasiNomi: fasi.filter((f) => scelteFasi.has(f.id)).map((f) => f.name), tuttePipeline, periodo: { tipo, data: dataPeriodo }, colonne: [...colonne], formato };
    const elenco = [...salvate.filter((x) => x.nome !== nome), nuova].slice(-12);
    setSalvate(elenco); scriviMemoria(kSalvate, elenco); setNomeSalvata("");
  };
  const togli = (nome: string) => { const elenco = salvate.filter((x) => x.nome !== nome); setSalvate(elenco); scriviMemoria(kSalvate, elenco); };
  const periodoRapido = (t: "mese_scorso" | "settimana_scorsa" | "anno") => { const p = periodoRelativo(t)!; setDa(p.da); setA(p.a); };

  return (
    <Dialog open={aperto} onOpenChange={(v) => { if (!v && !inCorso) onChiudi(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Esporta opportunità</DialogTitle>
          <DialogDescription>Scegli cosa portare fuori: fasi, periodo, colonne, note e appuntamenti.</DialogDescription>
        </DialogHeader>

        {salvate.length > 0 && (
          <div className="space-y-1">
            <Label>Esportazioni salvate</Label>
            <div className="flex flex-wrap gap-1.5">
              {salvate.map((sv) => (
                <span key={sv.nome} className="flex items-center gap-1 rounded-full border bg-muted/40 pl-3 text-sm">
                  <button type="button" className="py-1 hover:underline" onClick={() => applica(sv)}>{sv.nome}</button>
                  <button type="button" aria-label={`Togli «${sv.nome}»`} className="rounded-full p-1 text-muted-foreground hover:text-destructive" onClick={() => togli(sv.nome)}><Trash2 className="h-3.5 w-3.5" /></button>
                </span>
              ))}
            </div>
          </div>
        )}

        {piuPipeline && (
          <div className="space-y-1">
            <Label>Pipeline</Label>
            <RadioGroup value={tuttePipeline ? "tutte" : "questa"} onValueChange={(v) => setTuttePipeline(v === "tutte")} className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="questa" />{nomePipeline ? `Solo «${nomePipeline}»` : "Questa pipeline"}</label>
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="tutte" />Tutte le pipeline</label>
            </RadioGroup>
          </div>
        )}

        {!tuttePipeline && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Fasi</Label>
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => setScelteFasi(scelteFasi.size ? new Set() : new Set(fasi.map((f) => f.id)))}>
                {scelteFasi.size ? "Tutte le fasi" : "Seleziona tutte"}
              </button>
            </div>
            <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
              {fasi.map((f) => (
                <label key={f.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                  <Checkbox checked={scelteFasi.has(f.id)} onCheckedChange={(v) => setScelteFasi((s) => alterna(s, f.id, !!v))} />
                  <span className="truncate">{f.name}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{scelteFasi.size ? `${scelteFasi.size} ${scelteFasi.size === 1 ? "fase scelta" : "fasi scelte"}.` : "Nessuna fase scelta: si esportano tutte."}</p>
          </div>
        )}

        <div className="space-y-2">
          <Label>Stato</Label>
          <div className="flex flex-wrap gap-3">
            {([["open", "Aperte"], ["won", "Vinte"], ["lost", "Perse"], ["abandoned", "Abbandonate"]] as const).map(([s, nome]) => (
              <label key={s} className="flex items-center gap-2 text-sm">
                <Checkbox checked={stati.has(s)} onCheckedChange={(v) => setStati((x) => alterna(x, s, !!v))} />
                {nome}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{stati.size ? "" : "Nessuno stato scelto: tutte. "}Solo «Perse» per l'elenco dei persi con il motivo.</p>
        </div>

        <div className="space-y-2">
          <Label>Periodo (facoltativo)</Label>
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-0.5 text-xs"><span className="text-muted-foreground">Dal</span><Input type="date" className="h-9 w-40" value={da} onChange={(e) => setDa(e.target.value)} /></label>
            <label className="space-y-0.5 text-xs"><span className="text-muted-foreground">Al</span><Input type="date" className="h-9 w-40" value={a} onChange={(e) => setA(e.target.value)} /></label>
            <Select value={dataPeriodo} onValueChange={(v) => setDataPeriodo(v as DataPeriodo)}>
              <SelectTrigger className="h-9 w-56" aria-label="Su quale data"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(NOMI_DATA_PERIODO) as DataPeriodo[]).map((k) => <SelectItem key={k} value={k}>per {NOMI_DATA_PERIODO[k]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <button type="button" className="rounded-full border px-2.5 py-0.5 hover:bg-muted" onClick={() => periodoRapido("settimana_scorsa")}>Settimana scorsa</button>
            <button type="button" className="rounded-full border px-2.5 py-0.5 hover:bg-muted" onClick={() => periodoRapido("mese_scorso")}>Mese scorso</button>
            <button type="button" className="rounded-full border px-2.5 py-0.5 hover:bg-muted" onClick={() => periodoRapido("anno")}>Quest'anno</button>
            {(da || a) && <button type="button" className="rounded-full px-2.5 py-0.5 text-muted-foreground hover:underline" onClick={() => { setDa(""); setA(""); }}>Nessun periodo</button>}
          </div>
          {(da || a) && dataPeriodo === "chiusura" && <p className="text-xs text-muted-foreground">Per data vinta o persa: le aperte restano fuori.</p>}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Colonne</Label>
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => setMostraColonne((v) => !v)}>{mostraColonne ? "Chiudi" : colonne.size ? `${colonne.size} scelte · cambia` : "Tutte · scegli"}</button>
          </div>
          {mostraColonne && (
            <div className="space-y-1 rounded-md border p-2">
              <div className="flex gap-3 text-xs">
                <button type="button" className="text-primary hover:underline" onClick={() => setColonne(new Set())}>Tutte</button>
                <button type="button" className="text-primary hover:underline" onClick={() => setColonne(new Set(["name", "contact", "stage", "status", "lost_cause", "lost_detail"]))}>Solo fase e motivo</button>
              </div>
              <div className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
                {tutteLeColonne.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted">
                    <Checkbox checked={!colonne.size || colonne.has(c.key)} onCheckedChange={(v) => setColonne((s) => alterna(s.size ? s : new Set(tutteLeColonne.map((x) => x.key)), c.key, !!v))} />
                    {c.label}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Le colonne scelte si ricordano per la prossima volta.</p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Aggiungi al file</Label>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={note} onCheckedChange={(v) => setNote(!!v)} />Note</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={appuntamenti} onCheckedChange={(v) => setAppuntamenti(!!v)} />Appuntamenti</label>
          </div>
          {(note || appuntamenti) && <p className="text-xs text-muted-foreground">Colonne con il riepilogo{formato === "xlsx" ? " e un foglio con una riga per ognuno" : ""}. Le note automatiche del sistema restano fuori.</p>}
        </div>

        <div className="space-y-2">
          <Label>Formato</Label>
          <RadioGroup value={formato} onValueChange={(v) => setFormato(v as FormatoEsportazioneOpportunita)} className="gap-2">
            <label className="flex items-start gap-2 text-sm"><RadioGroupItem value="xlsx" className="mt-0.5" /><span><span className="font-medium">Excel</span> — un foglio con tutte, uno per ogni fase e il riepilogo dei motivi di perdita</span></label>
            <label className="flex items-start gap-2 text-sm"><RadioGroupItem value="csv" className="mt-0.5" /><span><span className="font-medium">CSV</span> — un solo elenco</span></label>
          </RadioGroup>
        </div>

        {filtriAttivi > 0 && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">Valgono anche la ricerca e i {filtriAttivi === 1 ? "filtro attivo" : `${filtriAttivi} filtri attivi`} della pagina.</p>}

        <div className="flex flex-wrap items-end gap-2 border-t pt-3">
          <label className="flex-1 space-y-0.5 text-xs"><span className="text-muted-foreground">Salva queste scelte per rifarla con un clic</span>
            <Input className="h-9" placeholder="Es. Persi del mese con il motivo" value={nomeSalvata} maxLength={60} onChange={(e) => setNomeSalvata(e.target.value)} /></label>
          <Button variant="outline" size="sm" className="h-9" onClick={salva} disabled={!nomeSalvata.trim()}><Save className="mr-1.5 h-4 w-4" />Salva</Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onChiudi} disabled={inCorso}>Annulla</Button>
          <Button onClick={esporta} disabled={inCorso}>
            {inCorso ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Esporta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
