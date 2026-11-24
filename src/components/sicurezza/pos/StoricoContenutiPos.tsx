import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { readAllPages } from "@/lib/personale/readAllPages";
import { normalizzaPos } from "../../../../supabase/functions/_shared/posModello";
import { costruisciHtmlPos, type RevisionePos } from "@/lib/sicurezza/posHtml";
import { Button } from "@/components/ui/button";
import { PrintPreviewModal } from "@/components/shared/PrintPreviewModal";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

type Copia = {
  id: string;
  revisione: number;
  acquisito_il: string;
  fonte: string;
  snapshot: {
    contenuto: unknown;
    status: string;
    revisioni: RevisionePos[];
    approvato_da_nome: string | null;
    approvato_il: string | null;
  };
};
export function StoricoContenutiPos({
  companyId,
  posId,
  codiceCommessa,
}: {
  companyId: string;
  posId: string;
  codiceCommessa?: string | null;
}) {
  const t = useT();
  const p = usePermissions();
  const [aperto, setAperto] = useState(false);
  const [stampa, setStampa] = useState<{ html: string; rev: number } | null>(
    null,
  );
  const q = useQuery({
    queryKey: ["pos-storico-contenuti", companyId, posId],
    enabled: aperto && !!companyId && p.canViewSicurezzaCantiere,
    queryFn: async () => {
      const rows = await readAllPages((from, to) =>
        supabase
          .from("pos_contenuti_archiviati" as never)
          .select("id,revisione,acquisito_il,fonte,snapshot")
          .eq("company_id", companyId)
          .eq("pos_id", posId)
          .order("revisione", { ascending: false })
          .order("id")
          .range(from, to),
      );
      return rows as unknown as Copia[];
    },
  });
  if (!p.canViewSicurezzaCantiere) return null;
  return (
    <details
      className="rounded-xl border bg-card p-4"
      onToggle={(e) => setAperto(e.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-semibold">
        {t("Storico dei contenuti approvati")}
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("Copie non modificabili del contenuto salvato per revisione. L’anteprima ricostruisce il documento da quei dati; non rappresenta l’originale PDF firmato né conserva i byte degli allegati.")}
      </p>
      {aperto &&
        (q.isError ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {t("Storico non disponibile.")}{" "}
            <Button variant="link" onClick={() => void q.refetch()}>
              {t("Riprova")}
            </Button>
          </p>
        ) : q.isLoading ? (
          <p className="mt-3 text-sm">{t("Caricamento storico…")}</p>
        ) : !q.data?.length ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("Nessuna copia approvata archiviata per questo POS.")}
          </p>
        ) : (
          <ul className="mt-3 divide-y">
            {q.data.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{t("Revisione {revisione}", { revisione: String(c.revisione ?? "") })}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("Acquisita il {data}", { data: new Date(c.acquisito_il).toLocaleString(intlCampo()) })}
                    {c.fonte === "stato_corrente_precedente"
                      ? ` ${t("· stato disponibile all’attivazione dello storico")}`
                      : ""}
                  </p>
                  {c.snapshot.approvato_da_nome && (
                    <p className="text-xs text-muted-foreground">{t("Approvazione interna: {approvato_da_nome}", { approvato_da_nome: String(c.snapshot.approvato_da_nome ?? "") })}</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setStampa({
                      rev: c.revisione,
                      html: costruisciHtmlPos({
                        contenuto: normalizzaPos(c.snapshot.contenuto),
                        stato: c.snapshot.status,
                        revisione: c.revisione,
                        revisioni: c.snapshot.revisioni ?? [],
                        approvatoDa: c.snapshot.approvato_da_nome,
                        approvatoIl: c.snapshot.approvato_il,
                        codiceCommessa,
                        avvisoCopia: "ANTEPRIMA RICOSTRUITA DAL CONTENUTO ARCHIVIATO. Non è l’originale PDF storico e non attesta firme precedenti.",
                      }),
                    })
                  }
                >
                  {t("Consulta contenuto")}
                </Button>
              </li>
            ))}
          </ul>
        ))}
      {stampa && (
        <PrintPreviewModal
          htmlContent={stampa.html}
          fileName={`POS-${codiceCommessa ?? posId}-rev${stampa.rev}-contenuto-archiviato`}
          title={t("Contenuto archiviato · revisione {rev}", { rev: String(stampa.rev ?? "") })}
          open
          onOpenChange={(o) => !o && setStampa(null)}
        />
      )}
    </details>
  );
}
