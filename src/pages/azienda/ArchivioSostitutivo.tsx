import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useFiscalPeriod } from "@/hooks/useFiscalPeriod";
import { useArchivioSostitutivo } from "@/hooks/useArchivioSostitutivo";
import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "@/lib/personale/readAllPages";
import {
  FiscalLegacyRedirect,
  FiscalStandaloneWorkspace,
} from "@/components/fatturazione/FiscalWorkspace";
import { FiscalSourceViewer } from "@/components/fatturazione/FiscalSourceViewer";
import { FiscalQueryState } from "@/components/fatturazione/FiscalQueryState";
import {
  FiscalSectionHeader,
  FiscalMetric,
  FiscalSelectFilter,
} from "@/components/fatturazione/FiscalSectionLayout";
import { ArchivioUploader } from "@/components/archivio/ArchivioUploader";
import { ArchivioTable } from "@/components/archivio/ArchivioTable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { fiscalDate, fiscalMatch } from "@/lib/fatturazione/fiscalInsights";
interface Source {
  id: string;
  numero?: string;
  numero_fattura?: string;
  data_emissione?: string;
  data_fattura?: string;
  stato: string;
  cliente_snapshot?: { ragione_sociale?: string };
  cedente_ragione_sociale?: string;
  sdi_file_xml_url?: string | null;
  xml_url?: string | null;
  tipo?: string;
}
export default function ArchivioSostitutivo({
  embedded = false,
}: { embedded?: boolean } = {}) {
  return embedded ? (
    <ArchiveContent />
  ) : (
    <FiscalLegacyRedirect
      section="archivio"
      fallback={<FiscalStandaloneWorkspace section="archivio" />}
    />
  );
}
function ArchiveContent() {
  const company = useEffectiveCompanyId(),
    p = useFiscalPeriod(),
    manual = useArchivioSostitutivo(p.anno);
  const permissions = usePermissions();
  const documents = useFeatureAccess("documenti");
  const sourceGateLoading =
    permissions.isLoading ||
    (permissions.canViewBilling && documents.isLoading);
  const sourceGateError = permissions.canViewBilling && documents.isError;
  const canReadSources =
    permissions.canViewBilling &&
    !sourceGateLoading &&
    !sourceGateError &&
    (documents.isEnabled || documents.isPreview);
  const search = p.params.get("q_archivio") ?? "";
  const rawOrigin = p.params.get("origine_archivio") ?? "tutti";
  const origin = ["tutti", "vendite", "acquisti", "manuali"].includes(rawOrigin)
    ? rawOrigin
    : "tutti";
  const rawXml = p.params.get("xml_archivio") ?? "tutti";
  const xml = ["tutti", "presente", "mancante"].includes(rawXml)
    ? rawXml
    : "tutti";
  const [page, setPage] = useState(0),
    [showUpload, setShowUpload] = useState(false);
  const sources = useQuery({
    queryKey: ["fiscal-archive-sources", company, p.anno],
    enabled: !!company && canReadSources,
    queryFn: async ({ signal }) => {
      const [sales, purchases] = await Promise.all([
        readAllPages((from, to) =>
          supabase
            .from("documenti_fiscali")
            .select(
              "id,numero,data_emissione,stato,cliente_snapshot,sdi_file_xml_url,tipo",
            )
            .eq("company_id", company!)
            .is("deleted_at", null)
            .gte("data_emissione", `${p.anno}-01-01`)
            .lte("data_emissione", `${p.anno}-12-31`)
            .not("stato", "in", '("bozza","annullata")')
            .order("data_emissione", { ascending: false })
            .order("id")
            .range(from, to)
            .abortSignal(signal),
        ),
        readAllPages((from, to) =>
          supabase
            .from("fatture_ricevute" as never)
            .select(
              "id,numero_fattura,data_fattura,stato,cedente_ragione_sociale,xml_url",
            )
            .eq("company_id", company!)
            .gte("data_fattura", `${p.anno}-01-01`)
            .lte("data_fattura", `${p.anno}-12-31`)
            .order("data_fattura", { ascending: false })
            .order("id")
            .range(from, to)
            .abortSignal(signal),
        ),
      ]);
      return [
        ...(sales as unknown as Source[]).map((r) => ({
          ...r,
          origin: "vendite" as const,
        })),
        ...(purchases as unknown as Source[]).map((r) => ({
          ...r,
          origin: "acquisti" as const,
        })),
      ].sort(
        (a, b) =>
          (b.data_emissione || b.data_fattura || "").localeCompare(
            a.data_emissione || a.data_fattura || "",
          ) || a.id.localeCompare(b.id),
      );
    },
  });
  if (!company) return <p>Seleziona un’azienda.</p>;
  if (
    sourceGateLoading ||
    sourceGateError ||
    (canReadSources && sources.isPending) ||
    (canReadSources && sources.isError) ||
    manual.isLoading ||
    manual.isError
  )
    return (
      <FiscalQueryState
        loading={
          sourceGateLoading ||
          (canReadSources && sources.isPending) ||
          manual.isLoading
        }
        error={
          sourceGateError ||
          (canReadSources && sources.isError) ||
          manual.isError
        }
        onRetry={() => {
          if (canReadSources) void sources.refetch();
          if (sourceGateError) void documents.refetch();
          void manual.refetch();
        }}
      />
    );
  const available = canReadSources ? sources.data || [] : [];
  const hasXml = (r: Source) =>
    !!(r.sdi_file_xml_url?.trim() || r.xml_url?.trim());
  const missingXml = available.filter((r) => !hasXml(r)).length;
  const filter = (changes: Record<string, string>) => {
    p.set(changes);
    setPage(0);
  };
  const rows = available.filter(
      (r) =>
        (origin === "tutti" || r.origin === origin) &&
        (xml === "tutti" || (xml === "presente" ? hasXml(r) : !hasXml(r))) &&
        fiscalMatch(
          search,
          r.numero,
          r.numero_fattura,
          r.cedente_ragione_sociale,
          r.cliente_snapshot?.ragione_sociale,
        ),
    ),
    pages = Math.max(1, Math.ceil(rows.length / 50)),
    current = Math.min(page, pages - 1);
  return (
    <div className="space-y-4">
      <FiscalSectionHeader
        title={`Archivio fiscale · ${p.anno}`}
        description="Documenti già presenti nel gestionale e allegati aggiuntivi, senza duplicare i file."
        actions={
          <Button
            disabled={!manual.canUpload}
            variant="outline"
            onClick={() => setShowUpload((v) => !v)}
          >
            {showUpload ? "Chiudi caricamento" : "Aggiungi allegato"}
          </Button>
        }
      />
      {!canReadSources && (
        <p className="rounded-xl border p-4 text-sm">
          Per consultare anche gli originali delle fatture servono il modulo e
          il permesso Fatturazione. Qui rimangono disponibili solo gli allegati
          autorizzati.
        </p>
      )}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
        <strong>Conservazione a norma non verificata.</strong>
        <p className="mt-1">
          La presenza di una fattura, un XML o un hash non prova l’avvenuta
          conservazione. Servono le ricevute del servizio effettivo; nessun
          documento viene marcato automaticamente «conservato».
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <FiscalMetric
          label="Documenti presenti"
          value={canReadSources ? available.length : "Accesso non disponibile"}
          description={`Documenti gestionali del ${p.anno}, non prova di conservazione`}
          onClick={
            canReadSources
              ? () =>
                  filter({
                    origine_archivio: "tutti",
                    xml_archivio: "tutti",
                    q_archivio: "",
                  })
              : undefined
          }
          active={origin === "tutti" && xml === "tutti"}
        />
        <FiscalMetric
          label="Allegati manuali"
          value={manual.documenti.length}
          description="File caricati nell’archivio separato"
          onClick={() =>
            filter({
              origine_archivio: "manuali",
              xml_archivio: "tutti",
              q_archivio: "",
            })
          }
          active={origin === "manuali"}
        />
        <FiscalMetric
          label="Riferimento XML da verificare"
          value={canReadSources ? missingXml : "Accesso non disponibile"}
          description="Riferimento non presente: non significa che l’originale non esista"
          onClick={
            canReadSources
              ? () =>
                  filter({
                    origine_archivio: "tutti",
                    xml_archivio: "mancante",
                    q_archivio: "",
                  })
              : undefined
          }
          active={xml === "mancante"}
          warning={canReadSources && missingXml > 0}
        />
      </div>
      {showUpload && manual.canUpload && (
        <ArchivioUploader
          key={p.anno}
          anno={p.anno}
          onUpload={manual.upload}
          isUploading={manual.isUploading}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Cerca nell’archivio fiscale"
          placeholder={
            origin === "manuali"
              ? "Cerca tipo, note o riferimento file…"
              : "Cerca numero o controparte…"
          }
          className="min-w-48 flex-1"
          value={search}
          onChange={(e) => {
            p.set({ q_archivio: e.target.value }, true);
            setPage(0);
          }}
        />
        <FiscalSelectFilter
          label="Origine dei documenti"
          value={origin}
          onChange={(value) =>
            filter({ origine_archivio: value, xml_archivio: "tutti" })
          }
          options={[
            { value: "tutti", label: "Tutte le fatture" },
            { value: "vendite", label: "Documenti attivi" },
            { value: "acquisti", label: "Fatture ricevute" },
            { value: "manuali", label: "Allegati manuali" },
          ]}
        />
        {origin !== "manuali" && (
          <FiscalSelectFilter
            label="Riferimento XML"
            value={xml}
            onChange={(value) => filter({ xml_archivio: value })}
            options={[
              { value: "tutti", label: "Tutti i riferimenti XML" },
              { value: "presente", label: "Riferimento presente" },
              { value: "mancante", label: "Riferimento da verificare" },
            ]}
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        I KPI riguardano l’intero anno; i filtri si applicano all’elenco. Un
        riferimento XML non attesta accessibilità del file o conservazione.
      </p>
      {origin === "manuali" ? (
        <ArchivioTable
          documenti={manual.documenti.filter((d) =>
            fiscalMatch(search, d.tipo_documento, d.note, d.storage_path),
          )}
          isLoading={false}
          inScadenzaProssimi365gg={manual.inScadenzaProssimi365gg}
          getSignedUrl={manual.getSignedUrl}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {[
                    "Documento",
                    "Data",
                    "Origine / stato",
                    "Originale / conservazione",
                  ].map((h) => (
                    <th key={h} className="p-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(current * 50, (current + 1) * 50).map((r) => (
                  <tr key={`${r.origin}:${r.id}`} className="border-t">
                    <td className="p-3">
                      <FiscalSourceViewer
                        type={r.origin}
                        id={r.id}
                        label={
                          r.numero ||
                          r.numero_fattura ||
                          "Documento senza numero"
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        {r.cedente_ragione_sociale ||
                          r.cliente_snapshot?.ragione_sociale ||
                          "Controparte da verificare"}
                      </p>
                    </td>
                    <td className="p-3">
                      {fiscalDate(r.data_emissione || r.data_fattura)}
                    </td>
                    <td className="p-3">
                      {r.origin === "vendite"
                        ? "Documenti attivi"
                        : "Fatture ricevute"}
                      <p className="text-xs text-muted-foreground">
                        Stato gestionale: {r.stato}
                      </p>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {r.sdi_file_xml_url || r.xml_url
                        ? "Riferimento XML presente"
                        : "File originale da verificare nella scheda"}
                      <p>Conservazione non verificata</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Nessun documento corrisponde all’anno e alla ricerca. Non
                significa che non esistano documenti di altri periodi.
              </p>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>
              {rows.length} documenti · pagina {current + 1} / {pages}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
              >
                Precedenti
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={current >= pages - 1}
                onClick={() => setPage(current + 1)}
              >
                Successivi
              </Button>
            </div>
          </div>
        </>
      )}
      {origin !== "manuali" && (
        <details className="rounded-xl border bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Allegati caricati manualmente ({manual.documenti.length})
          </summary>
          <p className="my-3 text-xs text-muted-foreground">
            Archivio separato dai documenti già presenti. Un hash non è una
            prova di conservazione.
          </p>
          <ArchivioTable
            documenti={manual.documenti}
            isLoading={false}
            inScadenzaProssimi365gg={manual.inScadenzaProssimi365gg}
            getSignedUrl={manual.getSignedUrl}
          />
        </details>
      )}
      <details className="rounded-xl border bg-white p-4 text-sm">
        <summary className="cursor-pointer font-medium">
          Verifica delle prove di conservazione
        </summary>
        <p className="mt-3 text-muted-foreground">
          Questa vista non riceve ancora gli esiti del conservatore. Per
          attestare una conservazione servono ricevuta del servizio,
          identificativo del pacchetto, data/esito e corrispondenza con i
          documenti originali. Gli allegati manuali non vengono promossi
          automaticamente a prove verificate.
        </p>
      </details>
    </div>
  );
}
