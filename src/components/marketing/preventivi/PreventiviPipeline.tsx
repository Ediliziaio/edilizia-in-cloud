import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ArrowRightLeft, Copy, ExternalLink, GripVertical, Mail, Phone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { pianoSpostamentoPreventivo } from "@/lib/preventivi/spostamentoPipeline";
import { formatCurrency } from "@/lib/formatters";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { STATO_UNIF_LABEL, TIPO_LABEL, type UnifiedRow, type UnifiedStato } from "./UnifiedPreventiviList";

const FASI: { id: UnifiedStato; colore: string }[] = [
  { id: "bozza", colore: "border-t-slate-400" }, { id: "in_corso", colore: "border-t-blue-500" },
  { id: "vinto", colore: "border-t-emerald-500" }, { id: "perso", colore: "border-t-rose-500" },
  { id: "altro", colore: "border-t-slate-300" },
];
type Props = {
  righe: UnifiedRow[]; selezionata: (id: string) => boolean; alterna: (id: string) => void;
  correlati: (riga: UnifiedRow) => void; puoModificare: boolean; puoEliminare: boolean;
  puoDuplicare: (riga: UnifiedRow) => boolean; inDuplicazione: string | null;
  duplica: (riga: UnifiedRow) => void; cestina: (riga: UnifiedRow) => void;
  sposta: (riga: UnifiedRow, destinazione: UnifiedStato) => Promise<void>;
};
type CardProps = Pick<Props, "selezionata" | "alterna" | "correlati" | "puoModificare" | "puoEliminare" | "puoDuplicare" | "inDuplicazione" | "duplica" | "cestina"> & {
  riga: UnifiedRow; richiedi: (riga: UnifiedRow, destinazione: UnifiedStato) => void;
};
function Scheda({ riga: r, selezionata, alterna, correlati, puoModificare, puoEliminare, puoDuplicare, inDuplicazione, duplica, cestina, richiedi }: CardProps) {
  const t = useT();
  const navigate = useNavigate();
  const id = `${r.tipo}:${r.id}`;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled: !puoModificare });
  const nome = r.cliente === "—" ? r.numero : r.cliente;
  const email = r.email?.trim();
  const telefono = r.telefono?.replace(/[^+0-9]/g, "");
  return <article ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), zIndex: isDragging ? 20 : undefined }} className={`relative rounded-lg border bg-white shadow-sm ${isDragging ? "opacity-75 shadow-lg" : ""}`}>
    <div className="flex items-start gap-2 px-2.5 pt-2.5">
      <Checkbox checked={selezionata(id)} onCheckedChange={() => alterna(id)} aria-label={t("Seleziona {nome}", { nome: r.numero })} className="mt-0.5" />
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => navigate(r.href)}>
        <span className="block truncate text-sm font-semibold text-slate-900" title={nome}>{nome}</span>
        <span className="block truncate text-xs text-muted-foreground">{r.numero} · {t(TIPO_LABEL[r.tipo].label)}</span>
        {r.titolo && <span className="mt-1 block line-clamp-2 text-xs text-slate-600">{r.titolo}</span>}
      </button>
      {puoModificare && <button type="button" {...attributes} {...listeners} className="cursor-grab rounded p-1 text-slate-400 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 active:cursor-grabbing" aria-label={t("Trascina {nome}", { nome: r.numero })}><GripVertical className="size-4" /></button>}
    </div>
    <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
      <span className="font-semibold tabular-nums">{r.totale != null ? formatCurrency(r.totale) : "—"}</span>
      {r.cliente !== "—" && <button type="button" onClick={() => correlati(r)} className="text-primary hover:underline">{t("Altri preventivi")}</button>}
    </div>
    <div className="flex items-center gap-0.5 border-t px-1.5 py-1 text-slate-500">
      <Button type="button" variant="ghost" size="icon" className="size-8" title={t("Apri preventivo")} aria-label={t("Apri {nome}", { nome: r.numero })} onClick={() => navigate(r.href)}><ExternalLink className="size-4" /></Button>
      {email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && <Button asChild variant="ghost" size="icon" className="size-8"><a href={`mailto:${encodeURIComponent(email)}`} title={t("Scrivi al cliente")} aria-label={t("Scrivi al cliente di {nome}", { nome: r.numero })}><Mail className="size-4" /></a></Button>}
      {telefono && /^\+?\d{5,}$/.test(telefono) && <Button asChild variant="ghost" size="icon" className="size-8"><a href={`tel:${telefono}`} title={t("Chiama il cliente")} aria-label={t("Chiama il cliente di {nome}", { nome: r.numero })}><Phone className="size-4" /></a></Button>}
      {puoDuplicare(r) && <Button type="button" variant="ghost" size="icon" className="size-8" title={t("Duplica")} aria-label={t("Duplica {nome}", { nome: r.numero })} disabled={inDuplicazione === r.id} onClick={() => duplica(r)}><Copy className="size-4" /></Button>}
      {puoModificare && <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-8" title={t("Sposta")} aria-label={t("Sposta {nome}", { nome: r.numero })}><ArrowRightLeft className="size-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start">{FASI.filter(f => f.id !== r.stato_unif && f.id !== "altro").map(f => <DropdownMenuItem key={f.id} onSelect={() => richiedi(r, f.id)}>{t(STATO_UNIF_LABEL[f.id].label)}</DropdownMenuItem>)}</DropdownMenuContent>
      </DropdownMenu>}
      {puoEliminare && <Button type="button" variant="ghost" size="icon" className="ml-auto size-8 hover:text-destructive" title={t("Elimina")} aria-label={t("Elimina {nome}", { nome: r.numero })} onClick={() => cestina(r)}><Trash2 className="size-4" /></Button>}
    </div>
  </article>;
}
function Colonna({ fase, righe, ...azioni }: Omit<Props, "righe" | "sposta"> & { fase: typeof FASI[number]; righe: UnifiedRow[]; richiedi: CardProps["richiedi"] }) {
  const t = useT();
  const [limite, setLimite] = useState(40);
  const { setNodeRef, isOver } = useDroppable({ id: `fase:${fase.id}` });
  const totale = righe.reduce((sum, r) => sum + (r.totale ?? 0), 0);
  return <section ref={setNodeRef} aria-label={t(STATO_UNIF_LABEL[fase.id].label)} className={`w-72 shrink-0 overflow-hidden rounded-xl border border-t-4 ${fase.colore} ${isOver ? "bg-blue-50 ring-2 ring-blue-300" : "bg-slate-50/80"}`}>
    <div className="border-b px-3 py-2.5"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-900">{t(STATO_UNIF_LABEL[fase.id].label)}</h3><span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium tabular-nums">{righe.length}</span></div><p className="mt-0.5 text-xs text-muted-foreground">{righe.length ? formatCurrency(totale) : t("Nessun preventivo")}</p></div>
    <div className="min-h-20 space-y-2 p-2">{righe.slice(0, limite).map(r => <Scheda key={`${r.tipo}:${r.id}`} riga={r} {...azioni} />)}
      {righe.length > limite && <Button variant="outline" size="sm" className="w-full" onClick={() => setLimite(n => n + 40)}>{t("Mostra altri")} ({righe.length - limite})</Button>}
    </div>
  </section>;
}
export function PreventiviPipeline({ righe, sposta, ...azioni }: Props) {
  const t = useT();
  const navigate = useNavigate();
  const [scelta, setScelta] = useState<{ riga: UnifiedRow; destinazione: UnifiedStato } | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const richiedi = (riga: UnifiedRow, destinazione: UnifiedStato) => {
    if (riga.stato_unif === destinazione) return;
    if (!pianoSpostamentoPreventivo(riga, destinazione)) {
      toast.info(t("Per questo passaggio apri il preventivo e segui il suo flusso."), { action: { label: t("Apri"), onClick: () => navigate(riga.href) } });
      return;
    }
    setScelta({ riga, destinazione });
  };
  const fineTrascinamento = ({ active, over }: DragEndEvent) => {
    const destinazione = String(over?.id ?? "").replace(/^fase:/, "") as UnifiedStato;
    const riga = righe.find(r => `${r.tipo}:${r.id}` === String(active.id));
    if (azioni.puoModificare && riga && FASI.some(f => f.id === destinazione)) richiedi(riga, destinazione);
  };
  const piano = scelta ? pianoSpostamentoPreventivo(scelta.riga, scelta.destinazione) : null;
  return <><DndContext sensors={sensors} onDragEnd={fineTrascinamento}>
    <div aria-label={t("Pipeline preventivi")} className="overflow-x-auto p-3"><p className="mb-2 text-xs text-muted-foreground">{t("Trascina una scheda o usa «Sposta». Le azioni che richiedono invio o firma si completano nel documento.")}</p>
      <div className="flex items-start gap-3">{FASI.map(fase => <Colonna key={fase.id} fase={fase} righe={righe.filter(r => r.stato_unif === fase.id)} {...azioni} richiedi={richiedi} />)}</div>
    </div>
  </DndContext>
  <AlertDialog open={!!scelta} onOpenChange={open => { if (!open && !salvataggio) setScelta(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{piano ? t(piano.descrizione) : ""}</AlertDialogTitle><AlertDialogDescription>{t("Confermi lo spostamento di {numero} in {fase}?", { numero: scelta?.riga.numero ?? "", fase: scelta ? t(STATO_UNIF_LABEL[scelta.destinazione].label) : "" })}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={salvataggio}>{t("Annulla")}</AlertDialogCancel><AlertDialogAction disabled={salvataggio} onClick={async e => { e.preventDefault(); if (!scelta) return; setSalvataggio(true); try { await sposta(scelta.riga, scelta.destinazione); setScelta(null); } catch { /* L’errore è mostrato dal salvataggio. */ } finally { setSalvataggio(false); } }}>{salvataggio ? t("Salvataggio…") : t("Conferma")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
