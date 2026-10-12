// Draws the array with p5.js and replays sorting operations on its own copy of it.
// It knows nothing about the algorithms themselves.

export const COLORS = {
  bar: '#3f4a42',
  dim: '#232a25',
  compare: '#ffb224',
  swap: '#ff3d81',
  pivot: '#4cc9ff',
  key: '#b58cff',
  sorted: '#58d66b',
  text: '#98a097',
  range: '#c6ff3d',
};

const PAD_TOP = 22;
const PAD_BOTTOM = 20;
const PAD_SIDE = 12;

export function createVisualizer(container, onFrame) {
  let values = [];
  let heights = []; // displayed heights, eased toward the real values
  let sorted = new Uint8Array(0);
  let marks = emptyMarks();
  let maxValue = 1;
  let smooth = true;
  let dirty = true;

  function emptyMarks() {
    return { compare: null, swap: null, pivot: -1, key: null, range: null };
  }

  function setArray(next) {
    values = next.slice();
    heights = values.slice();
    sorted = new Uint8Array(values.length);
    marks = emptyMarks();
    maxValue = Math.max(1, ...values);
    dirty = true;
  }

  // Applies one operation from an algorithm to the displayed array.
  function apply(op) {
    marks.compare = null;
    marks.swap = null;

    switch (op.type) {
      case 'compare':
        marks.compare = [op.i, op.j];
        break;
      case 'swap':
        [values[op.i], values[op.j]] = [values[op.j], values[op.i]];
        marks.swap = [op.i, op.j];
        // The pivot keeps its highlight when it is the one being moved.
        if (marks.pivot === op.i) marks.pivot = op.j;
        else if (marks.pivot === op.j) marks.pivot = op.i;
        break;
      case 'write':
        values[op.index] = op.value;
        marks.swap = [op.index];
        marks.key = op.insert || !marks.key ? null : { index: op.hole, value: marks.key.value };
        break;
      case 'key':
        marks.key = { index: op.index, value: op.value };
        break;
      case 'range':
        marks.range = [op.lo, op.hi];
        marks.pivot = -1;
        break;
      case 'pivot':
        marks.pivot = op.index;
        break;
      case 'sorted':
        sorted.fill(1, op.from, op.to + 1);
        if (op.pivotPlaced) marks.pivot = -1;
        break;
      case 'done':
        sorted.fill(1);
        marks = emptyMarks();
        break;
    }
    dirty = true;
  }

  function colorOf(i) {
    if (marks.swap?.includes(i)) return COLORS.swap;
    if (marks.pivot === i) return COLORS.pivot;
    if (marks.compare?.includes(i)) return COLORS.compare;
    if (marks.key?.index === i) return COLORS.key;
    if (sorted[i]) return COLORS.sorted;
    if (marks.range && (i < marks.range[0] || i > marks.range[1])) return COLORS.dim;
    return COLORS.bar;
  }

  function draw(p) {
    const n = values.length;
    p.clear();
    if (!n) return;

    const slot = (p.width - PAD_SIDE * 2) / n;
    const gap = slot > 7 ? 2 : slot > 3.5 ? 1 : 0;
    const barWidth = Math.max(1, slot - gap);
    const floor = p.height - PAD_BOTTOM;
    const scale = (floor - PAD_TOP) / maxValue;
    const radius = Math.min(3, barWidth / 3);
    const x = (i) => PAD_SIDE + i * slot + gap / 2;

    // Heights ease toward their value at low speed, and snap at high speed.
    let moving = false;
    for (let i = 0; i < n; i++) {
      // While a key is lifted, its slot shows the key instead of the stale array value.
      const target = marks.key?.index === i ? marks.key.value : values[i];
      const delta = target - heights[i];
      if (smooth && Math.abs(delta) > 0.3) {
        heights[i] += delta * 0.4;
        moving = true;
      } else {
        heights[i] = target;
      }
    }

    p.noStroke();
    for (let i = 0; i < n; i++) {
      const h = Math.max(2, heights[i] * scale);
      p.fill(colorOf(i));
      p.rect(x(i), floor - h, barWidth, h, radius, radius, 0, 0);
    }

    // Values above the bars, when there is room for them.
    if (slot >= 24) {
      p.fill(COLORS.text);
      p.textAlign(p.CENTER, p.BOTTOM);
      p.textSize(11);
      for (let i = 0; i < n; i++) {
        const value = marks.key?.index === i ? marks.key.value : values[i];
        p.text(value, x(i) + barWidth / 2, floor - Math.max(2, heights[i] * scale) - 3);
      }
    }

    // Markers under the bars repeat the information without relying on color:
    // a bracket for the active range, triangles for the active positions, a diamond for the pivot.
    if (marks.range) {
      const [lo, hi] = marks.range;
      p.stroke(COLORS.range);
      p.strokeWeight(1.5);
      p.noFill();
      p.beginShape();
      p.vertex(x(lo), floor + 4);
      p.vertex(x(lo), floor + 8);
      p.vertex(x(hi) + barWidth, floor + 8);
      p.vertex(x(hi) + barWidth, floor + 4);
      p.endShape();
      p.noStroke();
    }
    const size = Math.max(3, Math.min(6, slot / 2));
    const triangle = (i, color) => {
      const cx = x(i) + barWidth / 2;
      p.fill(color);
      p.triangle(cx, floor + 10, cx - size, floor + 10 + size * 1.4, cx + size, floor + 10 + size * 1.4);
    };
    for (const i of marks.compare || []) triangle(i, COLORS.compare);
    for (const i of marks.swap || []) triangle(i, COLORS.swap);
    if (marks.key) triangle(marks.key.index, COLORS.key);
    if (marks.pivot >= 0) {
      const cx = x(marks.pivot) + barWidth / 2;
      p.fill(COLORS.pivot);
      p.quad(cx, floor + 10, cx + size, floor + 10 + size, cx, floor + 10 + size * 2, cx - size, floor + 10 + size);
    }

    dirty = moving;
  }

  new p5((p) => {
    p.setup = () => {
      p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
      p.createCanvas(container.clientWidth || 300, container.clientHeight || 200);
      p.textFont('ui-monospace, Menlo, Consolas, monospace');
    };

    p.draw = () => {
      // Follow the container: cheap to check, and it covers every kind of resize.
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width && height && (width !== p.width || height !== p.height)) {
        p.resizeCanvas(width, height);
        dirty = true;
      }

      onFrame(Math.min(p.deltaTime, 100) / 1000);
      // Nothing changed since the last frame: keep the canvas as it is.
      if (dirty) draw(p);
    };
  }, container);

  return {
    setArray,
    apply,
    getArray: () => values.slice(),
    setSmooth(value) {
      smooth = value;
    },
  };
}
