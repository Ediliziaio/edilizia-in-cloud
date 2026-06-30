/**
 * SerramentiConversionEditor — Editor blocchi conversione PDF.
 *
 * Concentra in un unico componente la configurazione dei 9 elementi di
 * conversion rate optimization (CRO) del PDF preventivo:
 *   1. Garanzie esplicite (5 badge)
 *   2. Urgenza / validità prezzo + early bird
 *   3. Confronto Prima/Dopo numerico (tabella tecnica)
 *   4. Certificazioni (loghi qualità)
 *   5. Bonus aggiuntivi (value stacking)
 *   6. FAQ obiezioni anticipate
 *   7. Brand legitimacy footer (dati legali)
 *   8. Condizioni e disclaimer legali
 *
 * Tutti i campi sono opzionali: ogni sezione ha il proprio toggle "Attiva".
 * State è esterno: il chiamante (SerramentiTemplateEditor) gestisce save.
 */
import { memo, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Shield, Tag, Sparkles, Award, Gift, HelpCircle, FileText, Scale } from "lucide-react";
import type {
  SrTemplatePdfRow, SrGaranzia, SrConfrontoRiga,
  SrCertificazione, SrBonus, SrFaq,
} from "@/types/serramenti";
import {
  SR_GARANZIE_DEFAULT, SR_CONFRONTO_DEFAULT, SR_CERTIFICAZIONI_DEFAULT,
  SR_BONUS_DEFAULT, SR_FAQ_DEFAULT,
} from "@/types/serramenti";

interface Props {
  form: Partial<SrTemplatePdfRow>;
  update: <K extends keyof SrTemplatePdfRow>(key: K, value: SrTemplatePdfRow[K]) => void;
  sharedLegalTemplates?: SharedLegalTemplateOption[];
  onApplySharedLegalTemplate?: (templateId: string, mode: "replace" | "append") => void;
  onSaveSharedLegalTemplate?: (kind: SharedLegalTemplateKind) => void;
  isSharedLegalSaving?: boolean;
}

export type SharedLegalTemplateKind = "condizioni" | "legali";

export interface SharedLegalTemplateOption {
  id: string;
  kind: SharedLegalTemplateKind;
  name: string;
  body: string;
}

const GARANZIA_ICONE: Array<{ value: SrGaranzia["icona"]; label: string }> = [
  { value: "shield", label: "🛡️ Scudo" },
  { value: "tools", label: "🔨 Strumenti" },
  { value: "money", label: "💸 Soldi" },
  { value: "drop", label: "💧 Goccia" },
  { value: "refresh", label: "↩️ Ritorno" },
  { value: "clock", label: "⏰ Orologio" },
  { value: "award", label: "🏆 Premio" },
  { value: "custom", label: "✦ Generica" },
];

const BONUS_ICONE: Array<{ value: SrBonus["icona"]; label: string }> = [
  { value: "gift", label: "🎁 Regalo" },
  { value: "tools", label: "🔧 Strumenti" },
  { value: "shield", label: "🛡️ Garanzia" },
  { value: "wrench", label: "🔧 Assistenza" },
  { value: "phone", label: "📞 Supporto" },
  { value: "calendar", label: "📅 Servizio" },
  { value: "custom", label: "✦ Generico" },
];

function SerramentiConversionEditorImpl({
  form,
  update,
  sharedLegalTemplates = [],
  onApplySharedLegalTemplate,
  onSaveSharedLegalTemplate,
  isSharedLegalSaving = false,
}: Props) {
  // Garanzie
  const garanzie = (form.garanzie ?? []) as SrGaranzia[];
  const addGaranzia = () => update("garanzie", [...garanzie, { icona: "shield", titolo: "", descrizione: "" }]);
  const updateGaranzia = (idx: number, patch: Partial<SrGaranzia>) =>
    update("garanzie", garanzie.map((g, i) => i === idx ? { ...g, ...patch } : g));
  const removeGaranzia = (idx: number) =>
    update("garanzie", garanzie.filter((_, i) => i !== idx));
  const resetGaranzie = () => update("garanzie", SR_GARANZIE_DEFAULT);

  // Confronto Prima/Dopo
  const righeConfronto = (form.confronto_righe ?? []) as SrConfrontoRiga[];
  const addConfronto = () => update("confronto_righe", [...righeConfronto, { parametro: "", prima: "", dopo: "", delta: null }]);
  const updateConfronto = (idx: number, patch: Partial<SrConfrontoRiga>) =>
    update("confronto_righe", righeConfronto.map((r, i) => i === idx ? { ...r, ...patch } : r));
  const removeConfronto = (idx: number) =>
    update("confronto_righe", righeConfronto.filter((_, i) => i !== idx));
  const resetConfronto = () => update("confronto_righe", SR_CONFRONTO_DEFAULT);

  // Certificazioni
  const certificazioni = (form.certificazioni ?? []) as SrCertificazione[];
  const addCertificazione = () => update("certificazioni", [...certificazioni, { nome: "", logo_url: null }]);
  const updateCertificazione = (idx: number, patch: Partial<SrCertificazione>) =>
    update("certificazioni", certificazioni.map((c, i) => i === idx ? { ...c, ...patch } : c));
  const removeCertificazione = (idx: number) =>
    update("certificazioni", certificazioni.filter((_, i) => i !== idx));
  const resetCertificazioni = () => update("certificazioni", SR_CERTIFICAZIONI_DEFAULT);

  // Bonus
  const bonus = (form.bonus_aggiuntivi ?? []) as SrBonus[];
  const addBonus = () => update("bonus_aggiuntivi", [...bonus, { icona: "gift", titolo: "", valore_eur: null }]);
  const updateBonus = (idx: number, patch: Partial<SrBonus>) =>
    update("bonus_aggiuntivi", bonus.map((b, i) => i === idx ? { ...b, ...patch } : b));
  const removeBonus = (idx: number) =>
    update("bonus_aggiuntivi", bonus.filter((_, i) => i !== idx));
  const resetBonus = () => update("bonus_aggiuntivi", SR_BONUS_DEFAULT);

  // FAQ
  const faqItems = (form.faq_items ?? []) as SrFaq[];
  const addFaq = () => update("faq_items", [...faqItems, { domanda: "", risposta: "" }]);
  const updateFaq = (idx: number, patch: Partial<SrFaq>) =>
    update("faq_items", faqItems.map((f, i) => i === idx ? { ...f, ...patch } : f));
  const removeFaq = (idx: number) =>
    update("faq_items", faqItems.filter((_, i) => i !== idx));
  const resetFaq = () => update("faq_items", SR_FAQ_DEFAULT);
  const [selectedSharedLegalId, setSelectedSharedLegalId] = useState("");
  const selectedSharedLegal = useMemo(
    () => sharedLegalTemplates.find((template) => template.id === selectedSharedLegalId) ?? null,
    [selectedSharedLegalId, sharedLegalTemplates],
  );
  const hasLegalText = Boolean(form.condizioni_legali_testo?.trim());

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="rounded-md border border-amber-200 bg-amber-50/40 px-3 py-2">
        <p className="text-xs text-amber-900">
          <strong>⚡ Trust & conversione.</strong> Elementi psicologici per
          aumentare il tasso di firma del preventivo: garanzie esplicite,
          urgenza, prova sociale numerica, value stacking, obiezioni anticipate.
          Tutti opzionali — attiva solo quelli che applichi davvero (autenticità
          conta più dell'effetto). Cambiamenti visibili in Anteprima PDF.
        </p>
      </div>

      {/* ═══ 1. GARANZIE ════════════════════════════════════════════════════ */}
      <Section icon={<Shield />} title="1. Garanzie esplicite" tag="+15-25% conv">
        <p className="text-[11px] text-muted-foreground mb-2">
          5 garanzie con badge visivi nel PDF. Riducono il rischio percepito.
        </p>
        <div className="space-y-2">
          {garanzie.map((g, idx) => (
            <div key={idx} className="rounded-lg border bg-card p-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={g.icona}
                  onChange={(e) => updateGaranzia(idx, { icona: e.target.value as SrGaranzia["icona"] })}
                  className="h-8 text-xs rounded-md border border-input bg-background px-2 w-32"
                >
                  {GARANZIA_ICONE.map((ic) => (
                    <option key={ic.value} value={ic.value}>{ic.label}</option>
                  ))}
                </select>
                <Input
                  value={g.titolo}
                  onChange={(e) => updateGaranzia(idx, { titolo: e.target.value })}
                  placeholder="Titolo garanzia"
                  className="h-8 text-xs flex-1 font-semibold"
                />
                <Button
                  size="icon" variant="ghost"
                  onClick={() => removeGaranzia(idx)}
                  className="h-8 w-8 text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Textarea
                value={g.descrizione}
                onChange={(e) => updateGaranzia(idx, { descrizione: e.target.value })}
                placeholder="Descrizione breve della garanzia (1-2 frasi)"
                rows={2}
                className="text-xs"
              />
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={addGaranzia} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Aggiungi garanzia
            </Button>
            <Button size="sm" variant="ghost" onClick={resetGaranzie} className="text-[11px] text-muted-foreground">
              Ripristina 5 default
            </Button>
          </div>
        </div>
      </Section>

      {/* ═══ 2. URGENZA / SCADENZA ════════════════════════════════════════ */}
      <Section icon={<Tag />} title="2. Urgenza & scadenza prezzo" tag="+10-18% conv">
        <p className="text-[11px] text-muted-foreground mb-2">
          Box visivo "Offerta valida fino al…" + sconto early bird per chi firma
          rapidamente. Innesca scarsità.
        </p>
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!form.urgenza_attiva}
              onChange={(e) => update("urgenza_attiva", e.target.checked)}
              className="h-4 w-4 accent-orange-500"
            />
            <span className="text-sm font-medium">Mostra box urgenza nel PDF</span>
          </label>
          {form.urgenza_attiva && (
            <div className="space-y-2 pl-6">
              <div>
                <Label className="text-xs">Titolo</Label>
                <Input
                  value={form.urgenza_titolo ?? ""}
                  onChange={(e) => update("urgenza_titolo", e.target.value || null)}
                  placeholder="Es. Prezzo bloccato"
                  className="h-9 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">Descrizione</Label>
                <Textarea
                  value={form.urgenza_descrizione ?? ""}
                  onChange={(e) => update("urgenza_descrizione", e.target.value || null)}
                  placeholder="Es. Questo prezzo è bloccato fino alla scadenza. Dopo ricalcoliamo in base a listino fornitori aggiornato."
                  rows={2}
                  className="text-xs"
                />
              </div>
            </div>
          )}

          <div className="pt-2 border-t">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!form.early_bird_attivo}
                onChange={(e) => update("early_bird_attivo", e.target.checked)}
                className="h-4 w-4 accent-orange-500"
              />
              <span className="text-sm font-medium">Sconto early bird</span>
            </label>
            {form.early_bird_attivo && (
              <div className="grid grid-cols-2 gap-3 pl-6 mt-2">
                <div>
                  <Label className="text-xs">% sconto</Label>
                  <Input
                    type="number" min={0} max={50} step={1}
                    value={form.early_bird_pct ?? 5}
                    onChange={(e) => update("early_bird_pct", Number(e.target.value) || 5)}
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">Entro giorni</Label>
                  <Input
                    type="number" min={1} max={60} step={1}
                    value={form.early_bird_giorni ?? 7}
                    onChange={(e) => update("early_bird_giorni", Number(e.target.value) || 7)}
                    className="h-9 text-xs"
                  />
                </div>
                <p className="col-span-2 text-[10px] text-muted-foreground">
                  Es. "-5% se firmi entro 7 giorni dalla data del preventivo"
                </p>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* ═══ 3. CONFRONTO PRIMA/DOPO ═════════════════════════════════════════ */}
      <Section icon={<Sparkles />} title="3. Confronto Prima/Dopo numerico" tag="+12-20% conv">
        <p className="text-[11px] text-muted-foreground mb-2">
          Tabella tecnica che mostra il delta misurabile: serramento attuale vs nuovo.
        </p>
        <label className="flex items-center gap-2 cursor-pointer mb-2">
          <input
            type="checkbox"
            checked={!!form.confronto_attivo}
            onChange={(e) => update("confronto_attivo", e.target.checked)}
            className="h-4 w-4 accent-orange-500"
          />
          <span className="text-sm font-medium">Mostra pagina confronto nel PDF</span>
        </label>
        {form.confronto_attivo && (
          <div className="space-y-2">
            <div>
              <Label className="text-xs">Titolo pagina</Label>
              <Input
                value={form.confronto_titolo ?? ""}
                onChange={(e) => update("confronto_titolo", e.target.value || null)}
                placeholder="Es. Il salto di qualità che otterrai"
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              {righeConfronto.map((r, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1.5 items-center">
                  <Input
                    value={r.parametro}
                    onChange={(e) => updateConfronto(idx, { parametro: e.target.value })}
                    placeholder="Parametro"
                    className="h-8 text-xs col-span-4"
                  />
                  <Input
                    value={r.prima}
                    onChange={(e) => updateConfronto(idx, { prima: e.target.value })}
                    placeholder="Prima"
                    className="h-8 text-xs col-span-3"
                  />
                  <Input
                    value={r.dopo}
                    onChange={(e) => updateConfronto(idx, { dopo: e.target.value })}
                    placeholder="Dopo"
                    className="h-8 text-xs col-span-3"
                  />
                  <Input
                    value={r.delta ?? ""}
                    onChange={(e) => updateConfronto(idx, { delta: e.target.value || null })}
                    placeholder="Δ"
                    className="h-8 text-xs col-span-1 text-center"
                  />
                  <Button
                    size="icon" variant="ghost"
                    onClick={() => removeConfronto(idx)}
                    className="h-8 w-8 text-rose-600 col-span-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={addConfronto} className="gap-1">
                <Plus className="h-3.5 w-3.5" /> Aggiungi riga
              </Button>
              <Button size="sm" variant="ghost" onClick={resetConfronto} className="text-[11px] text-muted-foreground">
                Ripristina 4 default
              </Button>
            </div>
          </div>
        )}
      </Section>

      {/* ═══ 4. CERTIFICAZIONI ════════════════════════════════════════════ */}
      <Section icon={<Award />} title="4. Certificazioni & marchi qualità" tag="+5-8% conv">
        <p className="text-[11px] text-muted-foreground mb-2">
          Loghi delle certificazioni mostrate in chi siamo + footer.
        </p>
        <div className="space-y-1.5">
          {certificazioni.map((c, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-muted-foreground w-6">{idx + 1}</span>
              <Input
                value={c.nome}
                onChange={(e) => updateCertificazione(idx, { nome: e.target.value })}
                placeholder="Es. UNI EN ISO 9001"
                className="h-8 text-xs flex-1"
              />
              <Input
                value={c.logo_url ?? ""}
                onChange={(e) => updateCertificazione(idx, { logo_url: e.target.value || null })}
                placeholder="URL logo (opzionale)"
                className="h-8 text-xs flex-1"
              />
              <Button
                size="icon" variant="ghost"
                onClick={() => removeCertificazione(idx)}
                className="h-8 w-8 text-rose-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={addCertificazione} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Aggiungi
            </Button>
            <Button size="sm" variant="ghost" onClick={resetCertificazioni} className="text-[11px] text-muted-foreground">
              Ripristina 5 default
            </Button>
          </div>
        </div>
      </Section>

      {/* ═══ 5. BONUS AGGIUNTIVI ══════════════════════════════════════════ */}
      <Section icon={<Gift />} title="5. Bonus aggiuntivi (regali)" tag="+5-10% conv">
        <p className="text-[11px] text-muted-foreground mb-2">
          Regali tangibili con valore €. Il cliente percepisce valore extra non in offerta da concorrenza.
        </p>
        <div className="space-y-2">
          {bonus.map((b, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <select
                value={b.icona}
                onChange={(e) => updateBonus(idx, { icona: e.target.value as SrBonus["icona"] })}
                className="h-8 text-xs rounded-md border border-input bg-background px-2 w-32"
              >
                {BONUS_ICONE.map((ic) => (
                  <option key={ic.value} value={ic.value}>{ic.label}</option>
                ))}
              </select>
              <Input
                value={b.titolo}
                onChange={(e) => updateBonus(idx, { titolo: e.target.value })}
                placeholder="Es. Zanzariere magnetiche in regalo"
                className="h-8 text-xs flex-1"
              />
              <Input
                type="number" min={0}
                value={b.valore_eur ?? ""}
                onChange={(e) => updateBonus(idx, { valore_eur: e.target.value ? Number(e.target.value) : null })}
                placeholder="€"
                className="h-8 text-xs w-20"
              />
              <Button
                size="icon" variant="ghost"
                onClick={() => removeBonus(idx)}
                className="h-8 w-8 text-rose-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={addBonus} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Aggiungi bonus
            </Button>
            <Button size="sm" variant="ghost" onClick={resetBonus} className="text-[11px] text-muted-foreground">
              Ripristina 3 default
            </Button>
          </div>
        </div>
      </Section>

      {/* ═══ 6. FAQ ═════════════════════════════════════════════════════════ */}
      <Section icon={<HelpCircle />} title="6. FAQ — obiezioni anticipate" tag="+3-5% conv">
        <p className="text-[11px] text-muted-foreground mb-2">
          6 domande comuni dei clienti con risposte chiare. Riduce friction nel
          decision making.
        </p>
        <div className="space-y-2">
          {faqItems.map((f, idx) => (
            <div key={idx} className="rounded-lg border bg-card p-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-orange-100 text-orange-600 text-xs font-bold flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                <Input
                  value={f.domanda}
                  onChange={(e) => updateFaq(idx, { domanda: e.target.value })}
                  placeholder="Domanda (es. E se piove durante la posa?)"
                  className="h-8 text-xs flex-1 font-semibold"
                />
                <Button
                  size="icon" variant="ghost"
                  onClick={() => removeFaq(idx)}
                  className="h-8 w-8 text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Textarea
                value={f.risposta}
                onChange={(e) => updateFaq(idx, { risposta: e.target.value })}
                placeholder="Risposta breve, diretta, rassicurante (1-3 frasi)"
                rows={2}
                className="text-xs"
              />
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={addFaq} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Aggiungi FAQ
            </Button>
            <Button size="sm" variant="ghost" onClick={resetFaq} className="text-[11px] text-muted-foreground">
              Ripristina 6 default
            </Button>
          </div>
        </div>
      </Section>

      {/* ═══ 7. BRAND FOOTER ═══════════════════════════════════════════════ */}
      <Section icon={<FileText />} title="7. Brand legitimacy footer" tag="trust">
        <p className="text-[11px] text-muted-foreground mb-2">
          Dati legali in fondo all'ultima pagina (P.IVA, REA, assicurazione, ecc).
          Segnala professionalità e protegge da dispute.
        </p>
        <label className="flex items-center gap-2 cursor-pointer mb-2">
          <input
            type="checkbox"
            checked={!!form.brand_footer_attivo}
            onChange={(e) => update("brand_footer_attivo", e.target.checked)}
            className="h-4 w-4 accent-orange-500"
          />
          <span className="text-sm font-medium">Mostra footer legale nel PDF</span>
        </label>
        {form.brand_footer_attivo && (
          <Textarea
            value={form.brand_footer_testo ?? ""}
            onChange={(e) => update("brand_footer_testo", e.target.value || null)}
            placeholder="Es. Ke Bei Serramenti S.r.l. · P.IVA 12345678901 · REA MI-1234567 · Sede legale Via X 12, 20100 Milano · Assicurazione RC Cantieri Generali Italia €2.000.000 · Iscritta Albo Confartigianato dal 2008"
            rows={3}
            className="text-xs"
          />
        )}
      </Section>

      {/* ═══ 8. CONDIZIONI LEGALI ═════════════════════════════════════════ */}
      <Section icon={<Scale />} title="8. Condizioni e disclaimer" tag="trust">
        <p className="text-[11px] text-muted-foreground mb-2">
          Termini e condizioni in pagina appendice: acconto, tempi, recesso, foro
          competente. Riduce dispute future.
        </p>
        <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-900">Libreria condivisa Template offerte</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                Riusa qui le condizioni contrattuali e i termini legali creati nei Template offerte.
                I testi salvati da questa sezione possono essere riutilizzati anche nei preventivi standard.
              </p>
            </div>
            {sharedLegalTemplates.length > 0 && (
              <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200">
                {sharedLegalTemplates.length} blocchi disponibili
              </span>
            )}
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
            <select
              value={selectedSharedLegalId}
              onChange={(e) => setSelectedSharedLegalId(e.target.value)}
              className="h-9 w-full rounded-md border bg-white px-2 text-xs"
            >
              <option value="">
                {sharedLegalTemplates.length > 0
                  ? "Seleziona un blocco da Template offerte..."
                  : "Nessun blocco condizioni/legali creato nei Template offerte"}
              </option>
              {sharedLegalTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.kind === "condizioni" ? "Condizioni" : "Termini legali"} · {template.name}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!selectedSharedLegal || !onApplySharedLegalTemplate}
                onClick={() => selectedSharedLegal && onApplySharedLegalTemplate?.(selectedSharedLegal.id, "replace")}
              >
                Sostituisci testo
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!selectedSharedLegal || !onApplySharedLegalTemplate}
                onClick={() => selectedSharedLegal && onApplySharedLegalTemplate?.(selectedSharedLegal.id, "append")}
              >
                Aggiungi in coda
              </Button>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!hasLegalText || isSharedLegalSaving || !onSaveSharedLegalTemplate}
              onClick={() => onSaveSharedLegalTemplate?.("condizioni")}
              className="text-xs"
            >
              Salva come condizioni contrattuali
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!hasLegalText || isSharedLegalSaving || !onSaveSharedLegalTemplate}
              onClick={() => onSaveSharedLegalTemplate?.("legali")}
              className="text-xs"
            >
              Salva come termini legali
            </Button>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer mb-2">
          <input
            type="checkbox"
            checked={!!form.condizioni_legali_attivo}
            onChange={(e) => update("condizioni_legali_attivo", e.target.checked)}
            className="h-4 w-4 accent-orange-500"
          />
          <span className="text-sm font-medium">Mostra pagina Condizioni nel PDF</span>
        </label>
        {form.condizioni_legali_attivo && (
          <Textarea
            value={form.condizioni_legali_testo ?? ""}
            onChange={(e) => update("condizioni_legali_testo", e.target.value || null)}
            placeholder={
              "Es.\n" +
              "1. PAGAMENTO — 30% acconto alla firma del contratto, saldo alla consegna in cantiere prima della posa.\n" +
              "2. TEMPI — La data di consegna stimata è di X giorni lavorativi. Eventuali ritardi del fornitore non imputabili saranno comunicati tempestivamente.\n" +
              "3. RECESSO — Ai sensi dell'art. 52 D.lgs. 206/2005, il cliente consumatore può recedere entro 14 giorni dalla firma senza motivazione.\n" +
              "4. GARANZIA — 10 anni sul prodotto, 10 anni sulla posa secondo norma UNI 11673.\n" +
              "5. FORO COMPETENTE — Per ogni controversia è competente il Foro di Milano."
            }
            rows={8}
            className="text-xs font-mono"
          />
        )}
        <label className="flex items-center gap-2 cursor-pointer mt-4 pt-3 border-t">
          <input
            type="checkbox"
            checked={!!form.pdf_mostra_firma_online}
            onChange={(e) => update("pdf_mostra_firma_online", e.target.checked)}
            className="h-4 w-4 accent-orange-500"
          />
          <span className="text-sm font-medium">Mostra blocco &ldquo;Firma e conferma online&rdquo; nel PDF</span>
        </label>
        <p className="text-[11px] text-muted-foreground ml-6">
          Aggiunge nel preventivo il link alla pagina pubblica per la conferma digitale.
          Disattivo di default.
        </p>
      </Section>
    </div>
  );
}

// ─── Section helper ──────────────────────────────────────────────────────────

function Section({
  icon, title, tag, children,
}: {
  icon: React.ReactNode;
  title: string;
  tag: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        <div className="h-7 w-7 rounded-md bg-gradient-to-br from-orange-500 to-amber-400 text-white flex items-center justify-center shrink-0">
          <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold leading-tight">{title}</h3>
        </div>
        <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 font-medium shrink-0">
          {tag}
        </span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

// PERF: memoized export → ri-render solo se `form` o `update` cambiano davvero.
// Combinato con useCallback(update) nel parent, eliminiamo i re-render di
// questo componente complesso (548 righe, 6 SrCards CRUD) ad ogni keystroke
// in altri tab del parent editor.
export const SerramentiConversionEditor = memo(SerramentiConversionEditorImpl);
