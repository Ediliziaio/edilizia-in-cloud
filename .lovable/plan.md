

# Sezione Tag nelle Impostazioni + Selettore Tag Riutilizzabile

## Panoramica
Creare una nuova pagina "Tag" nelle impostazioni azienda per gestire centralmente i tag utilizzati in Contatti e Opportunita. Aggiornare il dialog dei contatti con un selettore a tendina che mostra i tag esistenti e permette di crearne di nuovi al volo.

---

## 1. Database - Nuova tabella `marketing_tags`

| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | default gen_random_uuid() |
| company_id | uuid FK companies(id) ON DELETE CASCADE | NOT NULL |
| name | text | NOT NULL, lowercase |
| color | text | nullable (colore opzionale per il badge) |
| created_at | timestamptz | default now() |

- Vincolo UNIQUE su (company_id, name) per evitare duplicati
- RLS: stesse policy degli altri dati azienda (company_admin full, staff read, super_admin full)

---

## 2. Pagina Impostazioni Tag

### Nuovo file: `src/pages/azienda/settings/SettingsTags.tsx`
Pagina wrapper che importa il componente dedicato.

### Nuovo file: `src/components/settings/TagsConfig.tsx`
Componente con:
- Titolo "Tag" + descrizione
- Input per aggiungere nuovo tag + bottone "Aggiungi"
- Lista/tabella dei tag esistenti con nome e bottone elimina
- Conferma eliminazione

---

## 3. Componente Selettore Tag Riutilizzabile

### Nuovo file: `src/components/marketing/TagSelector.tsx`

Componente basato su Popover + Command (cmdk) che:
- Mostra un campo input / bottone che apre un menu a tendina
- Lista i tag gia salvati nel database, filtrabili tramite ricerca
- Permette selezione multipla (checkbox accanto a ogni tag)
- Se il testo digitato non corrisponde a nessun tag esistente, mostra l'opzione "Crea [nuovo tag]" che lo salva nel database e lo seleziona
- Mostra i tag selezionati come badge rimovibili sopra l'input

---

## 4. Aggiornamento ContactDialog

### File: `src/components/marketing/ContactDialog.tsx`
- Sostituire l'attuale input manuale dei tag con il nuovo `TagSelector`
- Il selettore carichera i tag dalla tabella `marketing_tags` e permettera di crearne di nuovi inline

---

## 5. Routing e Sidebar Impostazioni

### File: `src/App.tsx`
- Aggiungere la route `tag` dentro il blocco `impostazioni`:
```
<Route path="tag" element={<SettingsTags />} />
```

### File: `src/components/layouts/CompanyLayout.tsx`
- Aggiungere la voce "Tag" nella sidebar impostazioni, dopo "Fornitori", con icona `Tag` di lucide-react

---

## File coinvolti

| File | Azione |
|------|--------|
| Database migration | Nuova tabella `marketing_tags` + RLS + unique constraint |
| `src/pages/azienda/settings/SettingsTags.tsx` | Nuovo - pagina wrapper |
| `src/components/settings/TagsConfig.tsx` | Nuovo - gestione CRUD tag |
| `src/components/marketing/TagSelector.tsx` | Nuovo - selettore riutilizzabile con creazione inline |
| `src/components/marketing/ContactDialog.tsx` | Modifica - usa TagSelector al posto dell'input manuale |
| `src/App.tsx` | Modifica - aggiunta route `tag` |
| `src/components/layouts/CompanyLayout.tsx` | Modifica - aggiunta voce sidebar impostazioni |

## Cosa NON cambia
- Nessuna modifica alle altre pagine impostazioni
- Nessuna modifica alla tabella `marketing_contacts` (continua a salvare i tag come text[])
- I tag esistenti nei contatti rimangono funzionanti

