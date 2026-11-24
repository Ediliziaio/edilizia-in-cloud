/**
 * Il rullino delle foto del cantiere nell'area operai (24/11/2026): come la galleria del telefono. Tre foto per
 * riga, quadrate, raggruppate per giorno («Oggi», «Ieri», la data); si tocca e si sfoglia a tutto schermo.
 * Prima: schede grandi due per riga, ognuna con un voto AI che per l'operaio non vuol dire niente (e in rosso
 * «0.0/10» quando l'AI non risponde), testi solo in italiano.
 *
 * `appena` evidenzia le foto appena caricate: chi scatta vede subito che sono arrivate.
 */
import { useEffect, useMemo, useState } from "react";
import { Camera, MapPinOff } from "lucide-react";
import type { FotoCantiere } from "@/hooks/useFotoCantiere";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";
import { FotoViewerCampo } from "@/components/campo/FotoViewerCampo";

export function giornoDellaFoto(iso: string, oggi: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "senza-data";
  const chiave = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const ieri = new Date(oggi); ieri.setDate(oggi.getDate() - 1);
  if (chiave(d) === chiave(oggi)) return "oggi";
  if (chiave(d) === chiave(ieri)) return "ieri";
  return chiave(d);
}

/** Le foto dalla più recente, a gruppi per giorno. L'indice è quello della lista intera: serve a sfogliare. */
export function raggruppaFoto(foto: FotoCantiere[], oggi: Date = new Date()) {
  const ordinate = [...foto].sort((a, b) => new Date(b.taken_at).getTime() - new Date(a.taken_at).getTime());
  const gruppi: { giorno: string; righe: { foto: FotoCantiere; indice: number }[] }[] = [];
  ordinate.forEach((f, indice) => {
    const giorno = giornoDellaFoto(f.taken_at, oggi);
    const ultimo = gruppi[gruppi.length - 1];
    if (ultimo?.giorno === giorno) ultimo.righe.push({ foto: f, indice });
    else gruppi.push({ giorno, righe: [{ foto: f, indice }] });
  });
  return { ordinate, gruppi };
}

export function Miniatura({ foto, getSignedUrl, onApri, evidenzia, className }: {
  foto: FotoCantiere;
  getSignedUrl: (path: string) => Promise<string | null>;
  onApri: () => void;
  evidenzia?: boolean;
  className?: string;
}) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [pronta, setPronta] = useState(false);
  useEffect(() => {
    let annullato = false;
    // La miniatura se c'è (più leggera sul 4G); se non si trova, la foto intera.
    void (async () => {
      let u = foto.thumbnail_path ? await getSignedUrl(foto.thumbnail_path) : null;
      if (!u) u = await getSignedUrl(foto.storage_path);
      if (!annullato) { setUrl(u); setPronta(true); }
    })();
    return () => { annullato = true; };
  }, [foto.thumbnail_path, foto.storage_path, getSignedUrl]);
  const senzaGps = foto.latitudine == null || foto.longitudine == null;
  return (
    <button type="button" onClick={onApri} aria-label={t("Apri la foto delle {ora}", { ora: new Date(foto.taken_at).toLocaleTimeString(intlCampo(), { hour: "2-digit", minute: "2-digit" }) })}
      className={cn("relative block aspect-square overflow-hidden rounded-lg bg-muted active:opacity-80", evidenzia && "ring-2 ring-primary ring-offset-1", className)}>
      {!pronta ? <span className="absolute inset-0 animate-pulse bg-muted" />
        : url ? <img src={url} alt="" loading="lazy" className="size-full object-cover" />
        : <span className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground">{t("Non disponibile")}</span>}
      {senzaGps && pronta && (
        <span className="absolute bottom-1 start-1 rounded-full bg-black/50 p-0.5 text-white" title={t("Senza posizione")}>
          <MapPinOff className="size-3" aria-hidden="true" />
        </span>
      )}
    </button>
  );
}

export function RullinoCampo({ foto, isLoading, getSignedUrl, puoEliminare, onElimina, appena }: {
  foto: FotoCantiere[];
  isLoading: boolean;
  getSignedUrl: (path: string) => Promise<string | null>;
  puoEliminare: (f: FotoCantiere) => boolean;
  onElimina: (f: FotoCantiere) => void;
  /** Momento dell'ultimo caricamento da questo telefono: le foto nate dopo hanno il bordo. */
  appena?: number | null;
}) {
  const t = useT();
  const [aperta, setAperta] = useState<number | null>(null);
  const { ordinate, gruppi } = useMemo(() => raggruppaFoto(foto), [foto]);

  if (isLoading) {
    return <div className="grid grid-cols-3 gap-1">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}</div>;
  }
  if (foto.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed py-8 text-center text-muted-foreground">
        <Camera className="size-6" aria-hidden="true" />
        <p className="text-sm font-semibold">{t("Ancora nessuna foto")}</p>
        <p className="px-6 text-xs">{t("Scatta durante il lavoro: ogni foto si salva con data, ora e posizione.")}</p>
      </div>
    );
  }

  const etichetta = (giorno: string) => giorno === "oggi" ? t("Oggi") : giorno === "ieri" ? t("Ieri") : giorno === "senza-data" ? t("Senza data")
    : new Date(`${giorno}T12:00:00`).toLocaleDateString(intlCampo(), { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-4">
      {gruppi.map(g => (
        <section key={g.giorno} aria-label={etichetta(g.giorno)} className="space-y-1.5">
          <h3 className="flex items-baseline gap-2 px-0.5">
            <span className="text-[15px] font-bold first-letter:uppercase">{etichetta(g.giorno)}</span>
            <span className="text-xs text-muted-foreground">{t("{n} foto", { n: g.righe.length })}</span>
          </h3>
          <div className="grid grid-cols-3 gap-1">
            {g.righe.map(({ foto: f, indice }) => (
              <Miniatura key={f.id} foto={f} getSignedUrl={getSignedUrl} onApri={() => setAperta(indice)}
                evidenzia={appena != null && new Date(f.created_at).getTime() >= appena - 5_000} />
            ))}
          </div>
        </section>
      ))}
      {aperta != null && ordinate[aperta] && (
        <FotoViewerCampo foto={ordinate} indice={aperta} onVai={setAperta} onChiudi={() => setAperta(null)}
          getSignedUrl={getSignedUrl} puoEliminare={puoEliminare} onElimina={onElimina} />
      )}
    </div>
  );
}
