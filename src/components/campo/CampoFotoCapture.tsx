/**
 * Componente cattura foto con camera nativa + geotag obbligatorio + watermark.
 * Drop-in replacement per i vecchi upload foto campo.
 */
import { useRef, useState } from "react";
import { Camera, X, RefreshCw, Check, Loader2, MapPin } from "lucide-react";
import { useFotoCapture, type CapturedPhoto } from "@/hooks/campo/useFotoCapture";

interface CampoFotoCaptureProps {
  onCapture: (photo: CapturedPhoto) => void;
  orderId?: string;
  nomeCantiere?: string;
  operaio?: string;
  maxFoto?: number;
  currentCount?: number;
  label?: string;
}

export default function CampoFotoCapture({
  onCapture,
  orderId,
  nomeCantiere,
  operaio,
  maxFoto = 5,
  currentCount = 0,
  label = "Scatta foto",
}: CampoFotoCaptureProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const { uploading, error, capture, clearError } = useFotoCapture();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<CapturedPhoto | null>(null);

  const raggiunto = currentCount >= maxFoto;

  const handleOpenCamera = (): void => {
    if (raggiunto) return;
    clearError();
    inputRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset per poter riselezionare

    const photo = await capture(file, { nomeCantiere, operaio, orderId });
    if (photo) {
      setPreview(photo);
      setPreviewUrl(photo.url);
    }
  };

  const handleConfirm = (): void => {
    if (!preview) return;
    onCapture(preview);
    setPreview(null);
    setPreviewUrl(null);
  };

  const handleRetry = (): void => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreview(null);
    setPreviewUrl(null);
    handleOpenCamera();
  };

  // Modalità preview
  if (preview && previewUrl) {
    return (
      <div className="space-y-3">
        <div className="relative rounded-xl overflow-hidden border-2 border-emerald-500 bg-black">
          <img
            src={previewUrl}
            alt="Anteprima foto con watermark"
            className="w-full h-auto max-h-[60vh] object-contain"
          />
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/70 text-emerald-300 text-[10px] px-2 py-1 rounded-full">
            <MapPin className="w-3 h-3" />
            GPS {preview.geo.lat.toFixed(4)}, {preview.geo.lng.toFixed(4)}
          </div>
          {preview.queued && (
            <div className="absolute top-2 right-2 bg-amber-500 text-amber-950 text-[10px] font-bold px-2 py-1 rounded-full">
              In coda
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleRetry}
            className="flex-1 h-12 rounded-xl bg-slate-800 border border-slate-700 text-white font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <RefreshCw className="w-4 h-4" />
            Riprova
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 h-12 rounded-xl bg-emerald-500 text-slate-950 font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <Check className="w-5 h-5" />
            Conferma
          </button>
        </div>
      </div>
    );
  }

  // Modalità bottone
  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />

      <button
        type="button"
        onClick={handleOpenCamera}
        disabled={uploading || raggiunto}
        className={`
          w-full h-14 rounded-xl font-bold flex items-center justify-center gap-2
          transition-all active:scale-[0.98]
          ${raggiunto
            ? "bg-slate-800 text-slate-500 cursor-not-allowed"
            : uploading
              ? "bg-amber-500/50 text-amber-950"
              : "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20"
          }
        `}
      >
        {uploading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Elaborazione…
          </>
        ) : raggiunto ? (
          <>
            <X className="w-5 h-5" />
            Massimo {maxFoto} foto raggiunto
          </>
        ) : (
          <>
            <Camera className="w-5 h-5" />
            {label} {currentCount > 0 && `(${currentCount}/${maxFoto})`}
          </>
        )}
      </button>

      {error && (
        <div
          role="alert"
          className="rounded-lg bg-red-950/60 border border-red-500 p-3 text-xs text-red-200"
        >
          {error}
        </div>
      )}
    </div>
  );
}
