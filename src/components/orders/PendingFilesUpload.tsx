/**
 * Documenti scelti mentre si crea la commessa: salgono quando la commessa
 * nasce. Ogni file ha già la sua cartella (proposta dal nome, correggibile).
 */
import { useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Paperclip, Upload, X, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useCartelleDocumenti } from "@/hooks/useCartelleDocumenti";
import { usePermissions } from "@/hooks/usePermissions";
import { DocumentFoldersNavigation, SENZA_CARTELLA, TUTTI_DOCUMENTI } from "./DocumentFoldersNavigation";
import {
  ACCEPT_INPUT,
  MAX_MB_PER_FILE,
  cartellaDelFileInCoda,
  cartellaSuggerita,
  cartelleMancanti,
  contaPerCartella,
  problemaFile,
} from "@/lib/commesse/documentiCommessa";
import { fmtBytes } from "./filePreviewUtils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export interface PendingFile {
  file: File;
  visibleToCustomer: boolean;
  /** undefined = nessuna scelta: vale la cartella proposta dal nome del file. */
  folderId?: string | null;
}

interface PendingFilesUploadProps {
  files: PendingFile[];
  onFilesChange: (files: PendingFile[]) => void;
  disabled?: boolean;
}

export function PendingFilesUpload({ files, onFilesChange, disabled = false }: PendingFilesUploadProps) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const { cartelle, isLoading, error } = useCartelleDocumenti();
  const [cartelleAperte, setCartelleAperte] = useState(false);
  const permissions = usePermissions();
  const [selezione, setSelezione] = useState(TUTTI_DOCUMENTI);
  const [sopraCartella, setSopraCartella] = useState<string | null>(null);
  const righe = files.map((pf, index) => ({ pf, index, folder_id: cartellaDelFileInCoda(pf, cartelle) }));
  const conteggi = contaPerCartella(righe);
  const senzaCartella = righe.filter((r) => !r.folder_id || !cartelle.some((c) => c.id === r.folder_id)).length;
  const selezioneAttiva = selezione === TUTTI_DOCUMENTI || (selezione === SENZA_CARTELLA && senzaCartella > 0) || cartelle.some((c) => c.id === selezione) ? selezione : TUTTI_DOCUMENTI;
  const visibili = righe.filter((r) => selezioneAttiva === TUTTI_DOCUMENTI || (selezioneAttiva === SENZA_CARTELLA ? !r.folder_id || !cartelle.some((c) => c.id === r.folder_id) : r.folder_id === selezioneAttiva));
  const cartellaAperta = selezioneAttiva !== TUTTI_DOCUMENTI && selezioneAttiva !== SENZA_CARTELLA ? selezioneAttiva : null;
  const mancanti = cartelleMancanti(cartelle, righe);

  const validateAndAddFiles = useCallback((selected: File[], destinazione?: string | null) => {
    if (disabled || isLoading || error) return;
    const valid: PendingFile[] = [];
    const presenti = new Set(files.map((p) => `${p.file.name}:${p.file.size}`));
    for (const file of selected) {
      const problema = problemaFile(file);
      if (problema) {
        toast.error(t("File escluso"), { description: problema });
        continue;
      }
      const key = `${file.name}:${file.size}`;
      if (presenti.has(key)) continue;
      presenti.add(key);
      // La scelta esplicita della cartella non viene sovrascritta dal nome del file.
      const folderId = destinazione !== undefined ? destinazione
        : selezioneAttiva === SENZA_CARTELLA ? null
        : cartellaAperta ?? cartellaSuggerita(file.name, cartelle);
      valid.push({
        file,
        folderId,
        visibleToCustomer: cartelle.find((c) => c.id === folderId)?.visibile_cliente ?? false,
      });
    }
    if (valid.length > 0) onFilesChange([...files, ...valid]);
  }, [disabled, isLoading, error, files, onFilesChange, cartelle, selezioneAttiva, cartellaAperta, t]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current++;
    if (!disabled && e.dataTransfer.items?.length) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent, destinazione?: string | null) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false); setSopraCartella(null); dragCounter.current = 0;
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) validateAndAddFiles(droppedFiles, destinazione);
  };

  const aggiorna = (index: number, patch: Partial<PendingFile>) =>
    onFilesChange(files.map((pf, i) => (i === index ? { ...pf, ...patch } : pf)));

  return (
    <Card
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={(e) => handleDrop(e)}
      className={`relative transition-colors ${isDragging ? "border-dashed border-2 border-primary/50 bg-primary/5" : ""}`}
    >
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 p-4 pb-3 sm:p-6 sm:pb-3">
        <CardTitle className="flex min-w-0 items-center gap-2 text-base sm:text-lg">
          <Paperclip className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
          <span>{t("Documenti commessa")}</span>
          {files.length > 0 && <span className="text-sm font-normal tabular-nums text-muted-foreground">{files.length}</span>}
        </CardTitle>
        <div>
          <input
            ref={fileInputRef}
            id="documenti-nuova-commessa"
            type="file"
            multiple
            disabled={disabled || isLoading || !!error}
            onChange={(e) => {
              validateAndAddFiles(Array.from(e.target.files || []));
              e.target.value = "";
            }}
            className="hidden"
            accept={ACCEPT_INPUT}
          />
          <Button type="button" size="sm" variant="outline" className="min-h-10 shrink-0" disabled={disabled || isLoading || !!error} onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            {t("Carica file")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
        {isDragging && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-primary/5 border-2 border-dashed border-primary/50 pointer-events-none">
            <Upload className="h-10 w-10 text-primary/60 mb-2" />
            <p className="text-sm font-medium text-primary/70">{t("Trascina i file qui")}</p>
          </div>
        )}

        {error && <p role="alert" className="text-sm text-destructive">{t("Cartelle non disponibili. Ricarica la pagina prima di aggiungere i documenti.")}</p>}
        {/* A pagina vuota erano un quarto del modulo: si aprono col primo file, o per scegliere prima dove metterlo. */}
        {files.length === 0 && !cartelleAperte && (
          <button type="button" onClick={() => setCartelleAperte(true)} className="text-xs font-medium text-primary hover:underline">{t("Mostra cartelle")}</button>
        )}
        {(files.length > 0 || cartelleAperte) && <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(180px,240px)_minmax(0,1fr)]">
          <DocumentFoldersNavigation
            cartelle={cartelle} conteggi={conteggi} totale={files.length} senzaCartella={senzaCartella}
            mancanti={mancanti.map((c) => c.id)} loading={isLoading}
            selezione={selezioneAttiva} onSelect={setSelezione}
            puoGestireCartelle={permissions.isAdmin || permissions.canEditSettingsOrders}
            sopraCartella={sopraCartella}
            onDragOverCartella={disabled ? undefined : (_e, id) => setSopraCartella(id)}
            onDropCartella={disabled ? undefined : handleDrop}
          />
          <div className="min-w-0 space-y-2">
          {visibili.length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-6 text-center text-xs text-muted-foreground sm:py-8 sm:text-sm">
              {cartellaAperta ? t("Nessun documento in «{cartella}». Carica o trascina qui i file.", { cartella: cartelle.find((c) => c.id === cartellaAperta)?.nome ?? "" }) : t("Nessun documento. Scegli o trascina qui i file: puoi selezionarne tanti insieme.")}
            </div>
          ) : visibili.map(({ pf, index, folder_id: cartella }) => {
              return (
                <div
                  key={`${pf.file.name}-${pf.file.size}-${index}`}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 rounded-lg border bg-muted/30"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block" title={pf.file.name}>{pf.file.name}</span>
                    <span className="text-xs text-muted-foreground">{fmtBytes(pf.file.size)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {cartelle.length > 0 && (
                      <Select
                        value={cartella && cartelle.some((c) => c.id === cartella) ? cartella : SENZA_CARTELLA}
                        disabled={disabled}
                        onValueChange={(id) => {
                          aggiorna(index, {
                            folderId: id === SENZA_CARTELLA ? null : id,
                            visibleToCustomer: cartelle.find((c) => c.id === id)?.visibile_cliente ?? pf.visibleToCustomer,
                          });
                        }}
                      >
                        <SelectTrigger aria-label={t("Cartella di {nome}", { nome: pf.file.name })} className={`h-10 w-full sm:w-[180px] text-xs ${cartella ? "" : "text-muted-foreground"}`}>
                          <SelectValue placeholder={t("Scegli la cartella")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SENZA_CARTELLA}>{t("Senza cartella")}</SelectItem>
                          {cartelle.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0" title={t("Visibile al cliente nella sua area")}>
                      {pf.visibleToCustomer ? <Eye className="h-3.5 w-3.5 text-emerald-600" /> : <EyeOff className="h-3.5 w-3.5" />}
                      {t("Cliente")}
                      <Switch
                        checked={pf.visibleToCustomer}
                        disabled={disabled}
                        onCheckedChange={(v) => aggiorna(index, { visibleToCustomer: v })}
                        aria-label={t("Visibile al cliente: {nome}", { nome: pf.file.name })}
                      />
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={disabled}
                      className="ml-auto h-10 w-10 shrink-0 text-destructive"
                      onClick={() => onFilesChange(files.filter((_, i) => i !== index))}
                      aria-label={t("Togli {nome}", { nome: pf.file.name })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>}
        <p className="text-xs text-muted-foreground">{files.length ? t("{n} file · Massimo {mb} MB per file.", { n: files.length, mb: MAX_MB_PER_FILE }) : t("Massimo {mb} MB per file.", { mb: MAX_MB_PER_FILE })}</p>
      </CardContent>
    </Card>
  );
}
