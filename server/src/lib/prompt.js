// Everything the AI sees is built here, so it's easy to check what leaves
// the server: no names, no learner codes, only marks and the teacher's
// own example comments with names swapped for {name}.

export const NAME = '{name}';
export const MAX_COMMENT_CHARS = 400;

export function buildSystemPrompt(styleExamples) {
  const examples = styleExamples.map((text) => `<example>\n${text}\n</example>`).join('\n');
  return `You draft end-of-term school report comments for a primary or high school teacher in South Africa. The teacher reviews and edits every draft before it goes on a report.

Write one general comment about one learner, using only the facts in the message.

Rules:
- 2 or 3 sentences, at most ${MAX_COMMENT_CHARS} characters.
- Refer to the learner as ${NAME}, exactly like that, at least once. The learner's gender is unknown, so don't use he, she, him, her, his or hers; repeat ${NAME} or rephrase instead.
- Name one real strength and one specific next step, both based on the marks.
- Keep the tone warm and encouraging, and be honest when marks are low or dropping.
- Don't invent anything that isn't in the facts: no behaviour, attitude, homework habits, activities or events.
- Only quote percentages or CAPS levels if the teacher's examples do.
- Use South African English spelling.
- Match the teacher's voice in the examples below: their vocabulary, sentence length and warmth. Don't copy their content.

The teacher's own past comments:
${examples}`;
}

function describeSubject(s) {
  if (s.average == null) return `${s.subject}: no marks this term`;
  let line = `${s.subject}: ${s.average}% (CAPS level ${s.level})`;
  if (s.previous_average != null) {
    const change = Math.round((s.average - s.previous_average) * 10) / 10;
    const direction = change > 0 ? `up from ${s.previous_average}%`
      : change < 0 ? `down from ${s.previous_average}%`
      : 'the same as';
    line += `, ${direction} last term`;
  }
  return line;
}

const FLAG_TEXT = {
  struggling: 'struggling (below 40% in at least one subject)',
  slipping: 'slipping (marks dropped in at least one subject)',
  improving: 'improving',
  steady: 'steady',
};

// learner comes from getClassSummary; first_name and learner_code are
// deliberately not used.
export function buildLearnerMessage(learner, { grade, term }) {
  return [
    `Grade ${grade}, term ${term}.`,
    ...learner.subjects.map(describeSubject),
    `Overall: ${FLAG_TEXT[learner.flag] ?? 'no marks yet'}.`,
  ].join('\n');
}

// Returns a problem description, or null if the draft is usable.
export function checkDraft(draft) {
  if (typeof draft !== 'string' || !draft.trim()) return 'empty draft';
  if (!draft.includes(NAME)) return `draft does not use ${NAME}`;
  if (draft.length > MAX_COMMENT_CHARS + 50) return `draft is ${draft.length} characters`;
  return null;
}

export function fillName(draft, firstName) {
  return draft.trim().replaceAll(NAME, firstName);
}

// Swaps any of the given first names in a style example for {name}, so
// names of real learners aren't sent to the AI.
export function anonymiseExample(text, firstNames) {
  const escaped = [...new Set(firstNames)]
    .filter(Boolean)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length);
  if (escaped.length === 0) return text.trim();
  const pattern = new RegExp(`(?<![\\p{L}])(${escaped.join('|')})(?![\\p{L}])`, 'giu');
  return text.trim().replace(pattern, NAME);
}
