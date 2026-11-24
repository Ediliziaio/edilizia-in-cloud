import type { SilvioPageContext } from "@/hooks/useSilvioPageContext";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function SilvioContextBar({ context, enabled, onToggle, entityLabel, companyName }: {
  context: SilvioPageContext;
  enabled: boolean;
  onToggle: () => void;
  entityLabel?: string | null;
  companyName?: string | null;
}) {
  const t = useT();
  return <div className="flex items-center justify-between gap-2 border-b border-blue-100 bg-blue-50/60 px-3 py-2">
    <div className="min-w-0 text-xs">
      {companyName && <p className="mb-0.5 break-words text-[11px] text-blue-800">{t("Azienda: {companyName}", { companyName: String(companyName ?? "") })}</p>}
      <p className="font-medium text-slate-700">{enabled ? `${t("Riferimento:")} ` : `${t("Riferimento disattivato:")} `}{context.route_label}
        {entityLabel ? <span className="break-words"> · {entityLabel}</span> : context.entity_id && <span className="ml-1 font-mono text-[10px] text-slate-500">#{context.entity_id.slice(0, 8)}</span>}
      </p>
      <p className="text-[11px] text-slate-500">{t("Per la prossima domanda. La cronologia resta invariata.")}</p>
    </div>
    <button type="button" onClick={onToggle} aria-pressed={enabled} aria-label={enabled ? t("Non usare questa pagina come riferimento") : t("Usa questa pagina come riferimento")}
      className="min-h-8 shrink-0 rounded-md border border-blue-200 bg-white px-2 text-xs font-medium text-blue-800 hover:bg-blue-50">
      {enabled ? t("Disattiva") : t("Usa pagina")}
    </button>
  </div>;
}
