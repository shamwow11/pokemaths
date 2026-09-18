// Pokemaths — web build.
//
// The adaptive core is the SAME file the native app uses (lib/engine.js,
// copied in by tools/build-web.py). Only the shell differs, so a change to
// the level ladder or the distractor recipe lands in both.
import {
  ROUND_LENGTH, SHIELD_EVERY, MAX_SHIELDS, FAILS_BEFORE_EASE, CLEARS_TO_UNEASE,
  MAX_LEVEL, LEVELS, levelFor, factKey, nextStrength,
  pickFact, buildOptions, displayOrder, shouldPromote,
} from './engine.js'

const KEY = 'pokemaths.v1'
const COLS = { 2: 2, 3: 3, 4: 2, 5: 3, 6: 3 }
const TILES = [
  ['var(--sky)', 'var(--ink)'], ['var(--yellow)', 'var(--ink)'],
  ['var(--magenta)', 'var(--yellow)'], ['var(--lime)', 'var(--ink)'],
  ['var(--teal)', 'var(--lime)'], ['var(--orange)', 'var(--indigo)'],
]
const $ = (id) => document.getElementById(id)

/* ---------------------------------------------------------------- storage */
function emptyProfile() {
  return {
    name: 'Player', level: 1, ease: 0, failsAtLevel: 0, cleanAtLevel: 0,
    clearsWhileEased: 0, shields: 0, playedOn: [], facts: {},
    records: { byLevel: {}, fastestAnswerMs: null, longestStreak: 0, roundsCleared: 0 },
    trophies: [],
  }
}
function emptyState() {
  return { version: 1, activeProfile: 'default', profiles: { default: emptyProfile() } }
}
let state = emptyState()

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyState()
    const p = JSON.parse(raw)
    if (!p || !p.profiles) return emptyState()
    const s = { ...emptyState(), ...p }
    for (const id of Object.keys(s.profiles)) {
      s.profiles[id] = { ...emptyProfile(), ...s.profiles[id] }
      s.profiles[id].level = Math.min(Math.max(s.profiles[id].level || 1, 1), MAX_LEVEL)
    }
    return s
  } catch (e) {
    // A corrupt blob must never brick the app for a 9-year-old.
    return emptyState()
  }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true }
  catch (e) { return false }
}
const me = () => state.profiles[state.activeProfile]

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function dayStreak(days) {
  if (!days || !days.length) return 0
  const set = new Set(days), d = new Date()
  let n = 0
  if (!set.has(todayISO())) d.setDate(d.getDate() - 1)
  for (;;) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!set.has(iso)) break
    n++; d.setDate(d.getDate() - 1)
  }
  return n
}
const fmt = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(1) + 's')

/* --------------------------------------------------------------- trophies */
let TROPHIES = []
function nextTrophy(earnedIds) {
  const earned = new Set(earnedIds)
  const unseen = TROPHIES.filter((t) => !earned.has(t.id))
  const bag = unseen.length ? unseen : TROPHIES
  return bag[Math.floor(Math.random() * bag.length)]
}
const trophyById = (id) => TROPHIES.find((t) => t.id === id) || null

/* ------------------------------------------------------------ navigation */
function show(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === name))
  if (name === 'home') drawHome()
  if (name === 'trophies') drawTrophies()
  if (name === 'progress') drawProgress()
}

/* ------------------------------------------------------------------ home */
function drawHome() {
  const p = me(), lvl = levelFor(p.level)
  $('hLevel').textContent = p.level
  $('hBest').textContent = fmt(p.records.byLevel[lvl.n]?.bestMs)
  $('hDays').textContent = dayStreak(p.playedOn)
  $('goSub').textContent = `${lvl.choices} answers · ${ROUND_LENGTH} in a row`
  $('hTrophy').textContent = `${p.trophies.length}/${TROPHIES.length}`
  const cleared = p.records.roundsCleared || 0
  const togo = SHIELD_EVERY - (cleared % SHIELD_EVERY)
  $('shieldNote').textContent = p.shields > 0
    ? '◆  shield ready'
    : `◇  ${togo} more round${togo === 1 ? '' : 's'} for a shield`
}

/* ------------------------------------------------------------------ play */
let streak = 0, shields = 0, roundMs = 0, qStart = 0, locked = false
let question = null, facts = {}, times = [], lastCorrectIndex = null
let timers = []
const later = (fn, ms) => { timers.push(setTimeout(fn, ms)) }
const clearTimers = () => { timers.forEach(clearTimeout); timers = [] }

function beginRound() {
  clearTimers()
  const p = me()
  facts = { ...p.facts }
  times = []; roundMs = 0; streak = 0; lastCorrectIndex = null
  shields = p.shields || 0
  $('overlay').classList.remove('on')
  drawShield(); drawPips()
  ask()
  show('play')
}

function drawPips() {
  $('pips').innerHTML = Array.from({ length: ROUND_LENGTH }, (_, i) =>
    `<span class="pip ${i < streak ? 'on' : i === streak ? 'now' : ''}"></span>`).join('')
}
function drawShield() { $('shield').className = shields > 0 ? '' : 'off' }

function ask() {
  const p = me(), lvl = levelFor(p.level), eased = (p.ease || 0) > 0
  const [a, b] = pickFact(facts, lvl, streak === 0, eased)
  const [l, r] = displayOrder(a, b)
  const { options, correct, correctIndex } = buildOptions(a, b, lvl, eased, lastCorrectIndex)
  lastCorrectIndex = correctIndex
  question = { a, b, correct }
  $('lvl').textContent = 'LVL ' + lvl.n
  $('q').textContent = `${l} × ${r}`
  const box = $('answers')
  box.style.gridTemplateColumns = `repeat(${COLS[lvl.choices] || 3}, minmax(0, 1fr))`
  box.innerHTML = ''
  options.forEach((v, i) => {
    const btn = document.createElement('button')
    btn.className = 'ans'
    btn.textContent = v
    btn.style.background = TILES[i % TILES.length][0]
    btn.style.color = TILES[i % TILES.length][1]
    btn.addEventListener('click', () => answer(v, btn), { passive: true })
    box.appendChild(btn)
  })
  locked = false
  qStart = Date.now()   // timed always; never displayed until the round ends
}

function answer(v, btn) {
  if (locked) return
  locked = true
  const ms = Date.now() - qStart
  const p = me(), lvl = levelFor(p.level)
  const ok = v === question.correct
  roundMs += ms

  const k = factKey(question.a, question.b)
  const prev = facts[k] || { seen: 0, right: 0, strength: 2, medianMs: null }
  const seen = prev.seen + 1
  facts[k] = {
    seen, right: prev.right + (ok ? 1 : 0),
    strength: nextStrength(prev.strength, ok, ms, lvl.paceMs),
    medianMs: prev.medianMs == null ? ms : Math.round(prev.medianMs + (ms - prev.medianMs) / Math.min(seen, 8)),
    lastSeen: Date.now(),
  }

  if (ok) {
    times.push(ms)
    btn.style.background = 'var(--lime)'; btn.style.color = 'var(--ink)'
    streak++; drawPips()
    if (streak >= ROUND_LENGTH) later(() => finish(true), 280)
    else later(ask, 230)
    return
  }
  btn.classList.add('shake')
  btn.style.background = 'var(--red)'; btn.style.color = '#fff'
  if (shields > 0) {
    shields--; drawShield()
    later(shieldUsed, 420)
  } else {
    later(() => finish(false), 420)
  }
}

function overlay(html) { $('overlay').innerHTML = html; $('overlay').classList.add('on') }

function shieldUsed() {
  overlay(`<p class="eyebrow">SHIELD USED</p>
    <h2 class="bighead" style="color:var(--teal)">SAVED IT</h2>
    <div class="teach">${question.a} × ${question.b} = <s>${question.a * question.b}</s></div>
    <p>streak stays at ${streak} · keep going</p>`)
  later(() => { $('overlay').classList.remove('on'); ask() }, 1900)
}

function finish(cleared) {
  const p = me(), lvl = levelFor(p.level)
  const total = roundMs
  const fastest = times.length ? Math.min(...times) : null
  const rec = p.records
  const reasons = []
  let trophy = null, promoted = false, shieldEarned = false, isRecord = false, prevBest

  p.facts = facts
  p.shields = shields
  if (!p.playedOn.includes(todayISO())) p.playedOn.push(todayISO())
  rec.longestStreak = Math.max(rec.longestStreak || 0, streak)
  let beatAnswer = false
  if (fastest != null && (rec.fastestAnswerMs == null || fastest < rec.fastestAnswerMs)) {
    rec.fastestAnswerMs = fastest; beatAnswer = true
  }

  if (cleared) {
    rec.roundsCleared = (rec.roundsCleared || 0) + 1
    prevBest = rec.byLevel[lvl.n]?.bestMs
    isRecord = prevBest == null || total < prevBest
    if (isRecord) {
      rec.byLevel[lvl.n] = { bestMs: total, at: Date.now() }
      reasons.push(prevBest == null ? `First time clearing level ${lvl.n}` : `Fastest level ${lvl.n} round`)
    }
    if (beatAnswer) reasons.push('Fastest single answer')

    if (rec.roundsCleared % SHIELD_EVERY === 0 && p.shields < MAX_SHIELDS) {
      p.shields = MAX_SHIELDS; shieldEarned = true
    }
    if (p.ease > 0) {
      p.clearsWhileEased = (p.clearsWhileEased || 0) + 1
      if (p.clearsWhileEased >= CLEARS_TO_UNEASE) { p.ease = 0; p.clearsWhileEased = 0 }
    }
    p.failsAtLevel = 0
    if (shouldPromote(lvl, p, times) && p.level < MAX_LEVEL) {
      p.level++; p.cleanAtLevel = 0; promoted = true
    } else {
      p.cleanAtLevel = (p.cleanAtLevel || 0) + 1
    }
    if (reasons.length) {                       // one GIF per round, however many records fell
      const t = nextTrophy(p.trophies.map((x) => x.gif))
      p.trophies.push({ gif: t.id, reason: reasons[0], level: lvl.n, ms: total, at: Date.now() })
      trophy = t
    }
  } else {
    p.failsAtLevel = (p.failsAtLevel || 0) + 1
    p.cleanAtLevel = 0
    if (p.failsAtLevel >= FAILS_BEFORE_EASE) { p.ease = 1; p.failsAtLevel = 0; p.clearsWhileEased = 0 }
  }
  save()

  if (!cleared) {
    overlay(`<p class="eyebrow">ROUND OVER</p>
      <h2 class="bighead" style="color:var(--red)">SO CLOSE</h2>
      <div class="teach">${question.a} × ${question.b} = <s>${question.a * question.b}</s></div>
      <p>${streak} in a row</p>
      <div class="row"><button class="btn" data-again style="background:var(--yellow)">TRY AGAIN</button>
      <button class="btn plain" data-home>HOME</button></div>`)
    return
  }
  overlay(`<p class="eyebrow">${isRecord ? 'NEW RECORD · LEVEL ' + lvl.n : 'ROUND CLEARED'}</p>
    <h2 class="bighead" style="color:${isRecord ? 'var(--magenta)' : 'var(--teal)'}">${fmt(total)}</h2>
    ${trophy ? `<div id="gifFrame" class="on"><img alt="" src="trophies/${trophy.file}"></div>`
             : `<p>best is ${fmt(rec.byLevel[lvl.n]?.bestMs)}</p>`}
    ${reasons.map((r) => `<span class="badge">${r}</span>`).join(' ')}
    ${promoted ? `<span class="badge" style="background:var(--lime)">LEVEL UP — now level ${p.level}</span>` : ''}
    ${shieldEarned ? '<span class="badge" style="background:var(--sky)">◆ shield banked</span>' : ''}
    <div class="row"><button class="btn" data-again>GO AGAIN</button>
    <button class="btn plain" data-home>HOME</button></div>`)
}

/* -------------------------------------------------------------- trophies */
function drawTrophies() {
  const p = me()
  const got = Object.fromEntries(p.trophies.map((t) => [t.gif, t]))
  $('tCount').textContent = `${p.trophies.length}/${TROPHIES.length}`
  $('tgrid').innerHTML = TROPHIES.map((t) => got[t.id]
    ? `<div class="cell got"><img loading="lazy" alt="" src="trophies/${t.file}"></div>`
    : '<div class="cell locked">?</div>').join('')
}

/* -------------------------------------------------------------- progress */
const SCALE = ['#AE2012', '#D1492F', '#FF6B00', '#FFE600', '#C8EE5A', '#E9FF70']
function drawProgress() {
  const p = me(), r = p.records
  const weak = Object.entries(p.facts).filter(([, f]) => f.seen >= 2)
    .sort((a, b) => a[1].strength - b[1].strength).slice(0, 12)
  let grid = ''
  for (let a = 0; a <= 12; a++) {
    grid += '<div class="grow"><span class="ax">' + a + '</span>'
    for (let b = 0; b <= 12; b++) {
      const f = p.facts[factKey(a, b)]
      grid += `<span class="cellbox" style="background:${f ? SCALE[Math.max(0, Math.min(5, f.strength))] : '#fff'}"></span>`
    }
    grid += '</div>'
  }
  $('pbody').innerHTML = `
    <div class="chips">
      ${[['Level', p.level], ['Rounds cleared', r.roundsCleared || 0], ['Longest streak', r.longestStreak || 0],
         ['Days in a row', dayStreak(p.playedOn)], ['Fastest answer', fmt(r.fastestAnswerMs)],
         ['Trophies', p.trophies.length]]
        .map(([k, v]) => `<span class="chip"><b>${v}</b><i>${k}</i></span>`).join('')}
    </div>
    ${p.ease > 0 ? '<p class="cap" style="background:var(--sky);padding:10px;border:3px solid var(--ink);border-radius:12px;opacity:1">Difficulty is currently eased — three rounds missed in a row, so the fact mix is softer underneath the same level. Lifts after two clean rounds.</p>' : ''}
    <h2>FACT GRID</h2>
    <p class="cap">Rows 0–12 × columns 0–12. Red is shaky, lime is automatic, white is unseen.</p>
    <div class="gridwrap">${grid}</div>
    <h2>NEEDS WORK</h2>
    <div class="chips">${weak.length ? weak.map(([k, f]) =>
      `<span class="chip" style="background:${SCALE[Math.max(0, Math.min(5, f.strength))]}"><b>${k.replace('x', ' × ')}</b><i>${f.right}/${f.seen}</i></span>`).join('')
      : '<p class="cap">Not enough rounds played yet.</p>'}</div>
    <h2>BEST TIME PER LEVEL</h2>
    <div class="chips">${LEVELS.map((l) => {
      const b = r.byLevel[l.n]
      return `<span class="chip" style="${b ? '' : 'opacity:.4'}"><b>${fmt(b?.bestMs)}</b><i>L${l.n}</i></span>`
    }).join('')}</div>
    <h2>BACKUP</h2>
    <p class="cap">Safari can clear website data. Save a copy of his progress now and then — it restores everything including trophies.</p>
    <div class="row" style="justify-content:flex-start">
      <button class="btn sm" id="exportBtn">SAVE BACKUP</button>
      <button class="btn sm plain" id="importBtn">RESTORE</button>
      <button class="btn sm danger" id="resetBtn">ERASE ALL</button>
    </div>`

  $('exportBtn').onclick = () => {
    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `pokemaths-backup-${todayISO()}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  }
  $('importBtn').onclick = () => {
    const inp = document.createElement('input')
    inp.type = 'file'; inp.accept = 'application/json,.json'
    inp.onchange = () => {
      const f = inp.files && inp.files[0]
      if (!f) return
      const rd = new FileReader()
      rd.onload = () => {
        try {
          const parsed = JSON.parse(rd.result)
          if (!parsed || !parsed.profiles) throw new Error('not a Pokemaths backup')
          state = parsed; save(); drawProgress()
          alert('Progress restored.')
        } catch (e) { alert("That file isn't a Pokemaths backup.") }
      }
      rd.readAsText(f)
    }
    inp.click()
  }
  $('resetBtn').onclick = () => {
    if (confirm('Erase all progress?\n\nLevels, records and every trophy. This cannot be undone.')) {
      state = emptyState(); save(); drawProgress()
    }
  }
}

/* ----------------------------------------------------------------- wiring */
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-home]')) { clearTimers(); show('home') }
  if (e.target.closest('[data-again]')) beginRound()
})
$('go').addEventListener('click', beginRound)
$('openTrophies').addEventListener('click', () => show('trophies'))

// Parent gate: long-press the level badge. Nothing a 9-year-old trips over.
let held = null
const badge = $('lvlStat')
const startHold = () => { held = setTimeout(() => show('progress'), 900) }
const endHold = () => { clearTimeout(held) }
badge.addEventListener('touchstart', startHold, { passive: true })
badge.addEventListener('touchend', endHold)
badge.addEventListener('touchmove', endHold, { passive: true })
badge.addEventListener('mousedown', startHold)
badge.addEventListener('mouseup', endHold)
badge.addEventListener('mouseleave', endHold)

// Stop a two-finger or double-tap zoom from wrecking the layout mid-round.
document.addEventListener('gesturestart', (e) => e.preventDefault())

async function boot() {
  state = load()
  try {
    TROPHIES = await (await fetch('trophies.json')).json()
  } catch (e) {
    TROPHIES = []
  }
  show('home')
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {})
  }
}
boot()
