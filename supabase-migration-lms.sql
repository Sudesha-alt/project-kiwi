-- Migration: Add last_man_standing column to matches table
-- Run this in your Supabase SQL Editor if you already have the existing schema

ALTER TABLE matches ADD COLUMN IF NOT EXISTS last_man_standing BOOLEAN NOT NULL DEFAULT false;
