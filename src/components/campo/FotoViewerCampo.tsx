/**
 * Foto a tutto schermo nell'area operai (24/11/2026, richiesta del founder: «quando scatto le foto posso vedere
 * più foto»). Si sfoglia col dito (o con le frecce), si vede «3 di 12», data e ora, la posizione. Si elimina solo
 * una foto propria: le altre le protegge già il database, qui il bottone non compare nemmeno.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, MapPinOff, Trash2, X } from "lucide-react";
import type { FotoCantiere } from "@/hooks/useFotoCantiere";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

export function dataOraFoto(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(intlCampo(), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function FotoViewerCampo({ foto, indice, onVai, onChiudi, getSignedUrl, puoEliminare, onElimina }: {
  foto: FotoCantiere[];
  indice: number;
  onVai: (i: number) => void;
  onChiudi: () => void;
  getSignedUrl: (path: string) => Promise<string | null>;
  puoEliminare: (f: FotoCantiere) => boolean;
  onElimina: (f: FotoCantiere) => void;
}) {
  const t = useT();
  const confirm = useConfirm();
  const corrente = foto[indice];
  // Il link si lega alla foto che l'ha chiesto: cambiando foto, finché non arriva il suo, si vede la rotella.
  const [link, setLink] = useState<{ path: string; url: string | null } | null>(null);
  const carica = link?.path !== corrente.storage_path;
  const url = carica ? null : link?.url ?? null;
  const inizioTocco = useRef<number | null>(null);
  const prima = indice > 0;
  const dopo = indice < foto.length - 1;

  useEffect(() => {
    let annullato = false;
    const path = corrente.storage_path;
    void getSignedUrl(path).then(u => { if (!annullato) setLink({ path, url: u }); });
    return () => { annullato = true; };
  }, [corrente.storage_path, getSignedUrl]);

  useEffect(() => {
    const tasti = (e: KeyboardEvent) => {
      if (e.key === "Escape") onChiudi();
      if (e.key === "ArrowLeft" && prima) onVai(indice - 1);
      if (e.key === "ArrowRight" && dopo) onVai(indice + 1);
    };
    window.addEventListener("keydown", tasti);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", tasti); document.body.style.overflow = overflow; };
  }, [indice, prima, dopo, onChiudi, onVai]);

  const haGps = corrente.latitudine != null && corrente.longitudine != null;

  // In un portale sul body: dentro la pagina una testata o un contenitore con trasformazioni la taglierebbe.
  // z-50 come le finestre: la conferma «Eliminare?», aperta dopo, sta sopra.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t("Foto {n} di {totale}", { n: indice + 1, totale: foto.length })}
      className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center gap-2 px-2 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2">
        <button type="button" onClick={onChiudi} aria-label={t("Chiudi")}
          className="flex size-11 items-center justify-center rounded-full bg-white/10 active:bg-white/20">
          <X className="size-5" aria-hidden="true" />
        </button>
        <p className="min-w-0 flex-1 text-center text-sm font-semibold tabular-nums">{t("Foto {n} di {totale}", { n: indice + 1, totale: foto.length })}</p>
        {puoEliminare(corrente) ? (
          <button type="button" aria-label={t("Elimina la foto")}
            onClick={async () => {
              const ok = await confirm({ title: t("Eliminare questa foto?"), description: t("Non si può annullare."), confirmLabel: t("Elimina"), variant: "destructive" });
              if (!ok) return;
              onElimina(corrente);
              if (foto.length <= 1) onChiudi(); else if (!dopo) onVai(indice - 1);
            }}
            className="flex size-11 items-center justify-center rounded-full bg-white/10 text-red-300 active:bg-white/20">
            <Trash2 className="size-5" aria-hidden="true" />
          </button>
        ) : <span className="size-11" aria-hidden="true" />}
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center"
        // Dito, penna o mouse: gli eventi «pointer» valgono per tutti.
        style={{ touchAction: "pan-y" }}
        onPointerDown={e => { inizioTocco.current = e.clientX; }}
        onPointerUp={e => {
          const da = inizioTocco.current;
          inizioTocco.current = null;
          const a = e.clientX;
          if (da == null || Math.abs(a - da) < 50) return;
          // Nelle lingue da destra a sinistra il dito va al contrario, come nelle app di foto.
          const avanti = (a < da) !== (document.documentElement.dir === "rtl");
          if (avanti && dopo) onVai(indice + 1);
          if (!avanti && prima) onVai(indice - 1);
        }}>
        {carica ? <Loader2 className="size-7 animate-spin text-white/70" aria-label={t("Caricamento…")} />
          : url ? <img src={url} alt={corrente.descrizione ?? t("Foto cantiere")} className="max-h-full max-w-full select-none object-contain" draggable={false} />
          : <p className="text-sm text-white/70">{t("Immagine non disponibile")}</p>}
        {prima && (
          <button type="button" onClick={() => onVai(indice - 1)} aria-label={t("Foto precedente")}
            className="absolute start-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 active:bg-black/70">
            <ChevronLeft className="size-6 rtl:rotate-180" aria-hidden="true" />
          </button>
        )}
        {dopo && (
          <button type="button" onClick={() => onVai(indice + 1)} aria-label={t("Foto successiva")}
            className="absolute end-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 active:bg-black/70">
            <ChevronRight className="size-6 rtl:rotate-180" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="space-y-1 px-4 pt-2 pb-[max(env(safe-area-inset-bottom),1rem)] text-[13px]">
        {corrente.descrizione && <p dir="auto" className="text-sm">{corrente.descrizione}</p>}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-white/80">
          <span className="capitalize tabular-nums">{dataOraFoto(corrente.taken_at)}</span>
          {haGps ? (
            <a href={`https://www.google.com/maps?q=${corrente.latitudine},${corrente.longitudine}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center gap-1 font-semibold text-emerald-300">
              <ExternalLink className="size-3.5" aria-hidden="true" />{t("Dove è stata scattata")}
            </a>
          ) : (
            <span className="inline-flex items-center gap-1"><MapPinOff className="size-3.5" aria-hidden="true" />{t("Senza posizione")}</span>
          )}
        </p>
      </div>
    </div>,
    document.body,
  );
}
