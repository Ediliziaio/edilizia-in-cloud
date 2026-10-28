import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import {
  contractDateError,
  PartnerValidationError,
  SUPPLIER_DOCUMENT_BUCKET,
  validateContractFile,
  type PartnerRole,
  type SupplierContract,
  type SupplierContractDocument,
  type SupplierRelation,
} from "@/lib/suppliers/partnerRelations";

export type ContractDraft = Pick<
  SupplierContract,
  | "title"
  | "kind"
  | "status"
  | "signed_on"
  | "starts_on"
  | "ends_on"
  | "notice_days"
  | "automatic_renewal"
  | "conditions"
  | "amount"
>;
export function useSupplierWorkspace(supplierId: string) {
  const companyId = useEffectiveCompanyId();
  const permissions = usePermissions();
  const canEdit =
    !permissions.solaLettura &&
    !!(permissions.isAdmin || permissions.canEditSettingsSuppliers);
  const canRead =
    canEdit || !!(permissions.isAdmin || permissions.canViewSettingsSuppliers);
  const canSub = !!(permissions.isAdmin || permissions.canViewSubappaltatori);
  const qc = useQueryClient();
  const key = ["supplier-workspace", companyId, supplierId];
  const query = useQuery({
    queryKey: key,
    enabled: !!companyId && !!supplierId && canRead,
    staleTime: 60_000,
    queryFn: async () => {
      const [relation, contracts, documents] = await Promise.all([
        supabase
          .from("supplier_relations" as never)
          .select("*")
          .eq("company_id", companyId!)
          .eq("supplier_id", supplierId)
          .maybeSingle(),
        loadCatalogPages<SupplierContract>(
          (from, to) =>
            supabase
              .from("supplier_contracts" as never)
              .select("*")
              .eq("company_id", companyId!)
              .eq("supplier_id", supplierId)
              .order("id")
              .range(from, to) as never,
        ),
        loadCatalogPages<SupplierContractDocument>(
          (from, to) =>
            supabase
              .from("supplier_contract_documents" as never)
              .select("*")
              .eq("company_id", companyId!)
              .eq("supplier_id", supplierId)
              .order("id")
              .range(from, to) as never,
        ),
      ]);
      if (relation.error) throw relation.error;
      return {
        relation: relation.data as unknown as SupplierRelation | null,
        contracts,
        documents,
      };
    },
  });
  const subs = useQuery({
    queryKey: ["supplier-workspace-subs", companyId],
    enabled: !!companyId && canRead && canSub,
    queryFn: () =>
      loadCatalogPages<{
        id: string;
        ragione_sociale: string;
        piva: string | null;
        codice_fiscale: string | null;
      }>((from, to) =>
        supabase
          .from("subappaltatori_sicurezza")
          .select("id,ragione_sociale,piva,codice_fiscale")
          .eq("company_id", companyId!)
          .order("id")
          .range(from, to),
      ),
    staleTime: 60_000,
  });
  const requireEdit = () => {
    if (!companyId || !canEdit)
      throw new PartnerValidationError(
        "Non puoi modificare il fascicolo fornitore.",
      );
  };
  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: key }),
      qc.invalidateQueries({
        queryKey: ["supplier-workspace-subs", companyId],
      }),
      qc.invalidateQueries({ queryKey: ["subappaltatori-page", companyId] }),
      qc.invalidateQueries({
        queryKey: ["supplier-subcontractor-link", companyId],
      }),
    ]);
  };
  const saveRelation = useMutation({
    mutationFn: async ({
      roles,
      subId,
      createSub,
    }: {
      roles: PartnerRole[];
      subId: string | null;
      createSub: boolean;
    }) => {
      requireEdit();
      if ((createSub || subId) && !canSub)
        throw new PartnerValidationError(
          "Serve anche il permesso Subappaltatori.",
        );
      const { data, error } = await supabase.rpc(
        "salva_relazione_fornitore" as never,
        {
          p_company_id: companyId,
          p_supplier_id: supplierId,
          p_roles: roles,
          p_subappaltatore_id: subId,
          p_crea_subappaltatore: createSub,
        } as never,
      );
      if (error) throw error;
      return data as unknown as string | null;
    },
    onSuccess: invalidate,
  });
  const saveContract = useMutation({
    mutationFn: async ({
      draft,
      existing,
    }: {
      draft: ContractDraft;
      existing?: SupplierContract;
    }) => {
      requireEdit();
      const errorMessage = contractDateError(draft);
      if (errorMessage) throw new PartnerValidationError(errorMessage);
      if (!draft.title.trim() || draft.title.trim().length > 200)
        throw new PartnerValidationError(
          "Indica un titolo fino a 200 caratteri.",
        );
      const payload = {
        ...draft,
        title: draft.title.trim(),
        conditions: draft.conditions?.trim() || null,
      };
      const table = supabase.from("supplier_contracts" as never);
      const response = existing
        ? await table
            .update(payload as never)
            .eq("company_id", companyId!)
            .eq("supplier_id", supplierId)
            .eq("id", existing.id)
            .eq("updated_at", existing.updated_at)
            .select("id")
            .maybeSingle()
        : await table
            .insert({
              ...payload,
              company_id: companyId,
              supplier_id: supplierId,
            } as never)
            .select("id")
            .single();
      if (response.error) throw response.error;
      if (!response.data)
        throw new PartnerValidationError(
          "Il contratto è cambiato o non è accessibile. Ricarica prima di riprovare.",
        );
    },
    onSuccess: invalidate,
  });
  const upload = useMutation({
    mutationFn: async ({
      contractId,
      file,
    }: {
      contractId: string;
      file: File;
    }) => {
      requireEdit();
      const invalid = validateContractFile(file);
      if (invalid) throw new PartnerValidationError(invalid);
      if (!query.data?.contracts.some((c) => c.id === contractId))
        throw new PartnerValidationError(
          "Salva il contratto prima di allegare un file.",
        );
      const bytes = await file.arrayBuffer();
      // Verifica firma minima: niente HTML/SVG rinominato PDF o immagine.
      const b = new Uint8Array(bytes);
      const validSignature =
        file.type === "application/pdf"
          ? new TextDecoder().decode(b.slice(0, 5)) === "%PDF-"
          : file.type === "image/png"
            ? [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)
            : b[0] === 255 && b[1] === 216 && b[2] === 255;
      if (!validSignature)
        throw new PartnerValidationError(
          "Il contenuto del file non corrisponde al formato dichiarato.",
        );
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      )
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      if (
        query.data.documents.some(
          (d) => d.contract_id === contractId && d.sha256 === hash,
        )
      )
        throw new PartnerValidationError(
          "Questo file è già presente nel contratto.",
        );
      const path = `${companyId}/${supplierId}/${contractId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120)}`;
      const { error: upError } = await supabase.storage
        .from(SUPPLIER_DOCUMENT_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upError) throw upError;
      const { error } = await supabase
        .from("supplier_contract_documents" as never)
        .insert({
          company_id: companyId,
          supplier_id: supplierId,
          contract_id: contractId,
          file_name: file.name,
          storage_path: path,
          mime_type: file.type,
          size_bytes: file.size,
          sha256: hash,
        } as never);
      if (error) {
        const { error: cleanupError } = await supabase.storage
          .from(SUPPLIER_DOCUMENT_BUCKET)
          .remove([path]);
        if (cleanupError)
          throw new PartnerValidationError(
            "Registrazione non completata; il file caricato richiede una verifica. Non ripetere il caricamento alla cieca.",
          );
        throw error;
      }
    },
    onSuccess: invalidate,
  });
  const download = async (doc: SupplierContractDocument) => {
    if (
      !canRead ||
      !companyId ||
      doc.company_id !== companyId ||
      doc.supplier_id !== supplierId ||
      !doc.storage_path.startsWith(
        `${companyId}/${supplierId}/${doc.contract_id}/`,
      ) ||
      doc.storage_path.includes("..")
    )
      throw new PartnerValidationError("Allegato non accessibile.");
    const { data, error } = await supabase.storage
      .from(SUPPLIER_DOCUMENT_BUCKET)
      .createSignedUrl(doc.storage_path, 300, { download: doc.file_name });
    if (error || !data?.signedUrl)
      throw error ?? Error("Download non disponibile.");
    const link = document.createElement("a");
    link.href = data.signedUrl;
    link.rel = "noopener noreferrer";
    link.target = "_blank";
    link.click();
  };
  return {
    query,
    subs,
    canRead,
    canEdit,
    canSub,
    saveRelation,
    saveContract,
    upload,
    download,
  };
}
