// Synthetic data for tests only. No qualification, signature or review is registered.
export const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function fontePropria() {
  return {
    versione: 1,
    company_id: id(1),
    order_id: id(2),
    id: id(3),
    revisione: 1,
    dal: "2026-11-10",
    al: "2026-11-15",
    fase_id: null,
    attivita: "TEST uso PLE",
    responsabile: "TEST tecnico",
    ruolo_responsabile: "TEST referente",
    registrato_il: "2026-10-27T12:00:00Z",
    impronta: "a".repeat(64),
    persone: [
      {
        tipo: "hr",
        id: id(4),
        nome: "TEST",
        cognome: "Omonimo",
        attivo: true,
        periodi: [
          {
            fonte: "campo",
            fonte_id: id(9),
            fase_id: null,
            dal: "2026-11-10",
            al: "2026-11-11",
            senza_date: false,
          },
        ],
      },
    ],
    criteri: [{ profilo_id: id(5), requisito: { id: id(6) } }],
    riscontri: [
      {
        persona_id: id(4),
        nominativo: "TEST Omonimo",
        mansione: "TEST addetto",
        profilo_id: id(5),
        profilo_nome: "TEST PLE",
        profilo_versione: 1,
        requisito_id: id(6),
        titolo: "TEST conduzione",
        esito: "riesaminata",
        motivazione: "TEST pertinenza letta",
        qualifica: {
          id: id(7),
          persona_tipo: "hr",
          persona_id: id(4),
          stato: "riesaminata",
          fonte_corrente: true,
          fonte_id: id(8),
          fonte_impronta: "b".repeat(64),
          dati: {
            titolo: "TEST attestato",
            ente: "TEST ente",
            validita_dal: "2026-11-01",
            validita_al: "2027-10-31",
            limitazioni: "TEST limite",
          },
        },
      },
    ],
  };
}
