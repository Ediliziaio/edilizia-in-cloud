/**
 * Prima apertura dell'app operai (26/11/2026, piano campo completo, punto 1.1).
 *
 * 1. Se la persona non ha mai scelto una lingua (né sul profilo né sul telefono), prima di tutto la lingua:
 *    ogni lingua scritta come la legge chi la parla. Un tocco e l'app cambia.
 * 2. Subito dopo, tre schermate su come si usa (timbra, rapportino, segnala), saltabili.
 * Si vede una volta: dopo la scelta la lingua è sul profilo, e chi l'aveva già scelta non vede niente.
 */
import { useState } from "react";
import { AlertTriangle, Clock, FileText, Languages } from "lucide-react";
import { LINGUE } from "@/lib/campo/lingua/lingue";
import { useLinguaCampo } from "@/lib/campo/lingua/LinguaCampo";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const GUIDA = [
  { icona: Clock, titolo: "Timbra", testo: "Un tocco quando arrivi e quando vai via." },
  { icona: FileText, titolo: "Rapportino", testo: "Cosa hai fatto, le ore, una foto. Anche a voce." },
  { icona: AlertTriangle, titolo: "Segnala", testo: "Un problema, un infortunio, il materiale che manca." },
] as const;

export function PrimaAperturaCampo() {
  const { scelta, scegli, t } = useLinguaCampo();
  const { profile } = useAuth();
  // null = forse serve la lingua: si decide solo a profilo caricato (prima «scelta» è falso per tutti).
  const [passo, setPasso] = useState<null | number | "fatto">(null);
  if (passo === "fatto") return null;
  if (passo === null && (!profile || scelta)) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="prima-apertura-titolo"
      className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      {passo === null ? (
        <div className="mx-auto w-full max-w-sm space-y-4 py-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-primary/10">
              <Languages className="size-7 text-primary" aria-hidden="true" />
            </span>
            {/* Il titolo in italiano e, sotto, solo icone e nomi: chi non legge l'italiano riconosce la propria lingua. */}
            <h1 id="prima-apertura-titolo" className="text-xl font-bold">{t("Scegli la tua lingua")}</h1>
          </div>
          <ul className="space-y-2">
            {LINGUE.map(l => (
              <li key={l.codice}>
                <button type="button" onClick={() => { scegli(l.codice); setPasso(0); }}
                  className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border bg-background px-4 text-start active:bg-muted">
                  <span dir={l.rtl ? "rtl" : "ltr"} className="text-base font-semibold">{l.nome}</span>
                  {l.codice !== "it" && <span className="text-xs text-muted-foreground">{l.nomeItaliano}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <Guida passo={passo} avanti={() => setPasso(passo + 1 < GUIDA.length ? passo + 1 : "fatto")} salta={() => setPasso("fatto")} />
      )}
    </div>
  );
}

function Guida({ passo, avanti, salta }: { passo: number; avanti: () => void; salta: () => void }) {
  const { t } = useLinguaCampo();
  const voce = GUIDA[passo];
  const Icona = voce.icona;
  const ultimo = passo === GUIDA.length - 1;
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col py-4">
      <div className="flex justify-end">
        <button type="button" onClick={salta} className="min-h-11 px-3 text-sm font-semibold text-muted-foreground">{t("Salta")}</button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <span className="flex size-24 items-center justify-center rounded-full bg-primary/10">
          <Icona className="size-12 text-primary" aria-hidden="true" />
        </span>
        <h1 id="prima-apertura-titolo" className="text-2xl font-bold">{t(voce.titolo)}</h1>
        <p className="text-base text-muted-foreground">{t(voce.testo)}</p>
      </div>
      <div className="flex justify-center gap-1.5 py-4" aria-hidden="true">
        {GUIDA.map((_, i) => <span key={i} className={cn("size-2 rounded-full", i === passo ? "bg-primary" : "bg-muted")} />)}
      </div>
      <button type="button" onClick={avanti} className="min-h-12 w-full rounded-2xl bg-primary text-base font-semibold text-primary-foreground">
        {ultimo ? t("Inizia") : t("Avanti")}
      </button>
    </div>
  );
}
