-- Migration: Add series support
-- Run this in your Supabase SQL Editor if you already have the existing schema

-- 1. Create series table
CREATE TABLE IF NOT EXISTS series (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  team1_name TEXT NOT NULL,
  team2_name TEXT NOT NULL,
  total_matches INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add series_id to matches
ALTER TABLE matches ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES series(id) ON DELETE SET NULL;

-- 3. Enable RLS and public access for series
ALTER TABLE series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on series" ON series FOR ALL USING (true) WITH CHECK (true);
