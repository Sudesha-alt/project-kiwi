-- Run this in your Supabase SQL Editor to add commentary and fielder columns
ALTER TABLE ball_log ADD COLUMN IF NOT EXISTS commentary TEXT;
ALTER TABLE ball_log ADD COLUMN IF NOT EXISTS fielder_id UUID REFERENCES players(id);
