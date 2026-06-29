/**
 * AiSalesProfileForm — le domande strategiche (vendita/persuasione) che
 * alimentano la generazione AI dei testi del template. Componente controllato,
 * condiviso tra i moduli. Le risposte si salvano nel "Profilo vendita azienda"
 * (company_sales_profile) e si riusano ovunque.
 */
import * as React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CompanySalesProfile } from "@/hooks/useCompanySalesProfile";

interface Props {
  value: CompanySalesProfile;
  onChange: (next: CompanySalesProfile) => void;
}

const CLIENTI: { key: string; label: string }[] = [
  { key: "privato", label: "Privato" },
  { key: "condominio", label: "Condominio" },
  { key: "azienda", label: "Azienda" },
  { key: "studio tecnico", label: "Studio tecnico" },
  { key: "ente pubblico", label: "Ente pubblico" },
  { key: "agricolo/industriale", label: "Agricolo/industriale" },
];

function Field({
  label, hint, star, children,
}: { label: string; hint?: string; star?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium flex items-center gap-1">
        {star ? <span className="text-orange-500">★</span> : null}
        {label}
      </Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p> : null}
    </div>
  );
}

export function AiSalesProfileForm({ value, onChange }: Props) {
  const set = (k: keyof CompanySalesProfile, v: string) => onChange({ ...value, [k]: v });
  const clientiSelezionati = value.cliente_tipo.split(",").map((s) => s.trim()).filter(Boolean);
  const hasCliente = (key: string) => clientiSelezionati.some((s) => s.toLowerCase() === key.toLowerCase());
  const toggleCliente = (key: string) => {
    const next = clientiSelezionati.filter((s) => s.toLowerCase() !== key.toLowerCase());
    if (next.length === clientiSelezionati.length) next.push(key); // non presente → aggiungi
    set("cliente_tipo", next.join(", "));
  };

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-muted-foreground">
        Sono tutte opzionali: rispondi a quelle che vuoi. Più dettagli dai, più i testi saranno precisi.
      </p>
      <Field label="1. Cosa fai, da quanto e in che zona?">
        <Textarea
          rows={2}
          value={value.attivita}
          onChange={(e) => set("attivita", e.target.value)}
          placeholder="Es. Rifacimento tetti senza ponteggi, da oltre 20 anni, in tutta la Lombardia."
        />
      </Field>

      <Field label="2. Chi è il tuo cliente tipo?" hint="Scrivi liberamente (es. 'privati con villette singole, qualche condominio'). I bottoni sotto sono solo scorciatoie.">
        <Textarea
          rows={2}
          value={value.cliente_tipo}
          onChange={(e) => set("cliente_tipo", e.target.value)}
          placeholder="Es. privati con villette singole; ogni tanto piccoli condomini"
        />
        <div className="flex flex-wrap gap-1.5 pt-1.5">
          {CLIENTI.map((c) => {
            const active = hasCliente(c.key);
            return (
              <Button
                key={c.key}
                type="button"
                size="sm"
                variant="outline"
                className={cn("h-7 text-xs", active && "border-orange-400 bg-orange-50 text-orange-700")}
                onClick={() => toggleCliente(c.key)}
              >
                {active ? "✓ " : "+ "}{c.label}
              </Button>
            );
          })}
        </div>
      </Field>

      <Field label="3. Che problema ha quando ti chiama?">
        <Textarea
          rows={2}
          value={value.problema}
          onChange={(e) => set("problema", e.target.value)}
          placeholder="Es. Tetto vecchio che d'inverno fa infiltrazioni; paura di spendere tanto e di lavori infiniti."
        />
      </Field>

      <Field label="Cosa fai TU che gli altri non fanno (o non dicono)?" star
        hint="È la domanda che fa la differenza: la tua offerta unica.">
        <Textarea
          rows={2}
          value={value.usp}
          onChange={(e) => set("usp", e.target.value)}
          placeholder="Es. Rifaccio il tetto senza ponteggi: meno costi, meno disagio, lavori più rapidi."
        />
      </Field>

      <Field label="4. Perché fidarsi di te? Fatti veri (numeri, garanzie, certificazioni)" star
        hint="L'AI userà SOLO questi: scrivi solo cose vere, niente inventato.">
        <Textarea
          rows={3}
          value={value.prove}
          onChange={(e) => set("prove", e.target.value)}
          placeholder="Es. Oltre 400 tetti rifatti; squadra interna senza subappalti; garanzia 10 anni sull'impermeabilizzazione."
        />
      </Field>

      <Field label="5. Cosa è incluso nel prezzo e che condizioni offri?">
        <Textarea
          rows={2}
          value={value.offerta}
          onChange={(e) => set("offerta", e.target.value)}
          placeholder="Es. Smaltimento e pulizia inclusi; gestiamo noi il bonus; pagamento fino a 24 rate."
        />
      </Field>

      <Field label="6. Le 3 domande che ti fanno SEMPRE prima di firmare?">
        <Textarea
          rows={2}
          value={value.obiezioni}
          onChange={(e) => set("obiezioni", e.target.value)}
          placeholder="Es. Quanto durano i lavori? E se piove? Il bonus lo gestite voi?"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3 pt-1">
        <Field label="Come parli ai clienti?">
          <Input
            value={value.voce}
            onChange={(e) => set("voce", e.target.value)}
            placeholder="Es. diretto, dai del tu"
          />
        </Field>
        <Field label="Cosa non dire mai">
          <Input
            value={value.vietati}
            onChange={(e) => set("vietati", e.target.value)}
            placeholder='Es. "i migliori", "prezzi imbattibili"'
          />
        </Field>
      </div>
    </div>
  );
}

export default AiSalesProfileForm;
