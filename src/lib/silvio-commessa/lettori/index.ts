/**
 * I lettori a regole di Silvio (fase 1, lotto 1.1): ogni fonte diventa un `Frammento` del
 * piano della commessa, senza AI. Le funzioni pure si provano senza database; le letture
 * stanno in `daDatabase.ts`.
 */
export { frammentoDaPreventivo, modelloDelPreventivo, moduloDelPreventivo, MODULI_EDILI, preventivoFirmato, type DatiPreventivo } from "./preventivo";
export { frammentoDaComputo, frammentoDaFileComputo, type DatiComputo } from "./computo";
export { frammentoDaCommessa, type DatiCommessaEsistente } from "./commessa";
export { leggiFrammentiPreventivo, leggiFrammentoComputo, leggiFrammentoCommessa } from "./daDatabase";
