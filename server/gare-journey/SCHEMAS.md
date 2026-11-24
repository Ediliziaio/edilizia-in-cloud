# Local UBL structural validation

Read-only schema data downloaded from the official OP-TED/ESPD-EDM repository on 2026-11-11:

- UBL 2.2: tag `v2.1.1`, `docs/src/main/asciidoc/modules/ROOT/dist/xsd/`
- UBL 2.3: tag `v4.1.0`, `ubl-2.3/xsd/`

Source: https://github.com/OP-TED/ESPD-EDM . Copyright and notices remain in every schema. OASIS schemas: https://www.oasis-open.org/policies-guidelines/ipr/ . No code from that repository is executed.

Validation is offline, structural XSD validation. It does not certify Italian eDGUE taxonomy, complete ESPD business rules, signatures, declarations or acceptance by a particular portal. Simple boolean/text/date/identifier/URL/numeric questions and unambiguous ONTRUE/ONFALSE conditions are compiled; complex types, extensions and ambiguous conditions use a clearly marked JSON working questionnaire. Generated XML is a draft with an unresolved manual validation item.
