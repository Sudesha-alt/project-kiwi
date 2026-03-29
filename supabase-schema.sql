-- Gully Scorecard — Supabase Schema
-- Run this in your Supabase SQL Editor

-- Matches table
CREATE TABLE series (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  team1_name TEXT NOT NULL,
  team2_name TEXT NOT NULL,
  total_matches INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Matches table
CREATE TABLE matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  series_id UUID REFERENCES series(id) ON DELETE SET NULL,
  team1_name TEXT NOT NULL,
  team2_name TEXT NOT NULL,
  total_overs INTEGER NOT NULL DEFAULT 20,
  toss_winner INTEGER NOT NULL DEFAULT 1, -- 1 or 2
  toss_decision TEXT NOT NULL DEFAULT 'bat', -- 'bat' or 'bowl'
  status TEXT NOT NULL DEFAULT 'setup', -- 'setup', 'live', 'completed'
  current_innings INTEGER NOT NULL DEFAULT 1,
  last_man_standing BOOLEAN NOT NULL DEFAULT false,
  winner TEXT,
  margin TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Players table
CREATE TABLE players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  team INTEGER NOT NULL, -- 1 or 2
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'batsman' -- 'batsman', 'bowler', 'all-rounder', 'wk'
);

-- Ball log — every delivery
CREATE TABLE ball_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  innings INTEGER NOT NULL DEFAULT 1,
  over_num INTEGER NOT NULL,
  ball_num INTEGER NOT NULL, -- legal ball number in the over (1-6)
  batsman_id UUID REFERENCES players(id),
  non_striker_id UUID REFERENCES players(id),
  bowler_id UUID REFERENCES players(id),
  runs INTEGER NOT NULL DEFAULT 0,
  is_extra BOOLEAN DEFAULT false,
  extras_type TEXT, -- 'wide', 'noball', 'bye', 'legbye', null
  extras_runs INTEGER DEFAULT 0,
  is_wicket BOOLEAN DEFAULT false,
  wicket_type TEXT, -- 'bowled', 'caught', 'lbw', 'runout', 'stumped', 'hitwicket'
  dismissed_player_id UUID REFERENCES players(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Innings summary
CREATE TABLE innings_summary (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  innings INTEGER NOT NULL,
  batting_team INTEGER NOT NULL,
  total_runs INTEGER NOT NULL DEFAULT 0,
  total_wickets INTEGER NOT NULL DEFAULT 0,
  total_overs_bowled NUMERIC(5,1) NOT NULL DEFAULT 0,
  extras INTEGER NOT NULL DEFAULT 0
);

-- Enable Row Level Security (allow all for now — add auth later)
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE ball_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE innings_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE series ENABLE ROW LEVEL SECURITY;

-- Public access policies (for anon key usage)
CREATE POLICY "Allow all on matches" ON matches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on players" ON players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on ball_log" ON ball_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on innings_summary" ON innings_summary FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on series" ON series FOR ALL USING (true) WITH CHECK (true);
