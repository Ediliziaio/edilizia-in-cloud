/**
 * La voce del listino generale a cui collegare una tariffa del committente (27/11/2026).
 * Stessa ricerca della pagina contratto (codice o descrizione, datalist del browser) più una PROPOSTA:
 * se la tariffa non è ancora collegata, `abbinaVoce` cerca la voce giusta dalla descrizione; si applica
 * solo con un clic (mai indovinando). Senza collegamento il rendiconto la trova solo cercandola a mano.
 */
import { useId, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { abbinaVoce, type VoceGenerale } from "@/lib/appalto/abbinaListino";

const nomeVoceGenerale = (v: VoceGenerale): string => (v.codice ? `${v.codice} · ${v.nome}` : v.nome);

export function VoceGeneralePicker({ voci, valoreId, descrizione, codice, disabled, onScegli }: {
  voci: VoceGenerale[]; valoreId: string | null | undefined; descrizione: string; codice?: string | null;
  disabled?: boolean; onScegli: (v: VoceGenerale | null) => void;
}) {
  const tr = useT();
  const idLista = useId();
  const [testo, setTesto] = useState<string | null>(null);
  const scelta = voci.find((v) => v.id === valoreId) ?? null;
  const proposta = useMemo(() => {
    if (valoreId || !descrizione.trim() || voci.length === 0) return null;
    const a = abbinaVoce({ codice, descrizione }, voci);
    return a.tariffaId ? voci.find((v) => v.id === a.tariffaId) ?? null : null;
  }, [valoreId, descrizione, codice, voci]);
  return (
    <div className="space-y-1">
      <Input aria-label={tr("Voce del listino generale")} list={idLista} disabled={disabled}
        placeholder={tr("Nessuna: cerca per codice o descrizione")} value={testo ?? (scelta ? nomeVoceGenerale(scelta) : "")}
        onChange={(e) => {
          const t = e.target.value;
          setTesto(t);
          const v = voci.find((x) => nomeVoceGenerale(x) === t);
          if (v) { onScegli(v); setTesto(null); } else if (!t.trim()) onScegli(null);
        }}
        onBlur={() => setTesto(null)} />
      <datalist id={idLista}>{voci.map((v) => <option key={v.id} value={nomeVoceGenerale(v)} />)}</datalist>
      {proposta && !disabled && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {tr("Forse è: {nome}", { nome: nomeVoceGenerale(proposta) })}
          <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => onScegli(proposta)}>{tr("Collega")}</Button>
        </p>
      )}
      {valoreId && !scelta && voci.length > 0 && <p className="text-xs text-amber-700">{tr("voce non più attiva")}</p>}
    </div>
  );
}
