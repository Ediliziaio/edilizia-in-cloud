import { useEffect, useMemo, useState } from "react";
import VerticalWizardAiDialog from "@/components/quotes/VerticalWizardAiDialog";
import { useFamilies } from "@/hooks/useFamilies";
import { useDiscountRules } from "@/hooks/useDiscountRules";
import { useImmaginiModelloFirmate } from "@/hooks/useFileRiservati";
import { CAMPI_IMMAGINE_FOTOVOLTAICO } from "@/lib/storage/immaginiModelloPdf";
import {
  useFitScale,
  LARGHEZZA_A4_PX,
} from "@/components/shared/livePreview/useFitScale";
import {
  fvNativeContext,
  applyFvNativeTurn,
  type FvNativeCatalogue,
} from "@/lib/preventivi/verticalWizardDraft";
import { fvConversationPreview } from "@/lib/fotovoltaico/conversationPreview";
import { prodottoExtraConversazioneFv } from "@/lib/fotovoltaico/catalogoConversazione";
import { wizardDraftFingerprint } from "@/lib/preventivi/wizardAiDraft";
import type { WizardData } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/types";
import type { FvPdfTemplateData } from "../../../supabase/functions/_shared/fvHtmlTemplate";
import { nativeCatalogueCandidates } from "../../../supabase/functions/_shared/quoteNative";
import { useAziendaPerPdf } from "@/lib/serramenti/queries";

function Preview({
  data,
  catalogue,
  template,
  name,
  numero,
  createdAt,
  azienda,
}: {
  data: WizardData;
  catalogue: FvNativeCatalogue;
  template: Record<string, unknown>;
  name: string;
  numero: string;
  createdAt?: string;
  azienda?: FvPdfTemplateData["azienda"];
}) {
  const form = useImmaginiModelloFirmate(template, CAMPI_IMMAGINE_FOTOVOLTAICO),
    rules = useDiscountRules();
  const { ref: previewRef, scala } = useFitScale(LARGHEZZA_A4_PX);
  const [view, setView] = useState<{ html: string; total: number } | null>(
      null,
    ),
    [error, setError] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (rules.isLoading || rules.isError) return;
        setView(
          fvConversationPreview(
            data,
            catalogue,
            form as FvPdfTemplateData["template"],
            name,
            rules.data ?? [],
            numero,
            { createdAt, azienda },
          ),
        );
        setError("");
      } catch (e) {
        setError((e as Error).message);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [
    data,
    catalogue,
    form,
    name,
    numero,
    createdAt,
    azienda,
    rules.data,
    rules.isLoading,
    rules.isError,
  ]);
  return (
    <section className="overflow-hidden rounded-2xl border bg-white">
      <header className="border-b p-3">
        <h2 className="font-semibold">Anteprima del modello Fotovoltaico</h2>
        <p className="mt-1 text-xs text-slate-500">
          Configurazione corrente · IVA{" "}
          {(data.iva_aliquota * 100).toLocaleString("it-IT")}% inclusa. Rata,
          detrazioni e risparmi verranno ricalcolati nel passo finanziario.
        </p>
      </header>
      {error || rules.isError ? (
        <p role="alert" className="p-3 text-orange-800">
          {error ||
            "Regole economiche non disponibili: anteprima non aggiornata."}
        </p>
      ) : (
        <div
          ref={previewRef}
          className="h-[65dvh] overflow-hidden bg-slate-100"
        >
          {view ? (
            <iframe
              sandbox="allow-same-origin"
              title="Anteprima modello fotovoltaico"
              srcDoc={view.html}
              className="border-0"
              style={{
                width: LARGHEZZA_A4_PX,
                height: `calc(65dvh / ${Math.max(0.2, scala)})`,
                transform: `scale(${scala})`,
                transformOrigin: "top left",
              }}
            />
          ) : (
            <p className="p-4" role="status">
              Preparo il modello…
            </p>
          )}
        </div>
      )}
      <footer className="border-t p-3 text-right font-semibold">
        {view
          ? `${view.total.toLocaleString("it-IT", { style: "currency", currency: "EUR" })} IVA inclusa`
          : "Nessun importo confermato"}
      </footer>
    </section>
  );
}
export default function FotovoltaicoConversationalAiDialog({
  data,
  companyId,
  companyName,
  projectId,
  numero,
  createdAt,
  projectVersion,
  modelTitle = "Fotovoltaico · configurazione impianto",
  template,
  catalogue: source,
  onApply,
  onClose,
}: {
  data: WizardData;
  companyId: string;
  companyName: string;
  projectId: string;
  numero: string;
  createdAt?: string;
  projectVersion?: string;
  modelTitle?: string;
  template: Record<string, unknown>;
  catalogue: Omit<FvNativeCatalogue, "products">;
  onApply: (next: WizardData) => void;
  onClose: () => void;
}) {
  const extra = useFamilies();
  const company = useAziendaPerPdf(companyId);
  const azienda = useMemo(
    () =>
      company.data
        ? {
            name: company.data.ragione_sociale ?? companyName,
            phone: company.data.telefono,
            email: company.data.email,
            website: company.data.website,
            vat_number: company.data.partita_iva,
            pec: company.data.pec,
          }
        : undefined,
    [company.data, companyName],
  );
  const previewTemplate = useMemo(
    () => ({
      ...template,
      logo_url: template.logo_url ?? company.data?.logo_url,
    }),
    [template, company.data?.logo_url],
  );
  const catalogue = useMemo<FvNativeCatalogue>(
    () => ({
      ...source,
      products: extra.families
        .filter(
          (row) => row.attivo !== false && row.mostra_preventivo !== false,
        )
        .map(prodottoExtraConversazioneFv),
    }),
    [source, extra.families],
  );
  const candidates = useMemo(
    () => [
      ...(
        [
          "pannelli",
          "inverter",
          "accumuli",
          "kits",
          "products",
          "labour",
          "services",
        ] as const
      ).flatMap((key) =>
        catalogue[key].map((row) => ({
          id: String(row.id),
          kind: (
            {
              pannelli: "pannello",
              inverter: "inverter",
              accumuli: "accumulo",
              kits: "kit",
              products: "prodotto",
              labour: "manodopera",
              services: "servizio",
            } as const
          )[key],
          label: String(row.nome ?? row.descrizione ?? "Articolo").slice(
            0,
            200,
          ),
          specs: JSON.stringify({
            marca: row.marca,
            modello: row.modello,
            potenza_w: row.potenza_w,
            potenza_kw: row.potenza_kw,
            capacita_kwh: row.capacita_kwh,
            kwp: row.fv_kwp,
            accumulo_kwh: row.fv_accumulo_kwh,
            unita: row.unita_fatturazione ?? row.unita,
            da_configurare: row.configurazione_richiesta,
          }).slice(0, 1200),
        })),
      ),
    ],
    [catalogue],
  );
  return (
    <VerticalWizardAiDialog
      title={modelTitle}
      companyId={companyId}
      current={data}
      fingerprint={wizardDraftFingerprint([
        data,
        projectId,
        companyId,
        template,
        projectVersion,
      ])}
      onClose={onClose}
      context={(draft, query) => {
        if (extra.isLoading || extra.isError)
          throw new Error("Attendi il caricamento del listino FV o riprova.");
        const ctx = fvNativeContext(draft, modelTitle, []),
          used = new Set(
            ctx.current.flatMap((r) =>
              r.fields.filter((f) => /Id$/.test(f.key)).map((f) => f.value),
            ),
          );
        return {
          ...ctx,
          catalogue: nativeCatalogueCandidates(candidates, used, query),
        };
      }}
      applyProposal={async (draft, turn, manual) =>
        applyFvNativeTurn(draft, turn, catalogue, manual)
      }
      preview={(draft) => (
        <Preview
          data={draft}
          catalogue={catalogue}
          template={previewTemplate}
          name={companyName}
          numero={numero}
          createdAt={createdAt}
          azienda={azienda}
        />
      )}
      summary={(draft) => (
        <ul className="space-y-1">
          <li>
            {data.potenza_kwp} → {draft.potenza_kwp} kWp ·{" "}
            {draft.numero_pannelli_scelti} pannelli · accumulo{" "}
            {draft.capacita_accumulo_kwh} kWh
          </li>
          <li>
            {draft.prodotti_extra.length} prodotti extra ·{" "}
            {draft.manodopera_righe.length} righe di manodopera ·{" "}
            {draft.servizi_righe.length} servizi
          </li>
          <li>
            Cliente, tetto, IVA, sconti e modello invariati. Le modifiche sono
            trasferite alla Fase 5: il salvataggio avviene con «Salva e
            continua», in un’unica transazione sul preventivo.
          </li>
        </ul>
      )}
      onCommit={(draft) => onApply(draft)}
    />
  );
}
