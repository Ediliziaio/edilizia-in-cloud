/**
 * CarichiDaRegistrareCard — P0-A · Regia WhatsApp.
 *
 * I DDT fotografati dall'operaio in cantiere passano nella stessa pipeline del
 * flusso email (email_documento_estratto → buildDdtCarico → email_ddt_carico),
 * ma con email_id NULL: non compaiono nei pannelli per-email. Questo pannello
 * company-wide li mostra al titolare per la conferma finale del carico magazzino.
 *
 * Nessuna scrittura cieca: la giacenza si tocca solo dopo conferma umana.
 */

import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { Loader2, PackageCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useAggiornaStatoCaricoDdt,
  useCarichiDaRegistrare,
  type DdtCarico,
  type DdtCaricoRiga,
} from "@/lib/email-ai/hooks";

function relativeDate(value: string | null | undefined) {
  if (!value) return "data non disponibile";
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true, locale: it });
  } catch {
    return "data non disponibile";
  }
}

function scostamentoLabel(riga: DdtCaricoRiga) {
  if (riga.scostamento == null) return { text: "non a ordine", tone: "muted" as const };
  if (riga.scostamento === 0) return { text: "ok", tone: "ok" as const };
  const segno = riga.scostamento > 0 ? "+" : "";
  return { text: `${segno}${riga.scostamento}`, tone: "warn" as const };
}

function RigaRow({ riga }: { riga: DdtCaricoRiga }) {
  const sc = scostamentoLabel(riga);
  const toneClass =
    sc.tone === "warn"
      ? "text-amber-700"
      : sc.tone === "ok"
        ? "text-emerald-700"
        : "text-muted-foreground";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 border-t py-2 first:border-t-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {riga.descrizione || "Articolo senza descrizione"}
        </p>
        <p className="text-xs text-muted-foreground">
          {riga.codice ? `cod. ${riga.codice} · ` : ""}
          bolla {riga.qta_bolla}
          {riga.qta_ordine != null ? ` · ordine ${riga.qta_ordine}` : ""}
        </p>
        {riga.note ? <p className="mt-0.5 text-[11px] text-muted-foreground">{riga.note}</p> : null}
      </div>
      <span className={`shrink-0 text-sm font-semibold tabular-nums ${toneClass}`}>{sc.text}</span>
    </div>
  );
}

function CaricoRow({
  carico,
  busy,
  onConferma,
  onScarta,
}: {
  carico: DdtCarico;
  busy: boolean;
  onConferma: () => void;
  onScarta: () => void;
}) {
  const righe = Array.isArray(carico.righe) ? carico.righe : [];
  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">DDT {carico.ddt_numero ?? "s/n"}</Badge>
            {carico.senza_ordine ? (
              <Badge variant="outline">Senza ordine collegato</Badge>
            ) : (
              <Badge variant="outline">Ordine {carico.purchase_order_numero ?? "collegato"}</Badge>
            )}
            {carico.scostamenti_totali > 0 ? (
              <Badge variant="default" className="bg-amber-500 hover:bg-amber-500">
                {carico.scostamenti_totali} scostamenti
              </Badge>
            ) : (
              <Badge variant="outline" className="text-emerald-700">Quantità coerenti</Badge>
            )}
            <span className="text-xs text-muted-foreground">{relativeDate(carico.created_at)}</span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="ghost" onClick={onScarta} disabled={busy}>
            Scarta
          </Button>
          <Button size="sm" onClick={onConferma} disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            Registra carico
          </Button>
        </div>
      </div>
      {righe.length > 0 ? (
        <div className="mt-3 rounded-lg border bg-muted/20 px-3 py-1">
          {righe.map((riga, i) => (
            <RigaRow key={riga.po_item_id ?? `${riga.codice ?? "x"}-${i}`} riga={riga} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function CarichiDaRegistrareCard({ companyId }: { companyId: string | null | undefined }) {
  const { data, isLoading } = useCarichiDaRegistrare(companyId);
  const aggiorna = useAggiornaStatoCaricoDdt();
  const list = data ?? [];

  return (
    <Card className="border-emerald-200/60">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-emerald-600" />
            DDT da registrare a magazzino
          </span>
          <Badge variant={list.length > 0 ? "default" : "outline"}>{list.length} da confermare</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Bolle fotografate dagli operai in cantiere. Silvio ha confrontato le quantità con l'ordine:
          controlla gli scostamenti evidenziati e conferma per registrare il carico (la giacenza si aggiorna solo dopo la conferma).
        </p>
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : null}
        {!isLoading && list.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            Nessun DDT da cantiere in attesa di registrazione.
          </div>
        ) : null}
        {list.map((carico) => (
          <CaricoRow
            key={carico.id}
            carico={carico}
            busy={aggiorna.isPending}
            onConferma={() => aggiorna.mutate({ id: carico.id, stato: "confermato" })}
            onScarta={() => aggiorna.mutate({ id: carico.id, stato: "scartato" })}
          />
        ))}
      </CardContent>
    </Card>
  );
}
