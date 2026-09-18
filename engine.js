// The adaptive core: which fact to ask, what to put beside the right answer,
// and when the kid has earned the next level.
//
// Two dials move together as levels rise — how many answers are on screen,
// and which tables are in the bag. A third dial (how tightly the distractors
// cluster around the correct answer) moves quietly underneath both.

export const ROUND_LENGTH = 12
export const SHIELD_EVERY = 3     // cleared rounds per banked shield
export const MAX_SHIELDS = 1
export const FAILS_BEFORE_EASE = 3
export const CLEARS_TO_UNEASE = 2

const ALL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const TO_TEN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export const LEVELS = [
  { n: 1,  choices: 2, pool: [0, 1, 2, 5, 10],             paceMs: 6000, promote: 2 },
  { n: 2,  choices: 2, pool: [0, 1, 2, 3, 4, 5, 10],       paceMs: 5500, promote: 2 },
  { n: 3,  choices: 3, pool: [0, 1, 2, 3, 4, 5, 10],       paceMs: 5500, promote: 2 },
  { n: 4,  choices: 3, pool: [0, 1, 2, 3, 4, 5, 6, 9, 10], paceMs: 5000, promote: 2 },
  { n: 5,  choices: 4, pool: TO_TEN,                       paceMs: 5000, promote: 3 },
  { n: 6,  choices: 4, pool: TO_TEN,                       paceMs: 4500, promote: 3 },
  { n: 7,  choices: 5, pool: TO_TEN,                       paceMs: 4500, promote: 3 },
  { n: 8,  choices: 5, pool: ALL,                          paceMs: 4000, promote: 3 },
  { n: 9,  choices: 6, pool: ALL,                          paceMs: 4000, promote: 3 },
  { n: 10, choices: 6, pool: ALL,                          paceMs: 3500, promote: null },
]

export const MAX_LEVEL = LEVELS.length

export function levelFor(n) {
  return LEVELS[Math.min(Math.max(n, 1), MAX_LEVEL) - 1]
}

export function factKey(a, b) {
  return a + 'x' + b
}

const DEFAULT_STRENGTH = 2
const MAX_STRENGTH = 5

export function strengthOf(facts, a, b) {
  const f = facts[factKey(a, b)]
  return f && typeof f.strength === 'number' ? f.strength : DEFAULT_STRENGTH
}

// Correct and quick builds strength; correct but slow holds it; wrong costs
// two, because a miss says more about a fact than a single hit does.
export function nextStrength(current, wasCorrect, ms, paceMs) {
  const base = typeof current === 'number' ? current : DEFAULT_STRENGTH
  let delta
  if (!wasCorrect) delta = -2
  else delta = ms <= paceMs ? 1 : 0
  return Math.max(0, Math.min(MAX_STRENGTH, base + delta))
}

function factsInPool(level) {
  const out = []
  for (const a of level.pool) {
    for (let b = 0; b <= 12; b++) out.push([a, b])
  }
  return out
}

// The first question of every round is a fact the kid owns. Losing on
// question 1 of a 12-question round is the fastest way to put the iPad down.
export function pickFact(facts, level, isFirst, eased) {
  const pool = factsInPool(level)
  if (isFirst) {
    let best = pool[0]
    let bestScore = -1
    for (const [a, b] of pool) {
      const score = strengthOf(facts, a, b) + Math.random() * 0.9
      if (score > bestScore) { bestScore = score; best = [a, b] }
    }
    return best
  }
  // Weight toward weak facts, but flatten the curve while eased so a
  // struggling round fills up with facts he actually knows.
  const lean = eased ? 1.2 : 3
  let total = 0
  const weights = pool.map(([a, b]) => {
    const w = 1 + lean * (1 - strengthOf(facts, a, b) / MAX_STRENGTH)
    total += w
    return w
  })
  let r = Math.random() * total
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]
    if (r <= 0) return pool[i]
  }
  return pool[pool.length - 1]
}

// Wrong answers are the pedagogy. Random distractors make a 6-option board
// EASIER than a 2-option one, because five of them are obviously absurd.
// These are the mistakes a 3rd grader actually makes.
export function distractorsFor(a, b, count, level, eased) {
  const correct = a * b
  const seen = new Set([correct])
  const pool = []
  const push = (v) => {
    const n = Math.round(v)
    if (n >= 0 && n <= 200 && !seen.has(n)) { seen.add(n); pool.push(n) }
  }

  // Neighbour multiples: landing one square off in the table.
  push(a * (b + 1)); push(a * (b - 1))
  push((a + 1) * b); push((a - 1) * b)
  // The add-instead-of-multiply slip, only while it is still a real error.
  if (level.n <= 4) push(a + b)
  // Digit transposition forces a real read instead of a glance.
  if (correct >= 10 && correct < 100) {
    const s = String(correct)
    push(Number(s[1] + s[0]))
  }
  push(a * (b + 2)); push(a * (b - 2))
  push(correct + 1); push(correct - 1)
  push(correct + 2); push(correct - 2)
  push(correct + 10); push(correct - 10)
  push(correct + a + b); push(correct + 5)

  let guard = 0
  while (pool.length < count && guard++ < 80) {
    push(correct + (Math.floor(Math.random() * 24) - 12))
  }

  pool.sort((x, y) => Math.abs(x - correct) - Math.abs(y - correct))

  // Sorted nearest-first, so WHERE we slice is the difficulty dial. Level 1
  // takes the farthest candidates (easy to dismiss at a glance); level 10
  // takes the tightest cluster around the answer. Everything in between
  // slides smoothly between those two ends.
  //
  // Slicing from index 0 at every level — which an evenly-spaced walk does,
  // because it always includes pool[0] — hands a 2-choice beginner the single
  // hardest distractor there is. That inverts the whole curve.
  let tightness = (level.n - 1) / (MAX_LEVEL - 1)
  if (eased) tightness = Math.max(0, tightness - 0.35)
  const span = Math.max(0, pool.length - count)
  const start = Math.round((1 - tightness) * span)
  return pool.slice(start, start + count)
}

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Twelve correct answers that all land bottom-right teaches the wrong lesson,
// so keep the correct tile off the position it just used.
export function buildOptions(a, b, level, eased, avoidIndex) {
  const correct = a * b
  const opts = shuffle(distractorsFor(a, b, level.choices - 1, level, eased).concat([correct]))
  const at = opts.indexOf(correct)
  if (avoidIndex != null && at === avoidIndex && opts.length > 1) {
    const swap = (at + 1 + Math.floor(Math.random() * (opts.length - 1))) % opts.length
    ;[opts[at], opts[swap]] = [opts[swap], opts[at]]
  }
  return { options: opts, correct, correctIndex: opts.indexOf(correct) }
}

// Show 8 × 3 as often as 3 × 8 — commutativity is part of the fluency.
export function displayOrder(a, b) {
  return Math.random() < 0.5 ? [b, a] : [a, b]
}

export function median(nums) {
  if (!nums.length) return 0
  const s = nums.slice().sort((x, y) => x - y)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

// Promotion needs both: a cleared round AND a median under the pace target.
// Clearing slowly means the facts aren't automatic yet, which is the whole
// point of a times-table app.
export function shouldPromote(level, profile, answerTimes) {
  if (level.promote == null) return false
  if (profile.ease > 0) return false
  if (median(answerTimes) > level.paceMs) return false
  return profile.cleanAtLevel + 1 >= level.promote
}
