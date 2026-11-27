/**
 * Dentro Cantiere → Rapportini (27/11/2026): due voci, il diario interno e i rendiconti al committente.
 * Non è una scheda in più: stessa pagina, un selettore denso in testa. Il numero dei rendiconti lo legge
 * chi ha il permesso sugli importi (la stessa richiesta dell'elenco, che quindi non si rifà).
 */
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/usePermissions";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { cn } from "@/lib/utils";
import { elencoRendiconti } from "@/lib/rendiconti/rendicontiGiornalieri";
import type { SezioneDiario } from "@/lib/orders/detailNavigation";

export function SezioniDiario({ orderId, value, onChange, nRapportini }: {
  orderId: string;
  value: SezioneDiario;
  onChange: (v: SezioneDiario) => void;
  nRapportini?: number | null;
}) {
  const t = useT();
  const { canViewOrderAmounts } = usePermissions();
  const elenco = useQuery({
    queryKey: ["rendiconti-giornalieri", orderId],
    enabled: canViewOrderAmounts,
    queryFn: () => elencoRendiconti(orderId),
  });
  const voci: Array<{ valore: SezioneDiario; etichetta: string; n?: number | null }> = [
    { valore: "rapportini", etichetta: t("Rapportini"), n: nRapportini },
    { valore: "rendiconti", etichetta: t("Rendiconti al committente"), n: canViewOrderAmounts ? elenco.data?.length : null },
  ];
  return (
    <div role="group" aria-label={t("Rapportini e rendiconti")} className="inline-flex rounded-md border bg-muted/40 p-0.5">
      {voci.map((v) => (
        <button key={v.valore} type="button" aria-pressed={value === v.valore} onClick={() => onChange(v.valore)}
          className={cn("h-7 rounded px-3 text-xs font-medium transition-colors",
            value === v.valore ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {v.etichetta}{typeof v.n === "number" ? ` (${v.n})` : ""}
        </button>
      ))}
    </div>
  );
}
