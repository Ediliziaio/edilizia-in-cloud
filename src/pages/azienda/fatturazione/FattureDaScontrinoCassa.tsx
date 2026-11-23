import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { chiaveQueryCassa } from "@/lib/cassaInCloud";
import { formatDateIt } from "@/lib/formatters";
import type { FatturaDaCassa } from "../../../../shared/cassaInCloud";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

function DocumentoCollegato({ companyId, riferimento, attivo }: { companyId: string; riferimento: FatturaDaCassa; attivo: boolean }) {
  const t = useT();
  const { id, numero, data, differita } = riferimento;
  const documento = useQuery({
    queryKey: [...chiaveQueryCassa(companyId), "fattura-collegata", id, numero, data],
    enabled: attivo && !!numero && !!data,
    queryFn: async () => {
      const [importate, native] = await Promise.all([
        supabase.from("invoices").select("id").eq("company_id", companyId)
          .eq("invoice_number", numero).eq("issue_date", data).is("deleted_at", null)
          .in("document_type", ["invoice", "TD01", "TD24", "fattura", "fattura_riepilogativa"]).limit(2),
        supabase.from("documenti_fiscali").select("id").eq("company_id", companyId)
          .eq("numero", numero).eq("data_emissione", data).is("deleted_at", null)
          .in("tipo", ["fattura", "fattura_riepilogativa"]).neq("stato", "bozza").limit(2),
      ]);
      if (importate.error || native.error) throw importate.error ?? native.error;
      const trovate = [...importate.data.map((f) => `/azienda/documenti/importata/${f.id}`),
        ...native.data.map((f) => `/azienda/documenti/${f.id}/dettaglio`)];
      return trovate.length === 1 ? trovate[0] : null;
    },
  });
  return (
    <li className="min-w-0 py-1">
      <p>{differita ? t("Fattura differita") : t("Fattura")} {numero || id}{data && ` · ${formatDateIt(data)}`}</p>
      {documento.data && <Link to={documento.data} className="text-primary underline underline-offset-2">{t("Apri corrispondenza in Fatture")}</Link>}
    </li>
  );
}

export function FattureDaScontrinoCassa({ companyId, fatture }: { companyId: string; fatture: FatturaDaCassa[] }) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  if (!fatture.length) return null;
  return <details className="mt-1 text-xs" onToggle={(e) => setAperto(e.currentTarget.open)}>
    <summary className="cursor-pointer text-primary">{t("Riferimenti fattura da Cassa in Cloud")}</summary>
    {aperto && <ul className="divide-y">{fatture.map((f) => <DocumentoCollegato key={f.id} companyId={companyId} riferimento={f} attivo={aperto} />)}</ul>}
  </details>;
}
