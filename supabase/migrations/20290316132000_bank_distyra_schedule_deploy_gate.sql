-- Prepared disabled. Enable only after the bank-distyra worker is deployed and verified.
-- The four UTC gates produce only two calls: 07:00 and 18:00 Europe/Rome in both seasons.
DO $$ DECLARE j bigint; BEGIN
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='bank-distyra-twice-daily') THEN
  j:=cron.schedule('bank-distyra-twice-daily','0 5,6,16,17 * * *',$job$SELECT public.bank_sync_enqueue();$job$);
  PERFORM cron.alter_job(j,active:=false);
 END IF;
END $$;
