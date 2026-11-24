-- I sopralluoghi dell'opportunità passano da soli alla commessa che ne nasce.
-- Piano: docs/piano-sopralluoghi-vendita-tecnico.md, lotto 3.
--
-- Prima il rilievo fatto in vendita restava legato al solo contatto/opportunità: in commessa
-- compariva sotto «Sopralluoghi del cliente da collegare» e andava collegato a mano. Ora, quando
-- una commessa riceve un'opportunità (alla creazione o dopo), i sopralluoghi di QUELLA opportunità
-- senza commessa si collegano. Quelli dello stesso contatto su altre trattative no: restano tra
-- i «da collegare», perché potrebbero riguardare un altro lavoro.
-- Il trigger non deve mai fermare la commessa: un errore diventa un avviso nel log.
-- Al 24/11/2026 nessun rilievo esistente era in questa situazione: niente da recuperare.

create or replace function public.sopralluoghi_seguono_commessa()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.opportunity_id is null or new.opportunity_id is not distinct from old.opportunity_id then
    return new;
  end if;
  begin
    update public.surveys s
       set order_id = new.id,
           client_id = coalesce(s.client_id, new.customer_id)
     where s.company_id = new.company_id
       and s.opportunity_id = new.opportunity_id
       and s.order_id is null
       and s.deleted_at is null;
  exception when others then
    raise warning 'Sopralluoghi non collegati alla commessa %: %', new.id, sqlerrm;
  end;
  return new;
end;
$function$;

-- In INSERT «old» non c'è: una funzione a parte per non confrontare con un record vuoto.
create or replace function public.sopralluoghi_seguono_commessa_nuova()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.opportunity_id is null then
    return new;
  end if;
  begin
    update public.surveys s
       set order_id = new.id,
           client_id = coalesce(s.client_id, new.customer_id)
     where s.company_id = new.company_id
       and s.opportunity_id = new.opportunity_id
       and s.order_id is null
       and s.deleted_at is null;
  exception when others then
    raise warning 'Sopralluoghi non collegati alla commessa %: %', new.id, sqlerrm;
  end;
  return new;
end;
$function$;

revoke all on function public.sopralluoghi_seguono_commessa() from public, anon, authenticated;
revoke all on function public.sopralluoghi_seguono_commessa_nuova() from public, anon, authenticated;

drop trigger if exists trg_sopralluoghi_seguono_commessa on public.orders;
create trigger trg_sopralluoghi_seguono_commessa
  after update of opportunity_id on public.orders
  for each row execute function public.sopralluoghi_seguono_commessa();

drop trigger if exists trg_sopralluoghi_seguono_commessa_nuova on public.orders;
create trigger trg_sopralluoghi_seguono_commessa_nuova
  after insert on public.orders
  for each row execute function public.sopralluoghi_seguono_commessa_nuova();
