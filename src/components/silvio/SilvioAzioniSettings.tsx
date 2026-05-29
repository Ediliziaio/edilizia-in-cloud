/**
 * SilvioAzioniSettings — MP-SILVIO-01 · "Cosa può fare Silvio"
 *
 * Mostra il catalogo azioni con l'autorizzazione effettiva per l'azienda e
 * permette di RESTRINGERE (autonoma→conferma, o disattiva). Mai allargare oltre
 * il livello di sicurezza di base (denaro/esterno/irreversibile = sempre conferma).
 */
import { useMemo } from "react";
import { ShieldCheck, Lock, CheckCircle2, AlertTriangle, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSilvioCatalogo, useSilvioOverrideSet } from "@/lib/silvio/hooks";
import { etichettaAutorizzazione, etichettaRischio } from "@/lib/silvio/permessi";

const RISCHIO_CLS: Record<string, string> = {
  interno: "border-slate-200 bg-slate-50 text-slate-600",
  esterno: "border-amber-200 bg-amber-50 text-amber-700",
  denaro: "border-rose-200 bg-rose-50 text-rose-700",
};
const AUT_CLS: Record<string, string> = {
  autonoma: "border-blue-200 bg-blue-50 text-blue-700",
  conferma: "border-violet-200 bg-violet-50 text-violet-700",
  vietata: "border-slate-200 bg-slate-100 text-slate-500",
};
const MODULO_LABEL: Record<string, string> = {
  fatturazione: "Fatturazione", magazzino: "Magazzino", crm: "Clienti & Opportunità",
  scadenze: "Scadenze & Cashflow", email: "Email", calendario: "Calendario", fornitori: "Fornitori",
};

export function SilvioAzioniSettings() {
  const { data: catalogo, isLoading } = useSilvioCatalogo();
  const override = useSilvioOverrideSet();

  const perModulo = useMemo(() => {
    const m = new Map<string, NonNullable<typeof catalogo>>();
    for (const a of catalogo ?? []) {
      if (!m.has(a.modulo)) m.set(a.modulo, []);
      m.get(a.modulo)!.push(a);
    }
    return Array.from(m.entries());
  }, [catalogo]);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
        <p className="text-xs text-blue-900">
          Qui decidi <b>cosa può fare Silvio da solo</b> e cosa deve farti approvare. Le azioni che
          toccano denaro, invii o cose irreversibili restano <b>sempre con conferma</b>: non è
          modificabile, per la tua sicurezza. Puoi solo rendere un'azione <i>più</i> prudente.
        </p>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Caricamento…</p>
      ) : (catalogo?.length ?? 0) === 0 ? (
        <p className="text-xs text-muted-foreground">Nessuna azione disponibile.</p>
      ) : (
        perModulo.map(([modulo, azioni]) => (
          <section key={modulo} className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-800">{MODULO_LABEL[modulo] ?? modulo}</h3>
            <div className="space-y-1.5">
              {azioni.map((a) => {
                const ferrea = a.categoria_rischio === "denaro" || a.categoria_rischio === "esterno" || a.reversibilita === "irreversibile";
                const eff = a.autorizzazione_effettiva;
                return (
                  <div key={a.chiave} className="rounded-md border bg-white px-3 py-2">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800">{a.descrizione}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className={`text-[10px] ${RISCHIO_CLS[a.categoria_rischio] ?? ""}`}>
                            {etichettaRischio(a.categoria_rischio)}
                          </Badge>
                          <Badge variant="outline" className={`text-[10px] ${AUT_CLS[eff] ?? ""}`}>
                            {eff === "autonoma" && <CheckCircle2 className="mr-0.5 inline h-3 w-3" />}
                            {eff === "conferma" && <AlertTriangle className="mr-0.5 inline h-3 w-3" />}
                            {eff === "vietata" && <Ban className="mr-0.5 inline h-3 w-3" />}
                            {etichettaAutorizzazione(eff)}
                          </Badge>
                          {ferrea && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                              <Lock className="h-3 w-3" /> bloccata su conferma
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* controlli di restrizione */}
                    {eff !== "vietata" && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {eff === "autonoma" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={override.isPending}
                            onClick={() => override.mutate({ chiave: a.chiave, autorizzazione: "conferma" })}>
                            Richiedi conferma
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-rose-600" disabled={override.isPending}
                          onClick={() => override.mutate({ chiave: a.chiave, attiva: false })}>
                          <Ban className="h-3 w-3" /> Disattiva
                        </Button>
                      </div>
                    )}
                    {eff === "vietata" && a.attiva && (
                      <div className="mt-2">
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={override.isPending}
                          onClick={() => override.mutate({ chiave: a.chiave, attiva: true, autorizzazione: a.autorizzazione_default })}>
                          Riattiva (con conferma)
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
