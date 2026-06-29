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

  return (
    <div className="space-y-4">
      <Field label="1. Cosa fai, da quanto e in che zona?">
        <Textarea
          rows={2}
          value={value.attivita}
          onChange={(e) => set("attivita", e.target.value)}
          placeholder="Es. Rifacimento tetti senza ponteggi, da oltre 20 anni, in tutta la Lombardia."
        />
      </Field>

      <Field label="2. Chi è il tuo cliente tipo?">
        <div className="flex gap-2">
          {CLIENTI.map((c) => (
            <Button
              key={c.key}
              type="button"
              size="sm"
              variant={value.cliente_tipo === c.key ? "default" : "outline"}
              className={cn("flex-1", value.cliente_tipo === c.key && "bg-orange-500 hover:bg-orange-600")}
              onClick={() => set("cliente_tipo", c.key)}
            >
              {c.label}
            </Button>
          ))}
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
