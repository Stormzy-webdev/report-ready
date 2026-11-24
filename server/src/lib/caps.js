// CAPS achievement levels: 7 = 80–100%, 6 = 70–79, ... 1 = 0–29.
const LEVEL_FLOORS = [
  [80, 7],
  [70, 6],
  [60, 5],
  [50, 4],
  [40, 3],
  [30, 2],
  [0, 1],
];

// A change of this many percentage points since last term counts as a trend.
export const TREND_THRESHOLD = 5;
// Below this average a learner is flagged as struggling regardless of trend.
export const STRUGGLING_BELOW = 40;

export function capsLevel(average) {
  if (average == null || Number.isNaN(average)) return null;
  return LEVEL_FLOORS.find(([floor]) => average >= floor)[1];
}

// struggling = low marks, slipping = marks going down, improving = marks going up.
// A low average counts as struggling even if it went up.
export function trendFlag(average, previousAverage) {
  if (average == null) return null;
  const change = previousAverage == null ? null : average - previousAverage;
  if (average < STRUGGLING_BELOW) return 'struggling';
  if (change != null && change <= -TREND_THRESHOLD) return 'slipping';
  if (change != null && change >= TREND_THRESHOLD) return 'improving';
  return 'steady';
}

const FLAG_PRIORITY = ['struggling', 'slipping', 'improving', 'steady'];

// One flag for the whole learner: the most serious flag in any subject wins.
export function overallFlag(flags) {
  return FLAG_PRIORITY.find((flag) => flags.includes(flag)) ?? null;
}
