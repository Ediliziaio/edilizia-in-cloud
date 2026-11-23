/**
 * OrderUsciteCard — uscite di magazzino registrate per una commessa.
 *
 * Mostra le uscite (warehouse_uscite con order_id = questa commessa) con stato
 * registrata / DDT creato, e permette di generare il DDT direttamente da qui
 * (RPC create_ddt_from_uscita) — stesso "doppio controllo" della scheda Uscite.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowUpFromLine, FileText, Loader2, ExternalLink, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RiquadroCommessa, StatoPill, TabellaCommessa, type ColonnaTabella, type TonoStato } from "@/components/orders/TabellaCommessa";
import { useBillingMode } from "@/contexts/BillingModeContext";
import { useShipmentDDTPDF } from "@/hooks/useShipmentDDTPDF";
import { formatCurrency } from "@/lib/formatters";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";
import { useUsciteByOrder, useCreateDdtFromUscita, valoreUscita, type UscitaRow } from "@/hooks/warehouse/useWarehouseUscita";

type RigaUscita = UscitaRow["righe"][number] & { i: number };

const STATO: Record<UscitaRow["stato"], { label: string; tono: TonoStato }> = {
  registrata: { label: "Registrata", tono: "ambra" },
  ddt_creato: { label: "DDT creato", tono: "verde" },
  annullata: { label: "Annullata", tono: "grigio" },
};

/**
 * `canViewCosts` decide se mostrare il valore delle uscite (costo del
 * magazzino). Senza, la card mostra numeri, date, articoli e DDT.
 */
export function OrderUsciteCard({ orderId, canViewCosts = false }: { orderId: string; canViewCosts?: boolean }) {
  const t = useT();
  const navigate = useNavigate();
  const { isNative } = useBillingMode();
  const { generate: generateDDT } = useShipmentDDTPDF();
  const { data: uscite = [], isLoading, isError, refetch, isFetching } = useUsciteByOrder(orderId);
  const createDdt = useCreateDdtFromUscita();
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [dettaglio, setDettaglio] = useState<UscitaRow | null>(null);
  const valoreTotale = uscite
    .filter((uscita) => uscita.stato !== "annullata")
    .reduce((totale, uscita) => totale + valoreUscita(uscita.righe), 0);

  const handleCreateDdt = async (u: UscitaRow) => {
    setCreatingId(u.id);
    try {
      const res = await createDdt.mutateAsync({ uscitaId: u.id });
      toast.success(t("DDT {ddt} creato dalla uscita {uscita}", { ddt: res.numero_ddt, uscita: u.numero }));
      if (res.documento_id) {
        if (isNative) navigate(`/azienda/documenti/${res.documento_id}`);
        else void generateDDT(res.documento_id);
      }
    } catch (e) {
      toast.error(t("Errore creazione DDT: {errore}", { errore: (e as Error).message }));
    } finally {
      setCreatingId(null);
    }
  };

  const colonne: ColonnaTabella<UscitaRow>[] = [
    { titolo: t("Uscita"), principale: true, cella: (u) => (
      <div className="min-w-0">
        <span className="font-mono text-sm font-medium">{u.numero}</span>
        {u.vettore && u.vettore.tipo !== "mittente" && (
          <span className="mt-0.5 flex items-center gap-1 text-xs font-normal text-muted-foreground">
            <Truck className="h-3 w-3" aria-hidden /> {"ragione_sociale" in u.vettore ? u.vettore.ragione_sociale : t("vettore")}
          </span>
        )}
        {u.note && <p className="mt-0.5 line-clamp-1 max-w-md text-xs font-normal text-muted-foreground max-sm:hidden" title={u.note}>{u.note}</p>}
      </div>
    ) },
    { titolo: t("Data"), cella: (u) => new Date(u.data).toLocaleDateString(intlCampo()) },
    { titolo: t("Articoli"), cella: (u) => {
      const n = Array.isArray(u.righe) ? u.righe.length : 0;
      return (
        <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setDettaglio(u)}>
          {t(n === 1 ? "{n} articolo" : "{n} articoli", { n })}
        </button>
      );
    } },
    ...(canViewCosts ? [{ titolo: t("Valore"), destra: true, cella: (u: UscitaRow) => {
      const valore = valoreUscita(u.righe);
      return valore > 0 ? formatCurrency(valore) : "—";
    } }] : []),
    { titolo: t("Stato"), cella: (u) => <StatoPill tono={STATO[u.stato].tono}>{t(STATO[u.stato].label)}</StatoPill> },
    { titolo: t("Azione"), intestazione: <span className="sr-only">{t("Azione")}</span>, destra: true, cella: (u) => (
      u.stato === "registrata" ? (
        <Button size="sm" variant="outline" className="h-8" onClick={() => handleCreateDdt(u)} disabled={creatingId === u.id}>
          {creatingId === u.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
          {t("Crea DDT")}
        </Button>
      ) : u.documento_id ? (
        <Button size="sm" variant="outline" className="h-8" onClick={() => navigate(`/azienda/documenti/${u.documento_id}`)}>
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> {t("Apri DDT")}
        </Button>
      ) : null
    ) },
  ];

  // Card sempre presente: anche vuota spiega come registrare un'uscita.
  // Mobile: solo se ci sono uscite, e senza spiegazione.
  const vuota = !isLoading && !isError && uscite.length === 0;
  return (
    <div className={vuota ? "max-sm:hidden" : undefined}>
      <RiquadroCommessa icona={<ArrowUpFromLine className="h-4 w-4 text-muted-foreground" aria-hidden />} titolo={t("Uscite di magazzino")}
        conteggio={uscite.length} riassunto={canViewCosts && valoreTotale > 0 ? formatCurrency(valoreTotale) : undefined}>
        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">{t("Caricamento…")}</div>
        ) : isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">{t("Impossibile caricare le uscite di magazzino.")}<Button size="sm" variant="outline" disabled={isFetching} onClick={() => refetch()}>{t("Riprova")}</Button></div>
        ) : uscite.length === 0 ? (
          /* Prima diceva solo "vai in Magazzino → Uscita merce": un'istruzione
             senza il modo di eseguirla. Ora il collegamento c'e'. */
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {t("Nessuna uscita registrata. Scegli questa commessa come destinazione (Cantiere).")}
            </p>
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5"
              onClick={() => navigate("/azienda/magazzino")}>
              <ArrowUpFromLine className="h-4 w-4" />
              {t("Vai al magazzino")}
            </Button>
          </div>
        ) : (
          <TabellaCommessa etichetta={t("Uscite di magazzino")} colonne={colonne} righe={uscite} chiave={(u) => u.id} />
        )}
      </RiquadroCommessa>
      <Dialog open={!!dettaglio} onOpenChange={(aperto) => { if (!aperto) setDettaglio(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("Uscita {numero}", { numero: dettaglio?.numero ?? "" })}</DialogTitle>
            <DialogDescription>{t("Cosa è uscito dal magazzino per questa commessa.")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <TabellaCommessa<RigaUscita> etichetta={t("Articoli dell'uscita")} chiave={(r) => `${r.i}`}
              righe={(dettaglio?.righe ?? []).map((riga, i) => ({ ...riga, i }))}
              colonne={[
                { titolo: t("Articolo"), principale: true, cella: (r) => r.descrizione },
                { titolo: t("Quantità"), destra: true, cella: (r) => Number(r.quantita ?? 0).toLocaleString(intlCampo(), { maximumFractionDigits: 3 }) },
                ...(canViewCosts ? [{ titolo: t("Valore"), destra: true, cella: (r: RigaUscita) => formatCurrency(valoreUscita([r])) }] : []),
              ]} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
