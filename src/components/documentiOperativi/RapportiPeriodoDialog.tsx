import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DocumentoInvioDialog } from "./DocumentoInvioDialog";
import type {
  DocumentoOperativo,
  TipoDocumentoOperativo,
} from "@/lib/documentiOperativi/modello";
import type { RapportinoCompleto } from "@/hooks/useRapportiniMese";
import { statoDi } from "@/lib/orders/rapportiniMese";
import { campoWorkDay } from "@/lib/campo/workDay";
import { toast } from "sonner";
import { rapportoEconomiaDaRapportini } from "@/lib/documentiOperativi/rapporti";
import { FileText } from "lucide-react";

export function RapportiPeriodoDialog({
  righe,
  mese,
  companyId,
}: {
  righe: RapportinoCompleto[];
  mese: string;
  companyId?: string;
}) {
  const [doc, setDoc] = useState<DocumentoOperativo | null>(null);
  const avvia = (tipo: TipoDocumentoOperativo) => {
    if (
      tipo === "economia" &&
      new Set(
        righe.filter((r) => statoDi(r) === "approvato").map((r) => r.order_id),
      ).size > 1
    ) {
      toast.error(
        "Scegli un solo cantiere nei filtri prima di preparare il rapporto in economia.",
      );
      return;
    }
    setDoc(
      tipo === "economia"
        ? rapportoEconomiaDaRapportini(righe, mese)
        : {
            tipo: "trasporti",
            numero: `TRASPORTI-${mese}`,
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
          },
    );
  };
  return (
    <>
      {/* Documenti da stampare o spedire: da scrivania. */}
      <div className="flex flex-wrap gap-2 max-md:hidden">
        <Button size="sm" variant="outline" onClick={() => avvia("economia")}>
          <FileText className="mr-1.5 h-4 w-4" />
          Rapporto in economia
        </Button>
        <Button size="sm" variant="outline" onClick={() => avvia("trasporti")}>
          <FileText className="mr-1.5 h-4 w-4" />
          Rapporto trasporti
        </Button>
      </div>
      {doc && (
        <DocumentoInvioDialog
          key={`${companyId}-${doc.tipo}`}
          open
          onOpenChange={(v) => {
            if (!v) setDoc(null);
          }}
          documento={doc}
          modificaRighe
          context={{
            mode: "new",
            initialSubject: `${doc.tipo === "economia" ? "Rapporto lavori in economia" : "Rapporto trasporti"} ${doc.numero}`,
          }}
        />
      )}
    </>
  );
}
