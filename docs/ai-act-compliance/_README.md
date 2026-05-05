# Track 6 — AI Act Compliance Checklist

Documento operativo per dimostrare conformità AI Act (Regolamento UE 2024/1689) e Legge italiana 132/2025 in vista della scadenza **2 agosto 2026**.

L'analisi del sistema esistente di EiC mostra che **molti principi sono già rispettati architetturalmente** (multi-tenancy, RBAC, HIL, audit log). Quello che manca è la **formalizzazione documentale** richiesta in caso di audit.

## Contenuto della cartella

| File | Descrizione |
|---|---|
| `_README.md` | Questo file |
| `01-checklist-stato-vs-target.md` | Checklist completa con stato attuale vs target |
| `02-classificazione-rischio-sistemi-ai.md` | Classificazione di rischio per ogni edge function AI EiC |
| `03-dpia-template-cervello.md` | Template DPIA per il sistema Cervello Supremo |

## Roadmap compliance

```
Q3 2026 (3 mesi prima della scadenza):
  ✓ Checklist stato vs target completata
  ✓ Classificazione rischio sistemi AI completata
  ✓ DPIA del Cervello aggiornata e firmata
  ✓ Policy interna EiC firmata da team
  ✓ AI literacy training erogato a tutto il team
  ✓ Contratto cliente aggiornato con clausole AI Act

Q4 2026 (post-scadenza, monitoraggio):
  ✓ Audit interno ogni 90 giorni
  ✓ Aggiornamenti normativi monitorati
  ✓ Eventuali raccomandazioni recepite
```

## Obblighi chiave AI Act per EiC

EiC come **provider** del sistema Cervello (Silvio + 18 personas) ha obblighi:
- Classificazione di rischio del sistema (probabilmente "rischio limitato" per uso default)
- Documentazione tecnica
- Trasparenza verso utenti finali
- Gestione del rischio
- Cybersecurity adeguata
- Logging delle attività

EiC come **deployer interno** (uso AI nel proprio business) ha obblighi minori ma simili.

I clienti EiC come **deployer** dei sistemi forniti hanno obblighi propri (vedi `knowledge-base/10-ai-act-governance/policy-aziendale-uso-ai.md` e specifico template policy).

## Sanzioni rischiate (se non conforme)

| Violazione | Sanzione |
|---|---|
| Pratiche vietate (uso scorretto) | Fino a 35M€ o 7% fatturato mondiale |
| Non conformità sistemi alto rischio | Fino a 15M€ o 3% fatturato |
| Informazioni scorrette ad autorità | Fino a 7,5M€ o 1% fatturato |

Per PMI come EiC: si applica il MENO ALTO tra valore assoluto e percentuale.

## Strategia consigliata

Approccio "compliance-as-asset": non solo rispettare la legge, ma trasformare la conformità in **vantaggio competitivo commerciale**:

- "EiC è il primo gestionale edile italiano nativamente AI Act compliant"
- "Cervello Supremo è progettato con governance by design"
- "I tuoi dati sono al sicuro: certifichiamo i 7 principi non negoziabili dell'AI"

Questo posizionamento differenzia da gestionali "tradizionali" che dovranno rincorrere.
