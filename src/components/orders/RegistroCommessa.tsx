import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Download, FilePlus2, History, Pencil, Search, Trash2, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exportToCSV, exportToXLSX, type CsvColumn } from "@/lib/csvExport";
import { filtraRegistro, perGiorno, personeRegistro, righeEsportazione, type TipoVoce, type VoceRegistro } from "@/lib/orders/registroCommessa";
import { cn } from "@/lib/utils";

const TUTTI = "__tutti__";
const PASSO = 200;

const TIPI: Array<{ value: TipoVoce; label: string }> = [
  { value: "creato", label: "Creato" },
  { value: "modificato", label: "Modificato" },
  { value: "eliminato", label: "Eliminato" },
  { value: "evento", label: "Documenti ed eventi" },
  { value: "messaggio", label: "Messaggi" },
];

const COLONNE: CsvColumn[] = [
  { key: "quando", label: "Quando" },
  { key: "chi", label: "Chi" },
  { key: "azione", label: "Azione" },
  { key: "oggetto", label: "Su cosa" },
  { key: "dettagli", label: "Cosa è cambiato" },
  { key: "area", label: "Area" },
];

const MAX_DETTAGLI_LENGTH = 500;
const truncateDettagli = (t: string) => (t.length > MAX_DETTAGLI_LENGTH ? `${t.slice(0, MAX_DETTAGLI_LENGTH)}…` : t);

function IconaTipo({ tipo }: { tipo: TipoVoce }) {
  const Icona = tipo === "creato" ? FilePlus2 : tipo === "eliminato" ? Trash2 : tipo === "modificato" ? Pencil : History;
  return (
    <Icona aria-hidden className={cn("mt-0.5 h-3.5 w-3.5 shrink-0",
      tipo === "creato" && "text-emerald-600",
      tipo === "eliminato" && "text-red-600",
      tipo === "modificato" && "text-blue-600",
      (tipo === "evento" || tipo === "messaggio") && "text-slate-400")} />
  );
}

/** Una riga sola quando basta: ora, chi, cosa, su cosa. Le modifiche vanno sotto. */
function RigaVoce({ voce }: { voce: VoceRegistro }) {
  return (
    <li className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-2 px-3 py-1 text-xs hover:bg-muted/40 sm:grid-cols-[2.5rem_9.5rem_minmax(0,1fr)_auto]">
      <span className="tabular-nums leading-5 text-muted-foreground">{format(parseISO(voce.quando), "HH:mm")}</span>
      <span className={cn("truncate font-medium leading-5", voce.senzaPersona && "font-normal italic text-muted-foreground")} title={voce.chi}>{voce.chi}</span>
      <div className="col-start-2 flex min-w-0 gap-1.5 sm:col-start-3">
        <IconaTipo tipo={voce.tipo} />
        <div className="min-w-0 leading-5">
          <p className="truncate" title={voce.oggetto ? `${voce.titolo} · ${voce.oggetto}` : voce.titolo}>
            <span className={cn(voce.tipo === "eliminato" && "font-medium text-red-700")}>{voce.titolo}</span>
            {voce.volte > 1 && <span className="text-muted-foreground"> ({voce.volte} volte)</span>}
            {voce.oggetto && <span className="text-muted-foreground"> · {voce.oggetto}</span>}
          </p>
          {voce.dettagli.length > 0 && <p className="break-words text-foreground/80">{voce.dettagli.join(" · ")}</p>}
        </div>
      </div>
      <span className="hidden whitespace-nowrap leading-5 text-[10px] text-muted-foreground sm:block">{voce.area}</span>
    </li>
  );
}

interface Props {
  voci: VoceRegistro[];
  nomeFile: string;
  titoloCommessa: string;
}

/** Sola lettura: da qui non si scrive e non si manda niente. */
export function RegistroCommessa({ voci, nomeFile, titoloCommessa }: Props) {
  const [persona, setPersona] = useState<string | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoVoce | null>(null);
  const [dal, setDal] = useState("");
  const [al, setAl] = useState("");
  const [testo, setTesto] = useState("");
  const [mostrate, setMostrate] = useState(PASSO);

  const persone = useMemo(() => personeRegistro(voci), [voci]);
  const areeUsate = useMemo(() => [...new Set(voci.map((v) => v.area))].sort(), [voci]);
  const filtrate = useMemo(() => filtraRegistro(voci, { persona, area, tipo, dal, al, testo }), [voci, persona, area, tipo, dal, al, testo]);
  const giorni = useMemo(() => perGiorno(filtrate.slice(0, mostrate)), [filtrate, mostrate]);
  const haFiltri = !!(persona || area || tipo || dal || al || testo);

  const azzera = () => { setPersona(null); setArea(null); setTipo(null); setDal(""); setAl(""); setTesto(""); setMostrate(PASSO); };

  const esportaPdf = async () => {
    const rows = righeEsportazione(filtrate);
    if (rows.length === 0) { toast.error("Nessuna voce da esportare"); return; }
    try {
      const jsPDFModule = await import("jspdf");
      const jsPDF = jsPDFModule.default ?? (jsPDFModule as typeof jsPDFModule & { jsPDF?: typeof jsPDFModule.default }).jsPDF!;
      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 42;
      let y = 48;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("Registro attività", margin, y);
      y += 16;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(doc.splitTextToSize(titoloCommessa, pageWidth - margin * 2)[0], margin, y);
      y += 12;
      doc.text(`Esportato il ${format(new Date(), "dd/MM/yyyy HH:mm")} - ${rows.length} voci`, margin, y);
      y += 22;
      rows.forEach((row, index) => {
        const block = [
          `${row.quando} - ${row.chi} ${row.azione}`,
          row.oggetto,
          row.dettagli ? truncateDettagli(row.dettagli) : "",
        ].filter(Boolean);
        const lines: string[] = block.flatMap((line) => doc.splitTextToSize(line, pageWidth - margin * 2));
        const blockHeight = lines.length * 12 + 12;
        if (y + blockHeight > pageHeight - 48) { doc.addPage(); y = 48; }
        if (index % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin - 8, y - 11, pageWidth - margin * 2 + 16, blockHeight, "F");
        }
        doc.setFont("helvetica", "bold");
        doc.text(lines[0], margin, y);
        y += 12;
        doc.setFont("helvetica", "normal");
        lines.slice(1).forEach((line) => {
          // Un blocco più alto di una pagina non deve uscire dal foglio.
          if (y > pageHeight - 48) { doc.addPage(); y = 48; }
          doc.text(line, margin, y);
          y += 12;
        });
        y += 8;
      });
      doc.save(`${nomeFile}.pdf`);
      toast.success(`PDF esportato — ${rows.length} voci`);
    } catch {
      toast.error("Errore durante l'export PDF");
    }
  };

  return (
    <div className="space-y-3">
      {/* Chi ha lavorato su questa commessa: un clic e restano solo le sue azioni. */}
      <div className="flex flex-wrap gap-1.5">
        {persone.slice(0, 12).map((p) => (
          <button
            key={p.nome}
            type="button"
            onClick={() => { setPersona(persona === p.nome ? null : p.nome); setMostrate(PASSO); }}
            className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
              persona === p.nome ? "border-primary bg-primary/10 font-medium text-primary" : "bg-background hover:bg-muted",
              p.senzaPersona && "italic text-muted-foreground")}
            title={`Ultima azione: ${format(parseISO(p.ultima), "dd/MM/yyyy HH:mm")}`}
          >
            <UserRound className="h-3 w-3" />
            {p.nome}
            <span className="tabular-nums text-muted-foreground">{p.azioni}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={testo} onChange={(e) => { setTesto(e.target.value); setMostrate(PASSO); }} placeholder="Cerca: un articolo, un importo, un nome…" aria-label="Cerca nel registro" className="h-8 pl-7 text-xs" />
        </div>
        <Select value={persona ?? TUTTI} onValueChange={(v) => setPersona(v === TUTTI ? null : v)}>
          <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Persona"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TUTTI}>Tutte le persone</SelectItem>
            {persone.map((p) => <SelectItem key={p.nome} value={p.nome}>{p.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={area ?? TUTTI} onValueChange={(v) => setArea(v === TUTTI ? null : v)}>
          <SelectTrigger className="h-8 w-[160px] text-xs" aria-label="Area"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TUTTI}>Tutte le aree</SelectItem>
            {areeUsate.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tipo ?? TUTTI} onValueChange={(v) => setTipo(v === TUTTI ? null : (v as TipoVoce))}>
          <SelectTrigger className="h-8 w-[140px] text-xs" aria-label="Azione"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TUTTI}>Tutte le azioni</SelectItem>
            {TIPI.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={dal} onChange={(e) => setDal(e.target.value)} aria-label="Dal giorno" className="h-8 w-[130px] text-xs" />
        <Input type="date" value={al} onChange={(e) => setAl(e.target.value)} aria-label="Al giorno" className="h-8 w-[130px] text-xs" />
        {haFiltri && (
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={azzera}>
            <X className="mr-1 h-3.5 w-3.5" />Azzera
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{filtrate.length}</span> {filtrate.length === 1 ? "azione" : "azioni"}{haFiltri ? ` su ${voci.length}` : ""}
        </p>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { exportToCSV(righeEsportazione(filtrate), COLONNE, `${nomeFile}.csv`); }}><Download className="mr-1 h-3 w-3" />CSV</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { void exportToXLSX(righeEsportazione(filtrate), COLONNE, `${nomeFile}.xlsx`); }}><Download className="mr-1 h-3 w-3" />Excel</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { void esportaPdf(); }}><Download className="mr-1 h-3 w-3" />PDF</Button>
        </div>
      </div>

      {filtrate.length === 0 ? (
        <div className="rounded-lg border bg-background py-10 text-center text-sm text-muted-foreground">
          {voci.length === 0 ? "Nessuna azione registrata su questa commessa." : "Nessuna azione con questi filtri."}
        </div>
      ) : (
        <div className="rounded-lg border bg-background">
          {giorni.map((g) => (
            <section key={g.giorno}>
              <h3 className="sticky top-0 z-10 border-b bg-muted/60 px-3 py-1 text-xs font-medium capitalize backdrop-blur">
                {format(parseISO(g.giorno), "EEEE d MMMM yyyy", { locale: it })}
                <span className="ml-1.5 font-normal text-muted-foreground">{g.voci.length}</span>
              </h3>
              <ul className="divide-y divide-border/50">
                {g.voci.map((v) => <RigaVoce key={v.id} voce={v} />)}
              </ul>
            </section>
          ))}
        </div>
      )}
      {filtrate.length > mostrate && (
        <div className="text-center">
          <Button variant="outline" size="sm" onClick={() => setMostrate(mostrate + PASSO)}>Mostra altre {Math.min(PASSO, filtrate.length - mostrate)}</Button>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        I valori prima e dopo ci sono dal 2 novembre 2026; da quel giorno sono registrati anche articoli, rate, documenti e ditte. Prima si vede chi ha modificato e quali campi. Le azioni automatiche non hanno una persona.
      </p>
    </div>
  );
}
