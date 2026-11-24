import { ArrowLeft, ArrowRight } from "lucide-react";
import { MaterialiPerFase } from "@/components/orders/materiali/MaterialiPerFase";
import { OrderMeasureControl } from "@/components/orders/OrderMeasureControl";
import { Button } from "@/components/ui/button";
import { articoliPerEditor, useDatiArticoliCommessa, useScritturaArticoliCommessa } from "@/hooks/useArticoliCommessaEditor";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";
import { eMateriale } from "@/lib/distinta/elencoArticoli";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export default function MaterialiAmbito({ orderId, orderCode, nome, puoModificare, generaIniziale, computoIniziale, faseProposteIniziale, faseIniziale, ricercaIniziale, apriOrdini, apriRiepilogo }: {
  orderId: string;
  orderCode?: string | null;
  nome: string;
  puoModificare: boolean;
  generaIniziale?: boolean;
  computoIniziale?: string;
  faseProposteIniziale?: string | null;
  faseIniziale?: string;
  ricercaIniziale?: string;
  apriOrdini: () => void;
  apriRiepilogo?: () => void;
}) {
  const t = useT();
  const permessi = usePermissions();
  const companyId = useEffectiveCompanyId();
  const puoGestire = puoModificare && permessi.canEditOrders && !permessi.solaLettura;
  const dati = useDatiArticoliCommessa(orderId, !!puoGestire);
  const { updateSingleItemMutation, addItemMutation, addLaborMutation, onSalvaForniture } = useScritturaArticoliCommessa(orderId);
  const caricamento = dati.orderItemsPending || (dati.orderItems.length > 0 && dati.allegatiInCaricamento);
  const errore = dati.orderItemsError || dati.allegatiErrore;

  return <div className="min-w-0 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-2.5 py-1">
      <h3 className="text-sm font-semibold">{nome}{orderCode && <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{orderCode}</span>}</h3>
      <div className="flex flex-wrap gap-1">
        {apriRiepilogo && <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={apriRiepilogo}>
          <ArrowLeft className="size-3.5" aria-hidden="true" /> {t("Materiali dell’operazione")}
        </Button>}
        <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={apriOrdini}>
          {t("Ordini d’acquisto")} <ArrowRight className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
    {puoGestire && errore && <p role="status" className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">
      {t("Alcuni dati per la modifica degli articoli non sono disponibili.")}{" "}
      <Button type="button" size="sm" variant="link" onClick={() => void dati.riprova()}>{t("Riprova")}</Button>
    </p>}
    <MaterialiPerFase orderId={orderId} orderCode={orderCode} generaIniziale={puoGestire && generaIniziale} computoIniziale={computoIniziale}
      faseIniziale={faseIniziale}
      faseProposteIniziale={puoGestire ? faseProposteIniziale : undefined} ricercaIniziale={ricercaIniziale}
      editor={puoGestire && !caricamento && !errore ? {
        companyId: companyId ?? "",
        items: articoliPerEditor(dati.orderItems.filter(eMateriale), dati.attachments),
        onItemsChange: righe => {
          const nuove = righe.filter(riga => !riga.id);
          if (nuove.length) addItemMutation.mutate(nuove);
        },
        onSalvaForniture,
        onItemUpdate: riga => updateSingleItemMutation.mutate(riga),
        onAttachmentsRefresh: () => void dati.refetchAttachments(),
        onAddLabor: posa => addLaborMutation.mutate(posa),
      } : undefined} />
    <OrderMeasureControl orderId={orderId} />
  </div>;
}
