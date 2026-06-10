
CREATE TABLE public.matches (
  id BIGINT PRIMARY KEY,
  stage TEXT NOT NULL,
  group_name TEXT,
  kickoff TIMESTAMPTZ NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_code TEXT,
  away_code TEXT,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  home_score INT,
  away_score INT,
  outcome TEXT CHECK (outcome IN ('home','draw','away')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.matches TO anon, authenticated;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read matches" ON public.matches FOR SELECT USING (true);

CREATE TABLE public.guesses (
  match_id BIGINT PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  pick TEXT NOT NULL CHECK (pick IN ('home','draw','away')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guesses TO anon, authenticated;
GRANT ALL ON public.guesses TO service_role;
ALTER TABLE public.guesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read guesses" ON public.guesses FOR SELECT USING (true);
CREATE POLICY "Anyone can write guesses" ON public.guesses FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.predictions (
  match_id BIGINT PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  pick TEXT NOT NULL CHECK (pick IN ('home','draw','away')),
  reasoning TEXT,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.predictions TO anon, authenticated;
GRANT ALL ON public.predictions TO service_role;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read predictions" ON public.predictions FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_matches_updated BEFORE UPDATE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_guesses_updated BEFORE UPDATE ON public.guesses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_matches_kickoff ON public.matches(kickoff);
CREATE INDEX idx_matches_stage ON public.matches(stage);
