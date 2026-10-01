/**
 * Il canale di Edilizia in Cloud verso lo SDI: openapi.it, prodotto «Invoice»
 * (invoice.openapi.com, IT-configurations / IT-invoices). Chi fattura con noi
 * invia e riceve da qui: niente altri provider, niente chiavi da inserire.
 */
export const CANALE_SDI = "openapi";

/**
 * Il codice destinatario da registrare all'Agenzia delle Entrate per ricevere
 * le fatture dei fornitori sul nostro canale. Fonte: FAQ ufficiale dell'API
 * Invoice di openapi (console.openapi.com/apis/invoice/faq), verificata il
 * 01/10/2026: «The Recipient Code to be set for invoice reception is: PIC7CPS».
 *
 * Non confonderlo con JKKZDGR (prodotto «SDI» di openapi, non è il nostro) né
 * con USAL8PV (il codice di Openapi S.p.A. per le sue fatture).
 */
export const CODICE_DESTINATARIO_EIC = "PIC7CPS";
