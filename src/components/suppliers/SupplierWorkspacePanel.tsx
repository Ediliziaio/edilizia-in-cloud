import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  FileText,
  Paperclip,
  Plus,
  Download,
  ArrowUpRight,
} from "lucide-react";
import {
  useSupplierWorkspace,
  type ContractDraft,
} from "@/hooks/useSupplierWorkspace";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import {
  PARTNER_ROLES,
  partnerFeedback,
  contractDeadline,
  contractNoticeDate,
  type PartnerRole,
  type SupplierContract,
} from "@/lib/suppliers/partnerRelations";
import { fiscalDate } from "@/lib/fatturazione/fiscalInsights";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Workspace = ReturnType<typeof useSupplierWorkspace>;
const KINDS = [
  ["fornitura", "Fornitura"],
  ["consulenza", "Consulenza"],
  ["servizi", "Servizi"],
  ["accordo_quadro", "Accordo quadro"],
  ["altro", "Altro"],
] as const;
const STATUSES = [
  ["bozza", "Bozza"],
  ["attivo", "Attivo"],
  ["concluso", "Concluso"],
  ["risolto", "Risolto"],
] as const;
const fail = (e: unknown) =>
  toast.error(
    partnerFeedback(
      e,
      "Operazione non completata. Riprova dopo aver aggiornato i dati.",
    ),
  );

export function SupplierWorkspacePanel({ supplierId }: { supplierId: string }) {
  const workspace = useSupplierWorkspace(supplierId);
  const [editing, setEditing] = useState<SupplierContract | null | undefined>(
    undefined,
  );
  if (!workspace.canRead)
    return (
      <p role="alert">
        Per consultare contratti e ruoli serve il permesso Fornitori.
      </p>
    );
  if (workspace.query.isLoading)
    return <p role="status">Caricamento fascicolo fornitore…</p>;
  if (workspace.query.isError || !workspace.query.data)
    return (
      <div
        role="alert"
        className="space-y-3 rounded-xl border border-amber-300 p-4"
      >
        <p>
          Fascicolo non disponibile. Contratti e ruoli non vengono mostrati come
          vuoti se il servizio non risponde.
        </p>
        <Button
          variant="outline"
          onClick={() => void workspace.query.refetch()}
        >
          Riprova fascicolo
        </Button>
      </div>
    );
  const { contracts, documents } = workspace.query.data;
  return (
    <div className="space-y-5">
      <PartnerRoleEditor workspace={workspace} />
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <FileText className="h-4 w-4 text-primary" />
              Contratti e incarichi
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Forniture, consulenze, servizi e accordi quadro. I contratti di
              subappalto per commessa restano nella scheda dedicata.
            </p>
          </div>
          {workspace.canEdit && (
            <Button onClick={() => setEditing(null)}>
              <Plus className="mr-1 h-4 w-4" />
              Aggiungi contratto
            </Button>
          )}
        </div>
        {!contracts.length && (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nessun contratto registrato. Non significa che non esistano accordi
            esterni.
          </p>
        )}
        {contracts.map((c) => (
          <article key={c.id} className="space-y-3 rounded-xl border p-4">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h4 className="font-medium">{c.title}</h4>
                <p className="text-xs text-muted-foreground">
                  {KINDS.find(([v]) => v === c.kind)?.[1] ?? c.kind} ·{" "}
                  {c.amount === null
                    ? "Importo non indicato"
                    : `${formatCurrency(c.amount)} · valore contrattuale, IVA da verificare`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {STATUSES.find(([v]) => v === c.status)?.[1] ?? c.status}
                </Badge>
                {workspace.canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(c)}
                  >
                    Modifica contratto
                  </Button>
                )}
              </div>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Stipula</dt>
                <dd>{fiscalDate(c.signed_on, "Non indicata")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Inizio</dt>
                <dd>{fiscalDate(c.starts_on, "Non indicato")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Scadenza e preavviso
                </dt>
                <dd>{contractDeadline(c)}</dd>
              </div>
            </dl>
            {c.automatic_renewal && (
              <p className="text-xs text-amber-800">
                Rinnovo automatico dichiarato: il gestionale non rinnova il
                contratto e non invia disdette.
              </p>
            )}
            {c.conditions && (
              <details>
                <summary className="cursor-pointer text-sm text-primary">
                  Condizioni contrattuali
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-sm">
                  {c.conditions}
                </p>
              </details>
            )}
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-medium">Contratto e allegati</p>
              {documents
                .filter((d) => d.contract_id === c.id)
                .map((d) => (
                  <div
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span className="break-all">
                      {d.file_name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {fiscalDate(d.created_at)} ·{" "}
                        {Math.ceil(d.size_bytes / 1024)} KB
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void workspace.download(d).catch(fail)}
                    >
                      <Download className="mr-1 h-4 w-4" />
                      Scarica
                    </Button>
                  </div>
                ))}
              {workspace.canEdit && (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-primary">
                  <Paperclip className="h-4 w-4" />
                  {workspace.upload.isPending
                    ? "Caricamento…"
                    : "Allega PDF o immagine"}
                  <input
                    aria-label={`Allega documento a ${c.title}`}
                    className="sr-only"
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    disabled={workspace.upload.isPending}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.currentTarget.value = "";
                      if (file)
                        try {
                          await workspace.upload.mutateAsync({
                            contractId: c.id,
                            file,
                          });
                          toast.success("Allegato registrato");
                        } catch (err) {
                          fail(err);
                        }
                    }}
                  />
                </label>
              )}
            </div>
          </article>
        ))}
        <p className="text-xs text-muted-foreground">
          File privati, fino a 20 MB. Gli allegati confermati restano nello
          storico: carica nuove versioni senza sovrascriverli. Nessuna firma,
          disdetta o notifica automatica.
        </p>
      </section>
      {editing !== undefined && (
        <ContractEditor
          key={editing?.id ?? "new"}
          existing={editing ?? undefined}
          workspace={workspace}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}

function PartnerRoleEditor({ workspace: w }: { workspace: Workspace }) {
  const relation = w.query.data?.relation;
  const [draft, setDraft] = useState<{
    roles: PartnerRole[];
    subId: string | null;
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const state = draft ?? {
    roles: relation?.roles ?? [],
    subId: relation?.subappaltatore_id ?? null,
  };
  const [subSearch, setSubSearch] = useState("");
  useSettingsDraftGuard(!!draft);
  const save = async (createSub = false) => {
    try {
      await w.saveRelation.mutateAsync({
        roles: state.roles,
        subId: createSub ? null : state.subId,
        createSub,
      });
      setDraft(null);
      setCreating(false);
      toast.success(
        createSub
          ? "Scheda subappaltatore creata e collegata"
          : "Ruoli e collegamenti salvati",
      );
    } catch (e) {
      fail(e);
    }
  };
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div>
        <h3 className="font-semibold">Tipologie del partner</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Più ruoli per la stessa anagrafica. La categoria merceologica rimane
          distinta e modificabile nei dati del fornitore.
        </p>
      </div>
      <fieldset
        disabled={!w.canEdit || w.saveRelation.isPending}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {PARTNER_ROLES.map(([value, label]) => (
          <Label
            key={value}
            className="flex items-center gap-2 rounded-lg border p-3"
          >
            <Checkbox
              checked={state.roles.includes(value)}
              onCheckedChange={(checked) =>
                setDraft({
                  ...state,
                  roles: checked
                    ? [...state.roles, value]
                    : state.roles.filter((r) => r !== value),
                  subId:
                    value === "subappaltatore" && !checked ? null : state.subId,
                })
              }
            />
            {label}
          </Label>
        ))}
      </fieldset>
      {state.roles.includes("subappaltatore") && (
        <div className="space-y-3 rounded-lg bg-muted/40 p-4">
          <p className="text-sm">
            Collega una scheda Subappaltatori per contratti di cantiere, SAL,
            DURC e documenti. Non vengono trasferiti o duplicati i contratti già
            presenti.
          </p>
          {relation?.subappaltatore_id && w.canSub && (
            <Button variant="outline" asChild>
              <Link
                to={`/azienda/subappaltatori/${relation.subappaltatore_id}`}
              >
                Apri scheda subappaltatore
                <ArrowUpRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          )}
          {!w.canSub ? (
            <p className="text-xs text-muted-foreground">
              Serve il permesso Subappaltatori per consultare o modificare il
              collegamento.
            </p>
          ) : w.subs.isError ? (
            <p role="alert">
              Non riesco a leggere le schede esistenti. Riprova prima di crearne
              una.
            </p>
          ) : (
            <>
              <Input
                aria-label="Cerca scheda subappaltatore"
                placeholder="Cerca per ragione sociale o P.IVA…"
                value={subSearch}
                onChange={(e) => setSubSearch(e.target.value)}
              />
              <Select
                value={state.subId ?? "none"}
                disabled={
                  !w.canEdit || w.saveRelation.isPending || w.subs.isLoading
                }
                onValueChange={(v) =>
                  setDraft({ ...state, subId: v === "none" ? null : v })
                }
              >
                <SelectTrigger aria-label="Scheda subappaltatore collegata">
                  <SelectValue placeholder="Nessuna scheda collegata" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessuna scheda collegata</SelectItem>
                  {(w.subs.data ?? [])
                    .filter(
                      (s) =>
                        s.id === state.subId ||
                        `${s.ragione_sociale} ${s.piva ?? ""}`
                          .toLowerCase()
                          .includes(subSearch.toLowerCase()),
                    )
                    .slice(0, 100)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.ragione_sociale} · {s.piva ?? "P.IVA non indicata"}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {w.canEdit && !state.subId && (
                <Button
                  variant="outline"
                  disabled={w.subs.isLoading || w.saveRelation.isPending}
                  onClick={() => setCreating(true)}
                >
                  Crea una nuova scheda dedicata
                </Button>
              )}
            </>
          )}
        </div>
      )}
      {w.canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={!draft || w.saveRelation.isPending}
            onClick={() => void save()}
          >
            {w.saveRelation.isPending
              ? "Salvataggio…"
              : "Salva ruoli e collegamento"}
          </Button>
          {draft && (
            <Button
              variant="ghost"
              disabled={w.saveRelation.isPending}
              onClick={() => setDraft(null)}
            >
              Annulla modifiche
            </Button>
          )}
        </div>
      )}
      <Dialog
        open={creating}
        onOpenChange={(v) => !w.saveRelation.isPending && setCreating(v)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crea scheda subappaltatore</DialogTitle>
            <DialogDescription>
              Copierà i dati anagrafici del fornitore nella scheda dedicata e la
              collegherà. Non crea account, accessi, contratti o inviti. Se
              esiste una scheda simile la creazione viene bloccata.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={w.saveRelation.isPending}
              onClick={() => setCreating(false)}
            >
              Annulla
            </Button>
            <Button
              disabled={w.saveRelation.isPending}
              onClick={() => void save(true)}
            >
              Conferma creazione e collegamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ContractEditor({
  existing,
  workspace: w,
  onClose,
}: {
  existing?: SupplierContract;
  workspace: Workspace;
  onClose: () => void;
}) {
  const initial: ContractDraft = {
    title: existing?.title ?? "",
    kind: existing?.kind ?? "fornitura",
    status: existing?.status ?? "bozza",
    signed_on: existing?.signed_on ?? null,
    starts_on: existing?.starts_on ?? null,
    ends_on: existing?.ends_on ?? null,
    notice_days: existing?.notice_days ?? null,
    automatic_renewal: existing?.automatic_renewal ?? false,
    conditions: existing?.conditions ?? null,
    amount: existing?.amount ?? null,
  };
  const [draft, setDraft] = useState(initial);
  const confirm = useSettingsDraftGuard(
    JSON.stringify(draft) !== JSON.stringify(initial),
  );
  const close = () => {
    if (!w.saveContract.isPending && confirm()) onClose();
  };
  const set = <K extends keyof ContractDraft>(
    key: K,
    value: ContractDraft[K],
  ) => setDraft((prev) => ({ ...prev, [key]: value }));
  const save = async () => {
    try {
      await w.saveContract.mutateAsync({ draft, existing });
      toast.success("Contratto salvato");
      onClose();
    } catch (e) {
      fail(e);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existing ? "Modifica contratto" : "Nuovo contratto o incarico"}
          </DialogTitle>
          <DialogDescription>
            Registra i termini concordati. Dopo il salvataggio puoi allegare
            contratto e documenti; nessun invio o firma automatica.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="space-y-4"
        >
          <fieldset
            disabled={w.saveContract.isPending}
            className="grid gap-4 sm:grid-cols-2"
          >
            <Label className="space-y-2 sm:col-span-2">
              Titolo *
              <Input
                required
                maxLength={200}
                value={draft.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Es. Incarico consulenza contabile"
              />
            </Label>
            <Label className="space-y-2">
              Tipo
              <Select
                value={draft.kind}
                onValueChange={(v) => set("kind", v as ContractDraft["kind"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>
            <Label className="space-y-2">
              Stato
              <Select
                value={draft.status}
                onValueChange={(v) =>
                  set("status", v as ContractDraft["status"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>
            {(
              [
                ["signed_on", "Data stipula"],
                ["starts_on", "Data inizio"],
                ["ends_on", "Data scadenza"],
              ] as const
            ).map(([key, label]) => (
              <Label className="space-y-2" key={key}>
                {label}
                <Input
                  type="date"
                  value={draft[key] ?? ""}
                  onChange={(e) => set(key, e.target.value || null)}
                />
              </Label>
            ))}
            <Label className="space-y-2">
              Preavviso disdetta (giorni)
              <Input
                type="number"
                min={0}
                max={3650}
                step={1}
                value={draft.notice_days ?? ""}
                onChange={(e) =>
                  set(
                    "notice_days",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              />
            </Label>
            <Label className="space-y-2">
              Importo contrattuale (€)
              <Input
                type="number"
                min={0}
                step="0.01"
                value={draft.amount ?? ""}
                onChange={(e) =>
                  set(
                    "amount",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              />
              <span className="block text-xs font-normal text-muted-foreground">
                Facoltativo. Specifica nelle condizioni se IVA inclusa/esclusa e
                periodicità.
              </span>
            </Label>
            <Label className="flex items-center gap-2">
              <Checkbox
                checked={draft.automatic_renewal}
                onCheckedChange={(v) => set("automatic_renewal", v === true)}
              />
              Rinnovo automatico previsto dal contratto
            </Label>
            <Label className="space-y-2 sm:col-span-2">
              Condizioni, pagamenti e note
              <Textarea
                rows={5}
                maxLength={20000}
                value={draft.conditions ?? ""}
                onChange={(e) => set("conditions", e.target.value || null)}
                placeholder="Oggetto, compenso e periodicità, IVA, pagamenti, obblighi, recesso, penali, coperture…"
              />
            </Label>
            {contractNoticeDate(draft) && (
              <p className="text-sm sm:col-span-2">
                Preavviso entro il {fiscalDate(contractNoticeDate(draft))}. È
                una scadenza informativa, non una disdetta inviata.
              </p>
            )}
          </fieldset>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              disabled={w.saveContract.isPending}
              onClick={close}
            >
              Annulla
            </Button>
            <Button type="submit" disabled={w.saveContract.isPending}>
              {w.saveContract.isPending ? "Salvataggio…" : "Salva contratto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
