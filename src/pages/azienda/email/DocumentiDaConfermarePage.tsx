/**
 * /azienda/email/documenti — i documenti che l'AI ha letto dagli allegati delle email e che
 * aspettano una persona. Ci si arriva dal numero in home (Attività e Panoramica operativa) e
 * dalla barra laterale delle email. L'elenco e le sue regole: DocumentiDaConfermareLista.
 */
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { DocumentiDaConfermareLista } from "@/components/email-ai/DocumentiDaConfermareLista";
import { useAuth } from "@/contexts/AuthContext";
import { conteggioCompatto } from "@/lib/email-ai/documentiDaConfermare";
import { useDocumentiDaConfermareCount } from "@/lib/email-ai/hooks";

export default function DocumentiDaConfermarePage() {
  const { effectiveCompany } = useAuth();
  const numero = useDocumentiDaConfermareCount(effectiveCompany?.id);
  return (
    <div className="mx-auto w-full max-w-3xl space-y-3">
      <div className="flex items-center gap-2">
        <Link to="/azienda/email" aria-label="Torna alle email" className="-ml-2 flex items-center justify-center rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Documenti da confermare</h1>
        {!!numero.data && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">{conteggioCompatto(numero.data)}</span>
        )}
      </div>
      <DocumentiDaConfermareLista />
    </div>
  );
}
