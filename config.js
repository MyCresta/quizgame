// Public settings. The publishable key is safe to expose: the database only
// allows the quiz_* RPC functions, and answers stay hidden until the next day.
export const CONFIG = {
  title: 'Ballpark',
  tagline: '3 questions a day · up to 30 000 points',
  supabaseUrl: 'https://qvboidhwptpiduruiyfb.supabase.co',
  supabaseKey: 'sb_publishable_vlH6f9yVTWmnkU8-7b_q1g_Wtz4tKf1',
  // How many players to show on the office screen scoreboard
  scoreboardSize: 10,
  // Show each player's points for today on the screen right after they answer
  // (correct answers are still only revealed the next morning).
  showLivePoints: true,
};
