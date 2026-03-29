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

export async function createMatch({ team1Name, team2Name, totalOvers, tossWinner, tossDecision, lastManStanding, seriesId }) {
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
      series_id: seriesId || null,
      status: 'live',
      current_innings: 1
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ==================== SERIES & CLONE ====================

export async function createSeries(name, team1Name, team2Name, totalMatches) {
  requireSupabase();
  const { data, error } = await supabase
    .from('series')
    .insert({
      name,
      team1_name: team1Name,
      team2_name: team2Name,
      total_matches: totalMatches
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getSeriesList() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('series')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getSeries(seriesId) {
  requireSupabase();
  const { data, error } = await supabase
    .from('series')
    .select('*')
    .eq('id', seriesId)
    .single();
  if (error) throw error;
  return data;
}

export async function getSeriesMatches(seriesId) {
  requireSupabase();
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('series_id', seriesId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getSeriesPlayerStats(seriesId) {
  requireSupabase();
  const matches = await getSeriesMatches(seriesId);
  const completedMatches = matches.filter(m => m.status === 'completed');
  if (completedMatches.length === 0) return { players: {}, rankings: [] };

  const matchIds = completedMatches.map(m => m.id);
  
  // Fetch all players for these matches
  const { data: allPlayers, error: pErr } = await supabase
    .from('players')
    .select('*')
    .in('match_id', matchIds);
  if (pErr) throw pErr;

  // Fetch all balls for these matches
  const { data: allBalls, error: bErr } = await supabase
    .from('ball_log')
    .select('*')
    .in('match_id', matchIds);
  if (bErr) throw bErr;

  // Aggregate stats by normalized player name (since IDs change per match)
  const stats = {};

  allPlayers.forEach(p => {
    const name = p.name.trim().toLowerCase();
    if (!stats[name]) {
      stats[name] = {
        name: p.name,
        team: p.team,
        matchesPlayed: new Set(),
        bat: { runs: 0, balls: 0, fours: 0, sixes: 0, dismissals: 0, innings: 0 },
        bowl: { runs: 0, balls: 0, wickets: 0, innings: 0 },
        field: { catches: 0, runouts: 0, stumpings: 0 },
        impact: 0
      };
    }
    stats[name].matchesPlayed.add(p.match_id);
  });

  // Process balls
  allBalls.forEach(ball => {
    const striker = allPlayers.find(p => p.id === ball.batsman_id);
    const bowler = allPlayers.find(p => p.id === ball.bowler_id);
    
    // Batting
    if (striker) {
      const sName = striker.name.trim().toLowerCase();
      const st = stats[sName].bat;
      const bRuns = ball.is_extra && ball.extras_type === 'wide' ? 0 : ball.runs;
      if (!ball.is_extra || ball.extras_type !== 'wide') st.balls++;
      if (!ball.is_extra) st.runs += bRuns;
      if (bRuns === 4 && !ball.is_extra) st.fours++;
      if (bRuns === 6 && !ball.is_extra) st.sixes++;
    }

    // Bowling
    if (bowler) {
      const bName = bowler.name.trim().toLowerCase();
      const bst = stats[bName].bowl;
      bst.runs += ball.runs + (ball.extras_runs || 0);
      const isLegal = !ball.is_extra || ball.extras_type === 'bye' || ball.extras_type === 'legbye';
      if (isLegal) bst.balls++;
      if (ball.is_wicket && !['runout', 'obstructing', 'retired'].includes(ball.wicket_type)) {
        bst.wickets++;
      }
    }

    // Dismissals & Fielding
    if (ball.is_wicket && ball.dismissed_player_id) {
      const dismissed = allPlayers.find(p => p.id === ball.dismissed_player_id);
      if (dismissed) {
        const dName = dismissed.name.trim().toLowerCase();
        stats[dName].bat.dismissals++;
      }

      if (ball.fielder_id) {
        const fielder = allPlayers.find(p => p.id === ball.fielder_id);
        if (fielder) {
          const fName = fielder.name.trim().toLowerCase();
          const fst = stats[fName].field;
          if (ball.wicket_type === 'caught') fst.catches++;
          else if (ball.wicket_type === 'runout') fst.runouts++;
          else if (ball.wicket_type === 'stumped') fst.stumpings++;
        }
      }
    }
  });

  // Calculate Impact Score (similar to summary.js but cumulative)
  Object.values(stats).forEach(p => {
    let score = 0;
    
    // Bat: 1 pt per run, 2 for four, 4 for six
    score += p.bat.runs;
    score += p.bat.fours * 2;
    score += p.bat.sixes * 4;
    // SR bonus if balls > 10 across series
    if (p.bat.balls > 10) {
      const sr = (p.bat.runs / p.bat.balls) * 100;
      if (sr > 150) score += 20;
      else if (sr > 120) score += 10;
    }
    // Milestones
    const fifties = Math.floor(p.bat.runs / 50); // rough estimation for series milestones
    score += fifties * 15;

    // Bowl: 20 per wicket
    score += p.bowl.wickets * 20;
    // Econ bonus if bowled > 4 overs
    if (p.bowl.balls > 24) {
      const econ = p.bowl.runs / (p.bowl.balls / 6);
      if (econ < 6) score += 20;
      else if (econ < 8) score += 10;
    }
    const fifers = Math.floor(p.bowl.wickets / 5);
    score += fifers * 20;

    // Field
    score += p.field.catches * 5;
    score += p.field.runouts * 5;
    score += p.field.stumpings * 5;

    p.impact = score;
  });

  const rankings = Object.values(stats)
    .sort((a, b) => b.impact - a.impact)
    .filter(p => p.impact > 0 || p.matchesPlayed.size > 0);

  return { 
    players: stats, 
    rankings: rankings
  };
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

export async function addSinglePlayer(matchId, team, player) {
  requireSupabase();
  const { data, error } = await supabase
    .from('players')
    .insert({ match_id: matchId, team, name: player.name, role: player.role })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePlayer(playerId, updates) {
  requireSupabase();
  const { data, error } = await supabase
    .from('players')
    .update(updates)
    .eq('id', playerId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePlayer(playerId) {
  requireSupabase();
  // Check if player has ball_log entries
  const { count } = await supabase
    .from('ball_log')
    .select('*', { count: 'exact', head: true })
    .or(`batsman_id.eq.${playerId},non_striker_id.eq.${playerId},bowler_id.eq.${playerId},dismissed_player_id.eq.${playerId}`);
  if (count > 0) {
    throw new Error('Ye player already khelchuka hai — delete nahi kar sakte!');
  }
  const { error } = await supabase.from('players').delete().eq('id', playerId);
  if (error) throw error;
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
