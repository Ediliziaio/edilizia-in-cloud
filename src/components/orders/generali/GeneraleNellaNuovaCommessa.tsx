// src/components/orders/generali/GeneraleNellaNuovaCommessa.tsx
// In «Nuova commessa» aperta da una generale: dentro cosa entra, quanto del valore è già
// assegnato e quanto resta, e un avviso se l'importo che stai scrivendo lo supera.
// Per l'appalto anche riferimento, CIG e CUP del contratto, che valgono anche per questo ordine.
import { Layers } from "lucide-react";
import { Link } from "react-router-dom";
import { useRiepilogoGenerale } from "@/hooks/useCommesseGenerali";
import { useDatiContratto } from "@/hooks/useGeneraleContratto";
import { DEFINIZIONI_MODELLI, formattaEuro, totaliGenerale } from "@/lib/orders/commesseGenerali";
import { cn } from "@/lib/utils";

export function GeneraleNellaNuovaCommessa({ generaleId, importo }: { generaleId: string; importo: number | null }) {
  const { data: r } = useRiepilogoGenerale(generaleId);
  const contratto = useDatiContratto(generaleId, r?.generale.modello === "appalto");
  if (!r) return null;
  const def = DEFINIZIONI_MODELLI[r.generale.modello];
  const t = totaliGenerale(r);
  const c = contratto.data?.contratto ?? null;
  const restaDopo = t.daAssegnare !== null && importo !== null ? t.daAssegnare - importo : null;

  return (
    <section aria-label="Commessa generale" className="rounded-lg border bg-card px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Layers className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm">
              Questo {def.figlia.una} entra in{" "}
              <Link to={`/azienda/ordini/${generaleId}`} className="font-medium underline-offset-2 hover:underline">
                {[r.generale.codice, r.generale.nome].filter(Boolean).join(" · ")}
              </Link>
            </p>
            {c && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[c.riferimento && `Contratto ${c.riferimento}`, c.cig && `CIG ${c.cig}`, c.cup && `CUP ${c.cup}`].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{r.figlie.length === 1 ? `1 ${def.figlia.una} già dentro` : `${r.figlie.length} ${def.figlia.tante.toLowerCase()} già dentro`}</span>
      </div>

      {r.permessi.importi && r.generale.valore !== null && (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div><dt className="text-muted-foreground">{def.valore.etichetta}</dt><dd className="font-medium tabular-nums">{formattaEuro(r.generale.valore)}</dd></div>
          <div><dt className="text-muted-foreground">Già assegnato</dt><dd className="font-medium tabular-nums">{formattaEuro(t.assegnato ?? 0)}</dd></div>
          <div><dt className="text-muted-foreground">Da assegnare</dt><dd className={cn("font-medium tabular-nums", (t.daAssegnare ?? 0) < 0 && "text-destructive")}>{formattaEuro(t.daAssegnare ?? 0)}</dd></div>
          <div>
            <dt className="text-muted-foreground">Dopo questo {def.figlia.una}</dt>
            <dd className={cn("font-medium tabular-nums", restaDopo !== null && restaDopo < 0 && "text-destructive")}>
              {restaDopo === null ? "—" : formattaEuro(restaDopo)}
            </dd>
          </div>
        </dl>
      )}
      {restaDopo !== null && restaDopo < 0 && (
        <p role="status" className="mt-2 text-xs text-destructive">
          Con questo importo i lavori dentro superano {def.valore.etichetta.toLowerCase()} di {formattaEuro(-restaDopo)}. Si può salvare lo stesso, ma serve un atto aggiuntivo o un importo più basso.
        </p>
      )}
      {r.generale.modello === "appalto" && (
        <p className="mt-2 text-xs text-muted-foreground">
          Dopo il salvataggio puoi prezzarlo con l'elenco prezzi del contratto (scheda «Contratto e SAL» della generale).
        </p>
      )}
    </section>
  );
}
