import { query } from '../db.js';
import { capsLevel, trendFlag, overallFlag } from './caps.js';

// Per learner: each subject's term average, CAPS level, last term's average
// and a flag, plus one overall flag. Used by the summary page and as the
// facts the AI drafts comments from.
export async function getClassSummary(classId, term) {
  const { rows } = await query(
    `SELECT l.id AS learner_id, l.first_name, l.learner_code, l.initial,
            s.id AS subject_id, s.name AS subject,
            cur.average, prev.average AS previous_average
     FROM learners l
     JOIN subjects s ON s.class_id = l.class_id
     LEFT JOIN term_averages cur
       ON cur.learner_id = l.id AND cur.subject_id = s.id AND cur.term = $2
     LEFT JOIN term_averages prev
       ON prev.learner_id = l.id AND prev.subject_id = s.id AND prev.term = $2 - 1
     WHERE l.class_id = $1
     ORDER BY l.first_name, l.initial NULLS FIRST, l.learner_code, s.name`,
    [classId, term],
  );

  const learners = new Map();
  for (const row of rows) {
    if (!learners.has(row.learner_id)) {
      learners.set(row.learner_id, {
        learner_id: row.learner_id,
        first_name: row.first_name,
        initial: row.initial,
        learner_code: row.learner_code,
        subjects: [],
      });
    }
    // pg returns NUMERIC as a string to avoid losing precision.
    const average = row.average == null ? null : Number(row.average);
    const previous = row.previous_average == null ? null : Number(row.previous_average);
    learners.get(row.learner_id).subjects.push({
      subject_id: row.subject_id,
      subject: row.subject,
      average,
      level: capsLevel(average),
      previous_average: previous,
      flag: trendFlag(average, previous),
    });
  }

  return [...learners.values()].map((learner) => ({
    ...learner,
    flag: overallFlag(learner.subjects.map((s) => s.flag)),
  }));
}
