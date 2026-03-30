-- P2-02: Process campaign retries every 15 minutes
SELECT cron.schedule(
  'process-campaign-retries',
  '*/15 * * * *',
  $$
  -- Find pending retries and call the campaign manager edge function
  -- This simply updates retry records that are overdue to trigger reprocessing
  -- Actual retry calls are handled by the campaign manager EF when invoked
  UPDATE public.campaign_retry_log
  SET result = 'retry_due'
  WHERE result = 'failed'
    AND next_retry_at <= now()
    AND attempt_number < 3;
  $$
);
