import { UniformSelect } from "@/components/ui/uniform-select";
import { useMemo, useState } from "react";
import { Palette, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useFamilyMutations } from "@/hooks/useFamilyMutations";
import type { FamilyWithAxes } from "@/types/articleFamily";
import { catalogoColoriSchema, catalogoVuoto, coloreDisponibile, elencoColori, leggiCatalogoColori, type CatalogoColori } from "@/lib/serramenti/catalogoColori";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** Un solo pannello desktop, dentro le opzioni già esistenti. Le fasce restano l'unica fonte dei prezzi. */
export function CatalogoColoriEditor({ family }: { family: FamilyWithAxes }) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const [cerca, setCerca] = useState("");
  const salvato = useMemo(() => leggiCatalogoColori(family.custom_field_values) ?? catalogoVuoto(), [family.custom_field_values]);
  const [bozza, setBozza] = useState<{ catalogo: CatalogoColori; expected: CatalogoColori | null } | null>(null);
  const catalogo = bozza?.catalogo ?? salvato;
  const asse = family.axes.find(a => a.codice === "colore");
  const elenco = useMemo(() => asse ? elencoColori(asse) : [], [asse]);
  const { saveColorCatalog } = useFamilyMutations();
  if (!asse) return null;
  const modifica = (patch: Partial<CatalogoColori>) => setBozza({ catalogo: { ...catalogo, ...patch }, expected: bozza ? bozza.expected : leggiCatalogoColori(family.custom_field_values) });
  const cambiaCampione = (chiave: string, patch: Partial<CatalogoColori["campioni"][number]>) => {
    const prima = catalogo.campioni.find(c => c.chiave === chiave) ?? {
      chiave, codice: "", finitura: "", hex: "", lati: ["interno", "esterno"] as ("interno" | "esterno")[], attivo: true, confermato: false,
    };
    modifica({ campioni: [...catalogo.campioni.filter(c => c.chiave !== chiave), { ...prima, ...patch }] });
  };
  const salva = async () => {
    const parsed = catalogoColoriSchema.safeParse(catalogo);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    if (catalogo.combinazioni.some(c => !elenco.some(v => v.chiave === c.interno && v.attivo) || !elenco.some(v => v.chiave === c.esterno && v.attivo) || !coloreDisponibile(catalogo, c.interno, "interno") || !coloreDisponibile(catalogo, c.esterno, "esterno") || !asse.values.some(v => v.id === c.fasciaId && v.attivo))) {
      toast.error(t("Controlla le combinazioni: colori e fasce devono esistere ed essere attivi.")); return;
    }
    try {
      await saveColorCatalog.mutateAsync({ id: family.id, catalogo: parsed.data, expected: bozza ? bozza.expected : leggiCatalogoColori(family.custom_field_values) });
      setBozza(null); toast.success(t("Catalogo colori salvato per questa linea/prodotto"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("Salvataggio non riuscito")); }
  };
  return (
    <section className="rounded-lg border border-blue-100 bg-blue-50/30">
      <button type="button" className="flex w-full items-center gap-2 p-3 text-left text-sm font-medium text-blue-950" aria-expanded={aperto} onClick={() => setAperto(!aperto)}>
        <Palette className="h-4 w-4 text-orange-500" /> {t("Colori e finiture")} <span className="ml-auto text-xs font-normal text-muted-foreground">{t("{n} campioni", { n: elenco.length })} · {aperto ? t("Chiudi") : t("Gestisci")}</span>
      </button>
      {aperto && <fieldset disabled={saveColorCatalog.isPending} className="min-w-0 space-y-3 border-t p-3">
        <p className="text-xs text-muted-foreground">{t("Usa i colori presenti nelle fasce qui sotto. Aggiungi nuove voci nelle opzioni della variante. Codici, finiture e disponibilità valgono solo per questa famiglia: non vengono estesi ad altre linee.")}</p>
        <Input aria-label={t("Cerca campione nel catalogo")} placeholder={t("Cerca colore, codice o finitura…")} className="h-8 max-w-md text-xs" value={cerca} onChange={e => setCerca(e.target.value)} />
        <div className="max-h-80 overflow-auto rounded-md border bg-background">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="sticky top-0 bg-slate-50"><tr className="text-left"><th className="p-2">{t("Colore / fascia")}</th><th className="p-2">{t("Codice fornitore")}</th><th className="p-2">{t("Finitura")}</th><th className="p-2">{t("Campione HEX")}</th><th className="p-2">{t("Interno")}</th><th className="p-2">{t("Esterno")}</th><th className="p-2">{t("Attivo")}</th><th className="p-2">{t("Confermato")}</th></tr></thead>
            <tbody>{elenco.filter(v => {
              const m = catalogo.campioni.find(c => c.chiave === v.chiave);
              return `${v.nome} ${v.fascia} ${m?.codice ?? ""} ${m?.finitura ?? ""}`.toLowerCase().includes(cerca.toLowerCase());
            }).map(v => {
              const m = catalogo.campioni.find(c => c.chiave === v.chiave);
              return <tr key={v.chiave} className="border-t">
                <td className="p-2"><span className="font-medium">{v.nome}</span><p className="text-[10px] text-muted-foreground">{v.fascia}{!v.attivo && t(" · non più a listino")}</p></td>
                <td className="p-2"><Input className="h-8 w-28 text-xs" aria-label={t("Codice {nome} {fascia}", { nome: v.nome, fascia: v.fascia })} value={m?.codice ?? ""} onChange={e => cambiaCampione(v.chiave, { codice: e.target.value })} /></td>
                <td className="p-2"><Input className="h-8 w-28 text-xs" placeholder={t("Opaco, legno…")} aria-label={t("Finitura {nome} {fascia}", { nome: v.nome, fascia: v.fascia })} value={m?.finitura ?? ""} onChange={e => cambiaCampione(v.chiave, { finitura: e.target.value })} /></td>
                <td className="p-2"><Input className="h-8 w-24 text-xs" placeholder={t("#FFFFFF")} aria-label={t("Campione {nome} {fascia}", { nome: v.nome, fascia: v.fascia })} value={m?.hex ?? ""} onChange={e => cambiaCampione(v.chiave, { hex: e.target.value })} /></td>
                {(["interno", "esterno"] as const).map(lato => <td key={lato} className="p-2"><Checkbox aria-label={`${lato} ${v.nome} ${v.fascia}`} checked={m?.lati.includes(lato) ?? true} onCheckedChange={checked => {
                  const lati = m?.lati ?? ["interno", "esterno"];
                  cambiaCampione(v.chiave, { lati: checked === true ? [...new Set([...lati, lato])] : lati.filter(l => l !== lato) });
                }} /></td>)}
                <td className="p-2"><Checkbox aria-label={t("Attivo {nome} {fascia}", { nome: v.nome, fascia: v.fascia })} checked={m?.attivo ?? true} onCheckedChange={c => cambiaCampione(v.chiave, { attivo: c === true })} /></td>
                <td className="p-2"><Checkbox aria-label={t("Confermato {nome} {fascia}", { nome: v.nome, fascia: v.fascia })} checked={m?.confermato ?? false} onCheckedChange={c => cambiaCampione(v.chiave, { confermato: c === true })} /></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <div className="rounded-md border bg-background p-3 space-y-2">
          <Label htmlFor={`regola-${family.id}`} className="text-xs">{t("Prezzo interno / esterno")}</Label>
          <UniformSelect id={`regola-${family.id}`} className="h-8 w-full rounded-md border bg-background px-2 text-xs" value={catalogo.modalita} onChange={e => modifica({ modalita: e.target.value as CatalogoColori["modalita"] })}>
            <option value="fascia_piu_cara">{t("Fascia più cara — regola attuale")}</option><option value="combinazioni">{t("Combinazioni confermate dal fornitore")}</option>
          </UniformSelect>
          <p className="text-[11px] text-muted-foreground">{t("Ogni combinazione usa il prezzo e il costo della fascia scelta, senza aggiungere due volte il colore. In modalità combinazioni, quelle non definite restano da quotare.")}</p>
          {catalogo.modalita === "combinazioni" && <>
            {catalogo.combinazioni.map((regola, i) => <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
              {(["interno", "esterno", "fasciaId"] as const).map(campo => <UniformSelect key={campo} aria-label={t("{campo} combinazione {i}", { campo, i: i + 1 })} className="h-8 min-w-0 rounded-md border bg-background px-1 text-xs" value={regola[campo]} onChange={e => modifica({ combinazioni: catalogo.combinazioni.map((c, j) => j === i ? { ...c, [campo]: e.target.value } : c) })}>
                <option value="">{campo === "fasciaId" ? t("Fascia prezzo") : t("Colore {campo}", { campo })}</option>
                {campo === "fasciaId" ? asse.values.filter(v => v.attivo).map(v => <option key={v.id} value={v.id}>{v.label}</option>) : elenco.filter(v => v.attivo && coloreDisponibile(catalogo, v.chiave, campo)).map(v => <option key={v.chiave} value={v.chiave}>{v.nome} · {v.fascia}</option>)}
              </UniformSelect>)}
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={t("Rimuovi combinazione {i}", { i: i + 1 })} onClick={() => modifica({ combinazioni: catalogo.combinazioni.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>)}
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => modifica({ combinazioni: [...catalogo.combinazioni, { interno: "", esterno: "", fasciaId: "" }] })}><Plus className="mr-1 h-3.5 w-3.5" />{t("Combinazione")}</Button>
          </>}
        </div>
        <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" disabled={!bozza || saveColorCatalog.isPending} onClick={() => setBozza(null)}>{t("Annulla modifiche")}</Button><Button type="button" size="sm" disabled={!bozza || saveColorCatalog.isPending} onClick={salva}>{saveColorCatalog.isPending ? t("Salvataggio…") : t("Salva colori")}</Button></div>
        <p className="text-[10px] text-muted-foreground">{t("Il campione a schermo è indicativo: conferma la finitura con un campione fisico del fornitore.")}</p>
      </fieldset>}
    </section>
  );
}
