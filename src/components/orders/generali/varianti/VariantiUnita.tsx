// src/components/orders/generali/varianti/VariantiUnita.tsx
// Le varianti chieste dall'acquirente di un'unità: finiture extra e modifiche a pagamento.
// Sono le varianti della commessa dell'unità: proposta, PDF, firma online o su carta e costo
// previsto si fanno col flusso che l'app usa già (VariationLifecycleDialog). Qui si vedono
// tutte insieme, con quanto aggiungono al prezzo e la scadenza entro cui l'acquirente sceglie.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileText, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VariationLifecycleDialog } from "@/components/orders/VariationLifecycleDialog";
import { dataBreve, euro, oggi } from "@/components/orders/generali/unita/aspetto";
import { useAuth } from "@/contexts/AuthContext";
import { messaggioGenerale } from "@/hooks/useCommesseGenerali";
import { rileggiDopoVariante, useScadenzaVariante } from "@/hooks/useGeneraleVarianti";
import { prezzoCorrente, type ElencoUnita, type UnitaGenerale } from "@/lib/orders/generali/unita";
import {
  NOMI_STATO_VARIANTE, scadenzaScelte, totaliVarianti, type StatoVariante, type VarianteAcquirente,
} from "@/lib/orders/generali/varianti";
import { cn } from "@/lib/utils";

const STILE: Record<StatoVariante, string> = {
  proposta: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
  accettata: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
  rifiutata: "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200",
  annullata: "bg-muted text-muted-foreground",
};

interface Props {
  generaleId: string;
  unita: UnitaGenerale;
  elenco: ElencoUnita;
  /** Nuove varianti, documento e scadenze: computer o tablet, con il permesso. */
  gestisci: boolean;
}

export function VariantiUnita({ generaleId, unita: u, elenco, gestisci }: Props) {
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();
  const [aperta, setAperta] = useState<{ id: string; esistente: boolean } | null>(null);
  const d = elenco.varianti;
  if (!d) {
    return <p className="text-sm text-muted-foreground">Non riesco a leggere le varianti di questa unità. Riprova tra poco.</p>;
  }
  const varianti = d.varianti.filter((v) => v.orderId === u.orderId).sort((a, b) => a.numero - b.numero);
  const t = totaliVarianti(varianti, d.permessi);
  const puoScrivere = gestisci && d.permessi.modifica && !!effectiveCompany?.id;
  const prezzo = prezzoCorrente(u);
  const contesto = {
    customerName: u.acquirente ?? undefined,
    orderCode: u.codice ?? undefined,
    currentNet: d.permessi.importi && prezzo !== null ? prezzo + (t.accettate ?? 0) : undefined,
  };
  const chiudi = () => {
    setAperta(null);
    rileggiDopoVariante(qc, generaleId);
  };

  return (
    <div className="space-y-3">
      {d.permessi.importi && (t.numeroAccettate > 0 || t.numeroProposte > 0) && (
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-md border px-2.5 py-1.5">
            <dt className="text-xs text-muted-foreground">Accettate</dt>
            <dd className="font-medium tabular-nums">{euro(t.accettate)}</dd>
            <dd className="text-[11px] text-muted-foreground">entrano nel prezzo</dd>
          </div>
          <div className="rounded-md border px-2.5 py-1.5">
            <dt className="text-xs text-muted-foreground">Prezzo con varianti</dt>
            <dd className="font-medium tabular-nums">{prezzo === null ? "—" : euro(prezzo + (t.accettate ?? 0))}</dd>
          </div>
          <div className="rounded-md border px-2.5 py-1.5">
            <dt className="text-xs text-muted-foreground">Proposte aperte</dt>
            <dd className="font-medium tabular-nums">{t.numeroProposte ? euro(t.proposte) : "—"}</dd>
            {t.numeroProposte > 0 && <dd className="text-[11px] text-muted-foreground">{t.numeroProposte === 1 ? "una da decidere" : `${t.numeroProposte} da decidere`}</dd>}
          </div>
        </dl>
      )}

      {varianti.length === 0 ? (
        <p className="rounded-md border border-dashed bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
          {u.acquirente
            ? `Finiture extra o modifiche chieste da ${u.acquirente}: scrivi la proposta con prezzo e costo previsto, poi falla firmare. Accettata, entra nel prezzo e nel margine dell'unità.`
            : "Nessuna variante. Quando un acquirente chiede finiture extra o modifiche a pagamento, scrivi qui la proposta."}
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {varianti.map((v) => (
            <RigaVariante key={v.id} generaleId={generaleId} v={v} vedeImporti={d.permessi.importi} vedeCosti={d.permessi.costi}
              puoScrivere={puoScrivere} onApri={() => setAperta({ id: v.id, esistente: true })} />
          ))}
        </ul>
      )}

      {d.permessi.costi && t.numeroAccettate > 0 && t.costoAccettate !== null && t.accettate !== null && (
        <p className="text-xs text-muted-foreground">
          Costo previsto delle accettate {euro(t.costoAccettate)}: margine delle varianti {euro(t.accettate - t.costoAccettate)}.
          I costi veri arrivano sulla commessa dell'unità, come gli altri.
        </p>
      )}

      {puoScrivere && (
        <Button size="sm" variant="outline" onClick={() => setAperta({ id: crypto.randomUUID(), esistente: false })}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Nuova variante
        </Button>
      )}

      {aperta && effectiveCompany?.id && (
        <VariationLifecycleDialog
          key={aperta.id}
          id={aperta.id}
          existing={aperta.esistente}
          order={u.orderId}
          company={effectiveCompany.id}
          context={contesto}
          canEdit={puoScrivere}
          onClose={chiudi}
        />
      )}
    </div>
  );
}

function RigaVariante({ generaleId, v, vedeImporti, vedeCosti, puoScrivere, onApri }: {
  generaleId: string; v: VarianteAcquirente; vedeImporti: boolean; vedeCosti: boolean; puoScrivere: boolean; onApri: () => void;
}) {
  const scadenza = useScadenzaVariante(generaleId);
  const avviso = scadenzaScelte(v, oggi());
  const salvaScadenza = (valore: string) => {
    const nuova = valore || null;
    if (nuova === v.scadenzaScelte) return;
    scadenza.mutate({ variazioneId: v.id, scadenza: nuova }, {
      onSuccess: () => toast.success(nuova ? `Scelte entro il ${dataBreve(nuova)}` : "Scadenza tolta"),
      onError: (e) => toast.error(messaggioGenerale(e, "la scadenza")),
    });
  };
  const firma = v.firmataIl
    ? `${v.stato === "rifiutata" ? "Rifiutata" : "Firmata"} il ${dataBreve(v.firmataIl)}${v.canale === "offline" ? " su carta" : v.canale === "online" ? " online" : ""}`
    : v.inBozza ? "In bozza" : v.stato === "proposta" ? (v.documento ? "Documento pronto, da firmare" : "Da preparare") : null;

  return (
    <li className="space-y-1.5 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-xs text-muted-foreground">OdV {v.numero}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{v.titolo}</span>
        <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", STILE[v.stato])}>{NOMI_STATO_VARIANTE[v.stato]}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {vedeImporti && <span>Prezzo <span className="font-medium tabular-nums text-foreground">{euro(v.importo)}</span></span>}
        {vedeCosti && <span>Costo previsto <span className="tabular-nums text-foreground">{v.costoPrevisto === null ? "non scritto" : euro(v.costoPrevisto)}</span></span>}
        {firma && <span>{firma}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {v.stato === "proposta" && (puoScrivere ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Scelte entro
            <Input
              type="date"
              className="h-8 w-40"
              defaultValue={v.scadenzaScelte ?? ""}
              disabled={scadenza.isPending}
              onBlur={(e) => salvaScadenza(e.target.value)}
              aria-label={`Scadenza delle scelte di ${v.titolo}`}
            />
          </label>
        ) : v.scadenzaScelte && <span className="text-xs text-muted-foreground">Scelte entro il {dataBreve(v.scadenzaScelte)}</span>)}
        {avviso && (
          <span className={cn("inline-flex items-center gap-1 text-xs", avviso === "scaduta" ? "text-destructive" : "text-amber-700 dark:text-amber-300")}>
            <AlertTriangle className="h-3.5 w-3.5" /> {avviso === "scaduta" ? "Scadenza passata: l'acquirente non ha ancora deciso" : "Scade a giorni"}
          </span>
        )}
        {puoScrivere && (
          <Button size="sm" variant="ghost" className="ml-auto h-8" onClick={onApri}>
            <FileText className="mr-1.5 h-3.5 w-3.5" /> {v.inBozza ? "Riprendi la bozza" : "Documento e firma"}
          </Button>
        )}
      </div>
    </li>
  );
}
