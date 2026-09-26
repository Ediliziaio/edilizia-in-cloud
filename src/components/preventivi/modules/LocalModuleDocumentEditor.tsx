import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Save,
  Download,
  ImagePlus,
  Plus,
  Check,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import {
  createModuleDocument,
  documentTextVariants,
  documentImage,
  type ModuleDocument,
  type ModulePage,
} from "@/lib/moduli-vendita/moduleDocuments";
import {
  loadModuleDocument,
  saveModuleDocument,
  validateModuleDocument,
} from "@/lib/moduli-vendita/localModuleDocuments";
import { readLocalTemplateImage } from "@/lib/moduli-vendita/localTemplateImage";
import { toast } from "sonner";

interface Props {
  companyId: string;
  areaId: string;
  moduleId: string;
  company: ModuleDocument["company"];
  onBack: () => void;
}
export function LocalModuleDocumentEditor(props: Props) {
  const [initial] = useState<{
    saved: ReturnType<typeof loadModuleDocument>;
    document: ModuleDocument | null;
    error: string | null;
  }>(() => {
    try {
      const saved = loadModuleDocument(
        props.companyId,
        props.areaId,
        props.moduleId,
      );
      return {
        saved,
        document:
          saved?.document ??
          createModuleDocument(
            props.companyId,
            props.areaId,
            props.moduleId,
            props.company,
          ),
        error: null,
      };
    } catch (err) {
      return {
        saved: null,
        document: null,
        error: err instanceof Error ? err.message : "Errore lettura locale.",
      };
    }
  });
  if (!initial.document)
    return (
      <div role="alert" className="rounded-xl border p-5">
        <p>{initial.error}</p>
        <Button onClick={props.onBack} variant="outline" className="mt-3">
          Torna ai moduli
        </Button>
      </div>
    );
  return (
    <Editor
      {...props}
      initial={initial.document}
      savedAt={initial.saved?.savedAt ?? null}
    />
  );
}
function Editor({
  initial,
  savedAt,
  onBack,
}: Props & { initial: ModuleDocument; savedAt: string | null }) {
  const [form, setForm] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [hasSaved, setHasSaved] = useState(Boolean(savedAt));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [params, setParams] = useSearchParams();
  const revision = useRef(savedAt);
  const selected = params.get("section") ?? "copertina";
  const active = form.pages.find((p) => p.id === selected);
  const section = active ? selected : "copertina";
  const depsKey = JSON.stringify(form);
  useBeforeUnload(dirty);
  // All links outside this editor are guarded; page navigation keeps the draft.
  useEffect(() => {
    const guard = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent &&
        !["Enter", " ", "ArrowLeft", "ArrowRight"].includes(event.key)
      )
        return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[role="dialog"], [role="alertdialog"], [data-radix-popper-content-wrapper]')) return;
      if (
        !dirty ||
        !target?.closest("a,button,[role=tab]") ||
        target.closest("[data-local-document-editor]")
      )
        return;
      if (
        !window.confirm("Vuoi uscire senza salvare le modifiche al modello?")
      ) {
        event.preventDefault();
        event.stopPropagation();
      } else setDirty(false);
    };
    document.addEventListener("click", guard, true);
    document.addEventListener("pointerdown", guard, true);
    document.addEventListener("keydown", guard, true);
    return () => {
      document.removeEventListener("click", guard, true);
      document.removeEventListener("pointerdown", guard, true);
      document.removeEventListener("keydown", guard, true);
    };
  }, [dirty]);
  const patch = (value: Partial<ModuleDocument>) => {
    setForm((f) => ({ ...f, ...value }));
    setDirty(true);
    setError("");
  };
  const patchPage = (value: Partial<ModulePage>) =>
    active &&
    patch({
      pages: form.pages.map((p) =>
        p.id === active.id ? { ...p, ...value } : p,
      ),
    });
  const select = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("section", id);
    setParams(next, { replace: true });
  };
  const save = () => {
    try {
      revision.current = saveModuleDocument(form, revision.current).savedAt;
      setHasSaved(true);
      setDirty(false);
      setError("");
      toast.success("Modello salvato");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Salvataggio non riuscito.",
      );
    }
  };
  const exportCopy = () => {
    try {
      validateModuleDocument(form, form.companyId, form.areaId, form.moduleId);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(form, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `modello-${form.areaId}-${form.moduleId}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Esportazione non riuscita.",
      );
    }
  };
  const renderBlobUrl = useCallback(async () => {
    const { renderModuleDocument } = await import("./ModuleDocumentPDF");
    return renderModuleDocument(form);
  }, [form]);
  const field = (
    label: string,
    value: string,
    change: (v: string) => void,
    large = false,
    maxLength = 120,
  ) => (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {large ? (
        <Textarea
          rows={4}
          maxLength={maxLength}
          value={value}
          onChange={(e) => change(e.target.value)}
        />
      ) : (
        <Input
          maxLength={maxLength}
          value={value}
          onChange={(e) => change(e.target.value)}
        />
      )}
    </label>
  );
  const move = (id: string, delta: number) => {
    const pages = [...form.pages];
    const i = pages.findIndex((p) => p.id === id);
    const j = i + delta;
    if (j < 0 || j >= pages.length) return;
    [pages[i], pages[j]] = [pages[j], pages[i]];
    patch({ pages });
  };
  return (
    <div data-local-document-editor className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (
                !dirty ||
                window.confirm("Uscire senza salvare le modifiche?")
              )
                onBack();
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Moduli dell'area
          </Button>
          <h2 className="mt-2 text-2xl font-semibold">{form.title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportCopy}>
            <Download className="mr-2 h-4 w-4" />
            Esporta copia
          </Button>
          <Button onClick={save} disabled={(!dirty && hasSaved) || uploading}>
            <Save className="mr-2 h-4 w-4" />
            Salva modello
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap justify-between gap-2 rounded-lg bg-sky-50 px-4 py-3 text-xs text-sky-950">
        <span>
          Modello dell'azienda · non ancora collegato al preventivatore
        </span>
        <span role="status">
          {dirty
            ? "Modifiche da salvare"
            : hasSaved
              ? "Salvato"
              : "Modello pronto · non ancora salvato"}
        </span>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <div className="grid items-start gap-5 2xl:grid-cols-[190px_minmax(320px,1fr)_minmax(360px,0.95fr)] xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
        <nav
          aria-label="Pagine del modello"
          className="flex flex-wrap gap-2 rounded-xl border bg-white p-3 xl:col-span-2 2xl:col-span-1 2xl:block 2xl:sticky 2xl:top-4"
        >
          <label className="flex w-full items-center gap-3 text-sm 2xl:hidden">
            <span className="shrink-0 font-medium">Pagina da modificare</span>
            <select
              aria-label="Pagina da modificare"
              className="h-10 min-w-0 flex-1 rounded-md border bg-white px-3"
              value={section}
              onChange={(e) => select(e.target.value)}
            >
              <option value="copertina">Copertina e azienda</option>
              {form.pages.map((p, i) => (
                <option key={p.id} value={p.id}>
                  {i + 1}. {p.title}
                  {p.visible ? "" : " · nascosta"}
                </option>
              ))}
            </select>
          </label>
          <div className="hidden 2xl:block">
            <Button
              variant={section === "copertina" ? "default" : "ghost"}
              className="justify-start 2xl:w-full"
              onClick={() => select("copertina")}
            >
              Copertina e azienda
            </Button>
            {form.pages.map((p, i) => (
              <Button
                key={p.id}
                variant={section === p.id ? "default" : "ghost"}
                className="gap-2 text-left 2xl:mt-1 2xl:h-auto 2xl:w-full 2xl:whitespace-normal"
                onClick={() => select(p.id)}
              >
                {p.visible ? (
                  <Eye className="h-3 w-3 shrink-0" />
                ) : (
                  <EyeOff className="h-3 w-3 shrink-0" />
                )}
                <span>
                  {i + 1}. {p.title}
                </span>
              </Button>
            ))}
          </div>
        </nav>
        <div className="min-w-0 space-y-5 rounded-xl border bg-white p-5">
          {!active ? (
            <>
              {field("Titolo del modulo", form.title, (title) =>
                patch({ title }),
              )}
              {field(
                "Descrizione in copertina",
                form.subtitle,
                (subtitle) => patch({ subtitle }),
                true,
                400,
              )}
              <label className="block text-sm font-medium">
                Colore del documento
                <Input
                  type="color"
                  value={form.color}
                  onChange={(e) => patch({ color: e.target.value })}
                />
              </label>
              {form.image && (
                <img
                  src={form.image}
                  alt={`Immagine illustrativa per ${form.title}`}
                  className="h-44 w-full rounded-lg object-cover"
                />
              )}
              <label className="block space-y-2 text-sm">
                <span className="flex items-center gap-2">
                  <ImagePlus className="h-4 w-4" />
                  Sostituisci con una tua foto · massimo 1 MB
                </span>
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={uploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    setUploading(true);
                    try {
                      const image = await readLocalTemplateImage(file);
                      patch({
                        image,
                        imageCaption:
                          "Immagine caricata dall'azienda: verificarne pertinenza e diritti d'uso.",
                      });
                    } catch (err) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Immagine non valida",
                      );
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => patch({ image: null })}
                >
                  Senza foto
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    patch({
                      image: documentImage(form.areaId, form.moduleId),
                      imageCaption:
                        "Immagine illustrativa dell'area, generata con AI. Non rappresenta prodotti o lavori inclusi.",
                    })
                  }
                >
                  Immagine suggerita
                </Button>
              </div>
              {field(
                "Didascalia dell'immagine",
                form.imageCaption,
                (imageCaption) => patch({ imageCaption }),
                true,
                350,
              )}
              <details>
                <summary className="cursor-pointer text-sm font-medium">
                  Identità e contatti aziendali
                </summary>
                <div className="mt-4 space-y-4">
                  {(
                    [
                      ["name", "Ragione sociale"],
                      ["address", "Indirizzo"],
                      ["email", "Email"],
                      ["phone", "Telefono"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key}>
                      {field(
                        label,
                        form.company[key],
                        (value) =>
                          patch({ company: { ...form.company, [key]: value } }),
                        false,
                        250,
                      )}
                    </div>
                  ))}
                </div>
              </details>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={active.visible}
                    onChange={(e) => patchPage({ visible: e.target.checked })}
                  />
                  Includi questa pagina nel PDF
                </label>
                <div className="flex gap-1">
                  <Button
                    aria-label="Sposta pagina prima"
                    variant="outline"
                    size="sm"
                    disabled={form.pages[0].id === active.id}
                    onClick={() => move(active.id, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    aria-label="Sposta pagina dopo"
                    variant="outline"
                    size="sm"
                    disabled={form.pages.at(-1)?.id === active.id}
                    onClick={() => move(active.id, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {!active.visible && (
                <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-950">
                  Questa pagina è nascosta nel PDF. Puoi modificarla e attivarla
                  quando è pronta.
                </p>
              )}
              {field("Titolo della pagina", active.title, (title) =>
                patchPage({ title }),
              )}
              {field(
                "Introduzione",
                active.intro,
                (intro) => patchPage({ intro }),
                true,
                800,
              )}
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Tre testi di partenza per questa pagina
                </summary>
                <div className="mt-3 space-y-2">
                  {documentTextVariants(form, active).map((v) => (
                    <button
                      type="button"
                      key={v.name}
                      className="w-full rounded-lg border p-3 text-left hover:bg-muted"
                      onClick={() => patchPage({ intro: v.text })}
                    >
                      <span className="text-xs font-semibold text-orange-700">
                        {v.name} · Applica
                      </span>
                      <p className="mt-1 text-sm">{v.text}</p>
                    </button>
                  ))}
                </div>
              </details>
              {active.items.map((item, i) => (
                <div
                  key={i}
                  className="space-y-3 rounded-xl border bg-slate-50/60 p-4"
                >
                  {field(
                    `Blocco ${i + 1}: titolo`,
                    item.title,
                    (title) =>
                      patchPage({
                        items: active.items.map((v, j) =>
                          j === i ? { ...v, title } : v,
                        ),
                      }),
                    false,
                    140,
                  )}
                  {field(
                    `Blocco ${i + 1}: testo`,
                    item.text,
                    (text) =>
                      patchPage({
                        items: active.items.map((v, j) =>
                          j === i ? { ...v, text } : v,
                        ),
                      }),
                    true,
                    1800,
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      patchPage({
                        items: active.items.filter((_, j) => j !== i),
                      })
                    }
                  >
                    Rimuovi blocco {i + 1}
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                disabled={active.items.length >= 8}
                onClick={() =>
                  patchPage({
                    items: [
                      ...active.items,
                      { title: "Nuovo dettaglio", text: "" },
                    ],
                  })
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Aggiungi blocco
              </Button>
              {active.id === "condizioni" && (
                <p className="text-xs text-muted-foreground">
                  Usa solo condizioni aziendali verificate per questa fornitura.
                  Non vengono inventate clausole, certificazioni o garanzie.
                </p>
              )}
            </>
          )}
        </div>
        <aside className="min-w-0 space-y-2 xl:sticky xl:top-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Check className="h-4 w-4" />
            Anteprima reale del modello ·{" "}
            {1 + form.pages.filter((p) => p.visible).length} sezioni attive
          </div>
          <PdfBlobLivePreviewPanel
            renderBlobUrl={renderBlobUrl}
            depsKey={depsKey}
          />
        </aside>
      </div>
    </div>
  );
}
