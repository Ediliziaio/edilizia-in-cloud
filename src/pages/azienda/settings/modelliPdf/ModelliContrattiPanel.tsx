import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Save, PenLine, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuoteTemplates } from "@/hooks/useQuoteTemplates";
import { erroreInItaliano } from "../SettingsQuoteTemplates/helpers";
import { htmlPerEditorContratto } from "@/lib/preventivi/contrattoEditor";
import {
  blankTemplateForKind,
  type QuoteTemplate,
} from "@/types/quoteTemplate";
import { QuotePdfLivePreview } from "@/components/quotes/QuotePdfLivePreview";
import { DiscardDocumentDraft } from "@/components/shared/DiscardDocumentDraft";
import { DocumentEditorWorkspace } from "@/components/shared/DocumentEditorWorkspace";
import { RichTextEditorSafe } from "@/components/ui/rich-text-editor-safe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
export default function ModelliContrattiPanel({
  onDirty,
  onSaving,
}: {
  onDirty: (v: boolean) => void;
  onSaving: (v: boolean) => void;
}) {
  const t = useT();
  const permissions = usePermissions();
  return permissions.isAdmin || permissions.canViewSettingsPricing ? (
    <LibreriaContratti onDirty={onDirty} onSaving={onSaving} />
  ) : (
    <Card>
      <CardContent className="p-6 text-sm">
        {t("Per consultare i contratti serve il permesso di accesso ai modelli di preventivo.")}
      </CardContent>
    </Card>
  );
}
function LibreriaContratti({
  onDirty,
  onSaving,
}: {
  onDirty: (v: boolean) => void;
  onSaving: (v: boolean) => void;
}) {
  const tr = useT();
  const { effectiveCompany } = useAuth();
  const permissions = usePermissions();
  const query = useQuoteTemplates({ refetchOnWindowFocus: false });
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [ricariche, setRicariche] = useState(0);
  const [ricaricando, setRicaricando] = useState(false);
  const occupato = query.upsertTemplate.isPending || ricaricando;
  const conferma = () =>
    !dirty ||
    window.confirm(tr("Ci sono modifiche non salvate. Uscire senza salvarle?"));
  const condizioni = query.templates.filter(
    (t) => t.kind === "condizioni" || t.kind === "legali",
  );
  const actual = selected ?? condizioni[0]?.id ?? "nuovo";
  const source = condizioni.find((t) => t.id === actual);
  const canEdit = permissions.isAdmin || permissions.canEditSettingsPricing;
  const select = (id: string) => {
    if (id !== actual && conferma()) {
      setDirty(false);
      onDirty(false);
      setSelected(id);
    }
  };
  if (query.isLoading) return <p>{tr("Caricamento contratti…")}</p>;
  if (query.fetchError && !query.templates.length && !dirty)
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <p role="alert">{tr("Impossibile caricare i contratti.")}</p>
          <Button onClick={() => query.refetch()}>
            {tr("Riprova caricamento contratti")}
          </Button>
        </CardContent>
      </Card>
    );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <PenLine className="h-5 w-5 text-orange-500" />
            {tr("Contratti e condizioni")}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {tr("Gli stessi blocchi collegati ai modelli dei preventivi, disponibili anche qui.")}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={!canEdit || occupato}
          onClick={() => select("nuovo")}
        >
          <Plus className="mr-2 h-4 w-4" />
          {tr("Nuovo blocco contrattuale")}
        </Button>
        <Button
          variant="ghost"
          disabled={occupato}
          onClick={async () => {
            if (!conferma()) return;
            setRicaricando(true);
            onSaving(true);
            try {
              const esito = await query.refetch();
              if (esito.isError) {
                toast.error(tr("Ricarica dei contratti non riuscita"));
                return;
              }
              setDirty(false);
              onDirty(false);
              setRicariche((v) => v + 1);
            } finally {
              setRicaricando(false);
              onSaving(false);
            }
          }}
        >
          {ricaricando ? tr("Ricarico…") : tr("Ricarica contratti")}
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/azienda/impostazioni/template-preventivi">
            {tr("Libreria preventivi")}
            <ArrowUpRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={tr("Blocchi contrattuali")}
      >
        {condizioni.map((t) => (
          <Button
            key={t.id}
            variant={actual === t.id ? "secondary" : "outline"}
            disabled={occupato}
            aria-pressed={actual === t.id}
            onClick={() => select(t.id)}
          >
            {t.name}
          </Button>
        ))}
      </div>
      <Editor
        key={`${actual}:${source?.updated_at ?? "nuovo"}:${ricariche}`}
        source={source}
        companyId={effectiveCompany?.id}
        companyName={effectiveCompany?.business_name || effectiveCompany?.name}
        canEdit={canEdit}
        busy={occupato}
        saving={query.upsertTemplate.isPending}
        onDirty={(v) => {
          setDirty(v);
          onDirty(v);
        }}
        save={async (form) => {
          onSaving(true);
          try {
            const r = await query.upsertTemplate.mutateAsync({
              ...form,
              expectedUpdatedAt: form.updated_at,
            });
            setDirty(false);
            onDirty(false);
            setSelected(r.id);
          } finally {
            onSaving(false);
          }
        }}
      />
    </div>
  );
}
function Editor({
  source,
  companyId,
  companyName,
  canEdit,
  busy,
  saving,
  onDirty,
  save,
}: {
  source?: QuoteTemplate;
  companyId?: string;
  companyName?: string;
  canEdit: boolean;
  busy: boolean;
  saving: boolean;
  onDirty: (v: boolean) => void;
  save: (form: Partial<QuoteTemplate>) => Promise<void>;
}) {
  const t = useT();
  const savingGuard = useRef(false);
  const [base, setBase] = useState<Partial<QuoteTemplate>>(() =>
    source
      ? { ...source, body_html: htmlPerEditorContratto(source.body_html ?? "") }
      : {
          ...blankTemplateForKind("condizioni"),
          name: "Nuovo blocco contrattuale",
          body_html: "",
        },
  );
  const [form, setForm] = useState(base);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const patch = (value: Partial<QuoteTemplate>) => {
    setForm((f) => ({ ...f, ...value }));
    setDirty(true);
    onDirty(true);
    setError("");
  };
  const salva = async () => {
    if (!canEdit || busy || savingGuard.current) return;
    if (!form.name?.trim() || !form.body_html?.replace(/<[^>]*>/g, "").trim()) {
      setError(t("Indica il nome e il testo del blocco contrattuale."));
      return;
    }
    savingGuard.current = true;
    try {
      const valori = { ...form, body_format: "html" } as const;
      await save(valori);
      setBase(valori);
      setDirty(false);
      toast.success(t("Blocco contrattuale salvato"));
    } catch (e) {
      setError(
        erroreInItaliano(
          e,
          t("Salvataggio non riuscito. Il testo resta nell’editor: riprova."),
        ),
      );
    } finally {
      savingGuard.current = false;
    }
  };
  return (
    <DocumentEditorWorkspace
      editor={<Card className="min-w-0 xl:max-h-[70vh] xl:overflow-y-auto">
        <CardContent className="space-y-4 p-5">
          <div className="space-y-2">
            <Label htmlFor="contratto-nome">{t("Nome del blocco contrattuale")}</Label>
            <Input
              id="contratto-nome"
              maxLength={120}
              disabled={!canEdit || busy}
              value={form.name ?? ""}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </div>
          <Label>{t("Testo del contratto e condizioni")}</Label>
          <RichTextEditorSafe
            value={form.body_html ?? ""}
            onChange={(value) => patch({ body_html: value })}
            readOnly={!canEdit || busy}
          />
          <p className="text-xs text-slate-500">
            {t("Le modifiche saranno usate nei preventivi che collegano questo blocco. Puoi scegliere i collegamenti dalla libreria dei preventivi.")}
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          {canEdit && <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy || !dirty} onClick={salva}>
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              {saving ? t("Salvataggio…") : t("Salva contratto")}
            </Button>
            <DiscardDocumentDraft disabled={busy || !dirty} onDiscard={() => {
              setForm(base);
              setDirty(false);
              setError("");
              onDirty(false);
            }} />
            {dirty && <span className="text-xs text-amber-700">{t("Modifiche non salvate")}</span>}
          </div>}
        </CardContent>
      </Card>}
      anteprima={<div>
        <p className="mb-3 text-sm text-slate-500">
          {t("Anteprima delle condizioni nel preventivo, con dati di esempio.")}
        </p>
        {form.body_html
          ?.replace(/<[^>]*>/g, "")
          .replace(/&nbsp;/g, " ")
          .trim() ? (
          <QuotePdfLivePreview
            template={form}
            kind={source?.kind ?? "condizioni"}
            companyId={companyId}
            companyName={companyName}
            downloadFileName="anteprima-contratto.pdf"
            allowOpenInNewTab={false}
          />
        ) : (
          <Card>
            <CardContent className="p-8 text-sm text-slate-500">
              {t("Scrivi il testo per vedere l’anteprima PDF del blocco.")}
            </CardContent>
          </Card>
        )}
      </div>}
    />
  );
}
