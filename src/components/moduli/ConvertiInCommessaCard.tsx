/**
 * "Il cliente ha firmato? Crea la commessa" per tutti i preventivatori: fotovoltaico, serramenti,
 * ristrutturazione e i 7 edili.
 *
 * Il preventivo firmato è il contratto (31/10/2026): la commessa nasce solo da un preventivo
 * firmato (firma digitale, accettazione dal link o «Firmato su carta», che si registra da qui).
 * Mostra il riepilogo del server prima di creare articoli, fasi e rate nella stessa transazione.
 * I due record restano legati: una copia o revisione di un preventivo già commessa è una variante.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, FileSignature, HardHat, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import {
  anteprimaConversioneModulo, type AnteprimaConversioneModulo, convertiFvInCommessa, convertiModuloInCommessa,
  convertiRstInCommessa, leggiContrattoModulo, type ModuloCommessa, bloccoDelContratto, chiaveContrattoModulo,
} from "@/lib/moduli/convertiInCommessa";
import { ContrattoFirmatoCard, FirmatoSuCartaDialog } from "@/components/marketing/preventivi/FirmatoSuCarta";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ModuleConversionSummary } from "./ModuleConversionSummary";

interface Props {
  modulo: ModuloCommessa;
  progettoId: string;
  /** Commessa già creata da questo preventivo: se c'è, si mostra il collegamento. */
  ordineId?: string | null;
  /** Motivo per cui non si può ancora convertire (computo vuoto, cliente mancante…). */
  bloccoMotivo?: string | null;
  /** Chiamata dopo la conversione, per ricaricare la pagina del modulo. */
  onConvertito?: (orderId: string) => void;
  /** Ristrutturazione: quanti capitoli ha il computo. Da due in su si offre «una fase per capitolo». */
  capitoli?: number;
  fasiPianificate?: number;
  /** Per «Firmato su carta»: il codice del preventivo e chi lo firma di solito. */
  codice?: string | null;
  clientName?: string | null;
}

export function ConvertiInCommessaCard({ modulo, progettoId, ordineId, bloccoMotivo, onConvertito, capitoli = 0, fasiPianificate = 0, codice, clientName }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const companyId = useEffectiveCompanyId();
  const [cartaAperta, setCartaAperta] = useState(false);
  const { data: contratto } = useQuery({
    queryKey: chiaveContrattoModulo(modulo, progettoId),
    queryFn: () => leggiContrattoModulo(modulo, progettoId),
    enabled: !!progettoId,
  });
  const ordineAperto = ordineId ?? contratto?.ordine_id ?? null;
  const motivo = bloccoMotivo ?? bloccoDelContratto(contratto);
  const offriCarta = !!contratto && !contratto.firmato && !contratto.famiglia && !!companyId;
  const [inCorso, setInCorso] = useState(false);
  const [riepilogo, setRiepilogo] = useState<AnteprimaConversioneModulo | null>(null);
  const [dialog, setDialog] = useState(false);
  // Le voci del computo da ordinare: di partenza quelle che il sistema propone.
  const [vociScelte, setVociScelte] = useState<Set<string>>(new Set());
  const [errore, setErrore] = useState("");
  // Di partenza sì: i capitoli del computo sono già il modo in cui il lavoro è diviso.
  const [fasiCapitoli, setFasiCapitoli] = useState(true);
  // Gli edili hanno tutti il computo a capitoli: da due in su si offre una fase per capitolo.
  const offriFasi = modulo !== "fv" && modulo !== "sr" && capitoli >= 2 && fasiPianificate === 0;

  const mostraRiepilogo = async () => {
    setInCorso(true); setErrore("");
    try {
      const anteprima = await anteprimaConversioneModulo(modulo, progettoId, offriFasi && fasiCapitoli);
      setRiepilogo(anteprima);
      setVociScelte(new Set((anteprima.voci_materiale ?? []).filter((v) => v.proposta).map((v) => v.id)));
      setDialog(true);
    } catch (e) {
      toast.error("Riepilogo non disponibile", { description: e instanceof Error ? e.message : "Riprova." });
    } finally { setInCorso(false); }
  };

  const converti = async () => {
    if (!riepilogo) return;
    if (!user?.id) { toast.error("Sessione scaduta: accedi di nuovo"); return; }
    setInCorso(true);
    try {
      const opzioni = {
        fasiDaCapitoli: offriFasi && fasiCapitoli,
        impronta: riepilogo.impronta,
        vociMateriale: riepilogo.voci_materiale ? [...vociScelte] : undefined,
      };
      const esito = modulo === "fv"
        ? await convertiFvInCommessa(progettoId, user.id, riepilogo.impronta)
        : modulo === "rst"
          ? await convertiRstInCommessa(progettoId, user.id, opzioni)
          : await convertiModuloInCommessa(modulo, progettoId, user.id, opzioni);
      toast.success("Commessa creata", {
        description: `Lavorazioni trasferite: ${esito.lavorazioni} · Materiali da ordinare: ${esito.righe}.`,
      });
      void queryClient.invalidateQueries({ queryKey: chiaveContrattoModulo(modulo, progettoId) });
      // Segnala l'eventuale problema nell'avvio delle rate della commessa già creata.
      if (esito.avviso) toast.warning(esito.avviso, { duration: 12000 });
      setDialog(false);
      onConvertito?.(esito.orderId);
      navigate(`/azienda/ordini/${esito.orderId}`);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Conversione non riuscita. Riprova.");
    } finally {
      setInCorso(false);
    }
  };

  if (ordineAperto) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20">
        <CardContent className="flex flex-wrap items-center gap-3 p-4 max-md:flex-nowrap max-md:gap-2 max-md:px-3 max-md:py-2">
          <HardHat className="h-5 w-5 shrink-0 text-emerald-600 max-md:h-4 max-md:w-4" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200 max-md:truncate max-md:text-[13px]">Commessa già aperta</p>
            <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 max-md:hidden">
              Questo preventivo è diventato una commessa: i lavori si seguono da lì.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 tap-compact max-md:h-8 max-md:shrink-0" onClick={() => navigate(`/azienda/ordini/${ordineAperto}`)}>
            <span className="max-md:hidden">Apri la commessa</span>
            <span className="md:hidden">Apri</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    // Anche su mobile la scelta del raggruppamento resta disponibile.
    <>{contratto?.firmato && (
      <ContrattoFirmatoCard quote={{ firma_modo: contratto.modo, signed_at: contratto.signed_at, signed_by_name: contratto.signed_by_name, contratto_firmato: contratto.contratto_firmato }} />
    )}
    <Card className={cn("border-orange-200 bg-orange-50/60 dark:border-orange-900/50 dark:bg-orange-950/20", motivo && !offriCarta && "max-md:hidden")}>
      <CardContent className="flex flex-wrap items-center gap-3 p-4 max-md:gap-2 max-md:px-3 max-md:py-2">
        <HardHat className="h-5 w-5 shrink-0 text-orange-600 max-md:hidden" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-orange-900 dark:text-orange-200 max-md:truncate max-md:text-[13px]">
            {contratto && !contratto.firmato ? "Il cliente ha firmato?" : "Il preventivo è firmato: crea la commessa"}
          </p>
          <p className="text-xs text-orange-800/80 dark:text-orange-300/80 max-md:hidden">
            {motivo ?? "Controlla lavorazioni, materiali e rate prima di creare la commessa. Il contratto mantiene il suo importo."}
          </p>
          {fasiPianificate > 0 && <p className="mt-1 text-xs">Mantiene le {fasiPianificate} fasi pianificate nel preventivo, con le loro sottofasi.</p>}
          {offriFasi && !bloccoMotivo && (
            <label className="mt-1.5 flex items-center gap-2 text-xs text-orange-900 dark:text-orange-200">
              <Checkbox checked={fasiCapitoli} onCheckedChange={(v) => setFasiCapitoli(v === true)} aria-label="Una fase per ogni capitolo" />
              Raggruppa le lavorazioni nei {capitoli} capitoli del computo
            </label>
          )}
        </div>
        {offriCarta && (
          <Button size="sm" variant="outline" className="gap-1.5 tap-compact max-md:h-8 max-md:shrink-0 max-md:text-xs" onClick={() => setCartaAperta(true)}>
            <FileSignature className="h-3.5 w-3.5 max-md:hidden" />Firmato su carta
          </Button>
        )}
        <Button
          size="sm"
          className="gap-1.5 bg-orange-500 text-white hover:bg-orange-600 tap-compact max-md:h-8 max-md:shrink-0 max-md:text-xs"
          disabled={inCorso || !!motivo || !contratto}
          onClick={() => { void mostraRiepilogo(); }}
          title={motivo ?? undefined}
        >
          {inCorso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <HardHat className="h-3.5 w-3.5 max-md:hidden" />}
          <span className="max-md:hidden">Controlla e crea commessa</span>
          <span className="md:hidden">Crea commessa</span>
        </Button>
      </CardContent>
    </Card>
    <Dialog open={dialog} onOpenChange={(v) => { if (!inCorso) setDialog(v); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Dal preventivo alla commessa</DialogTitle>
          <DialogDescription>Verifica cosa verrà trasferito nel cantiere.</DialogDescription></DialogHeader>
        {riepilogo && <ModuleConversionSummary riepilogo={riepilogo} vociScelte={vociScelte} onCambiaVoci={setVociScelte} />}
        {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={inCorso} onClick={() => setDialog(false)}>Torna al preventivo</Button>
          {errore ? <Button disabled={inCorso} onClick={() => { void mostraRiepilogo(); }}>Aggiorna riepilogo</Button>
            : <Button disabled={inCorso || !riepilogo} onClick={() => { void converti(); }}>{inCorso ? "Creazione…" : "Conferma e crea commessa"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {offriCarta && cartaAperta && (
      <FirmatoSuCartaDialog
        open={cartaAperta}
        onOpenChange={setCartaAperta}
        modulo={modulo}
        quote={{ id: progettoId, company_id: companyId!, client_name: clientName ?? null, quote_number: codice ?? null }}
        onFirmato={() => {
          void queryClient.invalidateQueries({ queryKey: chiaveContrattoModulo(modulo, progettoId) });
          // La scheda di invio rilegge la riga ombra: ora è firmata.
          void queryClient.invalidateQueries({ queryKey: ["module-quote"] });
        }}
      />
    )}</>
  );
}
