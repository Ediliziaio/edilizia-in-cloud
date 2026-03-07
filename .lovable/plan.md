

# FIX 3: Email Campaign — Attach Files, Browser Preview, Test Send

## Current State
Three buttons in `CampaignSendSettings.tsx` are placeholders showing `toast.info("Funzionalità in arrivo")`:
- "Allega file" (line 205)
- "Anteprima nel browser" (line 415)
- "Invia email di test" (line 418)

## Implementation Plan

### 1. File Attachments
**In `CampaignSendSettings.tsx`:**
- Add hidden `<input type="file" ref={fileInputRef} accept=".pdf,.png,.jpg,.xlsx" multiple>` 
- Replace the "Allega file" toast button with one that triggers `fileInputRef.current?.click()`
- Add state `attachedFiles: File[]` to track selected files
- Show attached files as removable chips below the header
- Create a storage bucket `campaign-attachments` via SQL migration
- Add `useMutation` to upload files to `campaign-attachments/{campaignId}/` on save
- Files are uploaded when the user clicks "Salva" (alongside other settings)

**SQL Migration:**
```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('campaign-attachments', 'campaign-attachments', false);
CREATE POLICY "Auth users can upload campaign attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'campaign-attachments');
CREATE POLICY "Auth users can read campaign attachments" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'campaign-attachments');
CREATE POLICY "Auth users can delete campaign attachments" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'campaign-attachments');
```

### 2. Browser Preview (Dialog)
- Add a `Dialog` that opens when "Anteprima nel browser" is clicked
- Inside: render the campaign's `html_content` (sanitized with DOMPurify) in a styled container
- If no `html_content`, show `body_text` wrapped in a basic HTML template
- Desktop + mobile toggle tabs in the dialog header

### 3. Test Email Send
- Add a `Dialog` with an email input field
- On confirm, invoke edge function `send-test-email`
- **BLOCKER: No `RESEND_API_KEY` secret exists.** The edge function needs it. I will:
  1. Create the edge function `send-test-email/index.ts` with proper CORS headers and auth
  2. Add `[functions.send-test-email] verify_jwt = false` to config.toml  
  3. Request the user to add the `RESEND_API_KEY` secret before test sending works
  4. The UI will show a clear error if the key is missing

**Edge function `send-test-email/index.ts`:**
- CORS headers included
- Auth via `getUser()` 
- Fetches campaign by ID
- Sends via Resend API using `RESEND_API_KEY` from env
- Returns success/error JSON

### 4. New UI Components Added to `CampaignSendSettings.tsx`
- `Dialog` import (from `@/components/ui/dialog`)
- `useRef` for file input
- 3 new state variables: `attachedFiles`, `previewOpen`, `testEmailOpen`, `testEmailAddress`
- Removable chip list for attached files (with X button)
- Preview Dialog with sanitized HTML render
- Test Email Dialog with input + send button

### Files Changed
| File | Action |
|------|--------|
| `src/pages/azienda/marketing/CampaignSendSettings.tsx` | Major edit — add all 3 features |
| `supabase/functions/send-test-email/index.ts` | Create — edge function for test emails |
| SQL migration | Create bucket `campaign-attachments` + RLS policies |

