import { VerbaleTecnicoDialog } from "./VerbaleTecnicoDialog";
import {useVerbaliTecniciMezzo} from "@/hooks/useVerbaliTecniciMezzo";
import {usePermissions} from "@/hooks/usePermissions";
/**
 * Tagliandi e interventi di un mezzo, con il prossimo tagliando per data o per
 * km/ore. I km segnati su un intervento aggiornano quelli del mezzo (trigger
 * mezzi_aggiorna_contatore): non si scrivono in due posti.
 */
import { useMemo, useState } from "react";
import { Download, FileCheck2, Gauge, Loader2, Paperclip, Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  caricaFileMezzo, linkFileMezzo, rimuoviFileMezzo, useEliminaManutenzioneMezzo, useMezzoManutenzioni,
  useSalvaManutenzioneMezzo, type ManutenzioneInput,
} from "@/hooks/useMezzi";
import {
  STATO_SCADENZA_BADGE, TIPI_MANUTENZIONE, aggiungiGiorni, formatContatore, formatData, oggiIso,
  prossimoTagliando, tipoManutenzioneLabel, categoriaDocumentoLabel,vociPerClasse,
  type ContatoreUnita, type MezzoClasse, type MezzoManutenzione, type MezzoManutenzioneTipo,
} from "@/types/mezzi";

const euro = (n: number) => formatCurrency(n);

interface Props {
  mezzoId: string;
  companyId: string;
  contatoreAttuale: number | null;
  unita: ContatoreUnita;
  puoModificare: boolean;
  /** Per un attrezzo: manutenzione ordinaria, parti, tarature (niente tagliandi e gomme). */
  classe?: MezzoClasse;
  onVaiDocumenti?:()=>void;
}

export function MezzoManutenzioniSection({ mezzoId, companyId, contatoreAttuale, unita, puoModificare, classe = "mezzo",onVaiDocumenti }: Props) {
  const attrezzo = classe === "attrezzatura";
  const permessi=usePermissions();const registro=useVerbaliTecniciMezzo(companyId,mezzoId);const registrazioni=permessi.canViewMezzi?registro.data?.registrazioni||[]:[];
  const [verbale,setVerbale]=useState<MezzoManutenzione|null>(null);
  const { data: lista = [], isLoading, error, refetch } = useMezzoManutenzioni(mezzoId);
  const salva = useSalvaManutenzioneMezzo(mezzoId);
  const elimina = useEliminaManutenzioneMezzo();
  const oggi = oggiIso();

  const [aperto, setAperto] = useState(false);
  const [form, setForm] = useState<ManutenzioneInput>({});
  const [file, setFile] = useState<File | null>(null);
  const [caricamento, setCaricamento] = useState(false);
  const [daEliminare, setDaEliminare] = useState<MezzoManutenzione | null>(null);

  const prossimo = useMemo(() => prossimoTagliando(lista, contatoreAttuale, unita, oggi), [lista, contatoreAttuale, unita, oggi]);
  const costoUltimoAnno = useMemo(() => {
    const da = aggiungiGiorni(oggi, -365);
    return lista.filter((m) => m.data >= da && m.costo != null).reduce((tot, m) => tot + Number(m.costo), 0);
  }, [lista, oggi]);

  const set = <K extends keyof ManutenzioneInput>(k: K, v: ManutenzioneInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const nuovo = () => {
    setForm({ tipo: attrezzo ? "manutenzione_ordinaria" : "tagliando", data: oggi, contatore: contatoreAttuale });
    setFile(null);
    setAperto(true);
  };
  const modifica = (m: MezzoManutenzione) => {
    setForm({ ...m });
    setFile(null);
    setAperto(true);
  };

  const salvaIntervento = async () => {
    setCaricamento(true);
    let caricato: string | null = null;
    try {
      const patch: ManutenzioneInput = { ...form };
      if (file) {
        try {
          const up = await caricaFileMezzo(companyId, mezzoId, file);
          caricato = up.path;
          patch.file_path = up.path;
          patch.file_name = up.name;
        } catch (e) {
          toast.error(e instanceof Error ? `Non ho caricato il file: ${e.message}` : "Non ho caricato il file");
          return;
        }
      }
      await salva.mutateAsync(patch);
      setAperto(false);
    } catch {
      if (caricato) await rimuoviFileMezzo(caricato);
    } finally {
      setCaricamento(false);
    }
  };

  const apriFile = async (m: MezzoManutenzione) => {
    if (!m.file_path) return;
    const url = await linkFileMezzo(m.file_path);
    if (url) window.open(url, "_blank", "noopener");
    else toast.error("Il file non è disponibile. Riprova tra qualche secondo.");
  };

  const prossimoValido =
    form.prossimo_contatore == null || form.contatore == null || form.prossimo_contatore > form.contatore;
  const puoSalvare = !!form.data && prossimoValido && !caricamento && !salva.isPending;

  return (
    <div className="space-y-4">
      {verbale&&puoModificare&&<VerbaleTecnicoDialog key={verbale.id} companyId={companyId} mezzoId={mezzoId} manutenzioneId={verbale.id} onClose={()=>setVerbale(null)} onVaiDocumenti={onVaiDocumenti}/>}
      {permessi.canViewMezzi && registro.isError && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          Non riesco a leggere il registro delle copie tecniche.{' '}
          <button type="button" className="font-medium underline" onClick={() => registro.refetch()}>Riprova registro</button>
        </div>
      )}
      {registrazioni.length>0&&<details className="rounded-xl border bg-card p-3"><summary className="cursor-pointer text-sm font-medium">Registro delle copie tecniche · {registrazioni.length}</summary><ul className="mt-3 space-y-2">{registrazioni.map(r=><li key={r.id} className="rounded border p-3 text-sm"><p className="font-medium">{r.titolo}</p><p className="mt-1 text-xs text-muted-foreground">{categoriaDocumentoLabel(r.categoria)} · Intervento {r.data_intervento?`del ${formatData(r.data_intervento)}`:"di origine registrato"} · Copia registrata il {formatData(r.registrato_il.slice(0,10))}</p>{!r.disponibile&&<p className="mt-1 text-xs text-amber-900">Il documento registrato è stato rimosso o sostituito: controlla l’archivio.</p>}{!lista.some(m=>m.id===r.manutenzione_id)&&<p className="mt-1 text-xs text-muted-foreground">L’intervento di origine non è più nello storico operativo. Il riferimento della registrazione resta conservato.</p>}{onVaiDocumenti&&<Button type="button" size="sm" variant="link" className="mt-1 h-auto p-0 text-xs" onClick={onVaiDocumenti}>Vai ai documenti della macchina</Button>}</li>)}</ul></details>}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{attrezzo ? "Prossima manutenzione" : "Prossimo tagliando"}</p>
            {prossimo ? (
              <>
                <p className="mt-1 text-base font-semibold">
                  {[
                    prossimo.prossimaData ? `entro il ${formatData(prossimo.prossimaData)}` : null,
                    prossimo.prossimoContatore != null ? `a ${formatContatore(prossimo.prossimoContatore, unita)}` : null,
                  ].filter(Boolean).join(" o ")}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Adesso: {formatContatore(contatoreAttuale, unita)}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                {attrezzo
                  ? "Segna l'ultima manutenzione o taratura con quando va fatta la prossima: ti avvisiamo prima."
                  : "Segna l'ultimo tagliando con quando va fatto il prossimo: ti avvisiamo prima."}
              </p>
            )}
          </div>
          {prossimo && (
            <Badge variant="outline" className={`text-xs ${STATO_SCADENZA_BADGE[prossimo.stato].cls}`}>
              {STATO_SCADENZA_BADGE[prossimo.stato].label}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {lista.length > 0 && costoUltimoAnno > 0
            ? `Spesi ${euro(costoUltimoAnno)} negli ultimi 12 mesi.`
            : attrezzo ? "Manutenzioni, riparazioni, tarature: lo storico dell'attrezzo." : "Tagliandi, riparazioni, gomme: lo storico del mezzo."}
        </p>
        {puoModificare && (
          <Button size="sm" onClick={nuovo} className="shrink-0">
            <Plus className="mr-1 h-4 w-4" />Aggiungi
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Non riesco a caricare gli interventi.{" "}
          <button type="button" className="font-semibold underline" onClick={() => refetch()}>Riprova</button>
        </div>
      ) : lista.length === 0 ? (
        <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
          <Wrench className="mx-auto mb-2 h-8 w-8 opacity-40" />
          Nessun intervento registrato.
          {puoModificare && (
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={nuovo}><Plus className="mr-1 h-4 w-4" />{attrezzo ? "Segna un intervento" : "Segna un tagliando"}</Button>
            </div>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {lista.map((m) => (
            <li key={m.id} className="flex items-start gap-3 rounded-xl border bg-card p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium">{tipoManutenzioneLabel(m.tipo)}</span>
                  <span className="text-sm text-muted-foreground">{formatData(m.data)}</span>
                  {m.contatore != null && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Gauge className="h-3.5 w-3.5" aria-hidden="true" />{formatContatore(m.contatore, unita)}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[m.officina, m.costo != null ? euro(Number(m.costo)) : null, m.descrizione].filter(Boolean).join(" · ") || " "}
                </p>
                {registrazioni.some(r=>r.manutenzione_id===m.id)&&<p className="mt-1 text-xs text-muted-foreground">Copie tecniche registrate: {registrazioni.filter(r=>r.manutenzione_id===m.id).length}{onVaiDocumenti&&<Button type="button" variant="link" size="sm" className="ml-2 h-auto p-0 text-xs" onClick={onVaiDocumenti}>Vedi documenti</Button>}</p>}
                {(m.prossima_data || m.prossimo_contatore != null) && (
                  <p className="mt-0.5 text-xs text-foreground/70">
                    Prossimo: {[
                      m.prossima_data ? `entro il ${formatData(m.prossima_data)}` : null,
                      m.prossimo_contatore != null ? `a ${formatContatore(m.prossimo_contatore, unita)}` : null,
                    ].filter(Boolean).join(" o ")}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {m.file_path && (
                  <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => apriFile(m)} aria-label="Apri il file" title="Apri il file">
                    <Download className="h-4 w-4" />
                  </Button>
                )}
                {puoModificare && (
                  <>
                    {m.file_path&&<Button type="button" size="icon" variant="ghost" className="h-9 w-9" onClick={()=>setVerbale(m)} aria-label={`Registra verbale tecnico dell’intervento del ${formatData(m.data)}`} title="Registra verbale tecnico"><FileCheck2 className="h-4 w-4"/></Button>}
                    <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => modifica(m)} aria-label="Modifica" title="Modifica">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" onClick={() => setDaEliminare(m)} aria-label="Elimina" title="Elimina">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Modifica intervento" : "Nuovo intervento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="man-tipo">Tipo</Label>
                <Select value={form.tipo ?? "tagliando"} onValueChange={(v) => set("tipo", v as MezzoManutenzioneTipo)}>
                  <SelectTrigger id="man-tipo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {vociPerClasse(TIPI_MANUTENZIONE, classe, form.tipo).map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="man-data">Data</Label>
                <Input id="man-data" type="date" value={form.data ?? ""} onChange={(e) => set("data", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="man-contatore">{unita === "ore" ? "Ore di lavoro" : "Km"} al momento</Label>
                <Input
                  id="man-contatore"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={form.contatore ?? ""}
                  onChange={(e) => set("contatore", e.target.value === "" ? null : Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="man-costo">Costo (€)</Label>
                <Input
                  id="man-costo"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={form.costo ?? ""}
                  onChange={(e) => set("costo", e.target.value === "" ? null : Number(e.target.value))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="man-officina">Officina</Label>
              <Input id="man-officina" value={form.officina ?? ""} onChange={(e) => set("officina", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="man-descrizione">Cosa è stato fatto</Label>
              <Textarea id="man-descrizione" rows={2} value={form.descrizione ?? ""} onChange={(e) => set("descrizione", e.target.value)} placeholder="es. olio, filtri, pastiglie" />
            </div>

            <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
              <p className="text-sm font-medium">{attrezzo ? "Prossima manutenzione" : "Prossimo tagliando"}</p>
              <p className="text-xs text-muted-foreground">Basta uno dei due: ti avvisiamo a 30 giorni o a {unita === "ore" ? "50 ore" : "1.000 km"} dal traguardo.</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="man-prossima-data">Entro il</Label>
                  <Input id="man-prossima-data" type="date" value={form.prossima_data ?? ""} onChange={(e) => set("prossima_data", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="man-prossimo-contatore">O a {unita}</Label>
                  <Input
                    id="man-prossimo-contatore"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={form.prossimo_contatore ?? ""}
                    onChange={(e) => set("prossimo_contatore", e.target.value === "" ? null : Number(e.target.value))}
                  />
                </div>
              </div>
              {!prossimoValido && (
                <p className="text-sm text-red-700">{attrezzo ? "La prossima manutenzione" : "Il prossimo tagliando"} deve essere oltre i {unita} di oggi.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="man-file">
                Fattura o foto {form.file_name && <span className="text-xs text-muted-foreground">(ora: {form.file_name})</span>}
              </Label>
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Input id="man-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.heic" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAperto(false)}>Annulla</Button>
            <Button onClick={salvaIntervento} disabled={!puoSalvare}>
              {(caricamento || salva.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!daEliminare} onOpenChange={(o) => !o && setDaEliminare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare l'intervento?</AlertDialogTitle>
            <AlertDialogDescription>
              {daEliminare ? `${tipoManutenzioneLabel(daEliminare.tipo)} del ${formatData(daEliminare.data)}` : ""}. Si cancella anche il file allegato. I km del mezzo restano quelli di adesso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => daEliminare && elimina.mutate(daEliminare)}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
