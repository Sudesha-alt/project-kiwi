// Hinglish summary generator — uses match commentary in the summary

export function generateHinglishSummary(match, players, ballLog, inningsSummaries) {
  const lines = [];
  const team1 = match.team1_name;
  const team2 = match.team2_name;

  lines.push(pickRandom([
    `🏏 Aaj ka maha muqabla tha **${team1}** vs **${team2}** — aur bhai kya mast match raha!`,
    `🔥 Bhai aaj **${team1}** aur **${team2}** ke beech full-on cricket ka dhamaal hua!`,
    `⚡ **${team1}** vs **${team2}** — aaj ka match sachhi mein yaad rakhne wala tha!`,
  ]));
  lines.push('');

  for (const summary of inningsSummaries) {
    const battingTeam = summary.batting_team === 1 ? team1 : team2;
    const inningsBalls = ballLog.filter(b => b.innings === summary.innings);

    lines.push(summary.innings === 1
      ? `📋 **Pehle ${battingTeam} ne batting ki:**`
      : `📋 **Phir ${battingTeam} ne chase kiya:**`
    );
    lines.push(`Score: **${summary.total_runs}/${summary.total_wickets}** (${summary.total_overs_bowled} overs)`);
    lines.push('');

    // Batting stats
    const batsmanStats = {};
    const commentaryHighlights = [];

    for (const ball of inningsBalls) {
      if (!batsmanStats[ball.batsman_id]) batsmanStats[ball.batsman_id] = { runs: 0, balls: 0, fours: 0, sixes: 0, out: false };
      const bRuns = ball.is_extra && ball.extras_type === 'wide' ? 0 : ball.runs;
      if (!ball.is_extra || ball.extras_type !== 'wide') batsmanStats[ball.batsman_id].balls++;
      if (!ball.is_extra) batsmanStats[ball.batsman_id].runs += bRuns;
      if (bRuns === 4 && !ball.is_extra) batsmanStats[ball.batsman_id].fours++;
      if (bRuns === 6 && !ball.is_extra) batsmanStats[ball.batsman_id].sixes++;
      if (ball.is_wicket && ball.dismissed_player_id) {
        if (batsmanStats[ball.dismissed_player_id]) batsmanStats[ball.dismissed_player_id].out = true;
      }

      // Collect commentary for key moments
      if (ball.commentary) {
        if (ball.is_wicket) {
          const dismissed = players.find(p => p.id === ball.dismissed_player_id);
          commentaryHighlights.push({ type: 'wicket', text: ball.commentary, player: dismissed?.name, over: `${ball.over_num}.${ball.ball_num}` });
        } else if (bRuns === 6) {
          const bat = players.find(p => p.id === ball.batsman_id);
          commentaryHighlights.push({ type: 'six', text: ball.commentary, player: bat?.name, over: `${ball.over_num}.${ball.ball_num}` });
        } else if (bRuns === 4) {
          const bat = players.find(p => p.id === ball.batsman_id);
          commentaryHighlights.push({ type: 'four', text: ball.commentary, player: bat?.name, over: `${ball.over_num}.${ball.ball_num}` });
        }
      }
    }

    // Top scorer
    const topScorer = Object.entries(batsmanStats).sort((a, b) => b[1].runs - a[1].runs)[0];
    if (topScorer) {
      const player = players.find(p => p.id === topScorer[0]);
      const st = topScorer[1];
      if (player && st.runs > 0) {
        if (st.runs >= 50) {
          lines.push(pickRandom([
            `🌟 **${player.name}** ne toh **${st.runs} runs thok diye** (${st.balls} balls)! Fifty laga ke sabko chup kara diya 🔥`,
            `💥 **${player.name}** tha full form mein — **${st.runs}(${st.balls})** with ${st.fours} fours & ${st.sixes} sixes!`,
          ]));
        } else if (st.runs >= 30) {
          lines.push(`💪 **${player.name}** ne achha kaam kiya — **${st.runs}(${st.balls})**, solid innings thi!`);
        } else {
          lines.push(`🏏 **${player.name}** top scorer raha **${st.runs}(${st.balls})** runs ke saath.`);
        }
      }
    }

    // Include user commentary highlights
    if (commentaryHighlights.length > 0) {
      lines.push('');
      lines.push(`📝 **Key Moments:**`);
      for (const h of commentaryHighlights.slice(0, 5)) {
        const emoji = h.type === 'wicket' ? '🔴' : h.type === 'six' ? '🚀' : '💥';
        lines.push(`${emoji} *${h.over}*: ${h.text}`);
      }
    }

    // Ducks
    const ducks = Object.entries(batsmanStats).filter(([id, s]) => s.runs === 0 && s.out);
    for (const [id] of ducks) {
      const player = players.find(p => p.id === id);
      if (player) lines.push(pickRandom([
        `🦆 **${player.name}** to bina khate seedha pavilion chala gaya — duck out bhai!`,
        `😂 **${player.name}** ka toh aaj kuch nahi hua, golden duck le ke vapas aa gaya!`,
      ]));
    }

    // Sixes
    const totalSixes = Object.values(batsmanStats).reduce((sum, s) => sum + s.sixes, 0);
    if (totalSixes >= 5) {
      lines.push(`🚀 Total **${totalSixes} sixes** udd gayi innings mein! 😂`);
    }

    // Bowling
    const bowlerStats = {};
    for (const ball of inningsBalls) {
      if (!bowlerStats[ball.bowler_id]) bowlerStats[ball.bowler_id] = { runs: 0, wickets: 0, balls: 0 };
      bowlerStats[ball.bowler_id].runs += ball.runs + (ball.extras_runs || 0);
      if (ball.is_wicket) bowlerStats[ball.bowler_id].wickets++;
      const isLegal = !ball.is_extra || ball.extras_type === 'bye' || ball.extras_type === 'legbye';
      if (isLegal) bowlerStats[ball.bowler_id].balls++;
    }

    const topBowler = Object.entries(bowlerStats).sort((a, b) => b[1].wickets - a[1].wickets)[0];
    if (topBowler) {
      const player = players.find(p => p.id === topBowler[0]);
      const bs = topBowler[1];
      const overs = Math.floor(bs.balls / 6) + '.' + (bs.balls % 6);
      if (player && bs.wickets >= 3) {
        lines.push(pickRandom([
          `🎯 **${player.name}** ne **${bs.wickets} wicket** ukhad diye (${overs} ov mein ${bs.runs} runs) — batsmen ki halat kharab!`,
          `🔥 **${player.name}** tha bowling mein danger — **${bs.wickets}/${bs.runs}** (${overs} ov)!`,
        ]));
      } else if (player && bs.wickets >= 1) {
        lines.push(`🎯 **${player.name}** rahe best bowler — **${bs.wickets}/${bs.runs}** (${overs} ov).`);
      }
    }

    if (summary.extras > 5) {
      lines.push(`📦 Extras mein **${summary.extras} runs** gift mein de diye — bowling side tight nahi thi yaar!`);
    }

    lines.push('');
  }

  // Result
  if (match.winner) {
    lines.push('---');
    lines.push('');
    const loser = match.winner === team1 ? team2 : team1;
    lines.push(pickRandom([
      `🏆 **${match.winner}** ne **${loser}** ko ${match.margin || ''} se dhoya! 🎉`,
      `🥇 Final: **${match.winner}** WINS ${match.margin || ''}! 🙌`,
    ]));
    if (match.margin?.includes('1 run') || match.margin?.includes('1 wicket')) {
      lines.push(`😱 Kya close match tha — last moment tak dil dhak dhak!`);
    }

    // Include any commentary from the winning/final ball
    const lastBall = ballLog[ballLog.length - 1];
    if (lastBall?.commentary) {
      lines.push(`📝 Last ball: *"${lastBall.commentary}"*`);
    }
  }

  lines.push('');
  lines.push(pickRandom([
    `🏏 *Gully Scorecard: "Cricket is love, baki sab bakwaas!"*`,
    `🏏 *Gully Scorecard: "Har gali mein ek Sachin chupa hai!"*`,
    `🏏 *Gully Scorecard: "Jeetna haarna lagaa rehta hai, maza khelne mein hai!"*`,
  ]));

  return lines.join('\n');
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
