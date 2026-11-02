# Ballpark – the office quiz

Three range questions a day, a QR code to play from your phone, and a scoreboard for the office screen.

| Page | Use |
|---|---|
| `index.html` | Office screen. Works in portrait (1080×1920) and landscape (1920×1080). Point your screen template at this URL. |
| `play.html` | Phone page people reach by scanning the QR code. |
| `add.html` | Anyone can add a set of 3 questions; sets queue up for the coming weekdays. |

## How it works
- **Questions**: number questions (with a unit) or "pin it on the map" questions.
- **Scoring**: every answer scores 1–10 000 points, so 30 000 max per day.
  - Number, ratio scoring (default): an exact answer gets 10 000; being off by 10× (Ballpark), ~3× (Tight) or 100× (Loose) gets 1 point.
  - Number, plain difference: the author sets how far off scores 1 point (good for years).
  - Map: distance-based; the author picks the radius where points bottom out.
- **Schedule**: one set per weekday (Stockholm time), taken from the queue in the order added. No questions on weekends.
- **Points right away**: players see their points per question as soon as they lock in, and the screen's scoreboard
  updates live with a "Today" column (turn off with `showLivePoints` in `config.js`). Correct answers, closest guesses and facts are revealed the next morning.
  The scoreboard covers the current month.
- **Pictures**: a question can have an uploaded image (stored in the Supabase bucket `quiz-images`, resized to max 1400 px)
  or a red line drawn between two places on a map.
- **Fits the screen**: long questions shrink to fit and the scoreboard shows as many rows as fit.
- **Players**: type a name once on the phone, no sign-up. One answer per name per day. Authors can't answer their own set.

## Setup
Hosted on GitHub Pages from `main`. Map tiles: Esri (no labels) with automatic fallback to OpenStreetMap. Supabase settings are in `config.js` (the publishable key is meant to be public;
tables are locked down and only the `quiz_*` functions are callable).

To remove or edit a queued set, use the Supabase table editor (`quiz_sets` / `quiz_questions`).
