/**
 * «Chi fa cosa» nella pagina Rapportini e presenze: operaio, capo, ufficio e giornale
 * con le regole che si stanno guardando (anche quelle non ancora salvate), così il
 * titolare vede subito cosa cambia per ognuno. Il testo viene da `chiFaCosa`.
 */
import { Link } from "react-router-dom";
import { ArrowUpRight, ClipboardCheck, HardHat, NotebookPen, UserRound } from "lucide-react";
import { SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { chiFaCosa, type RuoloChiFaCosa } from "@/lib/campo/chiFaCosa";
import type { RegoleCampo } from "@/lib/campo/regoleCampo";

const ICONE: Record<RuoloChiFaCosa, typeof UserRound> = {
  operaio: UserRound,
  capo: HardHat,
  ufficio: ClipboardCheck,
  giornale: NotebookPen,
};

export function ChiFaCosaRiquadro({
  regole, modificato, evidenziata, linkVisibili = {}, bozzaSerale,
}: {
  regole: RegoleCampo; modificato: boolean; evidenziata?: boolean;
  /** La bozza serale del giornale è accesa? `undefined` finché non si sa. */
  bozzaSerale?: boolean;
  /** Il link si mostra solo a chi può aprire quella pagina: altrimenti porta a un «accesso negato». */
  linkVisibili?: Partial<Record<RuoloChiFaCosa, boolean>>;
}) {
  return (
    <SezioneImpostazione
      id="chi-fa-cosa"
      evidenziata={evidenziata}
      titolo="Chi fa cosa"
      descrizione={modificato
        ? "Con le scelte non ancora salvate: diventa vero quando salvi."
        : "Con le regole attuali dell’azienda. Cambia se cambi le scelte qui sotto."}
    >
      <div className="grid gap-3 p-4 sm:grid-cols-2" data-testid="chi-fa-cosa">
        {chiFaCosa(regole, { bozzaSerale }).map(({ ruolo, titolo, righe, link }) => {
          const Icona = ICONE[ruolo];
          return (
            <div key={ruolo} className="min-w-0 rounded-lg border bg-muted/20 p-3" aria-label={titolo} role="group">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Icona className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{titolo}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {righe.map((r) => <li key={r}>{r}</li>)}
              </ul>
              {linkVisibili[ruolo] && link && (
                <Link to={link.to} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline">
                  {link.testo}<ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </SezioneImpostazione>
  );
}
