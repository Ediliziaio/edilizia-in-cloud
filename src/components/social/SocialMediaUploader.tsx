/**
 * SocialMediaUploader — carica immagini e video del Social Manager nel bucket
 * privato social-media (vedi src/lib/social/mediaUpload.ts).
 * Serve dove AdMediaUploader non basta: video (Reel) e più file (carosello).
 */
import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SOCIAL_IMAGE_TYPES,
  SOCIAL_VIDEO_TYPES,
  uploadSocialMediaFile,
  validateSocialUploadFile,
  type SocialUploadAccept,
} from "@/lib/social/mediaUpload";
import type { SocialPostMedia } from "@/lib/social/types";

interface Props {
  companyId: string | undefined;
  accept: SocialUploadAccept;
  multiple?: boolean;
  /** quanti file si possono ancora aggiungere */
  maxFiles?: number;
  label: string;
  hint?: string;
  onUploaded: (items: SocialPostMedia[]) => void;
  className?: string;
}

export function SocialMediaUploader({
  companyId,
  accept,
  multiple = false,
  maxFiles,
  label,
  hint,
  onUploaded,
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const acceptAttr = (accept === "image"
    ? SOCIAL_IMAGE_TYPES
    : accept === "video"
      ? SOCIAL_VIDEO_TYPES
      : [...SOCIAL_IMAGE_TYPES, ...SOCIAL_VIDEO_TYPES]
  ).join(",");
  const limit = Math.max(0, maxFiles ?? (multiple ? 10 : 1));

  const handleFiles = async (files: FileList | File[]) => {
    if (!companyId) {
      toast.error("Azienda non identificata");
      return;
    }
    const all = Array.from(files);
    if (all.length === 0) return;
    if (limit === 0) {
      toast.error("Hai già raggiunto il numero massimo di file");
      return;
    }
    if (all.length > limit) {
      toast.warning(`Carico solo i primi ${limit} file`);
    }

    setBusy(true);
    const uploaded: SocialPostMedia[] = [];
    try {
      for (const file of all.slice(0, limit)) {
        const problem = validateSocialUploadFile(file, accept);
        if (problem) {
          toast.error(file.name, { description: problem });
          continue;
        }
        try {
          uploaded.push(await uploadSocialMediaFile(companyId, file));
        } catch (err) {
          toast.error(`Caricamento non riuscito: ${file.name}`, {
            description: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (uploaded.length > 0) {
        onUploaded(uploaded);
        toast.success(uploaded.length === 1 ? "File caricato" : `${uploaded.length} file caricati`);
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!busy) void handleFiles(e.dataTransfer.files);
      }}
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition",
        dragOver ? "border-orange-400 bg-orange-50" : "border-slate-300 bg-slate-50",
        className,
      )}
    >
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={acceptAttr}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void handleFiles(e.target.files);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3 gap-1.5"
        disabled={busy || !companyId || limit === 0}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {busy ? "Caricamento..." : "Scegli file"}
      </Button>
    </div>
  );
}
