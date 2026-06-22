/**
 * StepMedia — foto, render e allegati del progetto Piscine (Task 18).
 *
 * Upload su Supabase Storage + riga in `pis_progetti_media` (via
 * `useUpsertMedia`/`useDeleteMedia`). Griglia premium con:
 *  - tipo media (situazione / render / cantiere_simile / allegato)
 *  - caption editabile (salvataggio on-blur)
 *  - riordino su/giù (persistito ricompattando `ordine`)
 *  - elimina con conferma
 *
 * Bucket Storage: `company-photo-library` (PUBLIC, già esistente sul remoto).
 *   Perché non `sr-progetti` (usato da Serramenti): quel bucket è PRIVATO e
 *   richiederebbe una migrazione storage che non possiamo applicare in locale;
 *   inoltre i suoi URL sono firmati a TTL (scadono → il PDF perderebbe le
 *   immagini). `company-photo-library` è invece pubblico in lettura e
 *   company-scoped in scrittura/cancellazione tramite la policy
 *   `(storage.foldername(name))[1] = get_user_company_id(...)`, quindi il path
 *   DEVE iniziare con `{company_id}/…`. Lì salviamo
 *   `{company_id}/piscine/{progetto_id}/{uuid}.{ext}` e in
 *   `pis_progetti_media.url` mettiamo l'URL pubblico stabile (ideale per il PDF).
 *
 * Niente setState-in-effect: lo stato locale di editing caption deriva dai
 * dati server tramite `key` sulla riga; gli importi/ordini si ricavano con
 * `useMemo`. Niente `Date.now()`/`Math.random()` in render (gli id file usano
 * `crypto.randomUUID()` solo dentro l'handler di upload).
 */
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Image as ImageIcon,
  Upload,
  Loader2,
  Trash2,
  ArrowUp,
  ArrowDown,
  FileText,
  Sparkles,
  Camera,
  Building2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import {
  useUpsertMedia,
  useDeleteMedia,
  useEffectiveCompanyId,
} from "@/hooks/usePiscineProgetto";
import type { PisProgettoMedia } from "@/types/piscine";

interface Props {
  progettoId: string;
  media: PisProgettoMedia[];
}

const BUCKET = "company-photo-library";
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

/** Tipi di media + metadati UI (label, icona, classe badge). */
const TIPI_MEDIA = [
  { value: "situazione", label: "Stato attuale", icon: Camera, badge: "border-slate-300 bg-slate-50 text-slate-700" },
  { value: "render", label: "Render / progetto", icon: Sparkles, badge: "border-violet-300 bg-violet-50 text-violet-700" },
  { value: "cantiere_simile", label: "Lavoro simile", icon: Building2, badge: "border-blue-300 bg-blue-50 text-blue-700" },
  { value: "allegato", label: "Allegato", icon: FileText, badge: "border-amber-300 bg-amber-50 text-amber-700" },
] as const;

const tipoMeta = (tipo: string) =>
  TIPI_MEDIA.find((t) => t.value === tipo) ?? TIPI_MEDIA[0];

const isPdf = (url: string) => /\.pdf($|\?)/i.test(url);

export default function StepMedia({ progettoId, media }: Props) {
  const companyId = useEffectiveCompanyId();
  const confirm = useConfirm();
  const upsertMut = useUpsertMedia(progettoId);
  const deleteMut = useDeleteMedia(progettoId);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  // Ordina i media per `ordine` (poi created_at implicito dalla query): la
  // lista renderizzata è derivata, mai duplicata in stato (no setState-in-effect).
  const ordered = useMemo(
    () => [...media].sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0)),
    [media],
  );

  // ─── Upload (uno o più file) ───────────────────────────────────────────────
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!companyId) {
      toast.error("Azienda non disponibile");
      return;
    }
    setUploading(true);
    let okCount = 0;
    // Base ordine = dopo l'ultimo esistente, così i nuovi si accodano.
    let nextOrdine = ordered.reduce((max, m) => Math.max(max, m.ordine ?? 0), -1) + 1;
    try {
      for (const file of Array.from(files)) {
        if (!ALLOWED_MIMES.has(file.type)) {
          toast.error(`"${file.name}" non supportato`, {
            description: "Usa PNG, JPG, WEBP o PDF.",
          });
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          toast.error(`"${file.name}" troppo grande`, { description: "Massimo 8 MB per file." });
          continue;
        }
        const ext = file.name.includes(".")
          ? file.name.split(".").pop()!.toLowerCase()
          : "bin";
        // folder[1] DEVE essere company_id (policy storage company-scoped).
        const storagePath = `${companyId}/piscine/${progettoId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, file, { contentType: file.type, upsert: false });
        if (upErr) {
          toast.error(`Upload di "${file.name}" fallito`, { description: upErr.message });
          continue;
        }
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
        const url = pub.publicUrl;
        // Allegati PDF → tipo "allegato", altrimenti default "situazione".
        const tipo = file.type === "application/pdf" ? "allegato" : "situazione";
        try {
          await upsertMut.mutateAsync({ url, tipo, caption: null, ordine: nextOrdine });
          nextOrdine += 1;
          okCount += 1;
        } catch (e) {
          // Rollback del file caricato se la riga DB non viene creata.
          void supabase.storage.from(BUCKET).remove([storagePath]);
          toast.error(`Registrazione di "${file.name}" fallita`, {
            description: e instanceof Error ? e.message : "Errore sconosciuto",
          });
        }
      }
      if (okCount > 0) {
        toast.success(okCount === 1 ? "File caricato" : `${okCount} file caricati`);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ─── Update riga (tipo / caption) ──────────────────────────────────────────
  const updateMedia = async (
    m: PisProgettoMedia,
    patch: Partial<Pick<PisProgettoMedia, "tipo" | "caption">>,
  ) => {
    try {
      await upsertMut.mutateAsync({
        id: m.id,
        url: m.url,
        tipo: patch.tipo ?? m.tipo,
        caption: patch.caption !== undefined ? patch.caption : m.caption,
        ordine: m.ordine,
      });
    } catch (e) {
      toast.error("Salvataggio non riuscito", {
        description: e instanceof Error ? e.message : "Errore sconosciuto",
      });
    }
  };

  // ─── Riordino (swap di `ordine` con il vicino) ─────────────────────────────
  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= ordered.length) return;
    const a = ordered[index];
    const b = ordered[target];
    const aOrd = a.ordine ?? index;
    const bOrd = b.ordine ?? target;
    try {
      await Promise.all([
        upsertMut.mutateAsync({ id: a.id, url: a.url, tipo: a.tipo, caption: a.caption, ordine: bOrd }),
        upsertMut.mutateAsync({ id: b.id, url: b.url, tipo: b.tipo, caption: b.caption, ordine: aOrd }),
      ]);
    } catch (e) {
      toast.error("Riordino non riuscito", {
        description: e instanceof Error ? e.message : "Errore sconosciuto",
      });
    }
  };

  // ─── Elimina ───────────────────────────────────────────────────────────────
  const remove = async (m: PisProgettoMedia) => {
    const ok = await confirm({
      title: "Eliminare questo file?",
      description: "Verrà rimosso dal progetto. L'operazione non può essere annullata.",
      confirmLabel: "Elimina",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteMut.mutateAsync(m.id);
      // Best-effort: rimuovi anche l'oggetto Storage dal path pubblico.
      const path = extractStoragePath(m.url);
      if (path) void supabase.storage.from(BUCKET).remove([path]);
      toast.success("File eliminato");
    } catch (e) {
      toast.error("Eliminazione non riuscita", {
        description: e instanceof Error ? e.message : "Errore sconosciuto",
      });
    }
  };

  const busy = uploading || upsertMut.isPending;

  return (
    <div className="space-y-3">
      {/* Header + azione upload */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Foto e allegati</h2>
          <p className="text-[11px] text-muted-foreground">
            Stato attuale, render di progetto, lavori simili e documenti. Compaiono nel preventivo PDF.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {busy && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Caricamento…
            </span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <Button
            type="button"
            size="sm"
            className="gap-1.5 bg-orange-500 hover:bg-orange-600"
            disabled={uploading || !companyId}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Carica file
          </Button>
        </div>
      </div>

      {ordered.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={ImageIcon}
              title="Nessuna foto o allegato"
              description="Aggiungi foto dello stato attuale, render del progetto o lavori simili: renderanno il preventivo molto più convincente."
              action={{
                label: "Carica il primo file",
                icon: Upload,
                onClick: () => fileInputRef.current?.click(),
                primary: true,
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ordered.map((m, index) => (
            <MediaCard
              key={m.id}
              media={m}
              index={index}
              total={ordered.length}
              disabled={busy}
              onChangeTipo={(tipo) => void updateMedia(m, { tipo })}
              onChangeCaption={(caption) => void updateMedia(m, { caption })}
              onMoveUp={() => void move(index, -1)}
              onMoveDown={() => void move(index, 1)}
              onDelete={() => void remove(m)}
            />
          ))}
        </div>
      )}

      {ordered.length > 0 && (
        <p className="text-center text-[11px] text-muted-foreground">
          {ordered.length} {ordered.length === 1 ? "file" : "file"} · PNG, JPG, WEBP o PDF · max 8 MB
        </p>
      )}
    </div>
  );
}

// ─── Card singolo media ───────────────────────────────────────────────────────
interface MediaCardProps {
  media: PisProgettoMedia;
  index: number;
  total: number;
  disabled: boolean;
  onChangeTipo: (tipo: string) => void;
  onChangeCaption: (caption: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

function MediaCard({
  media, index, total, disabled,
  onChangeTipo, onChangeCaption, onMoveUp, onMoveDown, onDelete,
}: MediaCardProps) {
  const meta = tipoMeta(media.tipo);
  const TipoIcon = meta.icon;
  const pdf = isPdf(media.url);

  // Caption: stato locale seedato dal valore server tramite `key` sulla riga
  // (vedi sotto). Salvataggio on-blur per non spammare update a ogni tasto.
  const [caption, setCaption] = useState(media.caption ?? "");

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-2.5 p-2.5">
        {/* Anteprima */}
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted/40">
          {pdf ? (
            <a
              href={media.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground transition-colors hover:bg-muted/60"
            >
              <FileText className="h-9 w-9 text-amber-500" />
              <span className="text-[11px] font-medium">Apri PDF</span>
            </a>
          ) : (
            <img
              src={media.url}
              alt={media.caption ?? meta.label}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          )}
          <Badge
            variant="outline"
            className={cn("absolute left-1.5 top-1.5 gap-1 text-[10px] backdrop-blur", meta.badge)}
          >
            <TipoIcon className="h-3 w-3" />
            {meta.label}
          </Badge>
        </div>

        {/* Tipo */}
        <Select value={media.tipo} onValueChange={onChangeTipo} disabled={disabled}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIPI_MEDIA.map((t) => (
              <SelectItem key={t.value} value={t.value} className="text-xs">
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Caption */}
        <Input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => {
            if ((media.caption ?? "") !== caption) onChangeCaption(caption);
          }}
          placeholder="Didascalia (opzionale)…"
          className="h-8 text-xs"
          disabled={disabled}
        />

        {/* Azioni */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={disabled || index === 0}
              onClick={onMoveUp}
              title="Sposta su"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={disabled || index === total - 1}
              onClick={onMoveDown}
              title="Sposta giù"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-rose-500 hover:bg-rose-50 hover:text-rose-600"
            disabled={disabled}
            onClick={onDelete}
            title="Elimina"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Ricava lo storage path da un public URL del bucket per la pulizia best-effort.
 * Formato URL: `…/storage/v1/object/public/{bucket}/{path}`. Se non riconosciuto
 * ritorna null (l'oggetto resta nel bucket: tollerabile, niente errori UI).
 */
function extractStoragePath(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const raw = url.slice(idx + marker.length).split("?")[0];
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
