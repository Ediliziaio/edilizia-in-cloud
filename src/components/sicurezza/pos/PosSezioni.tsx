import { EsitiDalRapportoRumore } from "./EsitiDalRapportoRumore";
import { EmergenzeDalPsc } from "./EmergenzeDalPsc";
import { fontiEmergenzeDaRiesaminare, normalizzaFontiEmergenzePsc, testoIndicazioniEmergenza } from "../../../../supabase/functions/_shared/posEmergenzePsc";
import { LetturaOcrPsc, type ContestoLetturaPsc } from "./LetturaOcrPsc";
import { apriFileRiservato } from "@/lib/storagePrivato";
import { CAMPI_EMERGENZE_POS, dpiPrevistiPos, type CampoEmergenzePos } from "../../../../supabase/functions/_shared/posEvidenzeOperative";
import { apriRapportoRumorePos, ConsegneDpiLavorazionePos, ScegliRapportoRumorePos } from "./EvidenzeOperativePos";
import { ProgrammaDemolizioniPos } from "./ProgrammaDemolizioniPos";
import type { RiferimentoPsc } from "../../../../supabase/functions/_shared/posPsc";
import { CatalogoSchedeStandardPos, QuesitiSchedaPos, RiferimentiSchedaPos, TestiStandardLavorazionePos } from "./SchedeStandardPos";
import { inserisciTestiLavorazione } from "@/lib/sicurezza/testiLavorazionePos";
import { chiaviFontiLavorazionePos, ocrPscDaConfermare, pscSchedaDaRiesaminare } from "../../../../supabase/functions/_shared/posFontiScheda";
import { UniformSelect } from "@/components/ui/uniform-select";
import {RiferimentoPscPos} from "./RiferimentoPscPos";
import {SegnaleticaLavorazionePos} from "./SegnaleticaLavorazionePos";
import { RequisitiLavorazionePos } from "./RequisitiLavorazionePos";
import { cambiaNominativoFormazione } from "../../../../supabase/functions/_shared/posAddetti";
import { TecnicaLavorazionePos } from "./TecnicaLavorazionePos";
/**
 * Le sezioni dell'editor del POS, nell'ordine del modello semplificato del
 * DI 9/9/2014 (Allegato I). Ogni sezione modifica la bozza con `modifica`,
 * che lavora su una copia: niente mutazioni dello stato di React.
 */
import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, ChevronDown, Copy, ExternalLink, Loader2, Paperclip, Plus, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Area, Campo, Riga, Sezione } from "./campi";
import {
  ALLEGATO_LABEL, GESTIONE_EMERGENZE_LABEL, RIFERIMENTI_SEZIONE, RSPP_LABEL, RUOLO_IMPRESA_LABEL, SVOLGIMENTO_LABEL,
  applicaValutazione, lavorazioneVuota, soggettoVuoto, titoloDemolizionePos, valutazioneDaElenchi, vociMancanti,
  type GestioneEmergenze, type Lavorazione, type PosContenuto, type RsppSvoltoDa, type RuoloImpresa, type Svolgimento,
  type AllegatoPos, type TipoAllegato, type VoceMancante,
} from "../../../../supabase/functions/_shared/posModello";
import type { ContestoPos } from "../../../../supabase/functions/_shared/posModello";
import { caricaAllegatoPos, linkAllegatoPos } from "@/hooks/usePos";
import { RisorseNonPrevistePos } from "./RisorseNonPrevistePos";
import { FasiDaCommessaPos } from "./FasiDaCommessaPos";
import { TestiOrganizzazionePos } from "./TestiOrganizzazionePos";

import { ProdottiLavorazionePos } from "./ProdottiLavorazionePos";
import { FunzioniAvanzatePos } from "./FunzioniAvanzatePos";
import { RischiLavorazionePos } from "./RischiLavorazionePos";
import { invalidaProdottiLavorazione } from "../../../../supabase/functions/_shared/posProdotti";
export type Modifica = (fn: (d: PosContenuto) => void) => void;

interface BaseProps {
  d: PosContenuto;
  modifica: Modifica;
  ro: boolean;
  mancanti: number;
}

const nuovoId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `l${Date.now()}`);

// ── 1. Opera e committente ───────────────────────────────────────────────────

export function SezioneOpera({ d, modifica, ro, mancanti }: BaseProps) {
  const o = d.opera;
  return (
    <Sezione id="opera" numero={1} titolo="Opera, committente e cantiere" riferimento={`punto 3.2.1 e ${RIFERIMENTI_SEZIONE.opera}`} mancanti={mancanti}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="comm-nome" label="Committente: cognome e nome o ragione sociale" value={o.committente.nominativo} readOnly={ro}
          onChange={(v) => modifica((x) => { x.opera.committente.nominativo = v; })} />
        <Campo id="comm-cf" label="Committente: codice fiscale" value={o.committente.codice_fiscale} readOnly={ro}
          onChange={(v) => modifica((x) => { x.opera.committente.codice_fiscale = v; })} />
        <Campo id="comm-ind" label="Committente: indirizzo" value={o.committente.indirizzo} readOnly={ro} className="sm:col-span-2"
          onChange={(v) => modifica((x) => { x.opera.committente.indirizzo = v; })} />
        <Campo id="comm-tel" label="Committente: telefono" type="tel" value={o.committente.telefono} readOnly={ro}
          onChange={(v) => modifica((x) => { x.opera.committente.telefono = v; })} />
        <Campo id="comm-mail" label="Committente: e-mail" type="email" value={o.committente.email} readOnly={ro}
          onChange={(v) => modifica((x) => { x.opera.committente.email = v; })} />
      </div>

      <div className="flex items-center gap-2">
        <Switch id="resp-lavori" checked={!!o.responsabile_lavori} disabled={ro}
          onCheckedChange={(on) => modifica((x) => { x.opera.responsabile_lavori = on ? soggettoVuoto() : null; })} />
        <Label htmlFor="resp-lavori" className="text-sm">Il committente ha nominato un responsabile dei lavori</Label>
      </div>
      {o.responsabile_lavori && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo id="rl-nome" label="Responsabile dei lavori: cognome e nome" value={o.responsabile_lavori.nominativo} readOnly={ro}
            onChange={(v) => modifica((x) => { if (x.opera.responsabile_lavori) x.opera.responsabile_lavori.nominativo = v; })} />
          <Campo id="rl-cf" label="Codice fiscale" value={o.responsabile_lavori.codice_fiscale} readOnly={ro}
            onChange={(v) => modifica((x) => { if (x.opera.responsabile_lavori) x.opera.responsabile_lavori.codice_fiscale = v; })} />
          <Campo id="rl-ind" label="Indirizzo" value={o.responsabile_lavori.indirizzo} readOnly={ro} className="sm:col-span-2"
            onChange={(v) => modifica((x) => { if (x.opera.responsabile_lavori) x.opera.responsabile_lavori.indirizzo = v; })} />
          <Campo id="rl-tel" label="Telefono" type="tel" value={o.responsabile_lavori.telefono} readOnly={ro}
            onChange={(v) => modifica((x) => { if (x.opera.responsabile_lavori) x.opera.responsabile_lavori.telefono = v; })} />
          <Campo id="rl-mail" label="E-mail" type="email" value={o.responsabile_lavori.email} readOnly={ro}
            onChange={(v) => modifica((x) => { if (x.opera.responsabile_lavori) x.opera.responsabile_lavori.email = v; })} />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-6">
        <Campo id="cant-via" label="Cantiere: via e numero" value={o.cantiere.via} readOnly={ro} className="sm:col-span-3"
          onChange={(v) => modifica((x) => { x.opera.cantiere.via = v; })} />
        <Campo id="cant-loc" label="Località" value={o.cantiere.localita} readOnly={ro} className="sm:col-span-2"
          onChange={(v) => modifica((x) => { x.opera.cantiere.localita = v; })} />
        <Campo id="cant-prov" label="Provincia" value={o.cantiere.provincia} readOnly={ro}
          onChange={(v) => modifica((x) => { x.opera.cantiere.provincia = v.toUpperCase().slice(0, 2); })} />
        <Campo id="data-inizio" label="Inizio lavori" type="date" value={o.data_inizio} readOnly={ro} className="sm:col-span-3"
          onChange={(v) => modifica((x) => { x.opera.data_inizio = v; })} />
        <Campo id="data-fine" label="Fine lavori prevista" type="date" value={o.data_fine} readOnly={ro} className="sm:col-span-3"
          onChange={(v) => modifica((x) => { x.opera.data_fine = v; })} />
      </div>

      <Area id="descr-att" label="Descrizione sintetica delle attività che saranno svolte in cantiere" rows={3} value={o.descrizione_attivita} readOnly={ro}
        onChange={(v) => modifica((x) => { x.opera.descrizione_attivita = v; })} />
      {!ro && <TestiOrganizzazionePos turniPresenti={!!o.turni_lavoro.trim()} onInserisci={(righe, turni) => modifica(x => {
        const precedenti = x.opera.modalita_organizzative.trim();
        const esistenti = new Set(precedenti.split("\n").map(riga => riga.trim()));
        const nuove = righe.filter(riga => !esistenti.has(riga));
        if (nuove.length) x.opera.modalita_organizzative = [precedenti, ...nuove].filter(Boolean).join("\n");
        if (turni && !x.opera.turni_lavoro.trim()) x.opera.turni_lavoro = turni;
      })} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Area id="mod-org" label="Modalità organizzative" rows={3} value={o.modalita_organizzative} readOnly={ro}
          placeholder="Es.: accesso al cantiere dal cancello su via…, area di stoccaggio materiali nel cortile, servizi igienici chimici, orari di consegna"
          onChange={(v) => modifica((x) => { x.opera.modalita_organizzative = v; })} />
        <Area id="turni" label="Turni di lavoro" rows={3} value={o.turni_lavoro} readOnly={ro}
          placeholder="Es.: turno unico diurno, 8:00-12:00 e 13:00-17:00, dal lunedì al venerdì"
          onChange={(v) => modifica((x) => { x.opera.turni_lavoro = v; })} />
      </div>
      {o.modalita_organizzative_da_verificare && (
        <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <Checkbox checked={false} disabled={ro} onCheckedChange={(c) => c === true && modifica((x) => { x.opera.modalita_organizzative_da_verificare = false; })} />
          Le modalità organizzative le ha proposte l'AI: le ho rilette e adattate a questo cantiere.
        </label>
      )}
    </Sezione>
  );
}

// ── 2. Impresa ───────────────────────────────────────────────────────────────

export function SezioneImpresa({ d, modifica, ro, mancanti }: BaseProps) {
  const i = d.impresa;
  const recapito = (chiave: "sede_legale" | "sede_operativa" | "uffici_cantiere", titolo: string, hint?: string) => (
    <div className="grid gap-3 sm:grid-cols-3">
      <Campo id={`${chiave}-ind`} label={`${titolo}: indirizzo`} value={i[chiave].indirizzo} readOnly={ro} hint={hint}
        onChange={(v) => modifica((x) => { x.impresa[chiave].indirizzo = v; })} />
      <Campo id={`${chiave}-tel`} label="Telefono" type="tel" value={i[chiave].telefono} readOnly={ro}
        onChange={(v) => modifica((x) => { x.impresa[chiave].telefono = v; })} />
      <Campo id={`${chiave}-mail`} label="E-mail" type="email" value={i[chiave].email} readOnly={ro}
        onChange={(v) => modifica((x) => { x.impresa[chiave].email = v; })} />
    </div>
  );
  return (
    <Sezione id="impresa" numero={2} titolo="Dati identificativi dell'impresa" riferimento={RIFERIMENTI_SEZIONE.impresa} mancanti={mancanti}>
      <RadioGroup value={i.ruolo} disabled={ro} className="grid gap-2 sm:grid-cols-3"
        onValueChange={(v) => modifica((x) => { x.impresa.ruolo = v as RuoloImpresa; })}>
        {(Object.keys(RUOLO_IMPRESA_LABEL) as RuoloImpresa[]).map((r) => (
          <Label key={r} htmlFor={`ruolo-${r}`} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm font-normal">
            <RadioGroupItem id={`ruolo-${r}`} value={r} />
            {RUOLO_IMPRESA_LABEL[r]}
          </Label>
        ))}
      </RadioGroup>
      {i.ruolo === "esecutrice_subappalto" && (
        <Campo id="sub-a" label="In subappalto a (impresa affidataria)" value={i.subappalto_a} readOnly={ro}
          onChange={(v) => modifica((x) => { x.impresa.subappalto_a = v; })} />
      )}
      <div className="flex items-center gap-2">
        <Switch id="oltre-200" checked={i.durata_oltre_200_giorni} disabled={ro}
          onCheckedChange={(on) => modifica((x) => { x.impresa.durata_oltre_200_giorni = on; })} />
        <Label htmlFor="oltre-200" className="text-sm">Le attività dell'impresa in questo cantiere durano più di 200 giorni</Label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo id="rag-soc" label="Ragione sociale" value={i.ragione_sociale} readOnly={ro} className="sm:col-span-2"
          onChange={(v) => modifica((x) => { x.impresa.ragione_sociale = v; })} />
        <Campo id="piva" label="Partita IVA" value={i.partita_iva} readOnly={ro}
          onChange={(v) => modifica((x) => { x.impresa.partita_iva = v; })} />
        <Campo id="datore" label="Datore di lavoro" value={i.datore_lavoro} readOnly={ro} className="sm:col-span-3"
          onChange={(v) => modifica((x) => { x.impresa.datore_lavoro = v; })} />
      </div>
      {recapito("sede_legale", "Sede legale")}
      {recapito("sede_operativa", "Sede operativa", "Vuota: nel POS risulta uguale alla sede legale.")}
      {recapito("uffici_cantiere", "Uffici di cantiere", "Vuoti: nel POS risultano non previsti.")}
    </Sezione>
  );
}

// ── 3. Figure ────────────────────────────────────────────────────────────────

export function SezioneFigure({ d, modifica, ro, mancanti }: BaseProps) {
  return (
    <Sezione id="figure" numero={3} titolo="Dirigenti, preposti, RSPP, medico competente e RLS" riferimento={RIFERIMENTI_SEZIONE.figure} mancanti={mancanti}
      descrizione="Arrivano dalle Figure della sicurezza dell'impresa. Qui le adatti a questo cantiere; per ognuna servono le mansioni di sicurezza (lettera b).">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Dirigenti</h3>
          {!ro && (
            <Button size="sm" variant="outline" onClick={() => modifica((x) => { x.dirigenti.push({ nominativo: "", ruolo: "direttore_tecnico", mansioni_sicurezza: "" }); })}>
              <Plus className="mr-1 h-4 w-4" />Aggiungi
            </Button>
          )}
        </div>
        {d.dirigenti.length === 0 && <p className="text-xs text-muted-foreground">Serve almeno il direttore tecnico di cantiere.</p>}
        {d.dirigenti.map((x, n) => (
          <Riga key={`dir-${n}`} readOnly={ro} etichettaRimuovi={`Togli il dirigente ${x.nominativo || n + 1}`} onRemove={() => modifica((y) => { y.dirigenti.splice(n, 1); })}>
            <div className="grid gap-3 pr-10 sm:grid-cols-2">
              <Campo id={`dir-${n}-nome`} label="Nominativo" value={x.nominativo} readOnly={ro} onChange={(v) => modifica((y) => { y.dirigenti[n].nominativo = v; })} />
              <div className="space-y-1">
                <Label className="text-xs font-medium text-slate-700">Ruolo</Label>
                <Select value={x.ruolo} disabled={ro} onValueChange={(v) => modifica((y) => { y.dirigenti[n].ruolo = v as typeof x.ruolo; })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direttore_tecnico">Direttore tecnico di cantiere</SelectItem>
                    <SelectItem value="incaricato_art97">Incaricato dell'affidataria (art. 97)</SelectItem>
                    <SelectItem value="altro">Altro dirigente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Area id={`dir-${n}-mans`} label="Mansioni di sicurezza in cantiere" rows={2} value={x.mansioni_sicurezza} readOnly={ro} className="sm:col-span-2"
                onChange={(v) => modifica((y) => { y.dirigenti[n].mansioni_sicurezza = v; })} />
            </div>
          </Riga>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Preposti</h3>
          {!ro && (
            <Button size="sm" variant="outline" onClick={() => modifica((x) => { x.preposti.push({ nominativo: "", ruolo: "capocantiere", ruolo_altro: "", mansioni_sicurezza: "" }); })}>
              <Plus className="mr-1 h-4 w-4" />Aggiungi
            </Button>
          )}
        </div>
        {d.preposti.length === 0 && <p className="text-xs text-muted-foreground">Serve almeno il capocantiere.</p>}
        {d.preposti.map((x, n) => (
          <Riga key={`pre-${n}`} readOnly={ro} etichettaRimuovi={`Togli il preposto ${x.nominativo || n + 1}`} onRemove={() => modifica((y) => { y.preposti.splice(n, 1); })}>
            <div className="grid gap-3 pr-10 sm:grid-cols-2">
              <Campo id={`pre-${n}-nome`} label="Nominativo" value={x.nominativo} readOnly={ro} onChange={(v) => modifica((y) => { y.preposti[n].nominativo = v; })} />
              <div className="space-y-1">
                <Label className="text-xs font-medium text-slate-700">Ruolo</Label>
                <Select value={x.ruolo} disabled={ro} onValueChange={(v) => modifica((y) => { y.preposti[n].ruolo = v as typeof x.ruolo; })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="capocantiere">Capo cantiere</SelectItem>
                    <SelectItem value="incaricato_art97">Incaricato dell'affidataria (art. 97)</SelectItem>
                    <SelectItem value="altro">Altro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {x.ruolo === "altro" && (
                <Campo id={`pre-${n}-altro`} label="Quale ruolo" value={x.ruolo_altro} readOnly={ro} onChange={(v) => modifica((y) => { y.preposti[n].ruolo_altro = v; })} />
              )}
              <Area id={`pre-${n}-mans`} label="Mansioni di sicurezza in cantiere" rows={2} value={x.mansioni_sicurezza} readOnly={ro} className="sm:col-span-2"
                onChange={(v) => modifica((y) => { y.preposti[n].mansioni_sicurezza = v; })} />
            </div>
          </Riga>
        ))}
      </div>

      <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
        <h3 className="text-sm font-semibold sm:col-span-2">Responsabile del servizio di prevenzione e protezione (RSPP)</h3>
        <div className="space-y-1">
          <Label htmlFor="pos-rspp-svolto-da" className="text-xs font-medium text-slate-700">Il ruolo è svolto da</Label>
          <Select value={d.rspp.svolto_da} disabled={ro} onValueChange={(v) => modifica((y) => {
            y.rspp.svolto_da = v as RsppSvoltoDa;
            if (v === "datore" && !y.rspp.nominativo) y.rspp.nominativo = y.impresa.datore_lavoro;
          })}>
            <SelectTrigger id="pos-rspp-svolto-da" className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(RSPP_LABEL) as RsppSvoltoDa[]).map((k) => <SelectItem key={k} value={k}>{RSPP_LABEL[k]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Campo id="rspp-nome" label="Nominativo" value={d.rspp.nominativo} readOnly={ro} onChange={(v) => modifica((y) => { y.rspp.nominativo = v; })} />
        <Area id="rspp-mans" label="Mansioni di sicurezza in cantiere" rows={2} value={d.rspp.mansioni_sicurezza} readOnly={ro} className="sm:col-span-2"
          onChange={(v) => modifica((y) => { y.rspp.mansioni_sicurezza = v; })} />
      </div>

      <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-2 sm:col-span-2">
          <h3 className="text-sm font-semibold">Medico competente</h3>
          <div className="flex items-center gap-2">
            <Switch id="medico-previsto" checked={d.medico_competente.previsto} disabled={ro}
              onCheckedChange={(on) => modifica((y) => { y.medico_competente.previsto = on; })} />
            <Label htmlFor="medico-previsto" className="text-xs">Previsto (sorveglianza sanitaria)</Label>
          </div>
        </div>
        {d.medico_competente.previsto && (
          <>
            <Campo id="medico-nome" label="Nominativo" value={d.medico_competente.nominativo} readOnly={ro} onChange={(v) => modifica((y) => { y.medico_competente.nominativo = v; })} />
            <Area id="medico-mans" label="Mansioni di sicurezza in cantiere" rows={2} value={d.medico_competente.mansioni_sicurezza} readOnly={ro}
              onChange={(v) => modifica((y) => { y.medico_competente.mansioni_sicurezza = v; })} />
          </>
        )}
      </div>

      <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
        <h3 className="text-sm font-semibold sm:col-span-2">Rappresentante dei lavoratori per la sicurezza</h3>
        <div className="space-y-1">
          <Label htmlFor="pos-rls-tipo" className="text-xs font-medium text-slate-700">Tipo</Label>
          <Select value={d.rls.tipo} disabled={ro} onValueChange={(v) => modifica((y) => { y.rls.tipo = v as "rls" | "rlst"; })}>
            <SelectTrigger id="pos-rls-tipo" className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rls">RLS aziendale</SelectItem>
              <SelectItem value="rlst">RLST territoriale</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Campo id="rls-nome" label="Nominativo" value={d.rls.nominativo} readOnly={ro} onChange={(v) => modifica((y) => { y.rls.nominativo = v; })} />
        <Area id="rls-mans" label="Mansioni di sicurezza in cantiere" rows={2} value={d.rls.mansioni_sicurezza} readOnly={ro} className="sm:col-span-2"
          onChange={(v) => modifica((y) => { y.rls.mansioni_sicurezza = v; })} />
      </div>
    </Sezione>
  );
}

// ── 4. Emergenze ─────────────────────────────────────────────────────────────

export function SezioneEmergenze({ d, modifica, ro, mancanti, lettura }: BaseProps & { lettura?: ContestoLetturaPsc }) {
  const e = d.emergenze;
  const superate = fontiEmergenzeDaRiesaminare(e.fonti_psc, e.piano, d.procedure_psc.psc_presente ? d.procedure_psc.documento : undefined);
  return (
    <Sezione id="emergenze" numero={4} titolo="Pronto soccorso, antincendio ed evacuazione" riferimento={RIFERIMENTI_SEZIONE.emergenze} mancanti={mancanti}
      descrizione="Se c'è il PSC, controlla cosa prevede per emergenze, evacuazione e primo soccorso.">
      <RadioGroup value={e.gestione} disabled={ro} className="grid gap-2 sm:grid-cols-3"
        onValueChange={(v) => modifica((x) => { x.emergenze.gestione = v as GestioneEmergenze; })}>
        {(Object.keys(GESTIONE_EMERGENZE_LABEL) as GestioneEmergenze[]).map((g) => (
          <Label key={g} htmlFor={`gest-${g}`} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm font-normal">
            <RadioGroupItem id={`gest-${g}`} value={g} />
            {GESTIONE_EMERGENZE_LABEL[g]}
          </Label>
        ))}
      </RadioGroup>
      {e.gestione === "comune" && (
        <Campo id="imprese-comune" label="Imprese che gestiscono insieme le emergenze" value={e.imprese_gestione_comune} readOnly={ro}
          onChange={(v) => modifica((x) => { x.emergenze.imprese_gestione_comune = v; })} />
      )}
      {(!ro || e.piano) && <fieldset className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Organizzazione operativa delle emergenze</legend>
        {!ro && <p className="text-xs text-muted-foreground sm:col-span-2">Se una disposizione è nel PSC o nella planimetria, indica dove trovarla e come applicarla in cantiere.</p>}
        {!ro && lettura && <div className="sm:col-span-2">
          <EmergenzeDalPsc key={`${lettura.fonte.id}:${lettura.fonte.sha256}:${lettura.fonte.revisione}`} origine={lettura} piano={e.piano} fonti={e.fonti_psc} applica={proposte => modifica(x => {
            const psc = x.procedure_psc.documento;
            if (!x.procedure_psc.psc_presente || proposte.some(p => pscSchedaDaRiesaminare(p, psc))) return;
            const raggruppate = normalizzaFontiEmergenzePsc(Object.fromEntries(
              Object.keys(CAMPI_EMERGENZE_POS).map(k => [k, proposte.filter(p => p.campo === k)]),
            ));
            for (const [k, fonti] of Object.entries(raggruppate ?? {})) {
              const campo = k as CampoEmergenzePos;
              (x.emergenze.piano ??= {})[campo] = testoIndicazioniEmergenza(fonti);
              (x.emergenze.fonti_psc ??= {})[campo] = fonti;
            }
          })} />
        </div>}
        {(Object.entries(CAMPI_EMERGENZE_POS) as [CampoEmergenzePos, string][]).filter(([k]) => !ro || e.piano?.[k]).map(([k, label]) => {
          const fonti = e.fonti_psc?.[k], superata = superate.includes(k);
          return <div key={k} className={k === "allarme" || k === "planimetria" ? "sm:col-span-2" : undefined}>
            {fonti?.length ? <>
              <p className="mb-1 text-sm font-medium">{label}</p>
              <ul className="space-y-1">
                {fonti.map((fonte, i) => <li key={i} className="rounded-md border px-2.5 py-2 text-sm">
                  {fonte.fase && <p className="font-medium">{fonte.fase}</p>}
                  <p>{fonte.estratto}</p>
                  <p className={cn("mt-1 text-xs", superata ? "text-amber-800" : "text-muted-foreground")}>
                    {superata ? "Fonte da riesaminare · " : ""}PSC rev. {fonte.revisione} · pagina {fonte.pagina}{fonte.metodo === "ocr" ? " · OCR" : ""}
                  </p>
                </li>)}
              </ul>
              {!ro && <Button type="button" size="sm" variant="ghost" className="mt-1" onClick={() => modifica(x => {
                if (x.emergenze.fonti_psc) delete x.emergenze.fonti_psc[k];
              })}>Modifica come testo libero</Button>}
            </> : <Area id={`emergenza-${k}`} label={label} rows={2} value={e.piano?.[k] ?? ""} readOnly={ro}
              onChange={v => modifica(x => { (x.emergenze.piano ??= {})[k] = v; })} />}
          </div>;
        })}
      </fieldset>}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Lavoratori incaricati</h3>
        {!ro && (
          <Button size="sm" variant="outline" onClick={() => modifica((x) => { x.emergenze.addetti.push({ nominativo: "", antincendio: false, primo_soccorso: false, mansioni_sicurezza: "" }); })}>
            <Plus className="mr-1 h-4 w-4" />Aggiungi
          </Button>
        )}
      </div>
      {e.addetti.map((a, n) => (
        <Riga key={`add-${n}`} readOnly={ro} etichettaRimuovi={`Togli l'addetto ${a.nominativo || n + 1}`} onRemove={() => modifica((x) => { x.emergenze.addetti.splice(n, 1); })}>
          <div className="grid gap-3 pr-10 sm:grid-cols-2">
            <Campo id={`add-${n}-nome`} label="Nominativo" value={a.nominativo} readOnly={ro} onChange={(v) => modifica((x) => { x.emergenze.addetti[n].nominativo = v; })} />
            <div className="flex flex-col justify-end gap-2 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox checked={a.antincendio} disabled={ro} onCheckedChange={(c) => modifica((x) => { x.emergenze.addetti[n].antincendio = c === true; })} />
                Antincendio, evacuazione, salvataggio
              </label>
              <label className="flex items-center gap-2">
                <Checkbox checked={a.primo_soccorso} disabled={ro} onCheckedChange={(c) => modifica((x) => { x.emergenze.addetti[n].primo_soccorso = c === true; })} />
                Primo soccorso
              </label>
            </div>
            <Area id={`add-${n}-mans`} label="Mansioni di sicurezza in cantiere" rows={2} value={a.mansioni_sicurezza} readOnly={ro} className="sm:col-span-2"
              onChange={(v) => modifica((x) => { x.emergenze.addetti[n].mansioni_sicurezza = v; })} />
          </div>
        </Riga>
      ))}
    </Sezione>
  );
}

// ── 5. Lavoratori e autonomi ─────────────────────────────────────────────────

export function SezioneLavoratori({ d, modifica, ro, mancanti, organico, confronta }: BaseProps & {
  organico?: ContestoPos["organico"];
  confronta?: () => void;
}) {
  return (
    <Sezione id="lavoratori" numero={5} titolo="Lavoratori in cantiere per conto dell'impresa" riferimento={RIFERIMENTI_SEZIONE.lavoratori} mancanti={mancanti}>
      {!ro && organico && <details className="rounded-md border bg-muted/20 p-3">
        <summary className="cursor-pointer text-sm font-medium">Organico proposto dalla commessa · {organico.length}</summary>
        <ul className="mt-2 divide-y text-sm">
          {organico.map((p) => <li key={p.chiave} className="py-2">
            <p>{p.nome} · {p.qualifica}</p>
            <p className="text-xs text-muted-foreground">
              {[p.assegnato && "Assegnato alla commessa", p.daCampo && "App di cantiere",
                ...p.periodi.map(({ dal, al }) => `Pianificato ${dal} – ${al}`)].filter(Boolean).join(" · ")}
            </p>
          </li>)}
        </ul>
        {!organico.length && <p className="mt-2 text-xs text-muted-foreground">Nessun addetto recuperato dalle assegnazioni o dalla pianificazione.</p>}
        {confronta && <Button type="button" variant="link" size="sm" className="mt-1 h-auto p-0" onClick={confronta}>Confronta con i dati salvati nel POS</Button>}
      </details>}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Numero e qualifica dei lavoratori</h3>
          {!ro && <Button size="sm" variant="outline" onClick={() => modifica((x) => { x.lavoratori.push({ qualifica: "", numero: 1, note: "" }); })}><Plus className="mr-1 h-4 w-4" />Aggiungi</Button>}
        </div>
        {d.lavoratori.map((r, n) => (
          <Riga key={`lav-${n}`} readOnly={ro} etichettaRimuovi={`Togli la riga ${r.qualifica || n + 1}`} onRemove={() => modifica((x) => { x.lavoratori.splice(n, 1); })}>
            <div className="grid gap-3 pr-10 sm:grid-cols-6">
              <Campo id={`lav-${n}-q`} label="Qualifica" value={r.qualifica} readOnly={ro} className="sm:col-span-3" onChange={(v) => modifica((x) => { x.lavoratori[n].qualifica = v; })} />
              <Campo id={`lav-${n}-n`} label="Numero" type="number" value={String(r.numero)} readOnly={ro}
                onChange={(v) => modifica((x) => { x.lavoratori[n].numero = Math.max(0, Math.round(Number(v) || 0)); })} />
              <Campo id={`lav-${n}-note`} label="Note" value={r.note} readOnly={ro} className="sm:col-span-2" onChange={(v) => modifica((x) => { x.lavoratori[n].note = v; })} />
            </div>
          </Riga>
        ))}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Lavoratori autonomi</h3>
          {!ro && (
            <Button size="sm" variant="outline" onClick={() => modifica((x) => {
              x.autonomi.push({ nominativo: "", indirizzo: "", codice_fiscale: "", partita_iva: "", attivita: "", data_ingresso: "", data_uscita: "", note: "" });
            })}><Plus className="mr-1 h-4 w-4" />Aggiungi</Button>
          )}
        </div>
        {d.autonomi.length === 0 && <p className="text-xs text-muted-foreground">Nessuno: nel POS risulta che non operano lavoratori autonomi per conto dell'impresa.</p>}
        {d.autonomi.map((a, n) => (
          <Riga key={`aut-${n}`} readOnly={ro} etichettaRimuovi={`Togli l'autonomo ${a.nominativo || n + 1}`} onRemove={() => modifica((x) => { x.autonomi.splice(n, 1); })}>
            <div className="grid gap-3 pr-10 sm:grid-cols-2">
              <Campo id={`aut-${n}-nome`} label="Nominativo" value={a.nominativo} readOnly={ro} onChange={(v) => modifica((x) => { x.autonomi[n].nominativo = v; })} />
              <Campo id={`aut-${n}-att`} label="Attività svolta in cantiere" value={a.attivita} readOnly={ro} onChange={(v) => modifica((x) => { x.autonomi[n].attivita = v; })} />
              <Campo id={`aut-${n}-ind`} label="Indirizzo" value={a.indirizzo} readOnly={ro} onChange={(v) => modifica((x) => { x.autonomi[n].indirizzo = v; })} />
              <Campo id={`aut-${n}-cf`} label="Codice fiscale" value={a.codice_fiscale} readOnly={ro} onChange={(v) => modifica((x) => { x.autonomi[n].codice_fiscale = v; })} />
              <Campo id={`aut-${n}-piva`} label="Partita IVA" value={a.partita_iva} readOnly={ro} onChange={(v) => modifica((x) => { x.autonomi[n].partita_iva = v; })} />
              <div className="grid grid-cols-2 gap-3">
                <Campo id={`aut-${n}-in`} label="Ingresso in cantiere" type="date" value={a.data_ingresso} readOnly={ro} onChange={(v) => modifica((x) => { x.autonomi[n].data_ingresso = v; })} />
                <Campo id={`aut-${n}-out`} label="Uscita" type="date" value={a.data_uscita} readOnly={ro} onChange={(v) => modifica((x) => { x.autonomi[n].data_uscita = v; })} />
              </div>
            </div>
          </Riga>
        ))}
      </div>
    </Sezione>
  );
}

// ── 6. Formazione ────────────────────────────────────────────────────────────

export function SezioneFormazione({ d, modifica, ro, mancanti }: BaseProps) {
  const voci: Array<{ k: "base" | "rischi_specifici" | "rischi_cantiere" | "dpi_terza_categoria"; label: string }> = [
    { k: "base", label: "Base" },
    { k: "rischi_specifici", label: "Rischi specifici e di mansione" },
    { k: "rischi_cantiere", label: "Rischi di cantiere del PSC e del POS" },
    { k: "dpi_terza_categoria", label: "DPI di 3ª categoria, con addestramento" },
  ];
  return (
    <Sezione id="formazione" numero={6} titolo="Informazione e formazione dei lavoratori" riferimento={RIFERIMENTI_SEZIONE.formazione} mancanti={mancanti}
      descrizione="Per ciascun lavoratore. I documenti trovati sono riferimenti da controllare: titolo e flag HR non compilano le caselle. Verifica contenuti, scadenza e pertinenza alla mansione.">
      {!ro && (
        <Button size="sm" variant="outline" onClick={() => modifica((x) => {
          x.formazione.push({ nominativo: "", qualifica: "", base: false, rischi_specifici: false, rischi_cantiere: false, dpi_terza_categoria: false, altro: "", attestati: "" });
        })}><Plus className="mr-1 h-4 w-4" />Aggiungi lavoratore</Button>
      )}
      {d.formazione.map((f, n) => (
        <Riga key={`for-${n}`} readOnly={ro} etichettaRimuovi={`Togli ${f.nominativo || `il lavoratore ${n + 1}`}`} onRemove={() => modifica((x) => { x.formazione.splice(n, 1); })}>
          <div className="grid gap-3 pr-10 sm:grid-cols-2">
            <Campo id={`for-${n}-nome`} label="Lavoratore" value={f.nominativo} readOnly={ro} onChange={(v) => modifica((x) => { x.formazione[n] = cambiaNominativoFormazione(x.formazione[n], v); })} />
            <Campo id={`for-${n}-q`} label="Qualifica" value={f.qualifica} readOnly={ro} onChange={(v) => modifica((x) => { x.formazione[n].qualifica = v; x.formazione[n].verificata = false; })} />
            <div className="grid gap-2 text-sm sm:col-span-2 sm:grid-cols-2">
              {voci.map((v) => (
                <label key={v.k} className="flex items-center gap-2">
                  <Checkbox checked={f[v.k]} disabled={ro} onCheckedChange={(c) => modifica((x) => { x.formazione[n][v.k] = c === true; x.formazione[n].verificata = false; })} />
                  {v.label}
                </label>
              ))}
            </div>
            <Campo id={`for-${n}-altro`} label="Altro (descrivi)" value={f.altro} readOnly={ro} className="sm:col-span-2"
              placeholder="Es.: abilitazioni PLE, carrello elevatore, preposto, ponteggi"
              onChange={(v) => modifica((x) => { x.formazione[n].altro = v; x.formazione[n].verificata = false; })} />
            <p className="text-xs text-muted-foreground sm:col-span-2">{f.riferimento_addetto ? "Anagrafica HR collegata per identificativo. Modificare il nominativo rimuove il collegamento; nessuna qualifica è confermata automaticamente." : "Riga senza collegamento HR univoco: dati nominativi da riconciliare prima di collegare le evidenze della commessa."}</p>
            {f.attestati && <p className="text-xs text-muted-foreground sm:col-span-2">Attestati nell'app: {f.attestati}</p>}
            <label className="flex items-start gap-2 rounded-lg border p-3 text-sm sm:col-span-2">
              <Checkbox checked={f.verificata===true} disabled={ro} onCheckedChange={c=>modifica(x=>{x.formazione[n].verificata=c===true;})}/>
              Ho controllato i documenti, le scadenze e la pertinenza delle voci indicate per questo lavoratore e cantiere.
            </label>
          </div>
        </Riga>
      ))}
    </Sezione>
  );
}

// ── 7. Rumore ────────────────────────────────────────────────────────────────

export function SezioneRumore({ d, modifica, ro, mancanti, companyId, orderId, posId, allegatiSalvati = [], salvaPrimaDellaLettura }: BaseProps & {
  companyId?: string; orderId?: string; posId?: string; allegatiSalvati?: AllegatoPos[]; salvaPrimaDellaLettura?: () => Promise<boolean>;
}) {
  const [scegli, setScegli] = useState(false);
  const rapporto = d.rumore.rapporto;
  const modificaEsiti: Modifica = fn => modifica(x => {
    fn(x);
    if (x.rumore.rapporto) x.rumore.rapporto.esiti_riesaminati = false;
  });
  const aggiornaRapporto = (k: "codice" | "data" | "revisione" | "collocazione", v: string) =>
    modificaEsiti(x => { (x.rumore.rapporto ??= { codice: "", data: "", revisione: "" })[k] = v; });
  return (
    <Sezione id="rumore" numero={7} titolo="Esito del rapporto di valutazione del rumore" riferimento={RIFERIMENTI_SEZIONE.rumore} mancanti={mancanti}
      descrizione="Indica i livelli di esposizione e i relativi riferimenti nel rapporto dell’impresa.">
      {(!ro || rapporto) && <fieldset className="space-y-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-semibold">Rapporto di riferimento</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo id="rumore-rapporto" label="Numero o titolo" value={rapporto?.codice ?? ""} readOnly={ro} onChange={v => aggiornaRapporto("codice", v)} />
          <Campo id="rumore-data" type="date" label="Data del rapporto" value={rapporto?.data ?? ""} readOnly={ro} onChange={v => aggiornaRapporto("data", v)} />
          <Campo id="rumore-rev" label="Revisione" value={rapporto?.revisione ?? ""} readOnly={ro} onChange={v => aggiornaRapporto("revisione", v)} />
        </div>
        {rapporto?.fonte ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm">
          <span>Originale collegato · {rapporto.fonte.titolo}</span>
          <div className="flex flex-wrap gap-1">
            {companyId && posId && <Button type="button" size="sm" variant="outline" onClick={() => {
              void apriRapportoRumorePos(companyId, posId, rapporto.fonte!).catch(e =>
                toast.error(e instanceof Error ? e.message : "Originale non disponibile"));
            }}><ExternalLink className="mr-1 size-4" />Apri originale</Button>}
            {!ro && companyId && posId && <EsitiDalRapportoRumore key={`${rapporto.fonte.id}:${rapporto.fonte.sha256}`} companyId={companyId} posId={posId}
              fonte={rapporto.fonte} salva={salvaPrimaDellaLettura} applica={proposte => modificaEsiti(x => {
                const ref = x.rumore.rapporto?.fonte;
                if (!ref || ref.id !== rapporto.fonte?.id || ref.sha256 !== rapporto.fonte.sha256 || ref.origine !== rapporto.fonte.origine) return;
                for (const p of proposte) {
                  const riferimento = `Pagina ${p.pagina}${p.metodo === "ocr" ? " · OCR" : ""}`;
                  if (x.rumore.righe.some(r => r.riferimento?.replace(/ · OCR$/, "") === `Pagina ${p.pagina}` &&
                      r.mansione === p.mansione && r.esposizione === p.esposizione && r.lavorazione === p.lavorazione)) continue;
                  x.rumore.righe.push({ mansione: p.mansione, lavorazione: p.lavorazione, esposizione: p.esposizione, livello_sorgenti: "", note: "", riferimento });
                }
              })} />}
            {!ro && <Button type="button" size="sm" variant="ghost" onClick={() => modificaEsiti(x => { if (x.rumore.rapporto) delete x.rumore.rapporto.fonte; })}>Scollega</Button>}
          </div>
        </div> : (!ro || rapporto?.collocazione) && <Campo id="rumore-collocazione" label="Dove è conservato l’originale, se esterno" value={rapporto?.collocazione ?? ""} readOnly={ro} onChange={v => aggiornaRapporto("collocazione", v)} />}
        {!ro && companyId && orderId && posId && <Button type="button" size="sm" variant="outline" aria-expanded={scegli} onClick={() => setScegli(v => !v)}>
          <Paperclip className="mr-1 size-4" />{scegli ? "Chiudi scelta" : rapporto?.fonte ? "Sostituisci originale" : "Scegli dall’archivio o dagli allegati"}
        </Button>}
        {!ro && scegli && companyId && orderId && posId && <ScegliRapportoRumorePos companyId={companyId} orderId={orderId} posId={posId}
          allegati={d.allegati.filter(a => a.tipo === "valutazione_rumore" && allegatiSalvati.some(v => v.file_path === a.file_path && v.nome === a.nome && v.tipo === a.tipo))} collega={fonte => {
            modificaEsiti(x => {
              const precedente = x.rumore.rapporto;
              const stessaFonte = precedente?.fonte?.sha256 === fonte.sha256;
              x.rumore.rapporto = {
                codice: stessaFonte ? precedente!.codice : fonte.titolo,
                data: fonte.data_archivio ?? (stessaFonte ? precedente!.data : ""),
                revisione: stessaFonte ? precedente!.revisione : "",
                fonte,
              };
            });
            setScegli(false);
          }} />}
      </fieldset>}
      <Area id="rumore-esito" label="Esito della valutazione" rows={3} value={d.rumore.esito} readOnly={ro}
        placeholder="Es.: dalla valutazione del rumore del … (rev. …), l'esposizione giornaliera degli addetti è inferiore/superiore a … dB(A)"
        onChange={(v) => modificaEsiti((x) => { x.rumore.esito = v; })} />
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Tabella dei livelli di esposizione</h3>
        {!ro && (
          <Button size="sm" variant="outline" onClick={() => modificaEsiti((x) => { x.rumore.righe.push({ mansione: "", lavorazione: "", livello_sorgenti: "", esposizione: "", note: "" }); })}>
            <Plus className="mr-1 h-4 w-4" />Aggiungi riga
          </Button>
        )}
      </div>
      {d.rumore.righe.map((r, n) => (
        <Riga key={`rum-${n}`} readOnly={ro} etichettaRimuovi={`Togli la riga ${n + 1}`} onRemove={() => modificaEsiti((x) => { x.rumore.righe.splice(n, 1); })}>
          <div className="grid gap-3 pr-10 sm:grid-cols-2">
            <Campo id={`rum-${n}-m`} label="Mansione (o nominativo)" value={r.mansione} readOnly={ro} onChange={(v) => modificaEsiti((x) => { x.rumore.righe[n].mansione = v; })} />
            {(!ro && d.lavorazioni.length > 0) ? <label className="space-y-1.5 text-sm font-medium">
              <span>Lavorazione collegata</span>
              <select className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={r.lavorazione_id ?? ""}
                onChange={e => modificaEsiti(x => {
                  const voce = x.lavorazioni.find(l => l.id === e.target.value), riga = x.rumore.righe[n];
                  riga.lavorazione_id = voce?.id;
                  if (voce) riga.lavorazione = voce.titolo;
                })}>
                <option value="">Riferimento libero</option>
                {!!r.lavorazione_id && !d.lavorazioni.some(l => l.id === r.lavorazione_id) && <option value={r.lavorazione_id}>Lavorazione rimossa</option>}
                {d.lavorazioni.map((l, i) => <option key={l.id} value={l.id}>{l.titolo || `Lavorazione ${i + 1}`}</option>)}
              </select>
            </label> : null}
            {(!r.lavorazione_id || ro || !d.lavorazioni.length) && <Campo id={`rum-${n}-l`} label="Lavorazione" value={d.lavorazioni.find(l => l.id === r.lavorazione_id)?.titolo ?? r.lavorazione} readOnly={ro} onChange={(v) => modificaEsiti((x) => { x.rumore.righe[n].lavorazione = v; delete x.rumore.righe[n].lavorazione_id; })} />}
            <Campo id={`rum-${n}-rif`} label="Pagina o punto del rapporto" value={r.riferimento ?? ""} readOnly={ro}
              onChange={v => modificaEsiti(x => { x.rumore.righe[n].riferimento = v; })} />
            <Campo id={`rum-${n}-s`} label="Pressione sonora delle sorgenti" value={r.livello_sorgenti} readOnly={ro} onChange={(v) => modificaEsiti((x) => { x.rumore.righe[n].livello_sorgenti = v; })} />
            <Campo id={`rum-${n}-e`} label="Esposizione giornaliera/settimanale" value={r.esposizione} readOnly={ro} onChange={(v) => modificaEsiti((x) => { x.rumore.righe[n].esposizione = v; })} />
            <Campo id={`rum-${n}-note`} label="Note" value={r.note} readOnly={ro} className="sm:col-span-2" onChange={(v) => modificaEsiti((x) => { x.rumore.righe[n].note = v; })} />
          </div>
        </Riga>
      ))}
      {rapporto && <label className="flex items-center gap-2 rounded-md border bg-muted/20 p-3 text-sm">
        <Checkbox checked={rapporto.esiti_riesaminati === true} disabled={ro} onCheckedChange={v =>
          modifica(x => { if (x.rumore.rapporto) x.rumore.rapporto.esiti_riesaminati = v === true; })} />
        Ho confrontato gli esiti riportati con questa revisione del rapporto
      </label>}
    </Sezione>
  );
}

// ── 8. Lavorazioni ───────────────────────────────────────────────────────────

interface LavorazioniProps extends BaseProps {
  companyId?:string;
  orderId?:string;
  puoLeggereComputo?: boolean;
  posId?: string;
  contesto: ContestoPos | null;
  pscVigente?: RiferimentoPsc | null;
  onProponiAi: (lavorazione?: Lavorazione) => void;
  proponendo: boolean;
  vociDaCompletare?: readonly VoceMancante[];
}

export function SezioneLavorazioni({ d, modifica, ro, mancanti, contesto, onProponiAi, proponendo, companyId, orderId, puoLeggereComputo, posId, pscVigente, vociDaCompletare }: LavorazioniProps) {
  const mancantiPerScheda = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of vociDaCompletare ?? vociMancanti(d)) if (v.lavorazione_id) m.set(v.lavorazione_id, (m.get(v.lavorazione_id) ?? 0) + 1);
    return m;
  }, [d, vociDaCompletare]);
  const [apertaScheda, setApertaScheda] = useState<Record<string, boolean>>(() => {
    const primaDaCompletare = d.lavorazioni.find(l => (mancantiPerScheda.get(l.id) ?? 0) > 0);
    return Object.fromEntries(d.lavorazioni.map(l => [l.id, ro || l.id === primaDaCompletare?.id]));
  });
  const schedaAperta = (id: string) => apertaScheda[id] ?? true;
  const alternaScheda = (id: string) => setApertaScheda(a => ({ ...a, [id]: !(a[id] ?? true) }));
  function aggiungiDaFasi(nuove: Lavorazione[]) {
    if (!nuove.length) return;
    setApertaScheda(precedenti => ({
      ...precedenti,
      ...Object.fromEntries(nuove.map((l, i) => [l.id, i === 0])),
    }));
    modifica(x => {
      const collegate = new Set(x.lavorazioni.flatMap(chiaviFontiLavorazionePos));
      for (const lavorazione of nuove) {
        const chiavi = chiaviFontiLavorazionePos(lavorazione);
        if (chiavi.some(chiave => collegate.has(chiave))) continue;
        x.lavorazioni.push(lavorazione);
        chiavi.forEach(chiave => collegate.add(chiave));
      }
    });
  }
  const campo = (l: Lavorazione, n: number, k: keyof Lavorazione, label: string, righe = 2, placeholder?: string) => (
    <Area id={`lv-${n}-${k}`} label={label} rows={righe} value={String(l[k] ?? "")} readOnly={ro} placeholder={placeholder}
      onChange={(v) => modifica((x) => { (x.lavorazioni[n] as unknown as Record<string, unknown>)[k] = v; invalidaProdottiLavorazione(x.lavorazioni[n]); if(x.lavorazioni[n].origine!=="utente") x.lavorazioni[n].verificata=false; })} />
  );
  return (
    <Sezione id="lavorazioni" numero={8} titolo="Lavorazioni svolte in cantiere" riferimento={RIFERIMENTI_SEZIONE.lavorazioni} mancanti={mancanti}
      descrizione="Una scheda per lavorazione: sostanze, opere provvisionali, macchine, rischi, misure e DPI. Le schede proposte dall'AI o riprese da altri POS e modelli richiedono adattamento e conferma."
      azioni={!ro ? (
        // Telefono: due icone (prima i due pulsanti col testo uscivano dallo schermo e «Scheda vuota» si tagliava).
        <div className="flex flex-wrap gap-2">
          {companyId && orderId && <FasiDaCommessaPos companyId={companyId} orderId={orderId} lavorazioni={d.lavorazioni}
            puoLeggereComputo={puoLeggereComputo} ditte={contesto?.subappaltatori.map(s => s.ragione_sociale)} onAggiungi={aggiungiDaFasi} />}
          <CatalogoSchedeStandardPos companyId={companyId} orderId={orderId} onAggiungi={l => modifica(x => { x.lavorazioni.push(l); })} />
          <Button size="sm" variant="outline" className="tap-compact max-sm:h-8 max-sm:w-8 max-sm:px-0" aria-label="Proponi con l'AI" title="Proponi le lavorazioni con l'AI" onClick={() => onProponiAi()} disabled={proponendo}>
            {proponendo ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1" aria-hidden="true" /> : <Sparkles className="h-4 w-4 sm:mr-1" aria-hidden="true" />}<span className="max-sm:hidden">Proponi con l'AI</span>
          </Button>
          <Button size="sm" variant="outline" className="tap-compact max-sm:h-8 max-sm:w-8 max-sm:px-0" aria-label="Aggiungi una scheda vuota" title="Aggiungi una scheda vuota" onClick={() => modifica((x) => { const nuova = lavorazioneVuota(nuovoId()); applicaValutazione(nuova, valutazioneDaElenchi(nuova)); x.lavorazioni.push(nuova); })}>
            <Plus className="h-4 w-4 sm:mr-1" aria-hidden="true" /><span className="max-sm:hidden">Scheda vuota</span>
          </Button>
        </div>
      ) : undefined}>
      <FunzioniAvanzatePos d={d} ro={ro} modifica={modifica} />
      {contesto && (contesto.mezzi.length > 0 || contesto.subappaltatori.length > 0) && (
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
          {contesto.mezzi.length > 0 && <p><span className="font-medium">Mezzi sulla commessa:</span> {contesto.mezzi.map((m) => m.targa ? `${m.nome} (${m.targa})` : m.nome).join(", ")}</p>}
          {contesto.subappaltatori.length > 0 && <p className="mt-1"><span className="font-medium">Subappaltatori della commessa:</span> {contesto.subappaltatori.map((s) => s.tipo_lavori ? `${s.ragione_sociale} (${s.tipo_lavori})` : s.ragione_sociale).join(", ")}</p>}
        </div>
      )}
      {d.lavorazioni.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{d.lavorazioni.length} lavorazioni nel POS</p>
        <div className="flex flex-wrap items-center gap-2">
          {!ro && <RisorseNonPrevistePos lavorazioni={d.lavorazioni} modifica={modifica} />}
          {d.lavorazioni.length > 1 && <Button type="button" size="sm" variant="ghost" onClick={() => {
            const apriTutte = !d.lavorazioni.some(l => schedaAperta(l.id));
            setApertaScheda(Object.fromEntries(d.lavorazioni.map(l => [l.id, apriTutte])));
          }}>{d.lavorazioni.some(l => schedaAperta(l.id)) ? "Comprimi schede" : "Espandi schede"}</Button>}
        </div>
      </div>}
      {d.lavorazioni.length === 0 && <p className="text-sm text-muted-foreground">Nessuna lavorazione. Parti da una scheda standard, dalle lavorazioni della commessa o da una proposta AI.</p>}
      {d.lavorazioni.map((l, n) => (
        <div key={l.id} data-pos-lavorazione={l.id} className={`rounded-xl border ${l.origine !== "utente" && !l.verificata ? "border-amber-300 bg-amber-50/30" : "bg-slate-50/50"}`}>
          <div className={cn("flex flex-wrap items-center gap-2 px-3 py-2", schedaAperta(l.id) && "border-b")}>
            <button type="button" data-pos-apri-scheda onClick={() => alternaScheda(l.id)} aria-expanded={schedaAperta(l.id)} aria-label={`${schedaAperta(l.id) ? "Chiudi" : "Apri"} la lavorazione ${n + 1}`}
              className="flex h-8 shrink-0 items-center gap-0.5 rounded-md bg-slate-200 px-1.5 text-xs font-bold">
              {n + 1}<ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !schedaAperta(l.id) && "-rotate-90")} aria-hidden="true" />
            </button>
            <input
              aria-label={`Titolo della lavorazione ${n + 1}`}
              className="min-w-0 flex-1 rounded-md border bg-white px-2 py-1 text-sm font-medium disabled:bg-transparent max-sm:basis-[calc(100%-3.25rem)]"
              value={l.titolo}
              disabled={ro}
              placeholder="Titolo della lavorazione"
              onChange={(e) => modifica((x) => { x.lavorazioni[n].titolo = e.target.value; invalidaProdottiLavorazione(x.lavorazioni[n]); if(x.lavorazioni[n].origine!=="utente") x.lavorazioni[n].verificata=false; })}
            />
            {(mancantiPerScheda.get(l.id) ?? 0) > 0
              ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200" aria-label={`${mancantiPerScheda.get(l.id)} voci da completare in questa scheda`}>{mancantiPerScheda.get(l.id)}<span className="max-sm:hidden"> da completare</span></span>
              : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Scheda completa" />}
            {l.origine !== "utente" && (
              <Badge variant="outline" className={l.verificata ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-100 text-amber-900"}>
                {l.origine === "modello" ? (l.verificata ? "Riuso confermato" : "Da adattare al cantiere") : (l.verificata ? "AI, confermata" : "Proposta dall'AI")}
              </Badge>
            )}
            {!ro && (
              <div className="ml-auto flex items-center">
                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={n === 0} aria-label="Sposta su"
                  onClick={() => modifica((x) => { const [it] = x.lavorazioni.splice(n, 1); x.lavorazioni.splice(n - 1, 0, it); })}><ArrowUp className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={n === d.lavorazioni.length - 1} aria-label="Sposta giù"
                  onClick={() => modifica((x) => { const [it] = x.lavorazioni.splice(n, 1); x.lavorazioni.splice(n + 1, 0, it); })}><ArrowDown className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Duplica"
                  onClick={() => modifica((x) => { x.lavorazioni.splice(n + 1, 0, { ...structuredClone(x.lavorazioni[n]), prodotti: x.lavorazioni[n].prodotti?.map(p=>({...p,verificato:false})), prodotti_riesaminati:false, ...(x.lavorazioni[n].tecnica?{tecnica:{...structuredClone(x.lavorazioni[n].tecnica!),riesaminata:false}}:{}), requisiti_addetti: undefined, riscontri_dpi: undefined, segnaletica: undefined, id: nuovoId(), titolo: `${x.lavorazioni[n].titolo} (copia)`, origine: "modello", verificata: false }); })}><Copy className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Elimina la lavorazione ${l.titolo || n + 1}`}
                  onClick={() => modifica((x) => { x.lavorazioni.splice(n, 1); })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            )}
          </div>
          {schedaAperta(l.id) && <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
            {l.fonti_scheda && <div className="space-y-3 sm:col-span-2">
              <RiferimentiSchedaPos fonti={l.fonti_scheda}
                superato={pscSchedaDaRiesaminare(l.fonti_scheda.psc, pscVigente === undefined ? d.procedure_psc.documento : pscVigente)}
                apriOriginale={d.procedure_psc.documento ? pagina => {
                  const psc = d.procedure_psc.documento!;
                  void apriFileRiservato(psc.archivio === "sicurezza_documenti" ? "sicurezza-documenti" : "fascicoli-cantiere", psc.file_path, pagina)
                    .catch(() => toast.error("Originale PSC non disponibile"));
                } : undefined}
                confermaOcr={ro ? undefined : (indice, confermato) => modifica(x => {
                  const scheda = x.lavorazioni[n];
                  const estratto = scheda.fonti_scheda?.psc?.estratti[indice];
                  if (estratto?.metodo !== "ocr") return;
                  estratto.confermato = confermato;
                  scheda.verificata = false;
                  if (scheda.tecnica) scheda.tecnica.riesaminata = false;
                })}
                usaPrescrizione={ro ? undefined : estratto => modifica(x => {
                  const psc = x.procedure_psc;
                  const fonte = l.fonti_scheda?.psc;
                  if (!psc.psc_presente || !psc.documento || !fonte || pscSchedaDaRiesaminare(fonte, psc.documento) || (estratto.metodo === "ocr" && !estratto.confermato)) return;
                  const { id, revisione, sha256 } = fonte;
                  if (!psc.voci.some(v => v.lavorazione_id === l.id && v.pagina === String(estratto.pagina) && v.procedura === estratto.testo)) {
                    psc.richieste = true;
                    psc.voci.push({ fonte_estratto: { id, revisione, sha256, ...(estratto.metodo ? { metodo: estratto.metodo } : {}) }, procedura: estratto.testo, indicazioni: "", pagina: String(estratto.pagina), lavorazione_id: l.id });
                  }
                })}
                rimuoviPsc={ro ? undefined : () => modifica(x => {
                  const scheda = x.lavorazioni[n];
                  if (scheda.fonti_scheda) delete scheda.fonti_scheda.psc;
                  scheda.verificata = false;
                  if (scheda.tecnica) scheda.tecnica.riesaminata = false;
                })} />
              {!!l.fonti_scheda.quesiti?.length && <QuesitiSchedaPos quesiti={l.fonti_scheda.quesiti} readonly={ro} prefissoCampo={`lv-${n}-quesito`}
                proposta={companyId && posId ? { companyId, posId, aggiungiAllaModalita: testo => modifica(x => {
                  const scheda = x.lavorazioni[n];
                  if (scheda.modalita.trim().split("\n\n").includes(testo)) return;
                  scheda.modalita = [scheda.modalita.trim(), testo].filter(Boolean).join("\n\n");
                  scheda.verificata = false;
                  if (scheda.tecnica) scheda.tecnica.riesaminata = false;
                }) } : undefined}
                rispondi={(i, risposta) => modifica(x => {
                  const scheda = x.lavorazioni[n];
                  const q = scheda.fonti_scheda?.quesiti?.[i];
                  if (!q) return;
                  q.risposta = risposta;
                  scheda.verificata = false;
                  if (scheda.tecnica) scheda.tecnica.riesaminata = false;
                })} />}
            </div>}
            {d.versione_tecnica===1&&<TecnicaLavorazionePos d={d} n={n} ro={ro} modifica={modifica} companyId={companyId} orderId={orderId}/>}
            <SegnaleticaLavorazionePos l={l} ro={ro} onChange={segnaletica=>modifica(x=>{x.lavorazioni[n].segnaletica=segnaletica;x.lavorazioni[n].verificata=false;if(x.lavorazioni[n].tecnica)x.lavorazioni[n].tecnica!.riesaminata=false;})}/>
            {!ro && (!l.descrizione.trim() || !l.modalita.trim()) && <div className="flex flex-wrap gap-2 sm:col-span-2">
              <TestiStandardLavorazionePos lavorazione={l} onInserisci={proposta => modifica(x => {
                const corrente = x.lavorazioni.find(scheda => scheda.id === l.id);
                if (corrente) inserisciTestiLavorazione(corrente, proposta, "modello");
              })} />
              {l.titolo.trim() && <Button type="button" variant="outline" size="sm" onClick={() => onProponiAi(l)} disabled={proponendo}>
                <Sparkles className="size-4" aria-hidden="true" /> Proponi testo con l’AI
              </Button>}
            </div>}
            {campo(l, n, "descrizione", "Descrizione della lavorazione")}
            {campo(l, n, "modalita", "Modalità e organizzazione della fase di lavoro")}
            {(l.programma_demolizioni || titoloDemolizionePos(l.titolo)) && <ProgrammaDemolizioniPos id={`pos-demolizioni-${n}`} valore={l.programma_demolizioni} preposti={d.preposti.map(p => p.nominativo.trim())}
              ro={ro} cambia={programma => modifica(x => {
                const scheda = x.lavorazioni[n];
                scheda.programma_demolizioni = programma;
                if (scheda.origine !== "utente") scheda.verificata = false;
              })} />}
            {campo(l, n, "sostanze", "Sostanze e preparati pericolosi", 2, "«Nessuna», oppure descrivi le sostanze e collega i singoli prodotti")}
            {d.versione_prodotti===1&&companyId&&orderId&&<ProdottiLavorazionePos companyId={companyId} orderId={orderId} d={d} l={l} n={n} modifica={modifica} ro={ro}/>}
            {campo(l, n, "opere_provvisionali", "Opere provvisionali", 2, "Ponteggi, trabattelli, parapetti… o «Nessuna»")}
            {campo(l, n, "macchine", "Macchine e attrezzature", 2, "Anche «Nessuna»")}
            {campo(l, n, "impianti", "Impianti", 2, "Elettrico di cantiere, idrico… o «Nessuno»")}
            <RischiLavorazionePos l={l} n={n} ro={ro} cambia={(fn) => modifica((x) => { const lav = x.lavorazioni[n]; fn(lav); invalidaProdottiLavorazione(lav); if (lav.origine !== "utente") lav.verificata = false; })} />
            <ConsegneDpiLavorazionePos l={l} companyId={companyId} orderId={orderId} ro={ro}
              aggiungi={r => modifica(x => {
                const lav = x.lavorazioni[n];
                const precedenti = (lav.riscontri_dpi ?? []).filter(v => v.previsto !== r.previsto || v.consegna_id !== r.consegna_id);
                if (precedenti.length < 250) lav.riscontri_dpi = [...precedenti, r];
              })}
              aggiungiInGruppo={righe => modifica(x => {
                const lav = x.lavorazioni[n];
                if (lav.svolgimento === "subappalto") return;
                const previsti = dpiPrevistiPos(lav.dpi);
                const collegati = lav.riscontri_dpi ?? [];
                const nuove = righe.filter(r => previsti.includes(r.previsto) &&
                  !collegati.some(v => v.previsto === r.previsto && v.addetto_id === r.addetto_id));
                lav.riscontri_dpi = [...collegati, ...nuove].slice(0, 250);
              })}
              togli={r => modifica(x => {
                const lav = x.lavorazioni[n];
                lav.riscontri_dpi = lav.riscontri_dpi?.filter(v => v.previsto !== r.previsto || v.consegna_id !== r.consegna_id);
              })} />
            {campo(l, n, "turni", "Turni di lavoro", 3)}
            <Campo id={`lv-${n}-durata`} label="Durata presunta (giorni)" type="number" value={l.durata_giorni == null ? "" : String(l.durata_giorni)} readOnly={ro}
              onChange={(v) => modifica((x) => { x.lavorazioni[n].durata_giorni = v === "" ? null : Math.max(0, Math.round(Number(v) || 0)); invalidaProdottiLavorazione(x.lavorazioni[n]); if(x.lavorazioni[n].origine!=="utente") x.lavorazioni[n].verificata=false; })} />
            <div className="space-y-1">
              <Label htmlFor={`lv-${n}-svolgimento`} className="text-xs font-medium text-slate-700">Svolgimento</Label>
              <Select value={l.svolgimento} disabled={ro} onValueChange={(v) => modifica((x) => { x.lavorazioni[n].svolgimento = v as Svolgimento; invalidaProdottiLavorazione(x.lavorazioni[n]); if(x.lavorazioni[n].origine!=="utente") x.lavorazioni[n].verificata=false; })}>
                <SelectTrigger id={`lv-${n}-svolgimento`} className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SVOLGIMENTO_LABEL) as Svolgimento[]).map((k) => <SelectItem key={k} value={k}>{SVOLGIMENTO_LABEL[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {l.svolgimento !== "diretto" && (
              <Campo id={`lv-${n}-con`} label={l.svolgimento === "subappalto" ? "Impresa subappaltatrice" : "Impresa con cui si collabora"} value={l.svolgimento_con} readOnly={ro}
                hint={contesto?.subappaltatori.length ? `Sulla commessa: ${contesto.subappaltatori.map((s) => s.ragione_sociale).join(", ")}` : undefined}
                onChange={(v) => modifica((x) => { x.lavorazioni[n].svolgimento_con = v; invalidaProdottiLavorazione(x.lavorazioni[n]); if(x.lavorazioni[n].origine!=="utente") x.lavorazioni[n].verificata=false; })} />
            )}
            {d.versione_requisiti_addetti===1&&companyId&&orderId&&<RequisitiLavorazionePos companyId={companyId} orderId={orderId} d={d} l={l} n={n} modifica={modifica} ro={ro}/>}
            {l.origine !== "utente" && (
              <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-white p-2 text-sm sm:col-span-2">
                <Checkbox id={`lv-${n}-conferma`} checked={l.verificata} disabled={ro || ocrPscDaConfermare(l.fonti_scheda?.psc) || !!l.fonti_scheda?.quesiti?.some(q => !q.risposta.trim()) || pscSchedaDaRiesaminare(l.fonti_scheda?.psc, d.procedure_psc.documento)} onCheckedChange={(c) => modifica((x) => { x.lavorazioni[n].verificata = c === true; })} className="mt-0.5" />
                Ho letto questa scheda, l'ho adattata al cantiere e la confermo
              </label>
            )}
          </div>}
        </div>
      ))}
    </Sezione>
  );
}

// ── 9. Procedure del PSC ─────────────────────────────────────────────────────

export function SezionePsc({ d, modifica, ro, mancanti, companyId, orderId, lettura, onLetturaPronta }: BaseProps & {companyId:string;orderId:string; lettura?: ContestoLetturaPsc; onLetturaPronta?: () => void }) {
  const p = d.procedure_psc;
  return (
    <Sezione id="psc" numero={9} titolo="Procedure complementari o di dettaglio richieste dal PSC" riferimento={RIFERIMENTI_SEZIONE.psc} mancanti={mancanti}>
      <div className="flex items-center gap-2">
        <Switch id="psc-presente" checked={p.psc_presente} disabled={ro} onCheckedChange={(on) => modifica((x) => {
          x.procedure_psc.psc_presente = on;
          x.versione_psc=1;
          if (!on) x.procedure_psc.richieste = false;
        })} />
        <Label htmlFor="psc-presente" className="text-sm">Per questo cantiere c'è un Piano di Sicurezza e Coordinamento (PSC)</Label>
      </div>
      {p.psc_presente && <RiferimentoPscPos companyId={companyId} orderId={orderId} valore={p.documento} ro={ro} onChange={r=>modifica(x=>{x.versione_psc=1;if(r)x.procedure_psc.documento=r;else delete x.procedure_psc.documento;})}/>}
      {p.psc_presente && lettura && <LetturaOcrPsc {...lettura} ro={ro} onPronta={onLetturaPronta} />}
      {p.psc_presente && (
        <div className="flex items-center gap-2">
          <Switch id="psc-richieste" checked={p.richieste} disabled={ro} onCheckedChange={(on) => modifica((x) => { x.procedure_psc.richieste = on; })} />
          <Label htmlFor="psc-richieste" className="text-sm">Il PSC chiede procedure complementari o di dettaglio</Label>
        </div>
      )}
      {p.psc_presente && p.richieste && (
        <>
          {!ro && (
            <Button size="sm" variant="outline" onClick={() => modifica((x) => { x.procedure_psc.voci.push({ procedura: "", indicazioni: "" }); })}>
              <Plus className="mr-1 h-4 w-4" />Aggiungi procedura
            </Button>
          )}
          {p.voci.map((v, n) => (
            <Riga key={`psc-${n}`} readOnly={ro} etichettaRimuovi={`Togli la procedura ${n + 1}`} onRemove={() => modifica((x) => { x.procedure_psc.voci.splice(n, 1); })}>
              <div className="grid gap-3 pr-10 sm:grid-cols-2">
                {(v.fonte_estratto?.metodo === "ocr" || pscSchedaDaRiesaminare(v.fonte_estratto, p.documento)) && <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 sm:col-span-2">
                  <p>{pscSchedaDaRiesaminare(v.fonte_estratto, p.documento) ? "La citazione proviene da una revisione diversa del PSC." : "Citazione acquisita con OCR e collegata al riesame della lavorazione."}</p>
                  {!ro && <Button type="button" size="sm" variant="outline" onClick={() => modifica(x => {
                    const procedura = x.procedure_psc.voci[n];
                    delete procedura.fonte_estratto;
                    procedura.procedura = "";
                    procedura.pagina = "";
                  })}>Aggiorna la citazione manualmente</Button>}
                </div>}
                <Area id={`psc-${n}-p`} label="Procedura richiesta nel PSC" rows={2} value={v.procedura} readOnly={ro || v.fonte_estratto?.metodo === "ocr"} onChange={(t) => modifica((x) => { x.procedure_psc.voci[n].procedura = t; })} />
                <Area id={`psc-${n}-i`} label="Indicazioni complementari e di dettaglio" rows={2} value={v.indicazioni} readOnly={ro} onChange={(t) => modifica((x) => { x.procedure_psc.voci[n].indicazioni = t; })} />
                <Campo id={`psc-${n}-pagina`} label="Pagina / paragrafo del PSC" value={v.pagina||""} readOnly={ro || v.fonte_estratto?.metodo === "ocr"} onChange={t=>modifica(x=>{x.procedure_psc.voci[n].pagina=t;})}/>
                <Campo id={`psc-${n}-responsabile`} label="Responsabile operativo della procedura" value={v.responsabile||""} readOnly={ro} onChange={t=>modifica(x=>{x.procedure_psc.voci[n].responsabile=t;})}/>
                <div className="space-y-1 sm:col-span-2"><Label htmlFor={`psc-${n}-lavorazione`} className="text-xs">Lavorazione interessata</Label><UniformSelect id={`psc-${n}-lavorazione`} value={v.lavorazione_id||""} disabled={ro || v.fonte_estratto?.metodo === "ocr"} className="h-9 w-full rounded-md border bg-background px-2 text-sm" onChange={e=>modifica(x=>{x.procedure_psc.voci[n].lavorazione_id=e.target.value;})}><option value="">Procedura generale / da associare</option>{v.lavorazione_id&&!d.lavorazioni.some(l=>l.id===v.lavorazione_id)&&<option value={v.lavorazione_id}>Lavorazione non più presente: da riesaminare</option>}{d.lavorazioni.map(l=><option key={l.id} value={l.id}>{l.titolo||l.id}</option>)}</UniformSelect></div>
              </div>
            </Riga>
          ))}
        </>
      )}
    </Sezione>
  );
}

// ── 10. Allegati ─────────────────────────────────────────────────────────────

interface AllegatiProps extends BaseProps {
  companyId: string;
  posId: string;
}

export function SezioneAllegati({ d, modifica, ro, mancanti, companyId, posId }: AllegatiProps) {
  const [tipo, setTipo] = useState<TipoAllegato>("scheda_sicurezza");
  const [caricando, setCaricando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const carica = async (files: FileList | null) => {
    if (!files?.length) return;
    setCaricando(true);
    try {
      for (const f of Array.from(files)) {
        const path = await caricaAllegatoPos(companyId, posId, f);
        modifica((x) => { x.allegati.push({ tipo, nome: f.name, file_path: path }); });
      }
      toast.success("Allegato caricato: salva il POS per tenerlo");
    } catch (e) {
      toast.error(e instanceof Error ? `Allegato non caricato: ${e.message}` : "Allegato non caricato");
    } finally {
      setCaricando(false);
      if (input.current) input.current.value = "";
    }
  };

  const apri = async (path: string) => {
    const scheda = window.open("", "_blank");
    const url = await linkAllegatoPos(path);
    if (url && scheda) scheda.location.replace(url);
    else {
      scheda?.close();
      toast.error("Non riesco ad aprire l'allegato");
    }
  };

  return (
    <Sezione id="allegati" numero={10} titolo="Allegati" riferimento={RIFERIMENTI_SEZIONE.allegati} mancanti={mancanti}
      descrizione="Le schede di sicurezza delle sostanze pericolose sono allegati obbligatori. Qui anche il rapporto sul rumore o altri documenti.">
      {!ro && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="pos-allegato-tipo" className="text-xs font-medium text-slate-700">Tipo di allegato</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoAllegato)}>
              <SelectTrigger id="pos-allegato-tipo" className="h-9 w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ALLEGATO_LABEL) as TipoAllegato[]).map((k) => <SelectItem key={k} value={k}>{ALLEGATO_LABEL[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <input ref={input} id="pos-allegato" aria-label="File da allegare al POS" type="file" className="sr-only" multiple accept=".pdf,image/*,.doc,.docx" onChange={(e) => carica(e.target.files)} />
          <Button variant="outline" disabled={caricando} onClick={() => input.current?.click()}>
            {caricando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Paperclip className="mr-1 h-4 w-4" />}Carica file
          </Button>
        </div>
      )}
      {d.allegati.length === 0 && <p className="text-sm text-muted-foreground">Nessun allegato.</p>}
      <ul className="divide-y rounded-lg border">
        {d.allegati.map((a, n) => (
          <li key={`${a.file_path}-${n}`} className="flex items-center gap-3 px-3 py-2">
            <Badge variant="outline" className="shrink-0 text-[11px]">{ALLEGATO_LABEL[a.tipo]}</Badge>
            <span className="min-w-0 flex-1 truncate text-sm">{a.nome}</span>
            {a.file_path && (
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Apri ${a.nome}`} onClick={() => apri(a.file_path)}>
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
            {!ro && (
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Togli ${a.nome}`}
                // Solo dall'elenco: il file resta finché il POS non è salvato, così
                // «annulla» non lascia un riferimento a un file cancellato.
                onClick={() => modifica((x) => { x.allegati.splice(n, 1); })}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Sezione>
  );
}
