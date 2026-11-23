import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import {
  usePartnerReconciliation,
  useReconcilePartner,
  type FiscalPartner,
  type ReconciliationKind,
} from "@/hooks/billing/usePartnerReconciliation";
import {
  partnerConflict,
  partnerFeedback,
  partnerMatches,
  type PartnerIdentity,
} from "@/lib/suppliers/partnerRelations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link2, Unlink, ArrowUpRight } from "lucide-react";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function PartnerReconciliationPanel({
  companyId,
}: {
  companyId: string | null;
}) {
  const tTesto = useT();
  const permissions = usePermissions();
  const [kind, setKind] = useState<ReconciliationKind>("cliente");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("tutti");
  const [page, setPage] = useState(0);
  const [choice, setChoice] = useState<{
    source: FiscalPartner;
    target: PartnerIdentity | null;
  } | null>(null);
  const [complete, setComplete] = useState(false);
  const [identityReviewed, setIdentityReviewed] = useState(false);
  const canReadTarget =
    kind === "cliente"
      ? permissions.isAdmin ||
        permissions.canViewCustomers ||
        permissions.canViewOrders
      : permissions.isAdmin ||
        permissions.canViewSettingsSuppliers ||
        permissions.canEditSettingsSuppliers;
  const canEdit =
    !permissions.solaLettura &&
    !!(permissions.isAdmin || permissions.canViewBilling) &&
    !!canReadTarget;
  const query = usePartnerReconciliation(companyId, kind, !!canReadTarget);
  const mutation = useReconcilePartner(companyId, canEdit);
  const [manual, setManual] = useState<FiscalPartner | null>(null);
  const [targetSearch, setTargetSearch] = useState("");
  const targetMap = useMemo(
    () => new Map((query.data?.targets ?? []).map((t) => [t.id, t])),
    [query.data],
  );
  const linkId = (r: FiscalPartner) =>
    kind === "cliente" ? r.cliente_id : r.fornitore_id;
  const all = query.data?.fiscal ?? [];
  const rows = all.filter(
    (r) =>
      (status === "tutti" ||
        (status === "collegate" ? !!linkId(r) : !linkId(r))) &&
      `${r.name} ${r.vat ?? ""} ${r.fiscal ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase().trim()),
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / 30) - 1),
  );
  const select = (source: FiscalPartner, target: PartnerIdentity | null) => {
    setChoice({ source, target });
    setComplete(false);
    setIdentityReviewed(false);
    setManual(null);
  };
  const confirm = async () => {
    if (!choice) return;
    try {
      await mutation.mutateAsync({
        fiscalId: choice.source.id,
        kind,
        targetId: choice.target?.id ?? null,
        completeMissing: complete,
        ...(choice.source.receiptIds
          ? { receiptIds: choice.source.receiptIds }
          : {}),
      });
      toast.success(
        choice.target ? tTesto("Collegamento salvato") : tTesto("Collegamento rimosso"),
      );
      setChoice(null);
    } catch (e) {
      toast.error(
        partnerFeedback(e, tTesto("Collegamento non salvato. Aggiorna e riprova.")),
      );
    }
  };
  const needsIdentityReview =
    !!choice?.target &&
    !partnerMatches(choice.source, [choice.target]).some((m) => m.exact);
  return (
    <div className="space-y-4 pt-4">
      <Tabs
        value={kind}
        onValueChange={(v) => {
          setKind(v as ReconciliationKind);
          setPage(0);
          setChoice(null);
          setManual(null);
        }}
      >
        <TabsList>
          <TabsTrigger value="cliente">{tTesto("Clienti dei cantieri")}</TabsTrigger>
          <TabsTrigger value="fornitore">{tTesto("Fornitori operativi")}</TabsTrigger>
        </TabsList>
      </Tabs>
      <p className="text-sm text-muted-foreground">
        {tTesto("Collega i registri dello stesso soggetto. Non vengono fusi record, modificate fatture o creati account. I suggerimenti richiedono conferma; identificativi discordanti non sono abbinabili.")}
      </p>
      {!canReadTarget ? (
        <p role="alert">
          {kind === "cliente"
            ? tTesto("Per questa riconciliazione serve anche il permesso di lettura Clienti o Commesse.")
            : tTesto("Per questa riconciliazione serve anche il permesso di lettura Fornitori.")}
        </p>
      ) : query.isLoading ? (
        <p role="status">{tTesto("Caricamento anagrafiche e collegamenti…")}</p>
      ) : query.isError ? (
        <div role="alert" className="rounded-xl border border-destructive p-4">
          <p>
            {tTesto("Collegamenti non disponibili. Nessun elenco parziale viene presentato come completo.")}
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            {tTesto("Riprova")}
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="max-w-sm"
              aria-label={tTesto("Cerca anagrafica da riconciliare")}
              placeholder={tTesto("Nome, partita IVA, codice fiscale…")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
            {[
              ["tutti", "Tutte"],
              ["collegate", "Collegate"],
              ["non_collegate", "Da collegare"],
            ].map(([value, label]) => (
              <Button
                key={value}
                variant={status === value ? "default" : "outline"}
                onClick={() => {
                  setStatus(value);
                  setPage(0);
                }}
              >
                {label}
              </Button>
            ))}
            <span className="text-xs text-muted-foreground">{tTesto("{n} posizioni fiscali · {n2} collegate", { n: rows.length, n2: all.filter((r) => !!linkId(r)).length })}</span>
          </div>
          {kind === "fornitore" && all.some((r) => r.receiptIds) && (
            <p className="text-xs text-muted-foreground">
              {tTesto("Sono comprese anche le fatture ricevute. Le posizioni senza P.IVA/CF restano separate per documento: il conteggio non è il numero dei fornitori e un nome uguale non prova l’identità.")}
            </p>
          )}
          {!canEdit && (
            <p className="text-sm text-muted-foreground">
              {tTesto("Consultazione: non puoi modificare i collegamenti.")}
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left">{tTesto("Anagrafica fiscale")}</th>
                  <th className="px-3 py-2 text-left">
                    {kind === "cliente" ? tTesto("Cliente cantiere") : tTesto("Fornitore")}
                  </th>
                  <th className="w-px px-3 py-2 text-left">{tTesto("Azioni")}</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice(currentPage * 30, currentPage * 30 + 30)
                  .map((source) => {
                    const id = linkId(source),
                      target = id ? targetMap.get(id) : null;
                    const suggestions = !id
                      ? partnerMatches(source, query.data?.targets ?? []).slice(
                          0,
                          3,
                        )
                      : [];
                    return (
                      <tr key={source.id} className="border-t align-middle">
                        <td className="px-3 py-2 leading-5">
                          <Link
                            className="font-medium hover:underline"
                            to={
                              source.receiptIds
                                ? "/azienda/documenti/fatture-ricevute"
                                : `/azienda/documenti/anagrafiche/${source.id}`
                            }
                          >
                            {source.name || tTesto("Nome da completare")}
                          </Link>
                          <div className="flex flex-wrap items-center gap-x-3 text-xs leading-4">
                            {source.receiptIds && (
                              <span className="text-primary">
                                {tTesto(source.receiptIds.length === 1 ? "Fatture ricevute · {n} documento" : "Fatture ricevute · {n} documenti", { n: source.receiptIds.length })}
                              </span>
                            )}
                            <span className="text-muted-foreground">
                              {source.vat ||
                                source.fiscal ||
                                tTesto("Identificativi non indicati")}
                            </span>
                          </div>
                          {source.active === false && (
                            <Badge variant="secondary">{tTesto("Inattiva")}</Badge>
                          )}
                        </td>
                        <td className="space-y-1 px-3 py-2">
                          {id ? (
                            target ? (
                              <>
                                <Link
                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                  to={
                                    kind === "cliente"
                                      ? `/azienda/clienti/${id}`
                                      : `/azienda/impostazioni/fornitori?tab=operativo&fornitore=${id}`
                                  }
                                >
                                  {target.name}
                                  <ArrowUpRight className="h-3 w-3" />
                                </Link>
                                {target.active === false && (
                                  <p className="text-xs text-amber-700">
                                    {tTesto("Fornitore inattivo: collegamento mantenuto")}
                                  </p>
                                )}
                              </>
                            ) : (
                              <p className="text-amber-700">
                                {tTesto("Collegata, ma scheda non accessibile: verifica i permessi.")}
                              </p>
                            )
                          ) : suggestions.length ? (
                            <>
                              {suggestions.length > 1 && (
                                <p className="text-xs text-amber-700">
                                  {tTesto("Più candidati: scegli dopo verifica.")}
                                </p>
                              )}
                              {suggestions.map((m) => (
                                <div
                                  key={m.target.id}
                                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
                                >
                                  <div className="min-w-0 flex-1 basis-40">
                                    <p className="break-words leading-5">
                                      {m.target.name}
                                    </p>
                                    <p className="text-xs leading-4 text-muted-foreground">
                                      {m.reason}
                                    </p>
                                  </div>
                                  {canEdit && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-9 shrink-0 px-2.5 sm:h-8"
                                      onClick={() => select(source, m.target)}
                                    >
                                      {tTesto("Verifica collegamento")}
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </>
                          ) : (
                            <span className="text-muted-foreground">
                              {tTesto("Nessuna corrispondenza certa")}
                            </span>
                          )}
                        </td>
                        <td className="w-px whitespace-nowrap px-3 py-2">
                          {canEdit &&
                            (id ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-9 px-2.5 sm:h-8"
                                onClick={() => select(source, null)}
                              >
                                <Unlink className="mr-1 h-4 w-4" />
                                {tTesto("Scollega")}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-9 px-2.5 sm:h-8"
                                onClick={() => {
                                  setManual(source);
                                  setTargetSearch("");
                                }}
                              >
                                <Link2 className="mr-1 h-4 w-4" />
                                {kind === "cliente" ? tTesto("Cerca cliente") : tTesto("Cerca fornitore")}
                              </Button>
                            ))}
                        </td>
                      </tr>
                    );
                  })}
                {!rows.length && (
                  <tr>
                    <td
                      colSpan={3}
                      className="p-6 text-center text-muted-foreground"
                    >
                      {tTesto("Nessuna anagrafica per questi filtri.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {rows.length > 30 && (
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="outline"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                {tTesto("Precedenti")}
              </Button>
              <span>
                {currentPage + 1} / {Math.ceil(rows.length / 30)}
              </span>
              <Button
                variant="outline"
                disabled={(currentPage + 1) * 30 >= rows.length}
                onClick={() => setPage(currentPage + 1)}
              >
                {tTesto("Successivi")}
              </Button>
            </div>
          )}
        </>
      )}
      <Dialog open={!!manual} onOpenChange={(open) => !open && setManual(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {kind === "cliente"
                ? tTesto("Scegli il cliente del cantiere")
                : tTesto("Scegli il fornitore operativo")}
            </DialogTitle>
            <DialogDescription>
              {tTesto("Nessuna creazione automatica. Confronta gli identificativi prima di confermare.")}
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label={tTesto("Cerca scheda operativa")}
            value={targetSearch}
            onChange={(e) => setTargetSearch(e.target.value)}
            placeholder={tTesto("Nome o identificativo fiscale…")}
          />
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {(query.data?.targets ?? [])
              .filter(
                (t) =>
                  t.active !== false &&
                  `${t.name} ${t.vat ?? ""} ${t.fiscal ?? ""}`
                    .toLowerCase()
                    .includes(targetSearch.toLowerCase()),
              )
              .slice(0, 50)
              .map((t) => (
                <Button
                  className="h-auto w-full justify-between whitespace-normal text-left"
                  variant="outline"
                  key={t.id}
                  disabled={!!manual && partnerConflict(manual, t)}
                  onClick={() => manual && select(manual, t)}
                >
                  <span>
                    {t.name}
                    <span className="block text-xs">
                      {t.vat || t.fiscal || tTesto("Identificativi non indicati")}
                    </span>
                  </span>
                  {manual && partnerConflict(manual, t) && (
                    <span className="text-xs text-destructive">
                      {tTesto("Dati discordanti")}
                    </span>
                  )}
                </Button>
              ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {tTesto("Fino a 50 risultati: restringi la ricerca se necessario.")}
          </p>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!choice}
        onOpenChange={(open) => !open && !mutation.isPending && setChoice(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {choice?.target
                ? tTesto("Conferma collegamento")
                : tTesto("Scollega le anagrafiche")}
            </DialogTitle>
            <DialogDescription>
              {tTesto("Le schede e i documenti fiscali rimangono separati e non vengono eliminati.")}
            </DialogDescription>
          </DialogHeader>
          <p>
            {choice?.source.name}{" "}
            {choice?.target
              ? `→ ${choice.target.name}`
              : tTesto("→ rimuovi solo il collegamento")}
          </p>
          {choice?.source.receiptIds && (
            <p className="rounded-lg border p-3 text-sm">{tTesto("Il collegamento riguarda {n} fatture ricevute di questo gruppo. Non modifica XML, importi, stato fiscale o costi già contabilizzati.", { n: choice.source.receiptIds.length })}</p>
          )}
          {choice?.target && (
            <div className="space-y-3">
              <p className="text-sm">
                {tTesto("P.IVA:")} {choice.source.vat || tTesto("non indicata")} /{" "}
                {choice.target.vat || tTesto("non indicata")}
                <br />
                {tTesto("CF:")} {choice.source.fiscal || tTesto("non indicato")} /{" "}
                {choice.target.fiscal || tTesto("non indicato")}
              </p>
              {!choice.source.receiptIds && (
                <>
                  <Label className="flex items-center gap-2">
                    <Checkbox
                      checked={complete}
                      onCheckedChange={(v) => setComplete(v === true)}
                    />
                    {tTesto("Completa solo email e telefono mancanti")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {tTesto("Non sovrascrive dati già presenti, intestazione o identificativi. Non attiva sincronizzazioni future.")}
                  </p>
                </>
              )}
              {needsIdentityReview && (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                  <p>
                    {tTesto("Gli identificativi non bastano a confermare l’identità: verifica la scheda e i documenti originali.")}
                  </p>
                  <Label className="flex items-center gap-2">
                    <Checkbox
                      checked={identityReviewed}
                      onCheckedChange={(v) => setIdentityReviewed(v === true)}
                    />
                    {tTesto("Ho verificato che è lo stesso soggetto")}
                  </Label>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setChoice(null)}
            >
              {tTesto("Annulla")}
            </Button>
            <Button
              disabled={
                mutation.isPending || (needsIdentityReview && !identityReviewed)
              }
              onClick={() => void confirm()}
            >
              {mutation.isPending ? tTesto("Salvataggio…") : tTesto("Conferma")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
