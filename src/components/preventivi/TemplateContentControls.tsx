import { useId, type ComponentType, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export function TemplateSectionCard({ icon: Icon, title, description, toggle, children }: {
  icon: ComponentType<{ className?: string }>;
  title: string; description?: string; children: ReactNode;
  toggle?: { value: boolean; onChange: (value: boolean) => void; label: string };
}) {
  return <Card data-template-section-card>
    <CardHeader className="pb-3"><div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600"><Icon className="h-4 w-4" /></div><div><CardTitle className="text-sm">{title}</CardTitle>{description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}</div></div>
      {toggle && <label className="flex items-center gap-2 text-xs text-muted-foreground">{toggle.value ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}<span>{toggle.label}</span><Switch aria-label={`${toggle.label}: ${title}`} checked={toggle.value} onCheckedChange={toggle.onChange} /></label>}
    </div></CardHeader>
    <CardContent className="space-y-4">{children}</CardContent>
  </Card>;
}

interface RowField<T> { key: keyof T; label: string; placeholder?: string; multiline?: boolean }
/** Only emits user changes, never normalizes or drops unknown row fields on mount. */
export function TemplateRowsEditor<T extends object>({ items, onChange, fields, empty, itemLabel, addLabel, emptyMessage }: {
  items: T[]; onChange: (items: T[]) => void; fields: RowField<T>[]; empty: T;
  itemLabel: string; addLabel: string; emptyMessage: string;
}) {
  const id = useId();
  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const next = [...items];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next);
  };
  return <div data-template-rows className="min-w-0 space-y-3">
    {!items.length && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{emptyMessage}</p>}
    {items.map((item, index) => <fieldset key={index} className="min-w-0 space-y-3 rounded-lg border p-3">
      <legend className="px-1 text-xs font-medium">{itemLabel} {index + 1}</legend>
      {fields.map(field => {
        const inputId = `${id}-${index}-${String(field.key)}`;
        const change = (value: string) => onChange(items.map((row, i) => i === index ? { ...row, [field.key]: value } : row));
        return <div key={String(field.key)} className="min-w-0 space-y-1.5"><label htmlFor={inputId} className="block text-xs font-medium">{field.label}</label>
          {field.multiline ? <Textarea id={inputId} aria-label={`${field.label} ${index + 1}`} rows={3} value={String(item[field.key] ?? "")} placeholder={field.placeholder} onChange={e => change(e.target.value)} />
            : <Input id={inputId} aria-label={`${field.label} ${index + 1}`} value={String(item[field.key] ?? "")} placeholder={field.placeholder} onChange={e => change(e.target.value)} />}
        </div>;
      })}
      <div className="flex flex-wrap gap-1 border-t pt-2">
        <Button type="button" variant="ghost" size="sm" disabled={index === 0} aria-label={`Sposta su ${itemLabel.toLowerCase()} ${index + 1}`} onClick={() => move(index, -1)}><ArrowUp className="h-3.5 w-3.5" />Su</Button>
        <Button type="button" variant="ghost" size="sm" disabled={index === items.length - 1} aria-label={`Sposta giù ${itemLabel.toLowerCase()} ${index + 1}`} onClick={() => move(index, 1)}><ArrowDown className="h-3.5 w-3.5" />Giù</Button>
        <Button type="button" variant="ghost" size="sm" className="ml-auto text-destructive" aria-label={`Rimuovi ${itemLabel.toLowerCase()} ${index + 1}`} onClick={() => onChange(items.filter((_, i) => i !== index))}><Trash2 className="h-3.5 w-3.5" />Rimuovi</Button>
      </div>
    </fieldset>)}
    <Button type="button" size="sm" variant="outline" onClick={() => onChange([...items, structuredClone(empty)])}><Plus className="mr-1.5 h-4 w-4" />{addLabel}</Button>
  </div>;
}

interface ListItem { titolo: string; descrizione?: string | null }
interface Testimonial { autore: string; ruolo?: string | null; testo: string }
interface Faq { domanda: string; risposta: string }
interface Phase { fase: string; durata?: string | null; descrizione?: string | null }

export function TemplateListItemsEditor({ items, onChange, addLabel, titlePlaceholder, descPlaceholder }: {
  items: ListItem[]; onChange: (items: ListItem[]) => void; addLabel: string; titlePlaceholder: string; descPlaceholder: string;
}) {
  return <TemplateRowsEditor items={items} onChange={onChange} fields={[
    { key: "titolo", label: "Titolo", placeholder: titlePlaceholder },
    { key: "descrizione", label: "Descrizione", placeholder: descPlaceholder, multiline: true },
  ]} empty={{ titolo: "", descrizione: "" }} itemLabel="Voce" addLabel={addLabel} emptyMessage="Nessuna voce. Aggiungi solo contenuti pertinenti alla tua proposta." />;
}

export function TemplateTestimonianzeEditor({ items, onChange }: { items: Testimonial[]; onChange: (items: Testimonial[]) => void }) {
  return <TemplateRowsEditor items={items} onChange={onChange} fields={[
    { key: "testo", label: "Testimonianza", placeholder: "Inserisci una testimonianza autentica", multiline: true },
    { key: "autore", label: "Autore", placeholder: "Nome cliente" },
    { key: "ruolo", label: "Contesto", placeholder: "Città / tipo lavoro" },
  ]} empty={{ autore: "", ruolo: "", testo: "" }} itemLabel="Testimonianza" addLabel="Aggiungi testimonianza" emptyMessage="Nessuna testimonianza. Inserisci soltanto recensioni autentiche autorizzate." />;
}

export function TemplateFaqEditor({ items, onChange }: { items: Faq[]; onChange: (items: Faq[]) => void }) {
  return <TemplateRowsEditor items={items} onChange={onChange} fields={[
    { key: "domanda", label: "Domanda", placeholder: "Domanda (es. Servono permessi per i lavori?)" },
    { key: "risposta", label: "Risposta", placeholder: "Risposta", multiline: true },
  ]} empty={{ domanda: "", risposta: "" }} itemLabel="Domanda" addLabel="Aggiungi FAQ" emptyMessage="Nessuna FAQ. Aggiungi le domande più frequenti dei tuoi clienti." />;
}

export function TemplateCronoEditor({ items, onChange }: { items: Phase[]; onChange: (items: Phase[]) => void }) {
  return <TemplateRowsEditor items={items} onChange={onChange} fields={[
    { key: "fase", label: "Fase", placeholder: "Fase (es. Demolizioni)" },
    { key: "durata", label: "Durata", placeholder: "Durata (es. 1 settimana)" },
    { key: "descrizione", label: "Descrizione", placeholder: "Dettaglio (opzionale)", multiline: true },
  ]} empty={{ fase: "", durata: "", descrizione: "" }} itemLabel="Fase" addLabel="Aggiungi fase" emptyMessage="Nessuna fase. Aggiungi le tappe del cantiere e le durate previste." />;
}
