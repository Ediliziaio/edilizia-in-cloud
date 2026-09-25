import { serramentiCoverLayout, withSerramentiCoverLayout, type SerramentiCoverLayout } from "@/lib/moduli-vendita/serramentiCoverLayout";

const layouts: Array<{ id: SerramentiCoverLayout; title: string; description: string }> = [
  { id: "editoriale-v1", title: "Editoriale · come Bagni", description: "Logo in alto, fotografia a tutta pagina e dati cliente allineati in basso." },
  { id: "classico", title: "Classico Serramenti", description: "Logo e azienda affiancati, titolo centrale e riquadro cliente separato." },
];

export function SerramentiCoverLayoutPicker({ value, onChange }: {
  value: Record<string, unknown> | null | undefined;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const selected = serramentiCoverLayout(value);
  return (
    <fieldset className="rounded-xl border bg-card p-4 space-y-3">
      <legend className="px-1 text-sm font-semibold">Composizione della copertina</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {layouts.map(layout => (
          <label key={layout.id} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${selected === layout.id ? "border-orange-500 bg-orange-50/50 dark:bg-orange-950/20" : "hover:bg-muted/40"}`}>
            <input type="radio" name="serramenti-cover-layout" value={layout.id} checked={selected === layout.id}
              onChange={() => onChange(withSerramentiCoverLayout(value, layout.id))} className="mt-1 accent-orange-500" />
            <span><span className="block text-sm font-medium">{layout.title}</span><span className="mt-1 block text-xs text-muted-foreground">{layout.description}</span></span>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Cambia solo l’impaginazione. Foto, logo, testi e personalizzazioni restano tuoi. Controlla il risultato nell’anteprima PDF.</p>
    </fieldset>
  );
}
