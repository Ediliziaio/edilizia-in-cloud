import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import VerticalWizardAiDialog from "@/components/quotes/VerticalWizardAiDialog";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import { useFamilies } from "@/hooks/useFamilies";
import { useSupplierProductLines } from "@/features/serramenti-listini/hooks/useSupplierProductLines";
import {
  useAziendaPerPdf,
  useTemplatePdf,
  useTariffeManodopera,
  SR_QK,
} from "@/lib/serramenti/queries";
import { listGrigliaByFamily } from "@/lib/serramenti/api";
import { serramentiConversationPricing } from "@/lib/serramenti/conversationPricing";
import {
  srConversationPayload,
  saveLocalSrConversation,
} from "@/lib/serramenti/conversationSave";
import {
  applySrNativeTurn,
  srNativeContext,
} from "@/lib/preventivi/verticalWizardDraft";
import { wizardDraftFingerprint } from "@/lib/preventivi/wizardAiDraft";
import { supabase } from "@/integrations/supabase/client";
import type { SrProgettoDetail } from "@/types/serramenti";
import { nativeCatalogueCandidates } from "../../../supabase/functions/_shared/quoteNative";

export default function SerramentiConversationalAiDialog({
  detail,
  onClose,
  onInserted,
}: {
  detail: SrProgettoDetail;
  onClose: () => void;
  onInserted?: (id: string) => void;
}) {
  const [base] = useState(() => structuredClone(detail));
  const company = useAziendaPerPdf(detail.progetto.company_id),
    template = useTemplatePdf(),
    tariffe = useTariffeManodopera();
  const { families, isLoading, isError } = useFamilies(),
    {
      lines,
      isLoading: linesLoading,
      isError: linesError,
    } = useSupplierProductLines();
  const qc = useQueryClient();
  const catalogue = useMemo(
    () => [
      ...families.map((f) => ({
        id: f.id,
        kind: "famiglia",
        label: f.nome.slice(0, 200),
        specs: JSON.stringify({
          prezzo: f.modalita_prezzo_base,
          assi: f.axes.map((a) => ({
            asse: a.codice,
            nome: a.nome,
            obbligatorio: a.obbligatorio,
            valori: a.values
              .filter((v) => v.attivo)
              .map((v) => ({ id: v.id, label: v.label, scelte: v.opzioni })),
          })),
        }).slice(0, 1200),
      })),
      ...(tariffe.data ?? []).map((t) => ({
        id: t.id,
        kind: "servizio",
        label: t.nome.slice(0, 200),
        specs: t.unita_fatturazione ?? t.unita ?? "",
      })),
      ...lines.map((l) => ({
        id: l.id,
        kind: "supplierLine",
        label: l.nome.slice(0, 200),
        specs: "",
      })),
    ],
    [families, tariffe.data, lines],
  );
  const title =
    base.progetto.intervento_titolo || "Serramenti · configurazione tecnica";
  const ready =
    !isLoading &&
    !linesLoading &&
    !tariffe.isLoading &&
    !template.isLoading &&
    !company.isLoading;
  const failed =
    isError ||
    linesError ||
    tariffe.isError ||
    template.isError ||
    company.isError;
  const resolver = useMemo(
    () =>
      serramentiConversationPricing(
        families,
        tariffe.data ?? [],
        lines,
        listGrigliaByFamily,
      ),
    [families, tariffe.data, lines],
  );
  return (
    <VerticalWizardAiDialog
      title={title}
      companyId={base.progetto.company_id}
      current={base}
      onClose={onClose}
      fingerprint={wizardDraftFingerprint(detail)}
      context={(draft, query) => {
        if (!ready || failed)
          throw new Error(
            "Attendi il caricamento del listino e del modello; se necessario riapri la chat.",
          );
        const used = new Set([
          ...draft.serramenti.flatMap((r) => [
            r.family_id,
            r.supplier_product_line_id,
          ]),
          ...draft.accessori.flatMap((r) => [
            r.family_id,
            r.supplier_product_line_id,
          ]),
          ...draft.servizi.map((r) => r.tariffa_id),
        ]);
        const candidates = nativeCatalogueCandidates(catalogue, used, query);
        return srNativeContext(draft, title, candidates);
      }}
      applyProposal={(draft, turn, manual) =>
        applySrNativeTurn(draft, turn, catalogue, resolver, manual)
      }
      variants={(draft, op) => {
        if (op.kind === "servizio") return [];
        const old = [...draft.serramenti, ...draft.accessori].find(
            (r) => r.id === op.id,
          ),
          field = op.fields.find((f) => f.key === "catalogueId");
        const familyId = field ? field.value : old?.family_id,
          family = families.find((f) => f.id === familyId),
          same = old?.family_id === familyId ? old : null;
        const values = {
          ...(same?.valori_assi ?? {}),
          ...Object.fromEntries(op.axes.map((a) => [a.axis, a.value])),
        };
        return (family?.axes ?? [])
          .filter(
            (a) =>
              !a.visibile_se ||
              a.visibile_se.valori.includes(values[a.visibile_se.asse]),
          )
          .map((a) => {
            const proposed = op.axes.find((v) => v.axis === a.codice);
            return {
              axis: a.codice,
              label: a.nome,
              required: a.obbligatorio,
              value: values[a.codice] ?? null,
              choice: proposed
                ? proposed.choice
                : (same?.scelte_assi?.[a.codice] ?? null),
              values: a.values
                .filter((v) => v.attivo)
                .map((v) => ({
                  id: v.id,
                  label: v.label,
                  choices: v.opzioni ?? [],
                })),
            };
          });
      }}
      preview={(draft) => (
        <section className="rounded-2xl border bg-white p-3">
          <h2 className="font-semibold">Anteprima del modello Serramenti</h2>
          <p className="my-2 text-xs text-slate-500">
            Stesso PDF del wizard, incluse foto, disegni e schede del modello
            scelto.
          </p>
          {ready && !failed ? (
            <div className="h-[65dvh]">
              <PdfBlobLivePreviewPanel
                depsKey={JSON.stringify([draft, template.data, company.data])}
                debounceMs={1000}
                renderBlobUrl={async () => {
                  const { renderSerramentoBlob } = await import(
                    "@/hooks/useSerramentoPDF"
                  );
                  return URL.createObjectURL(
                    await renderSerramentoBlob({
                      detail: draft,
                      template: template.data,
                      company: company.data,
                      useFreshTemplate: false,
                    }),
                  );
                }}
              />
            </div>
          ) : (
            <p role="status">
              {failed
                ? "Modello o listino non disponibili: riprova."
                : "Carico modello e listino…"}
            </p>
          )}
        </section>
      )}
      summary={(draft) => (
        <ul className="space-y-1">
          {[
            ...draft.serramenti.map((r) => ({
              id: r.id,
              title: r.tipologia_label,
              q: r.quantita,
            })),
            ...draft.accessori.map((r) => ({
              id: r.id,
              title: r.descrizione,
              q: r.quantita,
            })),
            ...draft.servizi.map((r) => ({
              id: r.id,
              title: r.descrizione,
              q: r.quantita,
            })),
          ].map((r) => (
            <li key={r.id}>
              {r.q} × {r.title}
            </li>
          ))}
          <li>
            {
              base.serramenti.filter(
                (r) => !draft.serramenti.some((n) => n.id === r.id),
              ).length
            }{" "}
            serramenti rimossi ·{" "}
            {
              base.accessori.filter(
                (r) => !draft.accessori.some((n) => n.id === r.id),
              ).length
            }{" "}
            accessori rimossi ·{" "}
            {
              base.servizi.filter(
                (r) => !draft.servizi.some((n) => n.id === r.id),
              ).length
            }{" "}
            servizi rimossi
          </li>
          <li>Cliente, IVA, condizioni e foto del progetto invariati.</li>
        </ul>
      )}
      onCommit={async (draft) => {
        if (
          qc.isMutating({
            mutationKey: ["sr-progetto-autosave", base.progetto.id],
          }) > 0
        )
          throw new Error(
            "Attendi il salvataggio in corso nel wizard prima di applicare la distinta.",
          );
        await saveLocalSrConversation(
          (name, args) => supabase.rpc(name as never, args as never),
          srConversationPayload(base, draft),
          import.meta.env.VITE_SUPABASE_URL,
        );
        await qc.invalidateQueries({
          queryKey: SR_QK.progetto(base.progetto.id),
        });
        const added = draft.serramenti.find(
          (r) => !base.serramenti.some((b) => b.id === r.id),
        );
        if (added) onInserted?.(added.id);
      }}
    />
  );
}
