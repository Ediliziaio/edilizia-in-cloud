/**
 * Il conto di costo di ogni riga di una fattura ricevuta, nella sua scheda (10/11/2026).
 *
 * Il menu della riga mostra il conto scelto, oppure quello proposto dalla descrizione
 * (calcestruzzo → materie prime, pompaggio → noli, cubiere → consumo…), da confermare. «Conto
 * della fattura» = la riga segue il «Conto di costo» della fattura. Ogni cambio rifà la scrittura
 * contabile della fattura (contabilita_riregistra_documento), che divide l'imponibile per conto.
 *
 * Dall'11/11/2026, per chi tiene la contabilità generale in casa col proprio piano dei conti, il
 * menu propone i CONTI DI COSTO del piano (con la ricerca) e permette di crearne uno nuovo: la riga
 * ricorda «conto:<id>» e la scrittura va su quel conto (migrazione 20290219100000). Per le altre
 * aziende restano le categorie.
 */
import { useMemo, useRef, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CATEGORIE_DI_BASE, chiaveRiga, contoPropostoRiga, etichettaCategoria, proposteDalPiano, proposteDalleScelte, type FatturaStorica, type SceltaPassata } from "@/lib/fatturazione/contoPerRiga";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const DELLA_FATTURA = "__fattura";
const uguali = (a: Record<string, string>, b: Record<string, string>) =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);

export interface RigaPerConto { chiave: string; descrizione: string }

/** Un conto di costo del piano dei conti dell'azienda (o un suo mastro). */
export interface ContoDiCosto { id: string; codice: string; descrizione: string; movimentabile: boolean; mastro_id: string | null; voce_cee: string | null }

const VALORE_CONTO = /^conto:([0-9a-f-]{36})$/i;
export const valoreDelConto = (id: string) => `conto:${id}`;

export function useContiRighe({ companyId, fatturaId, salvati, righe, onCambiato, fornitorePiva = null }: {
  companyId: string;
  fatturaId: string;
  /** La partita IVA del fornitore: le sue fatture passate dicono quale conto dare alle righe. */
  fornitorePiva?: string | null;
  salvati: Record<string, string>;
  righe: RigaPerConto[];
  onCambiato: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [salvando, setSalvando] = useState(false);
  const invio = useRef(false);
  const [bozza, setBozza] = useState<{ id: string; base: Record<string, string>; valori: Record<string, string>; salvata: boolean } | null>(null);
  const corrente = bozza?.id === fatturaId && (!bozza.salvata || uguali(salvati, bozza.base)) ? bozza : null;
  const scelti = corrente?.valori ?? salvati;
  const { data: proprie = [] } = useQuery({
    queryKey: queryKeys.costCategories.list(companyId),
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("cost_categories").select("*").eq("company_id", companyId).order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ name: string }>;
    },
  });
  // I conti di costo del piano, solo per chi tiene la contabilità generale in casa.
  const chiavePiano = ["conti-di-costo-del-piano", companyId];
  const { data: piano = [] } = useQuery({
    queryKey: chiavePiano,
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ContoDiCosto[]> => {
      const { data: azienda, error: e1 } = await supabase.from("companies").select("contabilita_generale_attiva").eq("id", companyId).maybeSingle();
      if (e1) throw e1;
      if (!azienda?.contabilita_generale_attiva) return [];
      const { data, error } = await supabase.from("contabilita_conti")
        .select("id, codice, descrizione, movimentabile, mastro_id, voce_cee")
        .eq("company_id", companyId).eq("natura", "costo").eq("attivo", true).order("codice");
      if (error) throw error;
      return data ?? [];
    },
  });
  const contiDelPiano = useMemo(() => piano.filter((c) => c.movimentabile), [piano]);
  const mastriDelPiano = useMemo(() => piano.filter((c) => !c.movimentabile), [piano]);
  const perId = useMemo(() => new Map(piano.map((c) => [c.id, c])), [piano]);

  const categorie = useMemo(() => {
    const nomi = proprie.map((c) => c.name).filter(Boolean);
    return Array.from(new Set([...(nomi.length > 0 ? nomi : CATEGORIE_DI_BASE), ...Object.values(salvati).filter((v) => !VALORE_CONTO.test(v))]));
  }, [proprie, salvati]);
  // Le fatture passate dello stesso fornitore, con i conti che hanno avuto le loro righe (dalla più
  // recente), e i riferimenti di questa (il contratto nell'XML): servono a proporre il conto giusto.
  const { data: storico = { fatture: [], riferimenti: "" } } = useQuery({
    queryKey: ["conti-righe-del-fornitore", companyId, fatturaId, fornitorePiva],
    enabled: !!companyId && !!fornitorePiva && contiDelPiano.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ fatture: FatturaStorica[]; riferimenti: string }> => {
      const [passate, questa] = await Promise.all([
        supabase.from("fatture_ricevute").select("righe, conti_righe")
          .eq("company_id", companyId).eq("cedente_piva", fornitorePiva!).neq("id", fatturaId)
          .order("data_fattura", { ascending: false }).limit(40),
        supabase.from("fatture_ricevute").select("xml_raw").eq("id", fatturaId).eq("company_id", companyId).maybeSingle(),
      ]);
      if (passate.error) throw passate.error;
      if (questa.error) throw questa.error;
      const fatture: FatturaStorica[] = (passate.data ?? []).map((f) => {
        const conti = (f.conti_righe ?? {}) as Record<string, string>;
        const righeF = Array.isArray(f.righe) ? (f.righe as Array<{ numero_linea?: unknown; descrizione?: unknown }>) : [];
        return { righe: righeF.map((r, i) => {
          const chiave = r.numero_linea != null && String(r.numero_linea).trim() !== "" ? String(r.numero_linea).trim() : String(i + 1);
          const conto = conti[chiave];
          return { descrizione: String(r.descrizione ?? ""), conto: conto && VALORE_CONTO.test(conto) ? conto : null };
        }) };
      });
      // I riferimenti della fattura: contratto, ordine, convenzione (dove le società di leasing mettono il numero).
      const xml = typeof questa.data?.xml_raw === "string" ? questa.data.xml_raw : "";
      const riferimenti = Array.from(xml.matchAll(/<(?:IdDocumento|RiferimentoTesto|CodiceCommessaConvenzione|Causale)>([^<]{3,200})</g), (m) => m[1]).join(" ");
      return { fatture, riferimenti };
    },
  });
  // Le righe già classificate a mano nelle altre fatture dell'azienda (24/11/2026): la scelta fatta
  // su un articolo vale per lo stesso articolo nelle fatture dopo, prima delle regole sulle parole.
  // Una lettura per azienda (non per fattura aperta): la fattura corrente si toglie dopo.
  const { data: scelteInAzienda = [] } = useQuery({
    queryKey: ["conti-righe-scelti-in-azienda", companyId],
    enabled: !!companyId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Array<SceltaPassata & { fattura: string }>> => {
      const { data, error } = await supabase.from("fatture_ricevute").select("id, cedente_piva, righe, conti_righe")
        .eq("company_id", companyId).neq("conti_righe", "{}")
        .order("updated_at", { ascending: false }).limit(150);
      if (error) throw error;
      return (data ?? []).flatMap((f) => {
        const conti = (f.conti_righe ?? {}) as Record<string, string>;
        const righeF = Array.isArray(f.righe) ? (f.righe as Array<{ numero_linea?: unknown; descrizione?: unknown }>) : [];
        return righeF.flatMap((r, i) => {
          const conto = conti[chiaveRiga(r, i)];
          return conto ? [{ fattura: String(f.id), fornitore: f.cedente_piva ? String(f.cedente_piva) : null, descrizione: String(r?.descrizione ?? ""), conto }] : [];
        });
      });
    },
  });
  const scelteFatte = useMemo(() => scelteInAzienda.filter((s) => s.fattura !== fatturaId), [scelteInAzienda, fatturaId]);
  const proposte = useMemo(() => {
    const m: Record<string, string> = {};
    // Con il piano dei conti: il conto del contratto o quello delle fatture passate del fornitore.
    const dalPiano = contiDelPiano.length > 0
      ? proposteDalPiano({ righe, riferimenti: storico.riferimenti, conti: contiDelPiano, storico: storico.fatture }) : {};
    const valido = (v: string) => {
      const c = VALORE_CONTO.exec(v);
      return c ? contiDelPiano.length > 0 && perId.has(c[1]) && !!perId.get(c[1])?.movimentabile : categorie.includes(v);
    };
    const dalleScelte = proposteDalleScelte({ righe, fornitore: fornitorePiva, scelte: scelteFatte, disponibili: valido });
    for (const r of righe) {
      if (scelti[r.chiave]) continue;
      const p = dalPiano[r.chiave] ?? dalleScelte[r.chiave] ?? contoPropostoRiga(r.descrizione, categorie);
      if (p) m[r.chiave] = p;
    }
    return m;
  }, [righe, scelti, categorie, contiDelPiano, storico, scelteFatte, fornitorePiva, perId]);

  const salva = async () => {
    if (!corrente || corrente.salvata || invio.current || uguali(corrente.valori, corrente.base)) return;
    invio.current = true;
    setSalvando(true);
    try {
      // Conti e scrittura contabile cambiano nella stessa transazione. Un conflitto
      // o un errore del giornale lascia entrambi come prima e conserva la bozza.
      const { error } = await supabase.rpc("contabilita_salva_conti_fattura" as never, {
        p_fattura: fatturaId, p_conti: corrente.valori, p_precedenti: corrente.base,
      } as never);
      if (error) throw error;
      setBozza({ ...corrente, salvata: true });
      toast.success(t("Conti della fattura salvati"));
      onCambiato();
      void qc.invalidateQueries({ queryKey: ["contabilita-generale", companyId] });
    } catch (e) {
      toast.error(t("Conto della riga non salvato"), { description: e instanceof Error ? e.message : String(e) });
    } finally {
      invio.current = false;
      setSalvando(false);
    }
  };

  /** Il testo di un valore: «codice descrizione» per un conto del piano, l'etichetta per una categoria. */
  const etichetta = (valore: string): string => {
    const m = VALORE_CONTO.exec(valore);
    if (!m) return etichettaCategoria(valore);
    const c = perId.get(m[1]);
    return c ? `${c.codice} ${c.descrizione}` : t("Conto del piano");
  };

  const cambia = (chiave: string, valore: string | null): void => {
    setBozza((prima) => {
      const attuale = prima?.id === fatturaId && (!prima.salvata || uguali(salvati, prima.base)) ? prima : null;
      const nuovi = { ...(attuale?.valori ?? salvati) };
      if (valore) nuovi[chiave] = valore; else delete nuovi[chiave];
      return { id: fatturaId, base: attuale && !attuale.salvata ? attuale.base : { ...(attuale?.valori ?? salvati) }, valori: nuovi, salvata: false };
    });
  };

  return {
    categorie,
    salvando,
    modificati: !!corrente && !corrente.salvata && !uguali(corrente.valori, corrente.base),
    salva: (): void => { void salva(); },
    annulla: (): void => { setBozza(null); },
    /** «piano»: si scelgono i conti di costo del piano dei conti; «categorie»: le categorie di costo. */
    modo: contiDelPiano.length > 0 ? ("piano" as const) : ("categorie" as const),
    contiDelPiano,
    mastriDelPiano,
    etichetta,
    /** Il conto da mostrare: quello scelto, altrimenti la proposta. */
    valore: (chiave: string): string | null => scelti[chiave] ?? proposte[chiave] ?? null,
    proposto: (chiave: string): boolean => !scelti[chiave] && !!proposte[chiave],
    quanteProposte: Object.keys(proposte).length,
    cambia,
    confermaProposte: (): void => setBozza({ id: fatturaId, base: corrente && !corrente.salvata ? corrente.base : { ...scelti }, valori: { ...proposte, ...scelti }, salvata: false }),
    /** Crea un conto di costo nel piano (sotto un mastro di costo) e lo mette sulla riga. */
    creaConto: async (chiave: string, nuovo: { codice: string; descrizione: string; mastroId: string }): Promise<boolean> => {
      const mastro = perId.get(nuovo.mastroId);
      const { data, error } = await supabase.rpc("contabilita_crea_conto", {
        p_company: companyId, p_codice: nuovo.codice.trim(), p_descrizione: nuovo.descrizione.trim(), p_natura: "costo",
        p_sezione_cee: "CE", p_voce_cee: mastro?.voce_cee ?? "", p_mastro: nuovo.mastroId,
      });
      if (error || !data) {
        toast.error(t("Conto non creato"), { description: error?.message ?? t("Il database non ha restituito il conto.") });
        return false;
      }
      toast.success(t("Conto {codice} creato nel piano dei conti", { codice: nuovo.codice.trim() }));
      await qc.invalidateQueries({ queryKey: chiavePiano });
      cambia(chiave, valoreDelConto(data));
      return true;
    },
  };
}

type ContiRighe = ReturnType<typeof useContiRighe>;

export function ContoRigaMenu({ chiave, conti }: { chiave: string; conti: ContiRighe }) {
  return conti.modo === "piano" ? <ContoDelPianoMenu chiave={chiave} conti={conti} /> : <CategoriaMenu chiave={chiave} conti={conti} />;
}

function CategoriaMenu({ chiave, conti }: { chiave: string; conti: ContiRighe }) {
  const t = useT();
  const v = conti.valore(chiave);
  const proposto = conti.proposto(chiave);
  return (
    <Select value={v ?? DELLA_FATTURA} disabled={conti.salvando}
      onValueChange={(x) => conti.cambia(chiave, x === DELLA_FATTURA ? null : x)}>
      <SelectTrigger aria-label={t("Conto di costo della riga")} title={proposto ? t("Proposto dalla descrizione: conferma o cambia") : undefined}
        className={`h-7 w-full min-w-[9rem] text-xs ${proposto ? "border-dashed italic text-muted-foreground" : ""}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={DELLA_FATTURA}>{t("Conto della fattura")}</SelectItem>
        {/* Un conto del piano scelto quando la contabilità generale era accesa: resta leggibile. */}
        {v && VALORE_CONTO.test(v) ? <SelectItem value={v}>{conti.etichetta(v)}</SelectItem> : null}
        {conti.categorie.map((c) => <SelectItem key={c} value={c}>{etichettaCategoria(c)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** I conti di costo del piano, con la ricerca, e «Nuovo conto di costo». */
function ContoDelPianoMenu({ chiave, conti }: { chiave: string; conti: ContiRighe }) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const [nuovo, setNuovo] = useState(false);
  const v = conti.valore(chiave);
  const proposto = conti.proposto(chiave);
  const testo = v ? conti.etichetta(v) : t("Conto della fattura");
  const scegli = (valore: string | null) => { setAperto(false); conti.cambia(chiave, valore); };
  return (
    <>
      <Popover open={aperto} onOpenChange={setAperto}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={aperto} aria-label={t("Conto di costo della riga")} disabled={conti.salvando}
            title={proposto ? t("Proposto (dal contratto, dalle fatture passate del fornitore o dalla descrizione): conferma o cambia") : testo}
            className={cn("h-7 w-full min-w-[9rem] justify-between px-2 text-xs font-normal", proposto && "border-dashed italic text-muted-foreground")}>
            <span className="truncate">{testo}</span>
            <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        {/* Senza Portal: dentro la scheda della fattura la ricerca deve prendere il cursore. */}
        <PopoverPrimitive.Content align="start" sideOffset={4} onEscapeKeyDown={() => setAperto(false)}
          className="z-50 w-[min(26rem,calc(100vw-2rem))] rounded-md border bg-popover p-0 text-popover-foreground shadow-md outline-none">
          <Command>
            <CommandInput placeholder={t("Cerca codice o descrizione…")} className="h-8 text-xs" />
            <CommandList className="max-h-72">
              <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">{t("Nessun conto: crealo qui sotto.")}</CommandEmpty>
              <CommandGroup>
                <CommandItem value="conto della fattura" onSelect={() => scegli(null)} className="text-xs">
                  <Check className={cn("mr-2 h-3.5 w-3.5", !v ? "opacity-100" : "opacity-0")} />{t("Conto della fattura")}
                </CommandItem>
                {conti.contiDelPiano.map((c) => (
                  <CommandItem key={c.id} value={`${c.codice} ${c.descrizione}`} onSelect={() => scegli(valoreDelConto(c.id))} className="text-xs">
                    <Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", v === valoreDelConto(c.id) ? "opacity-100" : "opacity-0")} />
                    <span className="mr-2 font-mono text-muted-foreground">{c.codice}</span><span className="truncate">{c.descrizione}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup>
                <CommandItem value="nuovo conto di costo" onSelect={() => { setAperto(false); setNuovo(true); }} className="text-xs font-medium">
                  <Plus className="mr-2 h-3.5 w-3.5" />{t("Nuovo conto di costo")}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverPrimitive.Content>
      </Popover>
      {nuovo && <NuovoContoDiCosto conti={conti} onChiudi={() => setNuovo(false)} onCrea={(d) => conti.creaConto(chiave, d)} />}
    </>
  );
}

function NuovoContoDiCosto({ conti, onChiudi, onCrea }: {
  conti: ContiRighe;
  onChiudi: () => void;
  onCrea: (d: { codice: string; descrizione: string; mastroId: string }) => Promise<boolean>;
}) {
  const t = useT();
  const [codice, setCodice] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [mastro, setMastro] = useState(conti.mastriDelPiano[0]?.id ?? "");
  const [inCorso, setInCorso] = useState(false);
  const doppio = conti.contiDelPiano.some((c) => c.codice === codice.trim());
  // Il mastro serve: dice dove sta il conto nel bilancio (e la sua voce CEE).
  const pronto = !!codice.trim() && !!descrizione.trim() && !!mastro && !doppio && !inCorso;
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !inCorso) onChiudi(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t("Nuovo conto di costo")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t("Nasce nel piano dei conti, sotto il mastro scelto, e va subito su questa riga. Lo ritrovi in Contabilità generale → Piano dei conti.")}</p>
          {conti.mastriDelPiano.length > 0 ? (
            <div className="space-y-1">
              <Label>{t("Mastro")}</Label>
              <Select value={mastro} onValueChange={setMastro}>
                <SelectTrigger aria-label={t("Mastro")}><SelectValue /></SelectTrigger>
                <SelectContent>{conti.mastriDelPiano.map((m) => <SelectItem key={m.id} value={m.id}>{m.codice} {m.descrizione}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ) : <p role="alert" className="text-xs text-destructive">{t("Il piano dei conti non ha mastri di costo: crea il conto da Contabilità generale → Piano dei conti.")}</p>}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1"><Label htmlFor="nuovo-conto-codice">{t("Codice")}</Label><Input id="nuovo-conto-codice" value={codice} onChange={(e) => setCodice(e.target.value)} /></div>
            <div className="col-span-2 space-y-1"><Label htmlFor="nuovo-conto-descrizione">{t("Descrizione")}</Label><Input id="nuovo-conto-descrizione" value={descrizione} onChange={(e) => setDescrizione(e.target.value)} /></div>
          </div>
          {doppio && <p role="alert" className="text-xs text-destructive">{t("Il codice {codice} c'è già nel piano dei conti.", { codice: codice.trim() })}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={inCorso} onClick={onChiudi}>{t("Annulla")}</Button>
          <Button disabled={!pronto} onClick={async () => {
            setInCorso(true);
            const ok = await onCrea({ codice, descrizione, mastroId: mastro });
            setInCorso(false);
            if (ok) onChiudi();
          }}>{t("Crea e usa")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Sopra le righe: quante hanno un conto proposto, e il pulsante per confermarle tutte. */
export function ProposteContiRighe({ conti }: { conti: ContiRighe }) {
  const t = useT();
  if (conti.quanteProposte === 0 && !conti.modificati) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground">
      <span aria-live="polite">{conti.modificati ? t("Conti modificati: salva insieme tutte le righe della fattura.") : t("{quanteProposte} righe hanno un conto proposto, da confermare.", { quanteProposte: conti.quanteProposte })}</span>
      <div className="flex flex-wrap gap-2">
        {conti.quanteProposte > 0 && <Button size="sm" variant="outline" disabled={conti.salvando} onClick={conti.confermaProposte}>{t("Usa le proposte")}</Button>}
        {conti.modificati && <><Button size="sm" variant="outline" disabled={conti.salvando} onClick={conti.annulla}>{t("Annulla modifiche ai conti")}</Button><Button size="sm" disabled={conti.salvando} onClick={conti.salva}>{conti.salvando ? t("Salvataggio…") : t("Salva conti della fattura")}</Button></>}
      </div>
    </div>
  );
}
