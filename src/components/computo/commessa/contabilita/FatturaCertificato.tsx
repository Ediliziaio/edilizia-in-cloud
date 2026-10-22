/**
 * Dal certificato di pagamento alla fattura.
 *   «Prepara la fattura»: crea la bozza già compilata (stazione appaltante,
 *   riga «lavori del SAL n. X» al netto, split payment, CIG e CUP), la lega al
 *   certificato e alla commessa e apre l'editor per controllarla ed emetterla.
 *   «Collega una fattura»: per la fattura già fatta (o con la fatturazione
 *   esterna), si sceglie fra quelle della commessa.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Link2, Loader2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useBillingMode } from "@/contexts/BillingModeContext";
import { useCreateDocumento } from "@/hooks/useDocumentiFiscali";
import { useLinkFatturaOrdine } from "@/hooks/billing/useFatturaOrdineLink";
import {
  useCollegaFatturaCertificato, useFattureCommessa, type CertificatoDb, type SalDb,
} from "@/hooks/useContabilitaLavori";
import { bozzaFatturaCertificato, type AnagraficaFatturazione } from "@/lib/computo/fatturaCertificato";
import type { ComputoCommessa } from "@/hooks/useComputoCommessa";
import { dataIt, euro } from "./comune";

interface Props {
  certificato: CertificatoDb;
  sal: SalDb;
  computo: ComputoCommessa;
  orderId: string;
  companyId: string;
  canEdit: boolean;
}

export default function FatturaCertificato({ certificato, sal, computo, orderId, companyId, canEdit }: Props) {
  const navigate = useNavigate();
  const { canViewBilling } = usePermissions();
  const billing = useBillingMode({ facoltativo: true });
  const crea = useCreateDocumento();
  const collegaOrdine = useLinkFatturaOrdine();
  const collega = useCollegaFatturaCertificato(orderId);
  const [scegli, setScegli] = useState(false);
  const fatture = useFattureCommessa(orderId, companyId, scegli || !!certificato.documento_fiscale_id);
  const [lavoro, setLavoro] = useState(false);
  const collegata = certificato.documento_fiscale_id
    ? fatture.data?.find((f) => f.id === certificato.documento_fiscale_id) ?? null
    : null;
  // La bozza nasce nel modulo fatturazione dell'app: con la fatturazione esterna si collega soltanto.
  const puoPreparare = canEdit && canViewBilling && (billing?.isNative ?? true);

  const prepara = async () => {
    setLavoro(true);
    try {
      const { data: ordine } = await supabase.from("orders").select("customer_id, order_code").eq("id", orderId).maybeSingle();
      let anagrafica: AnagraficaFatturazione | null = null;
      if (ordine?.customer_id) {
        const { data } = await (supabase.from("anagrafiche_native" as never).select("*")
          .eq("company_id" as never, companyId as never).eq("cliente_id" as never, ordine.customer_id as never)
          .limit(1) as unknown as PromiseLike<{ data: AnagraficaFatturazione[] | null }>);
        anagrafica = data?.[0] ?? null;
      }
      const bozza = bozzaFatturaCertificato({ certificato, sal, computo, orderId, orderCode: ordine?.order_code, anagrafica });
      let doc: { id: string; totale_documento?: number };
      try {
        doc = await crea.mutateAsync({ ...bozza });
      } catch {
        return; // l'errore lo mostra già la creazione del documento
      }
      try {
        await collega.mutateAsync({ certificatoId: certificato.id, documentoId: doc.id });
      } catch (e) {
        toast.warning("Fattura creata, ma non collegata al certificato", { description: e instanceof Error ? e.message : String(e) });
      }
      try {
        await collegaOrdine.mutateAsync({ fatturaId: doc.id, ordineId: orderId, importoAssociato: certificato.totale, companyId });
      } catch (e) {
        toast.warning("Fattura creata, ma non collegata alla commessa", { description: e instanceof Error ? e.message : String(e) });
      }
      if (!anagrafica) {
        toast.info("Completa i dati della stazione appaltante nella fattura", {
          description: "La commessa non ha un cliente in anagrafica: ho scritto solo il nome dal computo.",
        });
      }
      navigate(`/azienda/documenti/${doc.id}?ordine_link=${orderId}`);
    } finally {
      setLavoro(false);
    }
  };

  if (certificato.documento_fiscale_id) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <Button type="button" size="sm" variant="outline" className="h-7" disabled={!canViewBilling}
          title={canViewBilling ? undefined : "Serve il permesso «Fatturazione» per aprirla"}
          onClick={() => navigate(`/azienda/documenti/${certificato.documento_fiscale_id}`)}>
          <Receipt className="mr-1 h-3.5 w-3.5" />Fattura{collegata?.numero ? ` ${collegata.numero}` : ""}
        </Button>
        {canEdit && (
          <Button type="button" size="sm" variant="ghost" className="h-7 text-slate-600" disabled={collega.isPending}
            onClick={() => collega.mutate({ certificatoId: certificato.id, documentoId: null }, {
              onSuccess: () => toast.success("Fattura scollegata dal certificato"), onError: (e) => toast.error(e.message),
            })}>Scollega</Button>
        )}
      </span>
    );
  }
  if (!canEdit) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {puoPreparare && (
        <Button type="button" size="sm" className="h-7" disabled={lavoro} onClick={prepara}
          title={`Bozza di fattura per ${euro(certificato.imponibile)} + IVA ${certificato.aliquota_iva}%${certificato.split_payment ? " in split payment" : ""}`}>
          {lavoro ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Receipt className="mr-1 h-3.5 w-3.5" />}Prepara la fattura
        </Button>
      )}
      {!scegli ? (
        <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setScegli(true)}>
          <Link2 className="mr-1 h-3.5 w-3.5" />Collega una fattura
        </Button>
      ) : fatture.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-label="Carico le fatture" />
      ) : (fatture.data ?? []).length === 0 ? (
        <span className="text-xs text-slate-600">Nessuna fattura della commessa da collegare.</span>
      ) : (
        <select aria-label={`Fattura del certificato n. ${certificato.numero}`} className="h-7 rounded-md border bg-background px-1 text-xs"
          defaultValue="" disabled={collega.isPending}
          onChange={(e) => e.target.value && collega.mutate({ certificatoId: certificato.id, documentoId: e.target.value }, {
            onSuccess: () => { toast.success("Fattura collegata al certificato"); setScegli(false); },
            onError: (err) => toast.error(err.message),
          })}>
          <option value="" disabled>Scegli la fattura…</option>
          {(fatture.data ?? []).map((f) => (
            <option key={f.id} value={f.id}>
              {f.numero || "Bozza"}{f.data_emissione ? ` del ${dataIt(f.data_emissione)}` : ""} · {euro(f.totale_documento)} · {f.stato}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}
