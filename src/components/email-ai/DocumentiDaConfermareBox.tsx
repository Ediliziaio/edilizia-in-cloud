/**
 * Il numero dei documenti da confermare, in una riga, nella home da telefono (Attività).
 * Senza niente da confermare, o per chi non può vedere le email, non occupa posto.
 * Il conteggio e le sue regole: useDocumentiDaConfermareCount e lib/email-ai/documentiDaConfermare.
 */
import { Link } from "react-router-dom";
import { ChevronRight, FileCheck2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { conteggioCompatto } from "@/lib/email-ai/documentiDaConfermare";
import { useDocumentiDaConfermareCount } from "@/lib/email-ai/hooks";

export function DocumentiDaConfermareBox() {
  const { effectiveCompany } = useAuth();
  const puoVedereLeEmail = !!usePermissions().canViewMarketingEmail;
  const numero = useDocumentiDaConfermareCount(effectiveCompany?.id, puoVedereLeEmail);
  if (!puoVedereLeEmail || !numero.data) return null;
  return (
    <Link
      to="/azienda/email/documenti"
      className="flex items-center gap-2 rounded-xl border border-blue-200 bg-card px-4 py-2.5 text-sm transition-colors hover:bg-blue-50/50"
    >
      <FileCheck2 className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
      <span className="min-w-0 flex-1 truncate font-semibold">Documenti da confermare</span>
      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">{conteggioCompatto(numero.data)}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
    </Link>
  );
}
