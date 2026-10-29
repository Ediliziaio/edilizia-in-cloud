/**
 * OrdineAppaltatoreLavoroCard — pannello "Lavoro per appaltatore"
 * ────────────────────────────────────────────────────────────────
 * Mostra i campi specifici del Modulo Appaltatori:
 *   - come viene pagata (a corpo / a misura) e il tetto concordato
 *   - il contratto del committente da cui scendono listino e condizioni
 *   - il numero d'ordine del committente, che va in testa alla fattura
 *   - indirizzo cantiere, posizione materiali, date, briefing operativo
 *
 * Su una commessa a misura l'importo mostrato altrove e' una STIMA: qui si
 * dice, perche' un numero senza quell'etichetta viene letto come certo.
 *
 * Non viene MAI montato per ordini standard (`order_type='cliente'`):
 * il guard è demandato al chiamante (OrderDetail) per evitare layout
 * vuoti su record legacy.
 */
import { HardHat, MapPin, Package, FileText, CalendarDays, Wallet, FileSignature, Hash } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { QuoteCard } from "@/components/marketing/preventivi/ui/builderUI";

interface OrdineAppaltatoreLavoroCardProps {
  workAddress: string | null;
  workDescription: string | null;
  materialsLocation: string | null;
  workStartDate: string | null;
  workEndDate: string | null;
  valorizzazione?: "a_corpo" | "a_misura" | null;
  tettoImporto?: number | null;
  riferimentoCommittente?: string | null;
  nomeContratto?: string | null;
  /** Gli importi li vede solo chi ne ha il permesso. */
  mostraImporti?: boolean;
  /** Porta al rendiconto: su una commessa a misura e' dove sta il valore vero. */
  onApriRendiconto?: () => void;
}

const euroIT = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);

const fmtDate = (iso: string | null) => {
  if (!iso) return null;
  try {
    return format(new Date(iso), "d MMM yyyy", { locale: it });
  } catch {
    return iso;
  }
};

const Field = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) => (
  <div className="flex items-start gap-3">
    <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <div className="text-sm text-slate-900 mt-0.5 whitespace-pre-line break-words">
        {value || <span className="text-slate-400">Non specificato</span>}
      </div>
    </div>
  </div>
);

export function OrdineAppaltatoreLavoroCard({
  workAddress,
  workDescription,
  materialsLocation,
  workStartDate,
  workEndDate,
  valorizzazione,
  tettoImporto,
  riferimentoCommittente,
  nomeContratto,
  mostraImporti = true,
  onApriRendiconto,
}: OrdineAppaltatoreLavoroCardProps) {
  const start = fmtDate(workStartDate);
  const end = fmtDate(workEndDate);
  const dateRange =
    start && end
      ? `${start} → ${end}`
      : start
        ? `Inizio: ${start}`
        : end
          ? `Fine: ${end}`
          : null;

  const aMisura = valorizzazione === "a_misura";

  return (
    <QuoteCard
      title="Lavoro in appalto"
      icon={<HardHat className="h-4 w-4" />}
      subtitle="Il lavoro che un'impresa committente ti ha passato."
      action={onApriRendiconto ? (
        <button type="button" onClick={onApriRendiconto}
          className="text-sm font-medium text-orange-600 underline-offset-2 hover:underline">
          Rendiconto
        </button>
      ) : undefined}
    >
      <div className="grid sm:grid-cols-2 gap-4">
        {valorizzazione && (
          <Field
            icon={<Wallet className="h-4 w-4" />}
            label="Come viene pagato"
            value={
              <span>
                {aMisura ? "A misura" : "A corpo"}
                <span className="block text-xs text-slate-500">
                  {aMisura
                    ? "L'importo esce dalla rendicontazione: quello sulla commessa è una stima."
                    : "Importo concordato prima."}
                </span>
                {aMisura && mostraImporti && typeof tettoImporto === "number" && tettoImporto > 0 && (
                  <span className="block text-xs text-slate-600">
                    Tetto concordato: {euroIT(tettoImporto)}
                  </span>
                )}
              </span>
            }
          />
        )}
        {nomeContratto && (
          <Field
            icon={<FileSignature className="h-4 w-4" />}
            label="Contratto"
            value={nomeContratto}
          />
        )}
        {riferimentoCommittente && (
          <Field
            icon={<Hash className="h-4 w-4" />}
            label="Loro numero d'ordine"
            value={riferimentoCommittente}
          />
        )}
        <Field
          icon={<MapPin className="h-4 w-4" />}
          label="Indirizzo cantiere"
          value={workAddress}
        />
        <Field
          icon={<Package className="h-4 w-4" />}
          label="Posizione materiali"
          value={materialsLocation}
        />
        <Field
          icon={<CalendarDays className="h-4 w-4" />}
          label="Date lavori"
          value={dateRange}
        />
        <Field
          icon={<FileText className="h-4 w-4" />}
          label="Briefing operativo"
          value={workDescription}
        />
      </div>
    </QuoteCard>
  );
}
