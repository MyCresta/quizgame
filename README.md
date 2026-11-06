# Ballpark – the office quiz

Three range questions a day, a QR code to play from your phone, and a scoreboard for the office screen.

| Page | Use |
|---|---|
| `index.html` | Office screen. Works in portrait (1080×1920) and landscape (1920×1080). Point your screen template at this URL. |
| `play.html` | Phone page people reach by scanning the QR code. |
| `add.html` | Anyone can add a set of 3 questions (with a live preview); sets queue up for the coming weekdays. |
| `admin.html` | Password-protected: edit, reorder, delete or park sets as backups, fix wrong answers (points are recalculated), remove fake answers. |

## How it works
- **Question types** (every answer scores 1–10 000 points, closer = more):
  - **Number** with a unit (distances, weights, years…)
  - **Map pin**: players get a map with no place names and limited zoom. Add a photo for "Where was this taken?"
  - **Percent**: a 0–100 % slider
  - **Timer**: tap Start, then Stop at exactly N seconds with no clock shown (one try)
  - **Colour**: mix a colour with a picker (scored by how close it looks: CIEDE2000 colour difference plus a penalty for the wrong colour family, so any shade of the right colour scores well)
  - **Sort**: drag 3–6 items into the right order (scored by how many pairs are in the right order)
  - **Rhythm**: tap a famous rhythm from memory. The author says exactly what to tap: either sung words (typed with
    dashes between syllables, shown to players as boxes that light up per tap) or something else ("the whistling at the
    very start"), and records the real rhythm by tapping along. Players practise on the first line of "Små grodorna" (with syllables lighting up), then tap it.
    Scored on rhythm only: your first tap lines up with the first note, your taps are stretched to the speed that fits all notes best (least squares), and the average miss per note is scored, so speed never counts. After submitting, players see their taps against the real rhythm; the next day the screen shows the closest player's taps. Test it in Admin → Try it (built-in: Tetris, Nokia ringtone, Jingle Bells). Questions replaced with "Put this song in the quiz" are kept in Backups → Spare questions.
- **Scoring**: every answer scores 1–10 000 points, so 30 000 max per day.
  - Number, ratio scoring (default): an exact answer gets 10 000; being off by 10× (Ballpark), ~3× (Tight) or 100× (Loose) gets 1 point.
  - Number, plain difference: the author sets how far off scores 1 point (good for years).
  - Map: distance-based; the author picks the radius where points bottom out.
- **Schedule**: one set per weekday (Stockholm time), taken from the queue in the order added (admins can reorder).
  When the queue is empty a random **backup set** is used instead. No questions on weekends.
- **Source link**: each question can have an optional source link, shown with the answer at the reveal.
- **Points right away**: players see their points per question as soon as they lock in, and the screen's scoreboard
  updates live with a "Today" column (turn off with `showLivePoints` in `config.js`). Correct answers, closest guesses and facts are revealed the next morning.
  The scoreboard covers the current month.
- **Pictures**: a question can have an image link (https://…). Nothing is stored in the database; the page checks the link
  loads before the set can be submitted, and hides the picture if the link later breaks.
- **Fits the screen**: long questions shrink to fit and the scoreboard shows as many rows as fit.
- **Players**: type a name once on the phone, no sign-up. One answer per name per day. Authors can't answer their own set.

## Setup
Hosted on GitHub Pages from `main`. Map tiles: Esri (no labels) with automatic fallback to OpenStreetMap. Supabase settings are in `config.js` (the publishable key is meant to be public;
tables are locked down and only the `quiz_*` functions are callable).

**Office screen key and daily join code:** the screen's address has a secret key (`index.html?screen=…`, copy it
from Admin → Settings). With that key, the screen's QR code carries a code that changes every day. When the join-code
check is turned on (Admin → Settings), only people who scanned today's QR code can answer, and opening the quiz
address without the key shows no QR code, questions or names.

Admin page: `admin.html`. Change the password under Settings after the first login.

**One-time setup:** run `supabase/one_time_cleanup.sql` once in Supabase → SQL Editor. It enables the two delete
buttons on the admin page (delete set, remove a player's answers) and removes leftovers from earlier experiments.

## Challenge lab (testing)
Admin → Try it → "New challenge types" has playable test versions of: perfect circle, draw a country,
fill the glass, beans in a jar, centre of mass and match the angle (`lab.js`, outlines in `shapes.js`
from Natural Earth 1:50m, public domain). Each has a Settings panel to tune scoring. Not in the quiz yet.
