
DROP TABLE IF EXISTS public.predictions;

CREATE TABLE public.predictions (
  match_id bigint NOT NULL,
  predictor text NOT NULL,
  pick text NOT NULL,
  reasoning text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, predictor)
);
GRANT SELECT ON public.predictions TO anon, authenticated;
GRANT ALL ON public.predictions TO service_role;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read predictions" ON public.predictions FOR SELECT USING (true);

CREATE TABLE public.predictors (
  id text PRIMARY KEY,
  name text NOT NULL,
  tagline text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.predictors TO anon, authenticated;
GRANT ALL ON public.predictors TO service_role;
ALTER TABLE public.predictors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read predictors" ON public.predictors FOR SELECT USING (true);

INSERT INTO public.predictors (id, name, tagline, sort_order) VALUES
  ('juhani',   'Juhani Vanhatapio', 'That''s you.', 0),
  ('random',   'Richard Random',    'Flips a coin. Trusts the universe.', 1),
  ('stats',    'Sara Statistics',   'Rankings & numbers don''t lie.', 2),
  ('magician', 'Matt Magician',     'ML-flavored probability wizardry.', 3),
  ('adriana',  'Adriana Idriano',   'AI-powered football pundit.', 4),
  ('vibes',    'Valerie Vibes',     'Mysterious. Trust the vibes.', 5);
