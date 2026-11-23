import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { bankRpc, type BankPage } from "@/lib/finance/bankWorkspace";
import { formatDateIt } from "@/lib/formatters";
import { formatTreasuryCurrency as money } from "@/lib/treasury";
import { prettyTxDesc } from "./txLabel";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
export function BankOrderMovements({
  company,
  order,
  richiudibile = false,
}: {
  company: string;
  order: string;
  richiudibile?: boolean;
}) {
  const t = useT();
  const q = useQuery({
    queryKey: ["bank-contesto-movimenti", company, "commessa", order],
    queryFn: () =>
      bankRpc<BankPage>("bank_movimenti_elenco", {
        p_company: company,
        p_filters: { target: order, target_kind: "commessa" },
        p_offset: 0,
        p_limit: 10,
      }),
    staleTime: 30_000,
  });
  if (q.isPending)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("Caricamento riferimenti bancari…")}
      </p>
    );
  if (q.isError)
    return (
      <div role="alert" className="rounded-xl border p-4 text-sm">
        {t("Riferimenti bancari non disponibili.")}{" "}
        <button
          className="text-primary underline"
          onClick={() => void q.refetch()}
        >
          {t("Riprova")}
        </button>
      </div>
    );
  if (!q.data.count) return null;
  const Container = richiudibile ? "details" : "section";
  return (
    <Container className="income-bank-movements rounded-xl border bg-card p-4">
      {richiudibile ? <summary className="cursor-pointer text-sm font-semibold">{t("Movimenti bancari collegati")} <span className="text-muted-foreground">({q.data.count})</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{t("Bonifici e quote attribuite alla commessa. Apri per controllare i movimenti.")}</span></summary> : <h3 className="font-semibold">
        {t("Movimenti bancari collegati")}{" "}
        <span className="text-muted-foreground">({q.data.count})</span>
      </h3>}
      <p className="mt-3 text-xs text-muted-foreground">
        {t("Il bonifico può comprendere più commesse. La quota attribuita è indicata soltanto quando è stata specificata.")}
      </p>
      <div className="mt-3 overflow-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-2 text-left">{t("Data")}</th>
              <th className="px-3 text-left">{t("Movimento")}</th>
              <th className="px-3 text-right">{t("Bonifico complessivo")}</th>
              <th className="px-3 text-right">{t("Quota commessa")}</th>
              <th>
                <span className="sr-only">{t("Apri")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {q.data.rows.map((m) => (
              <tr className="border-t" key={m.id}>
                <td className="py-3 whitespace-nowrap">
                  {formatDateIt(m.booking_date)}
                </td>
                <td className="max-w-60 truncate px-3" title={prettyTxDesc(m)}>
                  {prettyTxDesc(m)}
                </td>
                <td className="px-3 text-right tabular-nums whitespace-nowrap">
                  {money(m.amount, "—", m.currency)}
                </td>
                <td className="px-3 text-right tabular-nums whitespace-nowrap">
                  {m.links.contexts.find(
                    (c) => c.kind === "commessa" && c.id === order,
                  )
                    ? money(
                        m.links.contexts.find(
                          (c) => c.kind === "commessa" && c.id === order,
                        )!.amount,
                        "—",
                        m.currency,
                      )
                    : t("Non specificata")}
                </td>
                <td>
                  <Link
                    to={`/azienda/tesoreria?tab=transazioni&movimento=${m.id}`}
                    aria-label={t("Apri bonifico {descrizione}", { descrizione: String(prettyTxDesc(m) ?? "") })}
                    className="inline-flex p-2 text-primary"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {q.data.count > 10 && (
        <p className="mt-2 text-xs text-muted-foreground">{t("Ultimi 10 di {n} movimenti. Per la ricerca completa apri Tesoreria e cerca il codice della commessa.", { n: String(q.data.count ?? "") })}</p>
      )}
    </Container>
  );
}
