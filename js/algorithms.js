// Sorting algorithms, written as generators.
//
// Each algorithm works on its own copy of the array and yields one object per
// meaningful operation. Nothing here knows about drawing: the visualizer replays
// the operations on its own copy of the array.
//
// Operations:
//   { type: 'compare', i, j }                two positions are compared
//   { type: 'swap', i, j }                   two elements exchange positions
//   { type: 'write', index, value }          one value is written into the array
//   { type: 'key', index, value }            insertion sort lifts a value out
//   { type: 'range', lo, hi }                quick sort focuses on a sub-range
//   { type: 'pivot', index }                 quick sort chooses a pivot
//   { type: 'sorted', from, to }             positions that are now in order
//   { type: 'done' }                         the array is sorted
// Every operation also carries `text`, a plain sentence describing it.

function* bubbleSort(a) {
  const n = a.length;
  for (let end = n - 1; end > 0; end--) {
    let swapped = false;
    for (let j = 0; j < end; j++) {
      const outOfOrder = a[j] > a[j + 1];
      yield {
        type: 'compare',
        i: j,
        j: j + 1,
        text: `Comparing neighbours ${a[j]} and ${a[j + 1]}: ${outOfOrder ? 'out of order.' : 'already in order.'}`,
      };
      if (outOfOrder) {
        [a[j], a[j + 1]] = [a[j + 1], a[j]];
        swapped = true;
        yield { type: 'swap', i: j, j: j + 1, text: `Swapping them: ${a[j + 1]} moves one step to the right.` };
      }
    }
    // Early exit: a full pass without any swap means everything is in order.
    if (!swapped) {
      yield { type: 'sorted', from: 0, to: end, text: 'No swap during this pass: the array is sorted, stopping early.' };
      return;
    }
    yield { type: 'sorted', from: end, to: end, text: `Pass complete: ${a[end]} has reached its final position.` };
  }
  if (n > 0) yield { type: 'sorted', from: 0, to: 0, text: 'The last remaining element is in place.' };
}

function* insertionSort(a) {
  const n = a.length;
  if (n > 0) yield { type: 'sorted', from: 0, to: 0, text: 'One element alone is a sorted section.' };

  for (let i = 1; i < n; i++) {
    const key = a[i];
    yield { type: 'key', index: i, value: key, text: `Taking ${key} as the key to insert into the sorted section.` };

    let j = i - 1;
    while (j >= 0) {
      const larger = a[j] > key;
      yield {
        type: 'compare',
        i: j,
        j: j + 1,
        text: larger
          ? `${a[j]} is larger than the key ${key}: it has to move right.`
          : `${a[j]} is not larger than the key ${key}: the right spot is found.`,
      };
      if (!larger) break;
      a[j + 1] = a[j];
      yield { type: 'write', index: j + 1, value: a[j], hole: j, text: `Moving ${a[j]} one place right to make room for the key.` };
      j--;
    }

    a[j + 1] = key;
    yield { type: 'write', index: j + 1, value: key, insert: true, text: `Inserting the key ${key} at position ${j + 1}.` };
    yield { type: 'sorted', from: 0, to: i, text: `The first ${i + 1} elements now form a sorted section.` };
  }
}

// Quick sort with Lomuto partitioning: the pivot is the last element of the range.
// Smaller elements are gathered on the left, then the pivot is placed after them.
function* quickSort(a, lo = 0, hi = a.length - 1) {
  if (lo > hi) return;
  if (lo === hi) {
    yield { type: 'sorted', from: lo, to: lo, text: `A range of one element (${a[lo]}) is already sorted.` };
    return;
  }

  yield { type: 'range', lo, hi, text: `Partitioning the range from position ${lo} to ${hi}.` };
  const pivot = a[hi];
  yield { type: 'pivot', index: hi, text: `Choosing the last element of the range, ${pivot}, as the pivot.` };

  let boundary = lo; // first position of the "not smaller" part
  for (let j = lo; j < hi; j++) {
    const smaller = a[j] < pivot;
    yield {
      type: 'compare',
      i: j,
      j: hi,
      text: smaller
        ? `${a[j]} is smaller than the pivot ${pivot}: it belongs on the left.`
        : `${a[j]} is not smaller than the pivot ${pivot}: it stays on the right.`,
    };
    if (smaller) {
      if (boundary !== j) {
        [a[boundary], a[j]] = [a[j], a[boundary]];
        yield { type: 'swap', i: boundary, j, text: `Swapping ${a[boundary]} into the left part.` };
      }
      boundary++;
    }
  }

  if (boundary !== hi) {
    [a[boundary], a[hi]] = [a[hi], a[boundary]];
    yield { type: 'swap', i: boundary, j: hi, text: `Placing the pivot ${pivot} between the two parts.` };
  }
  yield { type: 'sorted', from: boundary, to: boundary, pivotPlaced: true, text: `The pivot ${pivot} is in its final position.` };

  yield* quickSort(a, lo, boundary - 1);
  yield* quickSort(a, boundary + 1, hi);
}

export const ALGORITHMS = {
  bubble: {
    name: 'Bubble Sort',
    run: bubbleSort,
    best: 'O(n)',
    average: 'O(n²)',
    worst: 'O(n²)',
    note: 'Best case with early exit, on an array that is already sorted.',
    summary:
      'Walks through the array again and again, comparing neighbours and swapping them when they are out of order. After each pass the largest remaining value has "bubbled" to the end.',
  },
  insertion: {
    name: 'Insertion Sort',
    run: insertionSort,
    best: 'O(n)',
    average: 'O(n²)',
    worst: 'O(n²)',
    note: 'Best case on an array that is already sorted: one comparison per element.',
    summary:
      'Grows a sorted section from the left. Each new value (the key) is lifted out, larger values move one place right, and the key drops into the gap. This is how most people sort a hand of cards.',
  },
  quick: {
    name: 'Quick Sort',
    run: quickSort,
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n²)',
    note: 'Lomuto partition, last element as pivot. Worst case on sorted or reversed arrays.',
    summary:
      'Picks a pivot, moves every smaller value to its left and every other value to its right, then does the same on each side. The pivot is in its final position after every partition.',
  },
};

// The full run for one algorithm, on a copy of `values`. The source array is never modified.
export function* createRun(id, values) {
  yield* ALGORITHMS[id].run(values.slice());
  yield { type: 'done', text: 'Sorted: every element is in its final position.' };
}
