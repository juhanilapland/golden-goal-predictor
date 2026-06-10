CREATE TABLE public.rival_personas (
  rival_id text PRIMARY KEY,
  persona text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rival_personas TO anon, authenticated;
GRANT ALL ON public.rival_personas TO service_role;

ALTER TABLE public.rival_personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read personas" ON public.rival_personas FOR SELECT USING (true);
CREATE POLICY "Anyone can write personas" ON public.rival_personas FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER rival_personas_touch_updated_at
  BEFORE UPDATE ON public.rival_personas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();