-- Un dato protetto cambiato senza il permesso si rifiuta con il nome del permesso (14/11/2026).
--
-- Le viste *_visibili (orders, order_installments, order_employees, campo_rapportini,
-- employees) scrivono attraverso private.office_projection_write. Le colonne protette da un
-- diritto che l'utente non ha (private.office_projection_fields: importi, pagamenti, costi,
-- personale) venivano TOLTE in silenzio: il salvataggio rispondeva «fatto» e il dato non c'era.
-- Una rata nasceva da 0 €, un importo spariva. Regola del titolare: ogni errore di permesso deve
-- dire il permesso.
-- Ora: un valore protetto vuoto (quello che la vista mostra a chi non ha il diritto) o uguale a
-- quello salvato passa come prima, senza scrivere; un valore nuovo si rifiuta con 42501 e il
-- nome del permesso.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $patch$
declare
  v_def text := pg_get_functiondef('private.office_projection_write()'::regprocedure);
  v_vecchio constant text := ' if not coalesce((rights->>protected.right_name)::boolean,false) or (protected.right_name=''payments'' and not coalesce((rights->>''amounts'')::boolean,false)) then changed:=changed-protected.column_name; end if;';
  v_nuovo constant text := ' if (not coalesce((rights->>protected.right_name)::boolean,false) or (protected.right_name=''payments'' and not coalesce((rights->>''amounts'')::boolean,false))) and changed ? protected.column_name then
   -- dato protetto: vuoto o uguale al salvato passa senza scrivere; diverso si rifiuta col permesso
   if (changed->protected.column_name) in (''null''::jsonb,''false''::jsonb,''0''::jsonb,''""''::jsonb)
      or (before_row is not null and (changed->protected.column_name) = (before_row->protected.column_name)) then
    changed:=changed-protected.column_name;
   else
    raise exception ''Il dato «%» lo cambia solo chi ha il permesso «%». Chiedi al titolare dell''''azienda di darti l''''accesso.'',
     case protected.column_name when ''total_amount'' then ''importo totale'' when ''vat_rate'' then ''IVA'' when ''amount'' then ''importo della rata''
      when ''payment_type'' then ''tipo di pagamento'' when ''is_paid'' then ''pagata'' when ''paid_date'' then ''data di pagamento''
      when ''financing_cost'' then ''costo della finanziaria'' when ''costo_orario'' then ''costo orario'' when ''cost_preventivo'' then ''costo previsto''
      when ''notes'' then ''note'' else replace(protected.column_name,''_'','' '') end,
     case protected.right_name when ''amounts'' then ''Venduto e importi'' when ''payments'' then ''Venduto e importi''
      when ''costs'' then ''Costi'' when ''personal'' then ''Costi e Personale'' else protected.right_name end
     using errcode=''42501'';
   end if;
  end if;';
begin
  if position('dato protetto: vuoto o uguale' in v_def) > 0 then return; end if;
  if position(v_vecchio in v_def) = 0 then raise exception 'office_projection_write: punto da sostituire non trovato'; end if;
  execute replace(v_def, v_vecchio, v_nuovo);
end
$patch$;
