/**
 * OrdineAppaltatoreLavoroCard — pannello "Lavoro per appaltatore"
 * ────────────────────────────────────────────────────────────────
 * Mostra i campi specifici del Modulo Appaltatori:
 *   - indirizzo cantiere
 *   - descrizione operativa del lavoro
 *   - posizione materiali
 *   - date inizio/fine
 *
 * Non viene MAI montato per ordini standard (`order_type='cliente'`):
 * il guard è demandato al chiamante (OrderDetail) per evitare layout
 * vuoti su record legacy.
 */
import { HardHat, MapPin, Package, FileText, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { QuoteCard } from "@/components/marketing/preventivi/ui/builderUI";

interface OrdineAppaltatoreLavoroCardProps {
  workAddress: string | null;
  workDescription: string | null;
  materialsLocation: string | null;
  workStartDate: string | null;
  workEndDate: string | null;
}

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

  return (
    <QuoteCard
      title="Lavoro per appaltatore"
      icon={<HardHat className="h-4 w-4" />}
      subtitle="Sola manodopera commissionata da impresa committente."
    >
      <div className="grid sm:grid-cols-2 gap-4">
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
