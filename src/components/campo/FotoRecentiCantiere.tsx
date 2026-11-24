/**
 * Le ultime foto del cantiere dentro la pagina del lavoro (24/11/2026): prima per vederle bisognava aprire «Foto»
 * e da lì non si capiva quante ce n'erano. Qui una riga che scorre col dito, «Scatta» e «Vedi tutte (N)».
 * Le stesse letture del rullino (stessa chiave): scattando, la foto compare qui senza ricaricare.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Camera, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useFotoCantiere } from "@/hooks/useFotoCantiere";
import { ScattaFoto } from "@/components/campo/ScattaFoto";
import { Miniatura, raggruppaFoto } from "@/components/campo/RullinoCampo";
import { FotoViewerCampo } from "@/components/campo/FotoViewerCampo";
import { cn } from "@/lib/utils";
import { PILLOLA_PICCOLA } from "@/lib/campo/stileCampo";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const QUANTE = 12;

export function FotoRecentiCantiere({ orderId, nomeCantiere }: { orderId: string; nomeCantiere?: string }) {
  const t = useT();
  const { user } = useAuth();
  const { foto, isLoading, elimina, getSignedUrl } = useFotoCantiere(orderId);
  const [aperta, setAperta] = useState<number | null>(null);
  const { ordinate } = raggruppaFoto(foto);
  const recenti = ordinate.slice(0, QUANTE);

  return (
    <section aria-labelledby={`foto-${orderId}`} className="rounded-2xl border bg-background p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id={`foto-${orderId}`} className="flex items-baseline gap-1.5 text-[15px] font-bold">
          {t("Foto del cantiere")}
          {foto.length > 0 && <span className="text-[13px] font-semibold text-muted-foreground">{foto.length}</span>}
        </h2>
        <ScattaFoto orderId={orderId} nomeCantiere={nomeCantiere} className={cn(PILLOLA_PICCOLA, "border-primary/25 bg-primary/10 text-primary")}>
          <Camera className="size-4" aria-hidden="true" />{t("Scatta")}
        </ScattaFoto>
      </div>

      {isLoading ? (
        <div className="flex gap-1.5">{Array.from({ length: 4 }).map((_, i) => <span key={i} className="size-20 shrink-0 animate-pulse rounded-lg bg-muted" />)}</div>
      ) : recenti.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t("Ancora nessuna foto. Scatta durante il lavoro: si salvano con data, ora e posizione.")}</p>
      ) : (
        <>
          <div className="-mx-3 flex snap-x gap-1.5 overflow-x-auto px-3 pb-1 scrollbar-hide">
            {recenti.map((f, i) => (
              <Miniatura key={f.id} foto={f} getSignedUrl={getSignedUrl} onApri={() => setAperta(i)} className="size-20 shrink-0 snap-start" />
            ))}
          </div>
          <Link to={`/campo/lavoro/${orderId}/foto`} className="mt-2 flex min-h-11 items-center justify-between rounded-full bg-muted/60 px-4 text-sm font-semibold active:bg-muted">
            {t("Vedi tutte le foto ({n})", { n: foto.length })}
            <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
          </Link>
        </>
      )}

      {aperta != null && recenti[aperta] && (
        <FotoViewerCampo foto={recenti} indice={aperta} onVai={setAperta} onChiudi={() => setAperta(null)}
          getSignedUrl={getSignedUrl} puoEliminare={f => f.uploaded_by === user?.id} onElimina={elimina} />
      )}
    </section>
  );
}
