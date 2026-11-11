import type { Modifica, PianoCommessa } from "../../../shared/silvio-commessa/piano.ts";
import { emailVera } from "@/lib/preventivatore/selezionaCliente";

/** Un cambio di anagrafica non deve trascinare i recapiti del cliente precedente. */
export function modificheSceltaCliente(
  piano: PianoCommessa,
  id: string,
  nome: string,
  email?: string | null,
): Modifica[] {
  const cliente = piano.aree.cliente;
  const precedente = cliente?.["cliente.customer_id"]?.valore;
  const dati = cliente?.["cliente.nome"]?.valore as { client_name?: string; client_company?: string } | undefined;
  const normalizza = (s: string | undefined) => s?.trim().replace(/\s+/g, " ").toLocaleLowerCase("it") ?? "";
  const stessoNome = [dati?.client_company, dati?.client_name].some((s) => normalizza(s) && normalizza(s) === normalizza(nome));
  const cambiaIdentita = (typeof precedente === "string" && precedente !== id) || (!!dati && !stessoNome);
  const modifiche: Modifica[] = [
    { tipo: "cambia_valore", area: "cliente", chiave: "cliente.customer_id", valore: id },
    {
      tipo: "cambia_valore", area: "cliente", chiave: "cliente.nome",
      valore: dati?.client_company && normalizza(dati.client_company) === normalizza(nome)
        ? { ...(!cambiaIdentita ? dati : {}), client_company: nome.trim() }
        : { client_name: nome.trim() },
    },
  ];
  if (cambiaIdentita || !cliente?.["cliente.contatto"]?.valore) {
    const recapito = emailVera(email);
    modifiche.push({ tipo: "cambia_valore", area: "cliente", chiave: "cliente.contatto", valore: recapito ? { client_email: recapito } : null });
  }
  if (cambiaIdentita) {
    modifiche.push({ tipo: "cambia_valore", area: "cliente", chiave: "cliente.client_address", valore: null });
    const messaggio = piano.aree.comunicazione?.["comunicazione.avvio_cliente"];
    // Una proposta si ricalcola da sola. Un testo già accettato per un altro cliente
    // va invece escluso: non si può riutilizzare la precedente conferma del destinatario.
    if (messaggio?.fonte.tipo === "persona" || messaggio?.toccato) {
      modifiche.push({ tipo: "cambia_valore", area: "comunicazione", chiave: "comunicazione.avvio_cliente", valore: null,
        nota: "Cliente cambiato: prepara nuovamente il messaggio per il nuovo destinatario." });
    }
  }
  return modifiche;
}
