import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { DocumentoInvioDialog } from "./DocumentoInvioDialog";
import { titoloDocumento, type DocumentoOperativo } from "@/lib/documentiOperativi/modello";
import { preparaRendicontoTrasporti } from "@/lib/documentiOperativi/rendicontoTrasporti";
import type { RapportinoCompleto } from "@/hooks/useRapportiniMese";
import { nomeCantiere, statoDi } from "@/lib/orders/rapportiniMese";
import { campoWorkDay } from "@/lib/campo/workDay";
import { toast } from "sonner";
import type { QuadroPerRapporto } from "@/lib/documentiOperativi/rapporti";
import { preparaRapportoEconomia } from "@/lib/documentiOperativi/preparaRapportoEconomia";
import { leggiDestinatarioRapporto } from "@/lib/documentiOperativi/destinatarioRapporto";
import { FileText, Loader2, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { OfficeSelect } from "@/components/orders/OfficeSelect";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type RapportoDaPreparare = "economia" | "rendiconto-trasporti";

export function RapportiPeriodoDialog({
  righe,
  mese,
  companyId,
  conDatiEconomici = false,
  orderId,
  compatto = false,
  nascondiSeVuoto = false,
}: {
  righe: RapportinoCompleto[];
  mese: string;
  companyId?: string;
  conDatiEconomici?: boolean;
  /** Accesso dalla commessa: il rapporto manuale parte con riferimento e indirizzo. */
  orderId?: string;
  /** Con zero rapportini in tutto il pulsante non serve: non si mostra (commessa senza rapportini). */
  nascondiSeVuoto?: boolean;
  /** Nella testata delle schede di Commesse: bottone da 32px come gli altri comandi. */
  compatto?: boolean;
}) {
  const t = useT();
  const [doc, setDoc] = useState<DocumentoOperativo | null>(null);
  const [scegli, setScegli] = useState<RapportoDaPreparare | null>(null);
  const [cantiere, setCantiere] = useState("");
  const [cercaCantiere, setCercaCantiere] = useState("");
  const [preparazione, setPreparazione] = useState<string | null>(null);
  const operazione = useRef<AbortController | null>(null);
  const qc = useQueryClient();
  const approvatiVeri = righe.filter((r) => statoDi(r) === "approvato");
  // Bozza (27/11/2026): con rapportini da approvare si può stampare anche quelli; il PDF dice «BOZZA». Il rifiutato mai.
  const [conBozza, setConBozza] = useState(false);
  const inviati = righe.filter((r) => statoDi(r) === "inviato");
  const usaBozza = conBozza && inviati.length > 0;
  const approvati = usaBozza ? [...approvatiVeri, ...inviati] : approvatiVeri;
  // I documenti si compilano dai soli approvati: chi aspetta l'approvazione va detto, se no sembra che manchi (25/11/2026).
  const daApprovare = righe.filter((r) => statoDi(r) === "inviato").length;
  const nessunoApprovato = daApprovare
    ? t(daApprovare === 1 ? "Nessun rapportino approvato: {n} è ancora da approvare" : "Nessun rapportino approvato: {n} sono ancora da approvare", { n: daApprovare })
    : t("Nessun rapportino approvato in questo periodo");
  const cantieri = [...new Map(approvati.map((r) => [r.order_id, r])).values()];
  const scope = `${companyId}:${usaBozza}:${orderId ?? ""}:${mese}:${conDatiEconomici}:${approvati.map((r) => `${r.id}:${r.updated_at ?? ""}`).join(",")}`;
  const busy = preparazione === scope;
  useEffect(
    () => () => {
      operazione.current?.abort();
      operazione.current = null;
    },
    [scope],
  );

  const prepara = async (rapporto: RapportoDaPreparare, orderId: string) => {
    if (operazione.current || !companyId) return;
    const controller = new AbortController();
    operazione.current = controller;
    setPreparazione(scope);
    try {
      const documento = rapporto === "rendiconto-trasporti"
        ? await preparaRendicontoTrasporti(companyId, orderId, approvati, mese, controller.signal, usaBozza)
        : await preparaRapportoEconomia(
        approvati.filter((r) => r.order_id === orderId),
        mese,
        conDatiEconomici
          ? (id) =>
              qc.fetchQuery({
                queryKey: ["rapportino-quadro-economico", id],
                staleTime: 0,
                queryFn: async (): Promise<QuadroPerRapporto | null> => {
                  const { data, error } = await (
                    supabase as unknown as {
                      rpc: (
                        name: string,
                        args: object,
                      ) => PromiseLike<{
                        data: QuadroPerRapporto | null;
                        error: { message: string } | null;
                      }>;
                    }
                  ).rpc("rapportino_quadro_economico", { p_rapportino_id: id });
                  if (error) throw new Error(error.message);
                  return data;
                },
              })
          : undefined,
        controller.signal,
        () => leggiDestinatarioRapporto(companyId, orderId),
        usaBozza,
      );
      if (controller.signal.aborted) return;
      setDoc(documento);
      setScegli(null);
    } catch (e) {
      if (!controller.signal.aborted)
        toast.error(
          e instanceof Error
            ? e.message
            : t("Non riesco a preparare il riepilogo. Riprova."),
        );
    } finally {
      if (operazione.current === controller) {
        operazione.current = null;
        setPreparazione(null);
      }
    }
  };
  const rapportoManuale = async () => {
    if (operazione.current || !companyId) return;
    const documento: DocumentoOperativo = {
      tipo: "trasporti", numero: `TRASPORTI-${campoWorkDay()}`, data: campoWorkDay(), periodo: mese,
      destinatario: { nome: "" }, note: null,
      righe: [{ descrizione: "", unita: "viaggio", quantita: 1, prezzo: null, iva: null }],
    };
    if (!orderId) { setDoc(documento); return; }
    const controller = new AbortController();
    operazione.current = controller; setPreparazione(scope);
    try {
      const ordine = await supabase.from("orders").select("order_code, work_address").eq("id", orderId).eq("company_id", companyId).single();
      if (ordine.error) throw new Error(ordine.error.message);
      if (controller.signal.aborted) return;
      setDoc({ ...documento, commessa: ordine.data.order_code, luogo: ordine.data.work_address, destinazioneTipo: "cantiere", indirizzoCantiere: ordine.data.work_address });
    } catch (e) {
      if (!controller.signal.aborted) toast.error(e instanceof Error ? e.message : t("Rapporto trasporti non disponibile. Riprova."));
    } finally {
      if (operazione.current === controller) { operazione.current = null; setPreparazione(null); }
    }
  };
  const avvia = (rapporto: RapportoDaPreparare) => {
    if (cantieri.length === 1) void prepara(rapporto, cantieri[0].order_id);
    else {
      setCantiere("");
      setCercaCantiere("");
      setScegli(rapporto);
    }
  };
  if (nascondiSeVuoto && righe.length === 0) return null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={busy || !companyId} className={compatto ? "h-8 px-2.5 text-xs [&_svg]:h-3.5 [&_svg]:w-3.5" : undefined}>
              {busy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-1.5 h-4 w-4" />
              )}
              {t("Crea documento PDF")}
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-w-[calc(100vw-2rem)]"
          >
            {inviati.length > 0 && (
              <>
                <DropdownMenuRadioGroup value={usaBozza ? "bozza" : "approvati"} onValueChange={(v) => setConBozza(v === "bozza")}>
                  <DropdownMenuRadioItem value="approvati" onSelect={(e) => e.preventDefault()}>{t("Solo approvati")}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="bozza" onSelect={(e) => e.preventDefault()}>
                    {t("Anche quelli da approvare")}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                {usaBozza && <p className="px-2 pb-1 text-xs text-amber-700">{t("Il PDF riporterà «BOZZA – contiene rapportini non approvati».")}</p>}
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem
              disabled={!approvati.length}
              onSelect={() => avvia("economia")}
              className="block"
            >
              <span className="block font-medium">
                {t("Riepilogo lavori approvati")}
              </span>
              <span className="block text-xs text-muted-foreground">
                {approvati.length ? t("Rapporto in economia: compilato dai rapportini del periodo") : nessunoApprovato}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!approvati.length || !conDatiEconomici}
              onSelect={() => avvia("rendiconto-trasporti")}
              className="block"
            >
              <span className="block font-medium">{t("Rendiconto trasporti al cliente")}</span>
              <span className="block text-xs text-muted-foreground">
                {!conDatiEconomici
                  ? t("Richiede accesso alle voci e ai costi dei rapportini")
                  : approvati.length ? t("Viaggi dei rapportini approvati nel periodo") : nessunoApprovato}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="block"
              onSelect={() => void rapportoManuale()}
            >
              <span className="block font-medium">{t("Rapporto trasporti")}</span>
              <span className="block text-xs text-muted-foreground">
                {t("Modello da compilare per il trasportatore")}
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Nella testata delle schede (compatto) la frase resta per i lettori di schermo: in vista
            spingeva fuori dallo schermo «⋯» e «Scrivi rapportini» (25/11/2026). */}
        <span className={compatto ? "sr-only" : "text-xs text-slate-500"} role="status">
          {busy
            ? t("Preparo il riepilogo con i dati registrati…")
            : approvati.length
              ? t(approvati.length === 1 ? "{n} rapportino approvato per il riepilogo automatico" : "{n} rapportini approvati per il riepilogo automatico", { n: approvati.length })
                + (daApprovare ? ` · ${t("{n} da approvare", { n: daApprovare })}` : "")
              : daApprovare ? nessunoApprovato : t("Il riepilogo si prepara dai rapportini approvati")}
        </span>
      </div>
      <Dialog open={!!scegli} onOpenChange={(open) => {
        if (!open) {
          operazione.current?.abort();
          setScegli(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{scegli === "rendiconto-trasporti" ? t("Rendiconto trasporti al cliente") : t("Riepilogo lavori approvati")}</DialogTitle>
            <DialogDescription>
              {scegli === "rendiconto-trasporti"
                ? t("Scegli la commessa per riportare il suo cliente e i viaggi approvati nel periodo.")
                : t("Scegli il cantiere per preparare la bozza con cliente, lavori, ore, materiali, mezzi e prezzi di vendita disponibili.")}
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            {t("Compaiono solo le commesse con rapportini approvati nel periodo.")}
            {daApprovare > 0 && ` ${t(daApprovare === 1 ? "{n} rapportino è ancora da approvare: approvalo per includere la sua commessa." : "{n} rapportini sono ancora da approvare: approvali per includere le loro commesse.", { n: daApprovare })}`}
          </p>
          <Input
            aria-label={t("Cerca cantiere per il documento")}
            placeholder={t("Cerca per nome o codice…")}
            disabled={busy}
            value={cercaCantiere}
            onChange={(e) => setCercaCantiere(e.target.value)}
          />
          <OfficeSelect
            label={t("Cantiere del documento")}
            value={cantiere}
              disabled={busy}
            onValueChange={setCantiere}
            options={[
              { value: "", label: t("Scegli il cantiere") },
              ...cantieri
                .filter((r) =>
                  [r.order?.order_code, nomeCantiere(r)]
                    .join(" ")
                    .toLocaleLowerCase("it")
                    .includes(cercaCantiere.trim().toLocaleLowerCase("it")),
                )
                .map((r) => ({
                  value: r.order_id,
                  label: [r.order?.order_code, nomeCantiere(r)]
                    .filter(Boolean)
                    .join(" · "),
                })),
            ]}
          />
          <Button
            disabled={!cantiere || busy}
            onClick={() => { if (scegli) void prepara(scegli, cantiere); }}
          >
            {busy ? t("Preparo…") : t("Apri bozza compilata")}
          </Button>
        </DialogContent>
      </Dialog>
      {doc && (
        <DocumentoInvioDialog
          key={`${companyId}-${doc.tipo}`}
          open
          onOpenChange={(v) => {
            if (!v) setDoc(null);
          }}
          documento={doc}
          modificaRighe
          initialMode="pdf"
          context={{
            mode: "new",
            initialSubject: `${doc.rendicontoTrasporti ? titoloDocumento(doc) : doc.tipo === "economia" ? "Rapporto lavori in economia" : "Rapporto trasporti"} ${doc.numero}`,
          }}
        />
      )}
    </>
  );
}
