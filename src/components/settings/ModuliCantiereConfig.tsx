/**
 * Impostazioni → Rapportini e presenze: quali parti del rapportino usa l'azienda, i suoi campi e i modelli di verbale.
 * Si salva a parte dalle regole del flusso, perché è un altro documento. Da telefono non c'è: si configura da tablet o
 * computer, il telefono compila.
 *
 * Un campo che ha già dati non cambia tipo e, eliminandolo, si archivia: i documenti scritti restano leggibili.
 */
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { useModuliAzienda, useSalvaModulo, useUsoModulo, type ModuloAzienda, type TipoModulo } from "@/hooks/useModuliCantiere";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { CampiModulo } from "@/components/campo/CampiModulo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PRESET_RAPPORTINO, PRESET_VERBALE, type PresetModulo } from "@/lib/campo/moduliPreset";
import {
  BLOCCHI_STANDARD, SCHEMA_COME_OGGI, campiPerContesto, chiaveDaEtichetta, validaModifica, validaSchema,
  type BloccoStandard, type CampoModulo, type ModuloSchema, type TipoCampo,
} from "../../../supabase/functions/_shared/moduliCantiere";

const PARTI: Record<BloccoStandard, { nome: string; conseguenza?: string }> = {
  fasi: { nome: "Fasi e lavorazioni", conseguenza: "Avanzamento fasi e cronoprogramma non si aggiornano più dai rapportini." },
  avanzamento: { nome: "Avanzamento", conseguenza: "La percentuale di avanzamento non si aggiorna più dai rapportini." },
  materiali: { nome: "Materiali", conseguenza: "Il consumo materiali della commessa non si aggiorna più dai rapportini." },
  mezzi: { nome: "Mezzi e attrezzi", conseguenza: "Le giornate e i costi dei mezzi non si registrano più dai rapportini." },
  foto: { nome: "Foto" },
  straordinario: { nome: "Straordinario" },
};
const TIPI: Array<{ value: TipoCampo; label: string }> = [
  { value: "text", label: "Testo" }, { value: "textarea", label: "Testo lungo" }, { value: "number", label: "Numero" },
  { value: "date", label: "Data" }, { value: "select", label: "Una scelta" }, { value: "multiselect", label: "Più scelte" }, { value: "boolean", label: "Sì/No" },
];
const SELECT = "h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground disabled:opacity-60";

function Scelta<T extends string>({ etichetta, aria, value, opzioni, disabled, onChange }: {
  etichetta: string; aria: string; value: T; opzioni: Array<[T, string]>; disabled?: boolean; onChange: (v: T) => void;
}) {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">{etichetta}
      <select aria-label={aria} className={SELECT} value={value} disabled={disabled} onChange={e => onChange(e.target.value as T)}>
        {opzioni.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function EditorCampi({ tipoModulo, campi, uso, bloccato, onChange }: {
  tipoModulo: TipoModulo; campi: CampoModulo[]; uso: Record<string, number>; bloccato: boolean; onChange: (c: CampoModulo[]) => void;
}) {
  const attivi = campi.filter(c => !c.archiviato);
  const archiviati = campi.filter(c => c.archiviato);
  const delRapportino = tipoModulo === "rapportino";
  const riscrivi = (nuoviAttivi: CampoModulo[]) => onChange([...nuoviAttivi, ...archiviati]);
  const cambia = (i: number, parte: Partial<CampoModulo>) => riscrivi(attivi.map((c, k) => k === i ? { ...c, ...parte } : c));
  const sposta = (i: number, d: number) => {
    const n = [...attivi]; const [c] = n.splice(i, 1); n.splice(i + d, 0, c); riscrivi(n);
  };
  const elimina = (i: number) => {
    const c = attivi[i];
    const n = uso[c.chiave] ?? 0;
    if (n > 0) {
      if (!window.confirm(`${n} documenti contengono «${c.etichetta}». Non si compilerà più, ma quei dati restano. Continuare?`)) return;
      onChange([...attivi.filter((_, k) => k !== i), ...archiviati, { ...c, archiviato: true }]);
    } else onChange([...attivi.filter((_, k) => k !== i), ...archiviati]);
  };
  const aggiungi = () => riscrivi([...attivi, {
    // La chiave vera si fissa al salvataggio, dal nome scritto: qui serve solo a riconoscere il campo nuovo.
    chiave: `nuovo_${Date.now()}_${attivi.length}`, etichetta: "", tipo: "text", obbligatorio: false,
    chi: "tutti", ditte: "tutti", quando: "sempre", livello: "rapportino", stampa: delRapportino ? "interno" : "cliente",
  }]);
  return (
    <div className="space-y-3">
      {attivi.map((c, i) => {
        const n = i + 1;
        const usato = uso[c.chiave] ?? 0;
        return (
          <div key={c.chiave} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid min-w-48 flex-1 gap-1 text-xs text-muted-foreground">Nome
                <Input aria-label={`Nome del campo ${n}`} value={c.etichetta} maxLength={80} disabled={bloccato} onChange={e => cambia(i, { etichetta: e.target.value })} className="h-9" />
              </label>
              <div className="w-36"><Scelta etichetta="Tipo" aria={`Tipo del campo ${n}`} value={c.tipo} disabled={bloccato || usato > 0}
                opzioni={TIPI.map(t => [t.value, t.label])} onChange={tipo => cambia(i, { tipo })} /></div>
              <div className="flex h-9 items-center gap-2">
                <Switch id={`obbligatorio-${c.chiave}`} aria-label={`Obbligatorio, campo ${n}`} checked={c.obbligatorio} disabled={bloccato} onCheckedChange={obbligatorio => cambia(i, { obbligatorio })} />
                <Label htmlFor={`obbligatorio-${c.chiave}`} className="text-xs font-normal">Obbligatorio</Label>
              </div>
              {!bloccato && <div className="ml-auto flex gap-1">
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label={`Sposta su il campo ${n}`} disabled={i === 0} onClick={() => sposta(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label={`Sposta giù il campo ${n}`} disabled={i === attivi.length - 1} onClick={() => sposta(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-rose-600" aria-label={`Elimina il campo ${n}`} onClick={() => elimina(i)}><Trash2 className="h-4 w-4" /></Button>
              </div>}
            </div>
            {usato > 0 && <p className="text-xs text-muted-foreground">Il tipo non si cambia: {usato} documenti contengono già questo campo.</p>}
            {(c.tipo === "select" || c.tipo === "multiselect") && (
              <label className="grid gap-1 text-xs text-muted-foreground">Opzioni, separate da virgola
                <Input aria-label={`Opzioni del campo ${n}`} defaultValue={(c.opzioni ?? []).join(", ")} disabled={bloccato}
                  onChange={e => cambia(i, { opzioni: e.target.value.split(",").map(o => o.trim()).filter(Boolean) })} className="h-9" />
              </label>
            )}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
              {c.tipo === "number" && <label className="grid gap-1 text-xs text-muted-foreground">Unità
                <Input aria-label={`Unità del campo ${n}`} value={c.unita ?? ""} maxLength={12} disabled={bloccato} onChange={e => cambia(i, { unita: e.target.value || undefined })} className="h-9" />
              </label>}
              {delRapportino && <>
                <Scelta etichetta="Chi lo compila" aria={`Chi lo compila, campo ${n}`} value={c.chi} disabled={bloccato} opzioni={[["tutti", "Tutti"], ["capo", "Solo il capo"]]} onChange={chi => cambia(i, { chi })} />
                <Scelta etichetta="Quali ditte" aria={`Quali ditte, campo ${n}`} value={c.ditte} disabled={bloccato} opzioni={[["tutti", "Tutte"], ["dipendenti", "Dipendenti"], ["subappaltatori", "Subappaltatori"]]} onChange={ditte => cambia(i, { ditte })} />
                <Scelta etichetta="Quando" aria={`Quando, campo ${n}`} value={c.quando} disabled={bloccato} opzioni={[["sempre", "Sempre"], ["giornaliero", "Ogni giorno"], ["fine_lavori", "A fine lavori"]]} onChange={quando => cambia(i, { quando })} />
                <Scelta etichetta="Dove" aria={`Dove, campo ${n}`} value={c.livello} disabled={bloccato} opzioni={[["rapportino", "Sul rapportino"], ["fase", "Per ogni fase"]]} onChange={livello => cambia(i, { livello })} />
              </>}
              <Scelta etichetta="Nel PDF" aria={`Nel PDF, campo ${n}`} value={c.stampa} disabled={bloccato} opzioni={[["mai", "Mai"], ["interno", "Solo interno"], ["cliente", "Anche per il cliente"]]} onChange={stampa => cambia(i, { stampa })} />
            </div>
          </div>
        );
      })}
      {!bloccato && <Button type="button" variant="outline" size="sm" onClick={aggiungi}><Plus className="mr-1.5 h-4 w-4" />Aggiungi un campo</Button>}
      {archiviati.length > 0 && (
        <section role="region" aria-label="Archiviati" className="rounded-lg border bg-muted/30 p-3">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Archiviati</p>
          <ul className="divide-y">
            {archiviati.map(c => (
              <li key={c.chiave} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <span>{c.etichetta}</span>
                {!bloccato && <Button type="button" variant="ghost" size="sm" className="h-8" aria-label={`Riattiva ${c.etichetta}`}
                  onClick={() => onChange([...attivi, { ...c, archiviato: undefined }, ...archiviati.filter(a => a.chiave !== c.chiave)])}>Riattiva</Button>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Anteprima({ schema }: { schema: ModuloSchema }) {
  const [ruolo, setRuolo] = useState<"operaio" | "capo">("operaio");
  const [valori, setValori] = useState<Record<string, unknown>>({});
  const campi = campiPerContesto(schema, { ruolo, momento: "giornaliero", subappaltatore: false, soloOre: false });
  const parti = BLOCCHI_STANDARD.filter(b => schema.blocchi[b]).map(b => PARTI[b].nome);
  return (
    <section role="region" aria-label="Anteprima del modulo" className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Anteprima</span>
        <div className="ml-auto flex gap-1 rounded-lg bg-muted p-1" role="group">
          {(["operaio", "capo"] as const).map(r => (
            <Button key={r} type="button" size="sm" className="h-7" variant={ruolo === r ? "secondary" : "ghost"} aria-pressed={ruolo === r} onClick={() => setRuolo(r)}>
              {r === "operaio" ? "Vista operaio" : "Vista capo"}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Ore, descrizione{parti.length ? `, ${parti.join(", ").toLowerCase()}` : ""}.</p>
      <CampiModulo campi={campi} valori={valori} onChange={(k, v) => setValori(p => ({ ...p, [k]: v }))} />
    </section>
  );
}

/** Le chiavi dei campi nuovi nascono dal nome al salvataggio; quelle esistenti non cambiano mai. */
function fissaChiavi(s: ModuloSchema): ModuloSchema {
  const usate = s.campi.filter(c => !c.chiave.startsWith("nuovo_")).map(c => c.chiave);
  return {
    ...s,
    campi: s.campi.map(c => {
      const etichetta = c.etichetta.trim();
      if (!c.chiave.startsWith("nuovo_")) return { ...c, etichetta };
      const chiave = chiaveDaEtichetta(etichetta, usate);
      usate.push(chiave);
      return { ...c, etichetta, chiave };
    }),
  };
}

const erroreSalvataggio = (e: unknown) => {
  const x = e as { code?: string; message?: string } | null;
  if (x?.code === "42501") return "Non hai il permesso di cambiare queste scelte: le cambia chi ha «Configurazione Ordini» in modifica.";
  if (x?.code === "22023" && x.message) return x.message;
  return "Non sono riuscito a salvare. Riprova tra poco.";
};

interface Bozza { id: string | null; nome: string; schema: ModuloSchema; attivo: boolean }

export function ModuliCantiereConfig({ tipo, evidenziate }: { tipo: TipoModulo; evidenziate?: Record<string, boolean> }) {
  const { effectiveCompany, role } = useAuth();
  const permessi = usePermissions();
  const mobile = useIsMobile();
  const companyId = effectiveCompany?.id;
  const puoModificare = !permessi.isLoading && (role === "company_admin" || role === "super_admin" || !!permessi.canEditSettingsOrders);
  const { data: moduli = [], isLoading, isError, refetch } = useModuliAzienda(companyId, tipo);
  const { data: uso = {} } = useUsoModulo(companyId, tipo);
  const salva = useSalvaModulo(companyId);
  const [bozza, setBozza] = useState<Bozza | null>(null);
  const [apertoId, setApertoId] = useState<string | null>(null);
  useSettingsDraftGuard(bozza != null || salva.isPending);

  const salvatoRapportino = moduli[0] as ModuloAzienda | undefined;
  const aperto = tipo === "rapportino" ? salvatoRapportino : moduli.find(m => m.id === apertoId);
  const base: Bozza | null = useMemo(() => {
    if (aperto) return { id: aperto.id, nome: aperto.nome, schema: aperto.schema, attivo: aperto.attivo };
    return tipo === "rapportino" ? { id: null, nome: "Rapportino", schema: SCHEMA_COME_OGGI, attivo: true } : null;
  }, [aperto, tipo]);
  const corrente = bozza ?? base;
  const bloccato = !puoModificare || salva.isPending;

  if (mobile || !companyId) return null;
  if (isLoading) return null;
  if (isError) {
    return <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-3">
      Non riesco a leggere i modelli.<Button size="sm" variant="outline" onClick={() => refetch()}>Riprova</Button>
    </AlertDescription></Alert>;
  }

  const cambiaSchema = (parte: Partial<ModuloSchema>) => { if (corrente && !bloccato) setBozza({ ...corrente, schema: { ...corrente.schema, ...parte } }); };

  const prendiPreset = (p: PresetModulo) => {
    if (!corrente) return;
    const prima = corrente.schema.campi;
    if (prima.some(c => !c.archiviato) && !window.confirm("Il modello sostituisce parti e campi di questa bozza. Continuare?")) return;
    const nuove = new Set(p.schema.campi.map(c => c.chiave));
    const daTenere = prima.filter(c => (uso[c.chiave] ?? 0) > 0 && !nuove.has(c.chiave)).map(c => ({ ...c, archiviato: true }));
    setBozza({ ...corrente, schema: { ...p.schema, campi: [...p.schema.campi, ...daTenere] } });
  };

  const conferma = async () => {
    if (!corrente || bloccato) return;
    const schema = fissaChiavi(corrente.schema);
    const errori = [
      ...(corrente.nome.trim() ? [] : ["Dai un nome al modello."]),
      ...validaSchema(schema),
      ...validaModifica(aperto?.schema ?? SCHEMA_COME_OGGI, schema, uso),
    ];
    if (errori.length) { toast.error(errori[0]); return; }
    try {
      const id = await salva.mutateAsync({ id: corrente.id, tipo, nome: corrente.nome.trim(), schema, attivo: corrente.attivo });
      if (tipo === "verbale") setApertoId(id);
      setBozza(null);
      toast.success("Modello salvato");
    } catch (e) { toast.error(erroreSalvataggio(e)); }
  };

  const barraSalva = puoModificare && (bozza != null) && (
    <div className="flex items-center justify-end gap-2">
      <Button type="button" size="sm" variant="ghost" onClick={() => setBozza(null)} disabled={salva.isPending}>Annulla</Button>
      <Button type="button" size="sm" onClick={() => void conferma()} disabled={salva.isPending}><Save className="mr-1.5 h-4 w-4" />Salva</Button>
    </div>
  );

  if (tipo === "rapportino" && corrente) {
    return (
      <>
        <SezioneImpostazione id="parti" titolo="Parti del rapportino" evidenziata={evidenziate?.parti}
          descrizione="Spegnere nasconde solo l’inserimento: quello che è già scritto resta nei rapportini.">
          <div className="space-y-3 p-4">
            {puoModificare && <div className="flex flex-wrap items-center gap-2">
              {PRESET_RAPPORTINO.map(p => <Button key={p.id} type="button" variant="outline" size="sm" className="h-8" aria-label={`Parti dal modello ${p.nome}`} onClick={() => prendiPreset(p)}>{p.nome}</Button>)}
            </div>}
            <ul className="grid gap-x-6 md:grid-cols-2">
              <li className="flex min-h-11 items-center justify-between gap-3 border-b text-sm"><span>Ore</span><span className="text-xs text-muted-foreground">Sempre</span></li>
              <li className="flex min-h-11 items-center justify-between gap-3 border-b text-sm"><span>Descrizione dei lavori</span><span className="text-xs text-muted-foreground">Sempre</span></li>
              {(Object.keys(PARTI) as BloccoStandard[]).map(b => (
                <li key={b} className="border-b py-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span>{PARTI[b].nome}</span>
                    <Switch aria-label={PARTI[b].nome} checked={corrente.schema.blocchi[b]} disabled={bloccato}
                      onCheckedChange={v => cambiaSchema({ blocchi: { ...corrente.schema.blocchi, [b]: v } })} />
                  </div>
                  {!corrente.schema.blocchi[b] && PARTI[b].conseguenza && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{PARTI[b].conseguenza}</p>}
                </li>
              ))}
            </ul>
          </div>
        </SezioneImpostazione>
        <SezioneImpostazione id="campi-propri" titolo="Campi propri" evidenziata={evidenziate?.["campi-propri"]}
          descrizione="I dati che servono alla tua azienda, in app, dall’ufficio e nel PDF.">
          <div className="space-y-4 p-4">
            <EditorCampi tipoModulo="rapportino" campi={corrente.schema.campi} uso={uso} bloccato={bloccato} onChange={campi => cambiaSchema({ campi })} />
            <Anteprima schema={corrente.schema} />
          </div>
        </SezioneImpostazione>
        {barraSalva && <div className="sticky bottom-2 z-10 rounded-lg border bg-card/95 p-2 shadow-sm backdrop-blur">{barraSalva}</div>}
      </>
    );
  }

  return (
    <SezioneImpostazione id="verbali" titolo="Verbali di collaudo" evidenziata={evidenziate?.verbali}
      descrizione="Modelli di partenza: controllali e adattali al tuo lavoro. Il verbale non è un documento a norma di per sé.">
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {moduli.map(m => (
            <Button key={m.id} type="button" size="sm" className="h-8" variant={apertoId === m.id ? "secondary" : "outline"}
              aria-label={`Apri il modello ${m.nome}`} onClick={() => { setBozza(null); setApertoId(m.id); }}>
              {m.nome}{m.attivo ? "" : " · spento"}
            </Button>
          ))}
          {puoModificare && PRESET_VERBALE.map(p => (
            <Button key={p.id} type="button" size="sm" className="h-8" variant="ghost" aria-label={`Nuovo verbale da ${p.nome}`}
              onClick={() => setBozza({ id: null, nome: p.nome, schema: p.schema, attivo: true })}><Plus className="mr-1 h-3.5 w-3.5" />{p.nome}</Button>
          ))}
        </div>
        {corrente && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid min-w-56 flex-1 gap-1 text-xs text-muted-foreground">Nome del modello
                <Input aria-label="Nome del modello" value={corrente.nome} maxLength={80} disabled={bloccato} onChange={e => setBozza({ ...corrente, nome: e.target.value })} className="h-9" />
              </label>
              <label className="flex h-9 items-center gap-2 text-xs">Modello attivo
                <Switch aria-label="Modello attivo" checked={corrente.attivo} disabled={bloccato} onCheckedChange={attivo => setBozza({ ...corrente, attivo })} />
              </label>
              <label className="flex h-9 items-center gap-2 text-xs">Compilabile dal capo in cantiere
                <Switch aria-label="Compilabile dal capo in cantiere" checked={corrente.schema.dal_cantiere === true} disabled={bloccato} onCheckedChange={dal_cantiere => cambiaSchema({ dal_cantiere })} />
              </label>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold">Voci da controllare</p>
              {(corrente.schema.voci ?? []).map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input aria-label={`Voce ${i + 1}`} value={v} maxLength={160} disabled={bloccato} className="h-9"
                    onChange={e => cambiaSchema({ voci: (corrente.schema.voci ?? []).map((x, k) => k === i ? e.target.value : x) })} />
                  {!bloccato && <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-rose-600" aria-label={`Togli la voce ${i + 1}`}
                    onClick={() => cambiaSchema({ voci: (corrente.schema.voci ?? []).filter((_, k) => k !== i) })}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              ))}
              {!bloccato && <Button type="button" variant="outline" size="sm" onClick={() => cambiaSchema({ voci: [...(corrente.schema.voci ?? []), ""] })}><Plus className="mr-1.5 h-4 w-4" />Aggiungi una voce</Button>}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold">Dati del collaudo</p>
              <EditorCampi tipoModulo="verbale" campi={corrente.schema.campi} uso={uso} bloccato={bloccato} onChange={campi => cambiaSchema({ campi })} />
            </div>
            {barraSalva}
          </div>
        )}
      </div>
    </SezioneImpostazione>
  );
}
