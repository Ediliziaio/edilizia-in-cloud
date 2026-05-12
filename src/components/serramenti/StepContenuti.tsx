/**
 * StepContenuti — Step 3 wizard: scegli i contenuti del PDF cliente.
 *
 * L'azienda mantiene una "libreria" di esigenze/soluzioni/USP/incluso/passi
 * nelle Impostazioni Template (più voci possibili). Qui il commerciale
 * sceglie per il preventivo specifico quali voci usare, ne aggiunge di
 * custom, può modificare i testi inline.
 *
 * Layout:
 *  - 5 sezioni in accordion: Esigenze · Soluzione · Perché noi · Incluso · Prossimi passi
 *  - Per ognuna: checkbox per ogni voce libreria, editor inline, "Aggiungi
 *    voce custom", "Seleziona tutto / nessuna"
 *  - Le voci spuntate diventano l'array salvato nel progetto
 */
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  MessageCircle, Sparkles, ListChecks, Plus, Trash2, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useTemplatePdf } from "@/lib/serramenti/queries";
import { SrCallout } from "@/lib/serramenti/wizardUI";
import type {
  SrProgettoRow, SrEsigenza, SrSoluzioneItem, SrTemplatePdfRow,
} from "@/types/serramenti";

interface Props {
  form: Partial<SrProgettoRow>;
  onChange: <K extends keyof SrProgettoRow>(key: K, value: SrProgettoRow[K]) => void;
}

// ─── Object items (esigenze, soluzione) ──────────────────────────────────────


function ObjectItemsPicker({
  label,
  emoji,
  templateItems,
  selectedItems,
  onChange,
  placeholderTitolo,
  placeholderDesc,
}: {
  label: string;
  emoji: string;
  templateItems: Array<SrEsigenza | SrSoluzioneItem>;
  selectedItems: Array<SrEsigenza | SrSoluzioneItem>;
  onChange: (next: Array<SrEsigenza | SrSoluzioneItem>) => void;
  placeholderTitolo: string;
  placeholderDesc: string;
}) {
  // Una voce è "selezionata" se il suo titolo+descrizione combaciano con una nelle selectedItems
  const keyOf = (it: SrEsigenza | SrSoluzioneItem) => `${it.titolo}||${it.descrizione}`;
  const selectedKeys = useMemo(
    () => new Set(selectedItems.map(keyOf)),
    [selectedItems],
  );

  // Custom voci = quelle che non hanno match nel template
  const templateKeys = useMemo(
    () => new Set(templateItems.map(keyOf)),
    [templateItems],
  );
  const customItems = useMemo(
    () => selectedItems.filter((it) => !templateKeys.has(keyOf(it))),
    [selectedItems, templateKeys],
  );

  const toggleTemplate = (it: SrEsigenza | SrSoluzioneItem) => {
    const k = keyOf(it);
    if (selectedKeys.has(k)) {
      onChange(selectedItems.filter((s) => keyOf(s) !== k));
    } else {
      onChange([...selectedItems, it]);
    }
  };

  const selectAllTemplate = () => onChange([
    ...templateItems,
    ...customItems,
  ]);
  const clearAll = () => onChange([]);

  const addCustom = () => {
    onChange([...selectedItems, { titolo: "", descrizione: "" }]);
  };
  const updateCustom = (origIt: SrEsigenza | SrSoluzioneItem, field: "titolo" | "descrizione", value: string) => {
    const next = selectedItems.map((s) =>
      s === origIt ? { ...s, [field]: value } : s,
    );
    onChange(next);
  };
  const removeCustom = (origIt: SrEsigenza | SrSoluzioneItem) => {
    onChange(selectedItems.filter((s) => s !== origIt));
  };

  return (
    <div className="space-y-3">
      {/* Voci dalla libreria */}
      {templateItems.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-[11px] text-muted-foreground">
              Dalla tua <strong>libreria template</strong> ({templateItems.length} voci disponibili)
            </p>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={selectAllTemplate} className="h-7 text-[11px]">
                Seleziona tutte
              </Button>
              <Button size="sm" variant="ghost" onClick={clearAll} className="h-7 text-[11px]">
                Nessuna
              </Button>
            </div>
          </div>

          {/* Selezione "calma": testo sempre nero/slate, bordo sottile,
              background leggerissimo. Il segnale di selezione e' il
              checkbox + bg-slate-50 sottile, non testo+bordo arancione
              saturo (era percepito come warning). */}
          {templateItems.map((it, idx) => {
            const k = keyOf(it);
            const isSelected = selectedKeys.has(k);
            return (
              <label
                key={idx}
                className={
                  "flex items-start gap-3 rounded-md border p-3 cursor-pointer transition " +
                  (isSelected
                    ? "border-blue-300 bg-blue-50/40"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/30")
                }
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleTemplate(it)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {emoji} {it.titolo || <span className="italic text-muted-foreground">(senza titolo)</span>}
                  </p>
                  <p className="text-xs mt-0.5 text-slate-600">
                    {it.descrizione}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      ) : (
        <SrCallout variant="info">
          La tua libreria template non ha ancora {label.toLowerCase()}. Vai in <strong>Impostazioni → Template Moduli Vendita → Serramenti</strong> per aggiungerne.
        </SrCallout>
      )}

      {/* Voci custom per questo preventivo */}
      {customItems.length > 0 && (
        <div className="space-y-2 pt-2 border-t">
          <p className="text-[11px] text-muted-foreground">
            Voci personalizzate <strong>solo per questo cliente</strong> ({customItems.length})
          </p>
          {customItems.map((it, idx) => (
            <div key={idx} className="border-l-4 border-amber-300 pl-3 py-1 bg-amber-50/30 rounded-r-md">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[10px] uppercase tracking-wide text-amber-700 font-semibold">
                  Custom #{idx + 1}
                </Label>
                <Button
                  size="sm" variant="ghost"
                  onClick={() => removeCustom(it)}
                  className="h-7 px-2 text-xs text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Rimuovi
                </Button>
              </div>
              <Input
                value={it.titolo ?? ""}
                onChange={(e) => updateCustom(it, "titolo", e.target.value)}
                placeholder={placeholderTitolo}
                className="h-9 mb-2 mt-1"
              />
              <Textarea
                value={it.descrizione ?? ""}
                onChange={(e) => updateCustom(it, "descrizione", e.target.value)}
                placeholder={placeholderDesc}
                rows={2}
              />
            </div>
          ))}
        </div>
      )}

      <Button
        onClick={addCustom}
        variant="outline"
        size="sm"
        className="w-full border-dashed border border-slate-300 hover:border-slate-400 hover:bg-slate-50 text-slate-600 gap-1"
      >
        <Plus className="h-3.5 w-3.5" /> Aggiungi {label.toLowerCase()} personalizzata per questo cliente
      </Button>
    </div>
  );
}

// ─── String items (perché noi, incluso, prossimi passi) ────────────────────

function StringItemsPicker({
  label,
  emoji,
  templateItems,
  selectedItems,
  onChange,
  placeholder,
}: {
  label: string;
  emoji: string;
  templateItems: string[];
  selectedItems: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const selectedSet = useMemo(() => new Set(selectedItems), [selectedItems]);
  const templateSet = useMemo(() => new Set(templateItems), [templateItems]);
  const customItems = useMemo(
    () => selectedItems.filter((it) => !templateSet.has(it)),
    [selectedItems, templateSet],
  );

  const toggleTemplate = (it: string) => {
    if (selectedSet.has(it)) {
      onChange(selectedItems.filter((s) => s !== it));
    } else {
      onChange([...selectedItems, it]);
    }
  };

  const selectAllTemplate = () => onChange([...templateItems, ...customItems]);
  const clearAll = () => onChange([]);

  // customItemsWithIdx: ogni voce custom con la sua posizione assoluta in
  // selectedItems. Questo evita il bug di duplicati: due voci custom con
  // stesso testo (es. due stringhe vuote) non vengono più confuse da indexOf.
  const customItemsWithIdx = useMemo(
    () => selectedItems
      .map((value, realIdx) => ({ value, realIdx }))
      .filter(({ value }) => !templateSet.has(value)),
    [selectedItems, templateSet],
  );

  const addCustom = () => {
    onChange([...selectedItems, ""]);
  };
  const updateCustom = (realIdx: number, value: string) => {
    if (realIdx < 0 || realIdx >= selectedItems.length) return;
    const next = [...selectedItems];
    next[realIdx] = value;
    onChange(next);
  };
  const removeCustom = (realIdx: number) => {
    if (realIdx < 0 || realIdx >= selectedItems.length) return;
    onChange(selectedItems.filter((_, i) => i !== realIdx));
  };

  return (
    <div className="space-y-3">
      {templateItems.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-[11px] text-muted-foreground">
              Dalla tua <strong>libreria template</strong> ({templateItems.length} voci disponibili)
            </p>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={selectAllTemplate} className="h-7 text-[11px]">
                Seleziona tutte
              </Button>
              <Button size="sm" variant="ghost" onClick={clearAll} className="h-7 text-[11px]">
                Nessuna
              </Button>
            </div>
          </div>

          {templateItems.map((it, idx) => {
            const isSelected = selectedSet.has(it);
            return (
              <label
                key={idx}
                className={
                  "flex items-start gap-3 rounded-md border p-2.5 cursor-pointer transition " +
                  (isSelected
                    ? "border-blue-300 bg-blue-50/40"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/30")
                }
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleTemplate(it)}
                  className="mt-0.5"
                />
                <span className={"text-xs flex-1 text-slate-800 " + (isSelected ? "font-medium" : "")}>
                  {emoji} {it || <span className="italic text-muted-foreground">(vuota)</span>}
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <SrCallout variant="info">
          La tua libreria template non ha ancora <strong>{label.toLowerCase()}</strong>. Vai in <strong>Impostazioni → Template Moduli Vendita → Serramenti</strong> per aggiungerne.
        </SrCallout>
      )}

      {customItemsWithIdx.length > 0 && (
        <div className="space-y-2 pt-2 border-t">
          <p className="text-[11px] text-muted-foreground">
            Voci personalizzate <strong>solo per questo cliente</strong> ({customItemsWithIdx.length})
          </p>
          {customItemsWithIdx.map(({ value, realIdx }, displayIdx) => (
            <div key={realIdx} className="flex items-center gap-2">
              <span className="h-7 w-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold shrink-0">
                {displayIdx + 1}
              </span>
              <Input
                value={value}
                onChange={(e) => updateCustom(realIdx, e.target.value)}
                placeholder={placeholder}
                className="h-9 text-xs flex-1"
              />
              <Button
                size="icon" variant="ghost"
                onClick={() => removeCustom(realIdx)}
                className="h-9 w-9 shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5 text-rose-600" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button
        onClick={addCustom}
        variant="outline"
        size="sm"
        className="w-full border-dashed border border-slate-300 hover:border-slate-400 hover:bg-slate-50 text-slate-600 gap-1"
      >
        <Plus className="h-3.5 w-3.5" /> Aggiungi voce personalizzata per questo cliente
      </Button>
    </div>
  );
}

// ─── Step principale ────────────────────────────────────────────────────────

export function StepContenuti({ form, onChange }: Props) {
  const { data: template } = useTemplatePdf();
  const tpl: Partial<SrTemplatePdfRow> = (template ?? {}) as Partial<SrTemplatePdfRow>;

  const templateEsigenze = (tpl.esigenze_default ?? []) as SrEsigenza[];
  const templateSoluzione = (tpl.soluzione_default ?? []) as SrSoluzioneItem[];
  const templatePercheNoi = (tpl.perche_noi_default ?? []) as string[];
  const templateIncluso = (tpl.incluso_default ?? []) as string[];
  const templatePassi = (tpl.prossimi_passi_default ?? []) as string[];

  const selEsigenze = (form.esigenze ?? []) as SrEsigenza[];
  const selSoluzione = (form.soluzione ?? []) as SrSoluzioneItem[];
  const selPercheNoi = (form.perche_noi ?? []) as string[];
  const selIncluso = (form.incluso_investimento ?? []) as string[];
  const selPassi = (form.prossimi_passi ?? []) as string[];

  // Suggerimento UX: auto-seleziona tutto al primo accesso se vuoto + non ancora salvato
  const hasAnySelection =
    selEsigenze.length > 0 || selSoluzione.length > 0 ||
    selPercheNoi.length > 0 || selIncluso.length > 0 || selPassi.length > 0;

  const preselezionaTutto = () => {
    onChange("esigenze", templateEsigenze);
    onChange("soluzione", templateSoluzione);
    onChange("perche_noi", templatePercheNoi);
    onChange("incluso_investimento", templateIncluso);
    onChange("prossimi_passi", templatePassi);
    toast.success("Tutti i contenuti del template applicati al preventivo");
  };

  const sezioni: Array<{
    key: string;
    title: string;
    emoji: string;
    icon: React.ReactNode;
    count: number;
    total: number;
    body: React.ReactNode;
  }> = [
    {
      key: "esigenze",
      title: "Esigenze del cliente",
      emoji: "💬",
      icon: <MessageCircle className="h-4 w-4 text-orange-600" />,
      count: selEsigenze.length,
      total: templateEsigenze.length,
      body: (
        <ObjectItemsPicker
          label="Esigenza"
          emoji="💬"
          templateItems={templateEsigenze}
          selectedItems={selEsigenze}
          onChange={(v) => onChange("esigenze", v as SrEsigenza[])}
          placeholderTitolo="Es. Spifferi e correnti d'aria"
          placeholderDesc="Cosa risolve il nuovo serramento"
        />
      ),
    },
    {
      key: "soluzione",
      title: "Soluzione proposta",
      emoji: "✨",
      icon: <Sparkles className="h-4 w-4 text-orange-600" />,
      count: selSoluzione.length,
      total: templateSoluzione.length,
      body: (
        <ObjectItemsPicker
          label="Soluzione"
          emoji="✨"
          templateItems={templateSoluzione}
          selectedItems={selSoluzione}
          onChange={(v) => onChange("soluzione", v as SrSoluzioneItem[])}
          placeholderTitolo="Es. Posa qualificata UNI 11673"
          placeholderDesc="Cosa proponi e perché ti distingue"
        />
      ),
    },
    {
      key: "perche_noi",
      title: "Perché scegliere noi (USP)",
      emoji: "🏆",
      icon: <ListChecks className="h-4 w-4 text-orange-600" />,
      count: selPercheNoi.length,
      total: templatePercheNoi.length,
      body: (
        <StringItemsPicker
          label="USP"
          emoji="🏆"
          templateItems={templatePercheNoi}
          selectedItems={selPercheNoi}
          onChange={(v) => onChange("perche_noi", v)}
          placeholder="Es. Garanzia decennale scritta in contratto"
        />
      ),
    },
    {
      key: "incluso",
      title: "Cosa è incluso nell'investimento",
      emoji: "✅",
      icon: <ListChecks className="h-4 w-4 text-orange-600" />,
      count: selIncluso.length,
      total: templateIncluso.length,
      body: (
        <StringItemsPicker
          label="Voce inclusa"
          emoji="✅"
          templateItems={templateIncluso}
          selectedItems={selIncluso}
          onChange={(v) => onChange("incluso_investimento", v)}
          placeholder="Es. Sopralluogo tecnico gratuito"
        />
      ),
    },
    {
      key: "prossimi_passi",
      title: "Prossimi passi",
      emoji: "👣",
      icon: <ListChecks className="h-4 w-4 text-orange-600" />,
      count: selPassi.length,
      total: templatePassi.length,
      body: (
        <StringItemsPicker
          label="Step"
          emoji="👣"
          templateItems={templatePassi}
          selectedItems={selPassi}
          onChange={(v) => onChange("prossimi_passi", v)}
          placeholder="Es. Ci vediamo a casa tua per la consulenza tecnica"
        />
      ),
    },
  ];

  const hasAnyTemplate = sezioni.some((s) => s.total > 0);

  return (
    <div className="space-y-3">
      {/* Box intro: design neutro con accent blu navy (brand secondary)
          sul border-left. Le card di selezione sottostanti usano blu
          tenue per il selected state -> palette coerente. */}
      <Card className="border-l-4 border-l-[#173b67] border-slate-200">
        <CardContent className="p-4 flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <div className="flex items-center gap-2 mb-1">
              <MessageCircle className="h-4 w-4 text-[#173b67]" />
              <span className="text-sm font-semibold text-slate-900">Contenuti del preventivo</span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-1.5 leading-snug">
              Scegli quali voci della tua libreria template includere per questo cliente.
              Puoi anche aggiungerne di personalizzate solo per questo preventivo.
            </p>
            <p className="text-[11px] text-slate-700 leading-snug">
              <strong>Suggerimento:</strong> applica tutti i contenuti e poi rifinisci.
              Più veloce per il commerciale, più completo per il cliente.
            </p>
          </div>
          {hasAnyTemplate && (
            <Button
              size="sm"
              onClick={preselezionaTutto}
              className="bg-orange-500 hover:bg-orange-600 gap-1 shrink-0"
            >
              <ChevronRight className="h-3.5 w-3.5" />
              {hasAnySelection ? "Riapplica tutto" : "Applica tutto"}
            </Button>
          )}
        </CardContent>
      </Card>

      {!hasAnyTemplate && (
        <SrCallout variant="warning">
          La libreria template è vuota. Configurala in <strong>Impostazioni → Template Moduli Vendita → Serramenti</strong> per accelerare la compilazione dei preventivi.
        </SrCallout>
      )}

      <Card>
        <CardContent className="p-0">
          <Accordion type="multiple" defaultValue={["esigenze"]} className="w-full">
            {sezioni.map((s) => (
              <AccordionItem key={s.key} value={s.key} className="border-b last:border-b-0">
                <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-orange-50/40">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {s.icon}
                    <span className="text-sm font-semibold text-slate-900">{s.title}</span>
                    <span className={
                      "text-[10px] px-2 py-0.5 rounded-full font-semibold ml-auto mr-2 " +
                      (s.count > 0
                        ? "bg-orange-100 text-orange-600"
                        : "bg-slate-100 text-slate-500")
                    }>
                      {s.count} di {s.total + Math.max(0, s.count - s.total)} scelte
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 pt-1">
                  {s.body}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      <SrCallout variant="info">
        Le voci che selezioni qui andranno nel PDF cliente nelle rispettive sezioni:
        <ul className="list-disc list-inside mt-1 space-y-0.5">
          <li><strong>Esigenze + Soluzione</strong> → Pagina 1 (Proposta)</li>
          <li><strong>Cosa è incluso</strong> → Pagina 2 (Investimento)</li>
          <li><strong>Perché noi + Prossimi passi</strong> → fine PDF (chiusura)</li>
        </ul>
      </SrCallout>
    </div>
  );
}
