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

type RapportoDaPreparare = "economia" | "rendiconto-trasporti";

export function RapportiPeriodoDialog({
  righe,
  mese,
  companyId,
  conDatiEconomici = false,
}: {
  righe: RapportinoCompleto[];
  mese: string;
  companyId?: string;
  conDatiEconomici?: boolean;
}) {
  const [doc, setDoc] = useState<DocumentoOperativo | null>(null);
  const [scegli, setScegli] = useState<RapportoDaPreparare | null>(null);
  const [cantiere, setCantiere] = useState("");
  const [cercaCantiere, setCercaCantiere] = useState("");
  const [preparazione, setPreparazione] = useState<string | null>(null);
  const operazione = useRef<AbortController | null>(null);
  const qc = useQueryClient();
  const approvati = righe.filter((r) => statoDi(r) === "approvato");
  const cantieri = [...new Map(approvati.map((r) => [r.order_id, r])).values()];
  const scope = `${companyId}:${mese}:${conDatiEconomici}:${approvati.map((r) => `${r.id}:${r.updated_at ?? ""}`).join(",")}`;
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
        ? await preparaRendicontoTrasporti(companyId, orderId, approvati, mese, controller.signal)
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
      );
      if (controller.signal.aborted) return;
      setDoc(documento);
      setScegli(null);
    } catch (e) {
      if (!controller.signal.aborted)
        toast.error(
          e instanceof Error
            ? e.message
            : "Non riesco a preparare il riepilogo. Riprova.",
        );
    } finally {
      if (operazione.current === controller) {
        operazione.current = null;
        setPreparazione(null);
      }
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
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={busy || !companyId}>
              {busy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-1.5 h-4 w-4" />
              )}
              Crea documento PDF
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-w-[calc(100vw-2rem)]"
          >
            <DropdownMenuItem
              disabled={!approvati.length}
              onSelect={() => avvia("economia")}
              className="block"
            >
              <span className="block font-medium">
                Riepilogo lavori approvati
              </span>
              <span className="block text-xs text-muted-foreground">
                Rapporto in economia: compilato dai rapportini del periodo
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!approvati.length || !conDatiEconomici}
              onSelect={() => avvia("rendiconto-trasporti")}
              className="block"
            >
              <span className="block font-medium">Rendiconto trasporti al cliente</span>
              <span className="block text-xs text-muted-foreground">
                {!conDatiEconomici
                  ? "Richiede accesso alle voci e ai costi dei rapportini"
                  : "Viaggi dei rapportini approvati nel periodo"}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="block"
              onSelect={() =>
                setDoc({
                  tipo: "trasporti",
                  numero: `TRASPORTI-${campoWorkDay()}`,
                  data: campoWorkDay(),
                  periodo: mese,
                  destinatario: { nome: "" },
                  note: null,
                  righe: [
                    {
                      descrizione: "",
                      unita: "viaggio",
                      quantita: 1,
                      prezzo: null,
                      iva: null,
                    },
                  ],
                })
              }
            >
              <span className="block font-medium">Rapporto trasporti</span>
              <span className="block text-xs text-muted-foreground">
                Modello da compilare con viaggi e trasporti
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="text-xs text-slate-500" role="status">
          {busy
            ? "Preparo il riepilogo con i dati registrati…"
            : approvati.length
              ? `${approvati.length} ${approvati.length === 1 ? "rapportino approvato" : "rapportini approvati"} per il riepilogo automatico`
              : "Il riepilogo si prepara dai rapportini approvati"}
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
            <DialogTitle>{scegli === "rendiconto-trasporti" ? "Rendiconto trasporti al cliente" : "Riepilogo lavori approvati"}</DialogTitle>
            <DialogDescription>
              {scegli === "rendiconto-trasporti"
                ? "Scegli la commessa per riportare il suo cliente e i viaggi approvati nel periodo."
                : "Scegli il cantiere per preparare la bozza con cliente, lavori, ore, materiali, mezzi e prezzi di vendita disponibili."}
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Cerca cantiere per il documento"
            placeholder="Cerca per nome o codice…"
            disabled={busy}
            value={cercaCantiere}
            onChange={(e) => setCercaCantiere(e.target.value)}
          />
          <OfficeSelect
            label="Cantiere del documento"
            value={cantiere}
              disabled={busy}
            onValueChange={setCantiere}
            options={[
              { value: "", label: "Scegli il cantiere" },
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
            {busy ? "Preparo…" : "Apri bozza compilata"}
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
