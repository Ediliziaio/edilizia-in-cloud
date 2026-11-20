import { useRef, useState, type DragEvent } from "react";
import { AlertCircle, CheckCircle2, Loader2, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { UniformSelect } from "@/components/ui/uniform-select";
import { caricaAllegatoConProgresso, oggettoGiaCaricato } from "@/lib/commesse/caricaAllegatoConProgresso";
import { ACCEPT_INPUT, estensione, problemaFile } from "@/lib/commesse/documentiCommessa";
import { SMART_ACCEPTED_EXT, SMART_IMPORT_MAX_SIZE } from "@/lib/documenti/smartDocumentImport";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const BUCKET = "eic-drive";
type Stato = "attesa" | "invio" | "salvataggio" | "salvato" | "errore";
interface Voce { id: string; file: File; stato: Stato; percentuale: number; errore?: string }
interface Trasferimento { inviato: boolean; tentato: boolean; destinazione?: { folder_id: string | null; shared: boolean } }
interface Props {
  open: boolean;
  companyId: string;
  userId: string;
  iniziali: File[];
  cartelle: { id: string; name: string }[];
  cartellaIniziale: string | null;
  onClose: () => void;
  onArchiviati: (folderId: string | null) => void;
  onAnalizza: (file: File) => void;
  analizzati: ReadonlySet<File>;
}

const prepara = (files: File[]): Voce[] => files.filter(file => !problemaFile(file)).map(file => ({
  id: crypto.randomUUID(), file, stato: "attesa", percentuale: 0,
}));

function analizzabile(file: File) {
  const ext = estensione(file.name);
  return file.size <= SMART_IMPORT_MAX_SIZE && SMART_ACCEPTED_EXT.some(ammessa => ammessa.replace(/^\./, "") === ext);
}

export function CaricaFileDriveDialog({ open, companyId, userId, iniziali, cartelle, cartellaIniziale, onClose, onArchiviati, onAnalizza, analizzati }: Props) {
  const [voci, setVoci] = useState(() => prepara(iniziali));
  const [cartella, setCartella] = useState(cartellaIniziale ?? "");
  const [condiviso, setCondiviso] = useState(false);
  const [modalita, setModalita] = useState<"archivia" | "analizza">("archivia");
  const [inCorso, setInCorso] = useState(false);
  const [trascina, setTrascina] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const occupato = useRef(false);
  const trasferimenti = useRef(new Map<string, Trasferimento>());

  function aggiungi(files: File[]) {
    if (occupato.current) return;
    for (const file of files) {
      const errore = problemaFile(file);
      if (errore) toast.error(errore);
    }
    const nuovi = prepara(files);
    setVoci(prev => [...prev, ...nuovi]);
  }

  function aggiorna(id: string, modifica: Partial<Voce>) {
    setVoci(prev => prev.map(v => v.id === id ? { ...v, ...modifica } : v));
  }

  async function archiviaUno(voce: Voce) {
    const { id, file } = voce;
    const percorso = `${companyId}/${userId}/${id}`;
    const trasferimento = trasferimenti.current.get(id) ?? { inviato: false, tentato: false };
    trasferimenti.current.set(id, trasferimento);
    try {
      if (!trasferimento.inviato) {
        aggiorna(id, { stato: "invio", percentuale: 0, errore: undefined });
        const riprova = trasferimento.tentato;
        trasferimento.tentato = true;
        try {
          await caricaAllegatoConProgresso(BUCKET, percorso, file, percentuale => aggiorna(id, { percentuale }));
        } catch (errore) {
          if (!riprova || !oggettoGiaCaricato(errore)) throw errore;
        }
        trasferimento.inviato = true;
      }
      aggiorna(id, { stato: "salvataggio", errore: undefined });
      trasferimento.destinazione ??= { folder_id: cartella || null, shared: condiviso };
      const { error } = await supabase.from("media_library_files").insert({
        id, company_id: companyId, storage_path: percorso, name: file.name,
        mime_type: file.type || "application/octet-stream", size_bytes: file.size, ...trasferimento.destinazione,
      });
      if (error?.code === "23505") {
        const esistente = await supabase.from("media_library_files").select("id")
          .eq("company_id", companyId).eq("id", id).eq("storage_path", percorso).maybeSingle();
        if (!esistente.data) throw error;
      } else if (error) {
        if (/^(22|23|42)/.test(error.code)) trasferimento.destinazione = undefined;
        throw error;
      }
      trasferimenti.current.delete(id);
      aggiorna(id, { stato: "salvato", percentuale: 100 });
      return trasferimento.destinazione.folder_id;
    } catch (errore) {
      const dettaglio = errore as { code?: string; statusCode?: number; message?: string };
      const messaggio = dettaglio?.code === "42501" || dettaglio?.statusCode === 403
        ? "Verifica i permessi e che la cartella sia ancora attiva."
        : /network|timeout|fetch/i.test(dettaglio?.message ?? "") ? "Connessione interrotta. Riprova il file."
          : dettaglio?.message || "Archiviazione non riuscita.";
      aggiorna(id, { stato: "errore", errore: messaggio });
      return undefined;
    }
  }

  const completati = voci.filter(v => v.stato === "salvato").length;
  const inAttesa = voci.filter(v => (v.stato === "attesa" || v.stato === "errore") && !analizzati.has(v.file));
  async function archivia() {
    if (occupato.current || !inAttesa.length) return;
    setInCorso(true);
    occupato.current = true;
    const coda = [...inAttesa];
    const destinazioni = new Set<string | null>();
    try {
      await Promise.all(Array.from({ length: Math.min(3, coda.length) }, async () => {
        for (let voce = coda.shift(); voce; voce = coda.shift()) {
          const destinazione = await archiviaUno(voce);
          if (destinazione !== undefined) destinazioni.add(destinazione);
        }
      }));
      if (destinazioni.size) onArchiviati(destinazioni.size === 1 ? destinazioni.values().next().value ?? null : null);
    } finally {
      occupato.current = false;
      setInCorso(false);
    }
  }

  const totaleArchivio = voci.filter(voce => !analizzati.has(voce.file)).length;
  const fileDrag = (event: DragEvent) => event.dataTransfer.types.includes("Files");
  return <Dialog open={open} onOpenChange={stato => { if (!stato && !occupato.current) onClose(); }}>
    <DialogContent className="flex max-h-[90dvh] max-w-2xl flex-col">
      <DialogHeader><DialogTitle>Carica nel Drive</DialogTitle><DialogDescription>Archivia più file insieme o passali a Silvio per analizzarli uno alla volta.</DialogDescription></DialogHeader>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Modalità di caricamento">
        <Button type="button" variant={modalita === "archivia" ? "default" : "outline"} aria-pressed={modalita === "archivia"} disabled={inCorso} onClick={() => setModalita("archivia")}>Archivia</Button>
        <Button type="button" variant={modalita === "analizza" ? "default" : "outline"} aria-pressed={modalita === "analizza"} disabled={inCorso} onClick={() => setModalita("analizza")}><Sparkles className="mr-2 h-4 w-4" />Analizza con Silvio</Button>
      </div>
      <input ref={input} type="file" multiple accept={ACCEPT_INPUT} className="hidden" onChange={event => { aggiungi(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
      <div onDragOver={event => { if (fileDrag(event)) { event.preventDefault(); event.stopPropagation(); setTrascina(!inCorso); } }}
        onDragLeave={() => setTrascina(false)} onDrop={event => { event.preventDefault(); event.stopPropagation(); setTrascina(false); aggiungi(Array.from(event.dataTransfer.files)); }}>
        <Button type="button" variant="outline" className={`w-full border-dashed ${trascina ? "border-primary bg-primary/10" : ""}`} disabled={inCorso} onClick={() => input.current?.click()}><Upload className="mr-2 h-4 w-4" /> Seleziona o trascina i file</Button>
      </div>
      {modalita === "archivia" && <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="drive-archivia-cartella">Cartella di destinazione</label>
        <UniformSelect id="drive-archivia-cartella" className="w-full rounded-md border bg-background p-2 text-sm" value={cartella} disabled={inCorso} onChange={event => setCartella(event.target.value)}>
          <option value="">Archivio generale</option>
          {cartelle.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
        </UniformSelect>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={condiviso} disabled={inCorso} onCheckedChange={value => setCondiviso(value === true)} /> Condividi con chi ha accesso al Drive aziendale</label>
        <p className="text-xs text-muted-foreground">Con la condivisione disattivata, i file sono visibili a te e agli amministratori.</p>
      </div>}
      {voci.length > 0 && <ul className="min-h-12 divide-y overflow-y-auto rounded-md border">
        {voci.map(voce => {
          const giaAnalizzato = analizzati.has(voce.file);
          const fatto = voce.stato === "salvato" || giaAnalizzato;
          return <li key={voce.id} className="flex items-center gap-2.5 p-2.5">
            {fatto ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : voce.stato === "errore" ? <AlertCircle className="h-4 w-4 shrink-0 text-destructive" /> : null}
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{voce.file.name}</p>
              {giaAnalizzato ? <p className="text-xs text-muted-foreground">Analizzato con Silvio</p> : voce.errore ? <p className="text-xs text-destructive">{voce.errore}</p> : voce.stato === "salvataggio" ? <p className="text-xs text-muted-foreground">Salvataggio in archivio…</p> : null}
              {voce.stato === "invio" && <Progress className="mt-1 h-1.5" value={Math.min(voce.percentuale, 99)} aria-label={`Caricamento ${voce.file.name}`} />}
            </div>
            {modalita === "analizza" && !fatto && <Button type="button" size="sm" variant="outline" disabled={inCorso || !analizzabile(voce.file)} title={analizzabile(voce.file) ? undefined : "Formato o dimensione non supportati da Silvio"} onClick={() => onAnalizza(voce.file)}>Analizza</Button>}
            {!fatto && <Button type="button" size="icon" variant="ghost" disabled={inCorso} aria-label={`Togli ${voce.file.name}`} onClick={() => setVoci(prev => prev.filter(v => v.id !== voce.id))}><X className="h-4 w-4" /></Button>}
          </li>;
        })}
      </ul>}
      {modalita === "archivia" && (completati > 0 || inCorso) && <div className="space-y-1.5" role="status">
        <p className="text-sm font-medium">{inCorso ? `Caricamento in corso · ${completati} di ${totaleArchivio} archiviati` : inAttesa.length ? `${completati} file archiviati · ${inAttesa.length} da riprovare` : `${completati} file archiviati`}</p>
        <Progress className="h-2" value={totaleArchivio ? 100 * completati / totaleArchivio : 0} aria-label="Avanzamento archivio" />
      </div>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={inCorso} onClick={onClose}>Chiudi caricamento</Button>
        {modalita === "archivia" && (inAttesa.length > 0 || inCorso) && <Button type="button" disabled={inCorso} onClick={() => void archivia()}>
          {inCorso && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{inCorso ? "Caricamento…" : `${inAttesa.every(v => v.stato === "errore") ? "Riprova" : "Archivia"} ${inAttesa.length} file`}
        </Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
