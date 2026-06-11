ALTER TABLE public.predictions
  ADD COLUMN prob_home NUMERIC(5,4) DEFAULT NULL,
  ADD COLUMN prob_draw NUMERIC(5,4) DEFAULT NULL,
  ADD COLUMN prob_away NUMERIC(5,4) DEFAULT NULL;

GRANT SELECT ON public.predictions TO anon;
GRANT SELECT, INSERT, UPDATE ON public.predictions TO authenticated;
GRANT ALL ON public.predictions TO service_role;