/**
 * Spesa contro lavori (16/11/2026).
 *
 * Prima qui c'erano due barre: «Budget» sempre al 100% — è la base, non dice niente — e
 * «Ancora da spendere». Il confronto che conta in un cantiere è un altro: quanto ho speso del
 * budget contro quanto ho costruito. Se la spesa corre più dei lavori, il piano sta scappando,
 * e si vede a colpo d'occhio invece che facendo la sottrazione a mente.
 */
import { cn } from "@/lib/utils";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const euro = (v: number) => v.toLocaleString(intlCampo(), { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const pct = (v: number) => `${v.toLocaleString(intlCampo(), { maximumFractionDigits: 0 })}%`;

interface Props {
  speso: number;
  budget: number;
  /** Avanzamento dei lavori, 0-100. Null quando non c'è nessuna fase di cantiere da cui dedurlo. */
  avanzamento: number | null;
  /** Quante fasi di cantiere lo dicono: zero fasi non è «0% fatto», è «non lo sappiamo». */
  fasi?: number;
  budgetParziale?: boolean;
  budgetInBozza?: boolean;
}

export function SpesaControLavori({ speso, budget, avanzamento, fasi, budgetParziale, budgetInBozza }: Props) {
  const t = useT();
  const spesoPct = budget > 0 ? (speso / budget) * 100 : 0;
  const resta = budget - speso;
  // Lo scarto fra i due: spendere più di quanto si costruisce è il segnale da dare.
  const scarto = avanzamento !== null ? spesoPct - avanzamento : null;
  const inAnticipoSullaSpesa = scarto !== null && scarto > 5;

  return (
    <div className="generale-hero-progress">
      <div className="spesa-lavori">
        <Barra
          etichetta={budgetInBozza ? t("Speso sui costi in bozza") : t("Speso del budget")}
          valore={euro(speso)}
          percento={spesoPct}
          tono={spesoPct > 100 ? "bg-red-400" : "bg-orange-400"}
          nota={resta >= 0
            ? `${t("restano {importo}", { importo: euro(resta) })}${budgetParziale ? t(" · stime da completare") : ""}`
            : budgetInBozza ? t("oltre la bozza di {importo}", { importo: euro(-resta) }) : t("oltre il budget di {importo}", { importo: euro(-resta) })}
        />
        {avanzamento !== null && (
          <Barra
            etichetta={t("Lavori fatti")}
            valore={pct(avanzamento)}
            percento={avanzamento}
            tono="bg-sky-400"
            nota={scarto === null
              ? undefined
              : inAnticipoSullaSpesa
                ? t("la spesa corre {perc} più dei lavori", { perc: pct(scarto) })
                : scarto < -5
                  ? t("i lavori corrono {perc} più della spesa", { perc: pct(-scarto) })
                  : t("spesa e lavori vanno di pari passo")}
          />
        )}
      </div>
      <div className="generale-hero-note text-[11px]">
        <span>{t("Importi al netto dell'IVA.")}</span>
        {/* Senza fasi di cantiere non si disegna una barra a zero, che sembrerebbe un cantiere
            fermo: si dice che manca il termine di paragone (16/11/2026). */}
        {avanzamento === null && fasi === 0 && (
          <span> {t("Per confrontare la spesa coi lavori fatti, dividi il lavoro in fasi nel cantiere.")}</span>
        )}
      </div>
    </div>
  );
}

function Barra({ etichetta, valore, percento, tono, nota }: {
  etichetta: string; valore: string; percento: number; tono: string; nota?: string;
}) {
  const larghezza = Math.min(100, Math.max(0, percento));
  return (
    <div className="spesa-lavori-riga">
      <div className="spesa-lavori-testa">
        <span className="generale-progress-label">{etichetta}</span>
        <span className="tabular-nums">
          <span className="font-medium">{valore}</span>
          <span className="generale-progress-percent"> {pct(percento)}</span>
        </span>
      </div>
      <div className="generale-progress-track h-2 overflow-hidden rounded-full" aria-hidden="true">
        <div className={cn("h-full rounded-full transition-[width]", tono)} style={{ width: `${larghezza}%` }} />
      </div>
      {nota && <p className="spesa-lavori-nota">{nota}</p>}
    </div>
  );
}
