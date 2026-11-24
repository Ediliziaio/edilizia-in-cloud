import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { OriginaliConfronto } from "@/components/fatturazione/OriginaliConfronto";
import { CLASSE_DIALOG_CONFRONTO, PannelliConfrontoMobile } from "@/components/acquisti/RiepilogoConfronto";
import { ConfrontoDocumentiLayout, PannelloDocumento } from "@/components/shared/ConfrontoDocumentiLayout";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UniformSelect } from "@/components/ui/uniform-select";
import { supabase } from "@/integrations/supabase/client";
import type { RfqSupplier } from "@/hooks/useSupplierRfqs";
import { originaleDaRiferimento, type OriginaleConfronto } from "@/lib/fatturazione/originaliConfronto";
import { useT } from "@/lib/campo/lingua/LinguaCampo";


function OriginaliOfferta({ offerta, companyId }: { offerta: RfqSupplier; companyId: string }) {
  const t = useT();
  const allegato = originaleDaRiferimento(
    offerta.allegato_url,
    offerta.allegato_url?.startsWith("email-attachments/") ? "email-attachments" : "order-attachments",
  );
  const emailId = offerta.email_inbox_id;
  const email = useQuery({
    queryKey: ["rdo-originali-email", companyId, emailId],
    enabled: !!emailId,
    queryFn: async () => {
      if (!emailId) return [];
      const { data, error } = await supabase.from("email_attachments")
        .select("filename,mime_type,storage_path")
        .eq("company_id", companyId)
        .eq("inbox_id", emailId)
        .order("filename");
      if (error) throw error;
      return (data ?? []).flatMap(({ storage_path, filename, mime_type }) => {
        const mime = mime_type === "application/octet-stream" ? undefined : mime_type;
        const file = originaleDaRiferimento(storage_path, "email-attachments", filename, mime);
        return file && (file.mime === "application/pdf" || file.mime.startsWith("image/"))
          ? [{ ...file, etichetta: "Email" }]
          : [];
      }).sort((a, b) => Number(b.mime === "application/pdf") - Number(a.mime === "application/pdf"));
    },
  });

  const files = new Map<string, OriginaleConfronto>();
  if (allegato) files.set(allegato.id, allegato);
  for (const file of email.data ?? []) if (!files.has(file.id)) files.set(file.id, file);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-3 pt-0 sm:px-5 sm:pb-5">
      {email.isError && (
        <p role="alert" className="rounded-md border p-3 text-sm text-muted-foreground">
          {t("Allegati dell’email non disponibili.")}{" "}
          <button type="button" className="underline" onClick={() => void email.refetch()}>{t("Riprova")}</button>
        </p>
      )}
      {files.size ? <OriginaliConfronto files={[...files.values()]} companyId={companyId} /> : email.isLoading ? (
        <p role="status" className="p-3 text-sm text-muted-foreground">{t("Cerco i file allegati all’email…")}</p>
      ) : !email.isError && (
        <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">{t("Nessun originale disponibile per questa offerta.")}</p>
      )}
    </div>
  );
}

export function OriginaliOfferteDialog({ companyId, numero, offerte, iniziale, onClose }: {
  companyId: string;
  numero: string;
  offerte: RfqSupplier[];
  iniziale: string;
  onClose: () => void;
}) {
  const t = useT();
  const altreOfferte = offerte.filter(f => f.id !== iniziale);
  const secondaIniziale = altreOfferte.find(f => f.allegato_url)
    ?? altreOfferte.find(f => f.email_inbox_id)
    ?? altreOfferte[0];
  const [selezione, setSelezione] = useState([iniziale, secondaIniziale?.id ?? ""]);
  const [pannello, setPannello] = useState("sinistra");
  const prima = offerte.find(f => f.id === selezione[0]) ?? offerte[0];
  if (!prima) return null;
  const seconda = offerte.find(f => f.id === selezione[1] && f.id !== prima.id)
    ?? offerte.find(f => f.id !== prima.id);
  const scelta = seconda ? [prima, seconda] : [prima];

  return (
    <Dialog open onOpenChange={aperto => { if (!aperto) onClose(); }}>
      <DialogContent className={CLASSE_DIALOG_CONFRONTO}>
        <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12 sm:px-5 sm:pr-12">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <FileText className="size-4 text-primary" aria-hidden="true" />
            {t("Originali delle offerte")}
          </DialogTitle>
          <DialogDescription className="truncate text-xs">{t("{numero} · Preventivi ricevuti dai fornitori", { numero })}</DialogDescription>
        </DialogHeader>
        {seconda && (
          <PannelliConfrontoMobile valore={pannello} onChange={setPannello} sinistra={t("Offerta {n}", { n: 1 })} destra={t("Offerta {n}", { n: 2 })} />
        )}
        <ConfrontoDocumentiLayout singolo={!seconda}>
          {scelta.map((offerta, indice) => {
            const lato = indice === 0 ? "sinistra" : "destra";
            const etichetta = t("Offerta {n}", { n: indice + 1 });
            return (
              <PannelloDocumento key={lato} nome={etichetta} lato={lato} attivo={!seconda || pannello === lato} viste={null}
                testata={
                  <label className="flex flex-col gap-1 p-3 pb-2 text-xs font-medium sm:px-5">
                    {etichetta}
                    <UniformSelect value={offerta.id} aria-label={etichetta} className="h-9 w-full text-sm"
                      onChange={event => {
                        const id = event.target.value;
                        setSelezione(scelta.map((f, i) => i === indice ? id : f.id === id ? offerta.id : f.id));
                      }}>
                      {offerte.map(f => <option key={f.id} value={f.id}>{f.suppliers?.name ?? t("Fornitore")}</option>)}
                    </UniformSelect>
                  </label>
                }>
                <OriginaliOfferta key={offerta.id} offerta={offerta} companyId={companyId} />
              </PannelloDocumento>
            );
          })}
        </ConfrontoDocumentiLayout>
      </DialogContent>
    </Dialog>
  );
}
