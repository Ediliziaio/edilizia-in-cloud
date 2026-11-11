// ============================================================================
// DocumentiBollaCard — la bolla originale e gli allegati, in un posto solo
// ----------------------------------------------------------------------------
// 11/11/2026 — Prima erano due schede, ognuna col suo caricatore grande:
// «Documento DDT» (il cartaceo) e «Allegati» (con la scelta del tipo). Per due
// file si scorreva mezza pagina. Ora: in cima l'originale, sotto gli allegati
// in elenco, un solo «Aggiungi file» con la scelta del tipo, e una striscia
// bassa dove trascinare.
//
// Il tipo «Bolla originale» c'è solo finché l'originale manca: quando c'è, si
// sostituisce dalla sua riga e i file nuovi sono allegati.
// ============================================================================

import { useRef, useState, type DragEvent } from "react";
import { Camera, FolderOpen, Paperclip, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DDTFileRiga } from "@/components/ddt/DDTFilePreview";
import { DDTOriginaliCard } from "@/components/ddt/DDTOriginaliCard";
import type { DDTAttachment, DDTAttachmentKind, DDTRicezione } from "@/hooks/useDDTRicezione";
import { cn } from "@/lib/utils";

const MAX_MB = 20;
const ACCETTA = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";

const TIPI_ALLEGATO: Array<{ valore: DDTAttachmentKind; etichetta: string }> = [
  { valore: "ddt", etichetta: "Bolla originale" },
  { valore: "bolla", etichetta: "Bolla di consegna" },
  { valore: "packing_list", etichetta: "Packing list" },
  { valore: "danni", etichetta: "Foto danni / non conformità" },
  { valore: "firma", etichetta: "Firma ricevente" },
  { valore: "altro", etichetta: "Altro" },
];

export interface DocumentiBollaCardProps {
  ddt: Pick<DDTRicezione, "id" | "ddt_file_bucket" | "ddt_file_url" | "ddt_file_name" | "ddt_file_mime"> & {
    company_id: string;
  };
  /** Link firmato dell'originale caricato a mano (useFileDDT). */
  fileUrl: string | null | undefined;
  fileErrore?: boolean;
  onRiprovaFile?: () => void;
  allegati: DDTAttachment[];
  inCaricamento?: boolean;
  onCaricaOriginale: (file: File) => void;
  onRimuoviOriginale: () => void;
  onCaricaAllegati: (files: { file: File; kind: DDTAttachmentKind }[]) => void;
  onEliminaAllegato: (path: string) => void;
}

export function DocumentiBollaCard({
  ddt,
  fileUrl,
  fileErrore,
  onRiprovaFile,
  allegati,
  inCaricamento = false,
  onCaricaOriginale,
  onRimuoviOriginale,
  onCaricaAllegati,
  onEliminaAllegato,
}: DocumentiBollaCardProps) {
  // Originale dalla lettura AI (ddt_document_jobs) o caricato a mano.
  const originaleArchiviato = !!ddt.ddt_file_bucket;
  const originaleManuale = !originaleArchiviato && !!ddt.ddt_file_url;
  const senzaOriginale = !originaleArchiviato && !originaleManuale;
  const tipi = senzaOriginale ? TIPI_ALLEGATO : TIPI_ALLEGATO.filter((t) => t.valore !== "ddt");
  const [scelto, setScelto] = useState<DDTAttachmentKind | null>(null);
  // Senza originale si propone di caricare quello; poi gli allegati.
  const tipo: DDTAttachmentKind =
    scelto && tipi.some((t) => t.valore === scelto) ? scelto : senzaOriginale ? "ddt" : "bolla";

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const sostituisciRef = useRef<HTMLInputElement>(null);
  const [trascinando, setTrascinando] = useState(false);
  const [rifiutati, setRifiutati] = useState<string[]>([]);

  const invia = (lista: FileList | null) => {
    if (!lista?.length) return;
    const validi: File[] = [];
    const errori: string[] = [];
    for (const f of Array.from(lista)) {
      if (f.size > MAX_MB * 1024 * 1024) errori.push(`${f.name}: troppo grande (max ${MAX_MB} MB)`);
      else validi.push(f);
    }
    setRifiutati(errori);
    if (!validi.length) return;
    if (tipo === "ddt") {
      // L'originale è uno: il primo file; gli altri restano come bolla di consegna.
      const [primo, ...resto] = validi;
      onCaricaOriginale(primo);
      if (resto.length) onCaricaAllegati(resto.map((file) => ({ file, kind: "bolla" as const })));
    } else {
      onCaricaAllegati(validi.map((file) => ({ file, kind: tipo })));
    }
  };

  const suDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setTrascinando(false);
    invia(e.dataTransfer.files);
  };

  const quanti = allegati.length + (senzaOriginale ? 0 : 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Paperclip className="h-4 w-4 text-primary" />
            Documenti della bolla
            {quanti > 0 && (
              <Badge variant="secondary" className="text-xs">
                {quanti}
              </Badge>
            )}
          </CardTitle>
          <div className="flex w-full items-center gap-1.5 sm:w-auto">
            <select
              aria-label="Tipo di documento"
              className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs sm:w-44 sm:flex-none"
              value={tipo}
              onChange={(e) => setScelto(e.target.value as DDTAttachmentKind)}
            >
              {tipi.map((t) => (
                <option key={t.valore} value={t.valore}>
                  {t.etichetta}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 shrink-0 gap-1.5"
              disabled={inCaricamento}
              onClick={() => fileRef.current?.click()}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Aggiungi file
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 shrink-0 p-0"
              disabled={inCaricamento}
              aria-label="Scatta una foto"
              title="Scatta una foto"
              onClick={() => cameraRef.current?.click()}
            >
              <Camera className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <input
          ref={fileRef}
          type="file"
          accept={ACCETTA}
          multiple
          className="sr-only"
          data-testid="documenti-bolla-file"
          onChange={(e) => {
            invia(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            invia(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={sostituisciRef}
          type="file"
          accept="image/*,application/pdf"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onCaricaOriginale(f);
            e.target.value = "";
          }}
        />

        {fileErrore && originaleManuale && (
          <p role="alert" className="text-sm text-destructive">
            Non riesco ad aprire l’originale.{" "}
            <button type="button" className="underline" onClick={onRiprovaFile}>
              Riprova
            </button>
          </p>
        )}

        {(!senzaOriginale || allegati.length > 0) && (
          <ul className="divide-y overflow-hidden rounded-md border" aria-label="Documenti della bolla">
            {originaleArchiviato && (
              <DDTOriginaliCard ddtId={ddt.id} companyId={ddt.company_id} incorporato />
            )}
            {originaleManuale && fileUrl && (
              <DDTFileRiga
                url={fileUrl}
                name={ddt.ddt_file_name ?? "Bolla originale"}
                mime={ddt.ddt_file_mime ?? "application/pdf"}
                etichetta="Bolla originale"
                evidenziata
                onReplace={() => sostituisciRef.current?.click()}
                onDelete={onRimuoviOriginale}
                confermaRimozione={`Rimuovere il documento DDT "${ddt.ddt_file_name ?? ""}"?`}
              />
            )}
            {allegati.map((a) => (
              <DDTFileRiga
                key={a.path}
                url={a.url}
                name={a.name}
                mime={a.mime}
                size={a.size}
                kind={a.kind}
                onDelete={() => onEliminaAllegato(a.path)}
              />
            ))}
          </ul>
        )}

        <div
          onDrop={suDrop}
          onDragOver={(e) => {
            e.preventDefault();
            if (!trascinando) setTrascinando(true);
          }}
          onDragLeave={() => setTrascinando(false)}
          className={cn(
            "hidden items-center justify-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground transition-colors sm:flex",
            trascinando ? "border-primary bg-primary/5 text-primary" : "border-muted-foreground/25",
            inCaricamento && "pointer-events-none opacity-60",
          )}
        >
          <Upload className="h-3.5 w-3.5" />
          {inCaricamento
            ? "Caricamento in corso…"
            : senzaOriginale && tipo === "ddt"
              ? `Trascina qui la bolla: foto o PDF, max ${MAX_MB} MB`
              : `Trascina qui i file: foto o PDF, max ${MAX_MB} MB`}
        </div>
        {inCaricamento && (
          <p className="text-xs text-primary sm:hidden">Caricamento in corso…</p>
        )}
        {senzaOriginale && allegati.length === 0 && (
          <p className="text-xs text-muted-foreground sm:hidden">
            Nessun documento: fotografa la bolla o carica il PDF.
          </p>
        )}

        {rifiutati.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
            {rifiutati.map((r) => (
              <p key={r}>{r}</p>
            ))}
            <button type="button" className="underline" onClick={() => setRifiutati([])}>
              Nascondi
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
