import { ALGORITHMS, createRun } from './algorithms.js';
import { createVisualizer } from './visualizer.js';

const DEFAULTS = Object.freeze({ algorithm: 'bubble', size: 60, speed: 45, arrangement: 'shuffle' });
const MAX_OPERATIONS_PER_FRAME = 500;

const $ = (id) => document.getElementById(id);

const settings = { ...DEFAULTS };

// One run = one algorithm working on one starting arrangement.
// `initial` is never modified, so Restart can always return to it.
const run = {
  initial: [],
  operations: null, // the generator, created when the run starts
  status: 'idle', // idle | running | paused | done
  budget: 0, // fractional operations waiting to be played
  elapsed: 0,
  comparisons: 0,
  swaps: 0,
  writes: 0,
  text: '',
};

const visualizer = createVisualizer($('stage'), onFrame);

// ---------------------------------------------------------------------------
// Arrays
// ---------------------------------------------------------------------------

const randomInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));

function createArray(size, arrangement) {
  if (arrangement === 'shuffle') {
    return Array.from({ length: size }, () => randomInt(5, 100));
  }
  // Evenly spread ascending values from 5 to 100.
  const ascending = Array.from({ length: size }, (_, i) => Math.round(5 + (95 * i) / Math.max(1, size - 1)));
  if (arrangement === 'reversed') return ascending.reverse();

  // Nearly sorted: a few elements trade places with a close neighbour.
  for (let k = 0; k < Math.max(2, Math.round(size * 0.08)); k++) {
    const i = randomInt(0, size - 1);
    const j = Math.min(size - 1, Math.max(0, i + randomInt(-4, 4)));
    [ascending[i], ascending[j]] = [ascending[j], ascending[i]];
  }
  return ascending;
}

// ---------------------------------------------------------------------------
// Run control
// ---------------------------------------------------------------------------

// Drops the current run, if any, and shows the starting arrangement again.
// Every control goes through here, so two runs can never overlap.
function prepareRun() {
  run.operations = null;
  run.status = 'idle';
  run.budget = 0;
  run.elapsed = 0;
  run.comparisons = 0;
  run.swaps = 0;
  run.writes = 0;
  run.text = `${ALGORITHMS[settings.algorithm].name} is ready. Press Start, or Step forward to go one operation at a time.`;
  visualizer.setArray(run.initial);
  render();
}

function newArray(arrangement = settings.arrangement) {
  settings.arrangement = arrangement;
  run.initial = createArray(settings.size, arrangement);
  prepareRun();
}

// Plays exactly one operation. Returns it, or null when the run is over.
function stepOnce() {
  if (run.status === 'done') return null;
  if (!run.operations) run.operations = createRun(settings.algorithm, run.initial);

  const { value: op, done } = run.operations.next();
  if (done) {
    run.status = 'done';
    return null;
  }

  if (op.type === 'compare') run.comparisons++;
  if (op.type === 'write') run.writes++;
  if (op.type === 'swap') {
    run.swaps++;
    run.writes += 2;
  }
  visualizer.apply(op);

  run.text = op.text;
  if (op.type === 'done') {
    run.status = 'done';
    run.text = `Sorted with ${run.comparisons.toLocaleString('en-US')} comparisons and ${run.writes.toLocaleString('en-US')} writes.`;
  }
  return op;
}

function togglePlay() {
  if (run.status === 'running') {
    run.status = 'paused';
  } else {
    if (run.status === 'done') prepareRun();
    run.status = 'running';
    run.budget = 1; // the first operation plays right away
  }
  render();
}

function stepForward() {
  if (run.status === 'done') return;
  run.status = 'paused';
  const op = stepOnce();
  if (op) playTone(op);
  render();
}

function restart() {
  const wasRunning = run.status === 'running';
  prepareRun();
  if (wasRunning) togglePlay();
}

const operationsPerSecond = () => 1.5 * Math.pow(1000, settings.speed / 100);

// Called by the visualizer before each frame is drawn.
let sinceStats = 0;
function onFrame(dt) {
  if (run.status !== 'running') return;

  run.elapsed += dt;
  run.budget += dt * operationsPerSecond();
  let count = Math.min(Math.floor(run.budget), MAX_OPERATIONS_PER_FRAME);
  run.budget -= Math.floor(run.budget);

  let last = null;
  while (count-- > 0 && run.status === 'running') {
    last = stepOnce() || last;
  }
  if (last) playTone(last);

  // The page text is refreshed a few times per second, not on every frame.
  sinceStats += dt;
  if (run.status !== 'running') render();
  else if (sinceStats > 0.08) renderLive();
}

// ---------------------------------------------------------------------------
// Sound
// ---------------------------------------------------------------------------

const sound = { enabled: false, context: null, lastTone: 0 };

function operationValue(op) {
  const array = visualizer.getArray();
  if (op.type === 'write' || op.type === 'key') return op.value;
  if (op.type === 'compare' || op.type === 'swap') return array[op.j];
  if (op.type === 'pivot') return array[op.index];
  return null;
}

// One short tone per operation, pitched by the value involved.
// Tones are spaced out so that high speeds never become a continuous buzz.
function playTone(op) {
  if (!sound.enabled || !sound.context) return;
  const value = operationValue(op);
  const now = sound.context.currentTime;
  if (value === null || now - sound.lastTone < 0.03) return;
  sound.lastTone = now;

  const oscillator = sound.context.createOscillator();
  const gain = sound.context.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.value = 160 + (value / 100) * 900;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.07, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  oscillator.connect(gain);
  gain.connect(sound.context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.1);
}

function toggleSound() {
  sound.enabled = !sound.enabled;
  try {
    // The audio context can only be created after a user gesture, such as this click.
    if (sound.enabled && !sound.context) sound.context = new AudioContext();
    if (sound.context) sound.enabled ? sound.context.resume() : sound.context.suspend();
  } catch {
    sound.enabled = false;
  }
  const button = $('sound');
  button.setAttribute('aria-pressed', String(sound.enabled));
  button.textContent = sound.enabled ? 'Sound on' : 'Sound off';
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

const STATUS_LABELS = { idle: 'Ready', running: 'Running', paused: 'Paused', done: 'Sorted' };
const PLAY_LABELS = { idle: 'Start', running: 'Pause', paused: 'Resume', done: 'Run again' };

function setText(id, value) {
  const element = $(id);
  if (element.textContent !== value) element.textContent = value;
}

function setRange(id, value) {
  const input = $(id);
  input.value = value;
  input.style.setProperty('--fill', `${((value - input.min) / (input.max - input.min)) * 100}%`);
}

// Counters and the current explanation: the parts that change during a run.
function renderLive() {
  sinceStats = 0;
  setText('s-comparisons', run.comparisons.toLocaleString('en-US'));
  setText('s-swaps', run.swaps.toLocaleString('en-US'));
  setText('s-writes', run.writes.toLocaleString('en-US'));
  setText('s-elapsed', `${run.elapsed.toFixed(1)} s`);
  setText('explain', run.text);
}

// Everything else: buttons, labels and settings.
function render() {
  renderLive();
  const algorithm = ALGORITHMS[settings.algorithm];
  const rate = operationsPerSecond();

  $('status').dataset.state = run.status;
  setText('status-text', STATUS_LABELS[run.status]);
  setText('play', PLAY_LABELS[run.status]);
  $('step').disabled = run.status === 'done';
  $('restart').disabled = run.status === 'idle';

  setRange('size', settings.size);
  setRange('speed', settings.speed);
  setText('size-out', `${settings.size} elements`);
  setText('speed-out', `${rate < 10 ? rate.toFixed(1) : Math.round(rate)} ops/s`);
  visualizer.setSmooth(rate < 45);

  document.querySelectorAll('[data-algorithm]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.algorithm === settings.algorithm));
  });
  document.querySelectorAll('[data-arrange]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.arrange === settings.arrangement));
  });

  setText('s-algorithm', algorithm.name);
  setText('s-size', String(run.initial.length));
  setText('about-title', `About ${algorithm.name}`);
  setText('summary', algorithm.summary);
  setText('c-best', algorithm.best);
  setText('c-average', algorithm.average);
  setText('c-worst', algorithm.worst);
  setText('note', algorithm.note);
}

function bindInterface() {
  $('play').addEventListener('click', togglePlay);
  $('step').addEventListener('click', stepForward);
  $('restart').addEventListener('click', restart);
  $('sound').addEventListener('click', toggleSound);

  document.querySelector('[data-action="reset"]').addEventListener('click', () => {
    Object.assign(settings, DEFAULTS);
    newArray();
  });

  // Changing the algorithm cancels the run and keeps the same starting arrangement.
  document.querySelectorAll('[data-algorithm]').forEach((button) => {
    button.addEventListener('click', () => {
      settings.algorithm = button.dataset.algorithm;
      prepareRun();
    });
  });

  document.querySelectorAll('[data-arrange]').forEach((button) => {
    button.addEventListener('click', () => newArray(button.dataset.arrange));
  });

  $('size').addEventListener('input', (event) => {
    settings.size = Math.min(150, Math.max(10, Math.round(Number(event.target.value)) || DEFAULTS.size));
    newArray();
  });

  // The speed applies to the run in progress, without restarting it.
  $('speed').addEventListener('input', (event) => {
    settings.speed = Math.min(100, Math.max(1, Number(event.target.value) || DEFAULTS.speed));
    render();
  });

  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest('input, summary')) return;
    // On a focused button, Space already clicks that button.
    if (event.key === ' ' && event.target.closest('button')) return;
    if (event.key === ' ') togglePlay();
    else if (event.key === 'ArrowRight') stepForward();
    else if (event.key.toLowerCase() === 'r') restart();
    else return;
    event.preventDefault();
  });
}

bindInterface();
newArray();
