/** Quello che è successo col committente e che sta nel modulo appalto: va nel diario della sua scheda. */
import type { EventoDiario } from "@/components/clients/CustomerActivityTimeline";

export interface ContrattoNelDiario { id: string; nome: string; valido_dal: string; created_at?: string | null }
export interface RendicontoNelDiario {
  id: string; numero: number; periodo_dal: string; periodo_al: string;
  inviato_at: string | null; accettato_il: string | null; accettato_da_nome: string | null;
}

const giorno = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export function eventiCommittente(
  contratti: ContrattoNelDiario[],
  rendiconti: RendicontoNelDiario[],
  apri: (sezione: "contratti" | "rendiconti") => void,
): EventoDiario[] {
  const eventi: EventoDiario[] = [];
  for (const c of contratti) {
    eventi.push({
      id: `contratto-${c.id}`, tipo: "contratto", titolo: `Contratto: ${c.nome}`,
      descrizione: `Valido dal ${giorno(c.valido_dal)}`, quando: c.created_at ?? c.valido_dal,
      onClick: () => apri("contratti"),
    });
  }
  for (const r of rendiconti) {
    const periodo = `Periodo ${giorno(r.periodo_dal)} → ${giorno(r.periodo_al)}`;
    if (r.inviato_at) {
      eventi.push({ id: `rendiconto-inviato-${r.id}`, tipo: "rendiconto", titolo: `Rendiconto N. ${r.numero} mandato`, descrizione: periodo, quando: r.inviato_at, onClick: () => apri("rendiconti") });
    }
    if (r.accettato_il) {
      eventi.push({ id: `rendiconto-accettato-${r.id}`, tipo: "rendiconto", titolo: `Rendiconto N. ${r.numero} accettato`, descrizione: r.accettato_da_nome ? `Da ${r.accettato_da_nome}` : periodo, quando: r.accettato_il, onClick: () => apri("rendiconti") });
    }
  }
  return eventi;
}
