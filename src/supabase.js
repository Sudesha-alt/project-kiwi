// Supabase client + all database operations
import { createClient } from '@supabase/supabase-js';

// ⚠️ Replace these with your Supabase project credentials in a .env file
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://pgaexrhcyjnmephpwdbu.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnYWV4cmhjeWpubWVwaHB3ZGJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NjU1ODQsImV4cCI6MjA4OTE0MTU4NH0.rT5m7EBAvetbFIMumleFAZhMbwHZ6KT_Iy66TNSSQ9c';

const isConfigured = SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';

let supabase = null;

if (isConfigured) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export { supabase, isConfigured };

// Helper to check if Supabase is ready
function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured! Please add your SUPABASE_URL and SUPABASE_ANON_KEY in src/supabase.js');
  }
}

// ==================== MATCHES ====================

export async function createMatch({ team1Name, team2Name, totalOvers, tossWinner, tossDecision, lastManStanding }) {
  requireSupabase();
  const { data, error } = await supabase
    .from('matches')
    .insert({
      team1_name: team1Name,
      team2_name: team2Name,
      total_overs: totalOvers,
      toss_winner: tossWinner,
      toss_decision: tossDecision,
      last_man_standing: lastManStanding || false,
      status: 'live',
      current_innings: 1
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getMatches() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getMatch(matchId) {
  requireSupabase();
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateMatch(matchId, updates) {
  requireSupabase();
  const { data, error } = await supabase
    .from('matches')
    .update(updates)
    .eq('id', matchId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ==================== PLAYERS ====================

export async function addPlayers(matchId, team, players) {
  requireSupabase();
  const rows = players.map(p => ({
    match_id: matchId,
    team,
    name: p.name,
    role: p.role
  }));
  const { data, error } = await supabase
    .from('players')
    .insert(rows)
    .select();
  if (error) throw error;
  return data;
}

export async function getPlayers(matchId) {
  requireSupabase();
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('match_id', matchId);
  if (error) throw error;
  return data || [];
}

// ==================== BALL LOG ====================

export async function logBall(ball) {
  requireSupabase();
  const { data, error } = await supabase
    .from('ball_log')
    .insert({
      match_id: ball.matchId,
      innings: ball.innings,
      over_num: ball.overNum,
      ball_num: ball.ballNum,
      batsman_id: ball.batsmanId,
      non_striker_id: ball.nonStrikerId,
      bowler_id: ball.bowlerId,
      runs: ball.runs,
      is_extra: ball.isExtra || false,
      extras_type: ball.extrasType || null,
      extras_runs: ball.extrasRuns || 0,
      is_wicket: ball.isWicket || false,
      wicket_type: ball.wicketType || null,
      dismissed_player_id: ball.dismissedPlayerId || null,
      commentary: ball.commentary || null,
      fielder_id: ball.fielderId || null
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getBallLog(matchId, innings = null) {
  requireSupabase();
  let query = supabase
    .from('ball_log')
    .select('*')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true });
  if (innings !== null) {
    query = query.eq('innings', innings);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function undoLastBall(matchId, innings) {
  requireSupabase();
  const { data, error } = await supabase
    .from('ball_log')
    .select('*')
    .eq('match_id', matchId)
    .eq('innings', innings)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error) return null;
  if (!data) return null;

  await supabase.from('ball_log').delete().eq('id', data.id);
  return data;
}

// ==================== INNINGS SUMMARY ====================

export async function saveInningsSummary(summary) {
  requireSupabase();
  const { data, error } = await supabase
    .from('innings_summary')
    .insert({
      match_id: summary.matchId,
      innings: summary.innings,
      batting_team: summary.battingTeam,
      total_runs: summary.totalRuns,
      total_wickets: summary.totalWickets,
      total_overs_bowled: summary.totalOversBowled,
      extras: summary.extras
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getInningsSummaries(matchId) {
  requireSupabase();
  const { data, error } = await supabase
    .from('innings_summary')
    .select('*')
    .eq('match_id', matchId)
    .order('innings', { ascending: true });
  if (error) throw error;
  return data || [];
}

// ==================== DELETE MATCH ====================

export async function deleteMatch(matchId) {
  requireSupabase();
  // CASCADE will delete players, ball_log, innings_summary
  const { error } = await supabase
    .from('matches')
    .delete()
    .eq('id', matchId);
  if (error) throw error;
}

// ==================== REALTIME SYNC ====================

export function subscribeToBallLog(matchId, onInsert, onDelete) {
  if (!supabase) return null;

  const channel = supabase
    .channel(`ball_log_${matchId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'ball_log', filter: `match_id=eq.${matchId}` },
      (payload) => { if (onInsert) onInsert(payload.new); }
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'ball_log', filter: `match_id=eq.${matchId}` },
      (payload) => { if (onDelete) onDelete(payload.old); }
    )
    .subscribe();

  return channel;
}

export function subscribeToMatch(matchId, onChange) {
  if (!supabase) return null;

  const channel = supabase
    .channel(`match_${matchId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
      (payload) => { if (onChange) onChange(payload.new); }
    )
    .subscribe();

  return channel;
}

export function unsubscribeChannel(channel) {
  if (channel && supabase) {
    supabase.removeChannel(channel);
  }
}
