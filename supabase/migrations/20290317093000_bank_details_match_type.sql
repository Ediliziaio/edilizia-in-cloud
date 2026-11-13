SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('private.bank_movimento_links(uuid,uuid)'::regprocedure) INTO def;
 IF strpos(def,'''match_type'',r.match_type')=0 THEN
  def:=replace(def,'''split'',r.ripartita,','''split'',r.ripartita,''match_type'',r.match_type,');
  IF strpos(def,'''match_type'',r.match_type')=0 THEN RAISE EXCEPTION 'Rivedere tipo abbinamento';END IF;
  EXECUTE def;
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
