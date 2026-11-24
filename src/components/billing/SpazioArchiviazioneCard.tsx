/**
 * Spazio di archiviazione dell'azienda: barra usato/disponibile, cosa occupa
 * spazio e le commesse più pesanti. In Abbonamento e in Cartelle documenti.
 */
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { HardDrive } from "lucide-react";
import { useSpazioArchiviazione } from "@/hooks/useSpazioArchiviazione";
import { fmtBytes } from "@/components/orders/filePreviewUtils";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

function gb(byte: number): string {
  if (byte < 1024 * 1024 * 1024) return fmtBytes(byte) || "0 MB";
  return `${(byte / 1024 ** 3).toFixed(1).replace(".", ",")} GB`;
}

export function SpazioArchiviazioneCard({ compatta = false }: { compatta?: boolean }) {
  const t = useT();
  const { data, isLoading, error } = useSpazioArchiviazione();

  if (error) return null;

  const limiteByte = data?.limite_mb != null && data.limite_mb > 0 ? data.limite_mb * 1024 * 1024 : null;
  const quota = data && limiteByte ? Math.min(1, data.byte_usati / limiteByte) : 0;
  const colore = quota >= 0.95 ? "bg-destructive" : quota >= 0.8 ? "bg-amber-500" : "bg-primary";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          {t("Spazio di archiviazione")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !data ? (
          <Skeleton className="h-14 w-full" />
        ) : (
          <>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span>
                  <strong className="tabular-nums">{gb(data.byte_usati)}</strong>{" "}
                  <span className="text-muted-foreground">
                    {limiteByte ? t("di {limiteByte}", { limiteByte: String(gb(limiteByte) ?? "") }) : t("usati, senza limite")}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {data.file.toLocaleString(intlCampo())} {t("file")}{limiteByte ? ` · ${Math.round(quota * 100)}%` : ""}
                </span>
              </div>
              {limiteByte && (
                <div className="h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={Math.round(quota * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div className={`h-full ${colore}`} style={{ width: `${Math.max(quota * 100, data.byte_usati > 0 ? 1 : 0)}%` }} />
                </div>
              )}
              {quota >= 0.8 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {quota >= 1
                    ? t("Spazio esaurito: non si possono caricare altri file. Libera spazio o passa a un piano superiore.")
                    : t("Stai per esaurire lo spazio del piano.")}
                </p>
              )}
            </div>

            {!compatta && data.voci.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">{t("Cosa occupa spazio")}</p>
                <ul className="space-y-1">
                  {data.voci.map((v) => (
                    <li key={v.categoria} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 min-w-0 truncate">{v.categoria}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{t("{file} file", { file: String(v.file ?? "") })}</span>
                      <span className="w-20 text-right tabular-nums">{gb(v.byte)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.commesse.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">{t("Commesse con più documenti")}</p>
                <ul className="space-y-1">
                  {data.commesse.map((c) => (
                    <li key={c.order_id} className="flex items-center gap-2 text-sm">
                      <Link to={`/azienda/ordini/${c.order_id}`} className="flex-1 min-w-0 truncate hover:underline">
                        {c.codice ? <span className="font-medium">{c.codice}</span> : null}
                        {c.titolo ? <span className="text-muted-foreground"> · {c.titolo}</span> : null}
                      </Link>
                      <span className="text-xs text-muted-foreground tabular-nums">{t("{file} file", { file: String(c.file ?? "") })}</span>
                      <span className="w-20 text-right tabular-nums">{gb(c.byte)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
