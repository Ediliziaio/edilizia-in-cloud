import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { bankRpc, type BankMovement } from "@/lib/finance/bankWorkspace";
import { formatTreasuryCurrency as money } from "@/lib/treasury";
import { messaggioErrore } from "@/lib/messaggioErrore";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import type { CandidatoEsito } from "./EsitoMovimento";
import { TIPI_TRIBUTO, type TipoTributo } from "@/lib/finance/tributiF24";

/**
 * F24 che il motore riconosce ma non sa chiudere (natura «f24», esito «da gestire», 28/11/2026).
 * - tesoreria_f24_proposte: scadenze fiscali o righe del modulo F24 entro ±5 giorni che fanno
 *   l'importo, da sole o sommate (un F24 paga spesso più tributi insieme).
 * - le scadenze si chiudono con tesoreria_conferma_alternativa, la conferma di sempre;
 * - le righe F24 e «Tributi pagati» con tesoreria_f24_registra: Prima Nota e collegamento alla
 *   banca nella stessa transazione.
 */

interface PropostaF24 {
  residuo: number;
  tipo_suggerito: TipoTributo | null;
  candidati: (Omit<CandidatoEsito, "righe"> & { righe: { tipo: "scadenza" | "f24"; id: string; titolo: string; quota: number }[] })[];
}

export function TributiF24({ company, movement: m, onFatto }: { company: string; movement: BankMovement; onFatto: () => void }) {
  const t = useT();
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoTributo | null>(null);
  const [conferma, setConferma] = useState(false);
  const proposta = useQuery({
    queryKey: ["tesoreria-f24-proposte", company, m.id],
    retry: false,
    queryFn: () => bankRpc<PropostaF24>("tesoreria_f24_proposte", { p_company: company, p_tx: m.id }),
  });
  // Chi non vede la prima nota non riceve proposte: il pannello non compare.
  if (proposta.isError || !proposta.data || !(Number(proposta.data.residuo) > 0)) return null;
  const { candidati, residuo } = proposta.data;
  const scelto = tipo ?? proposta.data.tipo_suggerito;
  const valuta = (n: number) => money(n, "—", m.currency);

  async function esegui(chiave: string, azione: () => Promise<unknown>, ok: string) {
    if (inCorso) return;
    setInCorso(chiave);
    try {
      await azione();
      toast.success(ok);
      setConferma(false);
      onFatto();
    } catch (err) {
      toast.error(messaggioErrore(err, t("Registrazione non riuscita")));
    } finally {
      setInCorso(null);
    }
  }
  const confermaCandidato = (c: PropostaF24["candidati"][number]) =>
    esegui(c.chiave, () =>
      c.righe.every((r) => r.tipo === "f24")
        ? bankRpc("tesoreria_f24_registra", { p_company: company, p_tx: m.id, p_f24: c.righe.map((r) => r.id), p_tipo: null, p_note: null })
        : bankRpc("tesoreria_conferma_alternativa", {
            p_company: company, p_tx: m.id, p_note: null,
            p_rows: c.righe.map((r) => ({ tipo: r.tipo, id: r.id, importo: Math.round(Number(r.quota) * 100) / 100 })),
          }),
      c.righe.length === 1 ? t("Collegato a {titolo}", { titolo: c.righe[0].titolo }) : t("Collegato a {n} documenti", { n: c.righe.length }));
  const registraTributi = () =>
    scelto && esegui("tributi", () => bankRpc("tesoreria_f24_registra", { p_company: company, p_tx: m.id, p_f24: null, p_tipo: scelto, p_note: null }),
      t("Tributi registrati in Prima Nota e collegati al movimento"));
  const etichettaTipo = TIPI_TRIBUTO.find((x) => x.id === scelto)?.label;

  return (
    <div className="space-y-1.5 rounded-lg border bg-muted/30 p-2 text-xs">
      <p className="flex items-center gap-1 font-medium text-muted-foreground"><Landmark className="h-3 w-3" />{t("Cosa paga questo F24")}</p>
      {candidati.length > 0 ? (
        <ul className="divide-y rounded-md border bg-card">
          {candidati.map((c) => (
            <li key={c.chiave} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={c.righe.map((r) => r.titolo).join(" · ")}>{c.righe.map((r) => r.titolo).join(" + ")}</p>
                <p className="truncate text-muted-foreground">{c.motivi.join(" · ")}</p>
              </div>
              <span className="shrink-0 tabular-nums">{valuta(c.righe.reduce((s, r) => s + Number(r.quota), 0))}</span>
              <Button size="sm" className="h-7" variant="outline" disabled={!!inCorso} onClick={() => void confermaCandidato(c)}
                aria-label={t("Conferma {titoli}", { titoli: c.righe.map((r) => r.titolo).join(" + ") })}>
                {inCorso === c.chiave && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{t("Conferma")}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">{t("Nessuna scadenza fiscale né riga del modulo F24 fa questo importo entro 5 giorni.")}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground">{t("Oppure registralo come «Tributi pagati»:")}</span>
        {TIPI_TRIBUTO.map((x) => (
          <Button key={x.id} size="sm" variant={scelto === x.id ? "default" : "outline"} className="h-6 px-2 text-xs" disabled={!!inCorso}
            aria-pressed={scelto === x.id} onClick={() => { setTipo(x.id); setConferma(false); }}>
            {t(x.label)}
          </Button>
        ))}
        {!conferma && (
          <Button size="sm" className="h-6 px-2 text-xs" disabled={!scelto || !!inCorso} onClick={() => setConferma(true)}>{t("Registra")}</Button>
        )}
      </div>
      {conferma && scelto && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("Conferma la registrazione")}>
          <span>{t("Registrare {importo} in Prima Nota come «Tributi pagati · {tipo}» e collegarli a questo movimento?", { importo: String(valuta(residuo) ?? ""), tipo: t(etichettaTipo ?? "") })}</span>
          <Button size="sm" className="h-7" disabled={!!inCorso} onClick={() => void registraTributi()}>
            {inCorso === "tributi" && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{t("Sì, registra")}
          </Button>
          <Button size="sm" variant="ghost" className="h-7" disabled={!!inCorso} onClick={() => setConferma(false)}>{t("Annulla")}</Button>
        </div>
      )}
    </div>
  );
}
