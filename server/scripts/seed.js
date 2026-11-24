// Creates a demo teacher partway through report season:
//   5B: 30 learners, term 2 comments in every state (approved, to review, not drafted)
//   6A: 12 learners, no comments yet, to try the whole flow from scratch
// All names and marks are made up. Never put real learner data in the repo or the public demo.
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../src/db.js';
import { getClassSummary } from '../src/lib/summary.js';

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'demo-password';
const DEMO_NAME = 'Ms Mokoena';

const CLASSES = [
  {
    name: '5B',
    grade: 5,
    names: [
      'Thandi', 'Lebo', 'Sipho', 'Aisha', 'Pieter', 'Naledi', 'Kagiso', 'Zanele', 'Ruan', 'Ayanda',
      'Mpho', 'Chloe', 'Bongani', 'Fatima', 'Liam', 'Nomsa', 'Tumelo', 'Megan', 'Lwazi', 'Imaan',
      'Johan', 'Palesa', 'Karabo', 'Zoe', 'Sibusiso', 'Lerato', 'Ethan', 'Busi', 'Tshepo', 'Anika',
    ],
    codePrefix: 'L',
    subjects: ['Mathematics', 'English Home Language', 'Natural Sciences and Technology'],
    withComments: true,
  },
  {
    name: '6A',
    grade: 6,
    names: [
      'Amahle', 'Bheki', 'Carla', 'Dumisani', 'Elize', 'Farhaan',
      'Gugu', 'Hannah', 'Itumeleng', 'Jayden', 'Keabetswe', 'Lindiwe',
    ],
    codePrefix: 'A',
    subjects: ['Mathematics', 'English Home Language', 'Life Skills'],
    withComments: false,
  },
];

const ASSESSMENTS = [
  { name: 'Assignment', max: 30, weight: 1 },
  { name: 'Test', max: 50, weight: 2 },
];

// Stored the way the app stores them: learner names already swapped for {name}.
const STYLE_EXAMPLES = [
  '{name} has worked hard this term and is growing in confidence in Mathematics. Regular practice of times tables at home will help {name} build on this.',
  'It has been a pleasure to see {name} make such steady progress in reading. The next step is to finish written work in the time given.',
  '{name} produces neat, careful work and takes part eagerly in discussions. Next term, {name} should take on longer pieces of writing.',
  '{name} found parts of this term difficult, but never gave up. With daily reading at home, {name} will grow in confidence.',
  'Well done, {name}, on an excellent term! To keep stretching yourself, try the extension activities in class.',
];

// Seeded random numbers so every run produces the same data.
let state = 2026;
function random() {
  state = (state * 1664525 + 1013904223) % 2 ** 32;
  return state / 2 ** 32;
}
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// Comments written from each learner's real term 2 results, in the demo teacher's voice.
const TEMPLATES = {
  struggling: [
    (n, best, weak) => `${n} has found this term challenging, especially in ${weak}. With regular practice at home and extra support in class, ${n} can build confidence. A good next step is to ask for help as soon as something is unclear.`,
    (n, best, weak) => `${n} has kept trying this term, even when the work in ${weak} felt hard. ${best} is a real strength to build on. Daily practice at home will help ${n} close the gaps.`,
  ],
  slipping: [
    (n, best, weak) => `${n} is a capable learner, as the work in ${best} shows, but marks in ${weak} have dropped since term 1. Next term, ${n} should revise a little every day to get back on track.`,
    (n, best, weak) => `${n} has had a less consistent term than last. ${n} has what it takes to do well, and should focus on ${weak} next term, checking work carefully before handing it in.`,
  ],
  improving: [
    (n, best, weak) => `${n} has made pleasing progress this term, especially in ${best}. This improvement reflects real effort. To keep growing, ${n} should give ${weak} the same attention.`,
    (n, best) => `Well done, ${n}, on a term of clear improvement! The hard work in ${best} has paid off. Keep up this positive attitude next term.`,
  ],
  steady: [
    (n, best, weak) => `${n} has worked consistently this term and achieved solid results, particularly in ${best}. To move to the next level, ${n} should aim to strengthen ${weak} with extra practice.`,
    (n, best) => `${n} is a dependable member of the class who produces careful work. ${best} has been a highlight. Next term, ${n} should take on more challenging tasks.`,
  ],
};

function writeComment(learner, index) {
  const marked = learner.subjects.filter((s) => s.average != null);
  const best = marked.reduce((a, b) => (b.average > a.average ? b : a)).subject;
  const weak = marked.reduce((a, b) => (b.average < a.average ? b : a)).subject;
  const options = TEMPLATES[learner.flag] ?? TEMPLATES.steady;
  return options[index % options.length](learner.first_name, best, weak);
}

const classIds = [];

await withTransaction(async (client) => {
  await client.query('DELETE FROM teachers WHERE email = $1', [DEMO_EMAIL]);

  const { rows: [teacher] } = await client.query(
    'INSERT INTO teachers (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id',
    [DEMO_EMAIL, await bcrypt.hash(DEMO_PASSWORD, 12), DEMO_NAME],
  );

  for (const text of STYLE_EXAMPLES) {
    await client.query('INSERT INTO style_examples (teacher_id, text) VALUES ($1, $2)', [teacher.id, text]);
  }

  for (const spec of CLASSES) {
    const { rows: [cls] } = await client.query(
      'INSERT INTO classes (teacher_id, name, grade, year) VALUES ($1, $2, $3, 2026) RETURNING id',
      [teacher.id, spec.name, spec.grade],
    );
    classIds.push({ id: cls.id, spec });

    const learners = [];
    for (const [i, firstName] of spec.names.entries()) {
      const { rows: [learner] } = await client.query(
        'INSERT INTO learners (class_id, first_name, learner_code) VALUES ($1, $2, $3) RETURNING id',
        [cls.id, firstName, `${spec.codePrefix}${String(i + 1).padStart(2, '0')}`],
      );
      // Each learner has an ability level and a trend, so the summary shows
      // a mix of struggling, slipping, steady and improving learners.
      learners.push({ id: learner.id, ability: 30 + random() * 60, trend: (random() - 0.5) * 24 });
    }

    for (const subjectName of spec.subjects) {
      const { rows: [subject] } = await client.query(
        'INSERT INTO subjects (class_id, name) VALUES ($1, $2) RETURNING id',
        [cls.id, subjectName],
      );
      for (const term of [1, 2]) {
        for (const a of ASSESSMENTS) {
          const { rows: [assessment] } = await client.query(
            `INSERT INTO assessments (subject_id, term, name, max_mark, weight)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [subject.id, term, `Term ${term} ${a.name.toLowerCase()}`, a.max, a.weight],
          );
          for (const learner of learners) {
            const percent = clamp(learner.ability + learner.trend * (term - 1) + (random() - 0.5) * 16, 5, 100);
            await client.query(
              'INSERT INTO marks (assessment_id, learner_id, mark) VALUES ($1, $2, $3)',
              [assessment.id, learner.id, Math.round((percent / 100) * a.max)],
            );
          }
        }
      }
    }
  }
});

// Term 2 comments for 5B, written from the averages the app itself calculates:
// every third learner approved, every third a draft to review, the rest left
// empty so "Draft comments" has something to do.
const counts = { approved: 0, draft: 0, empty: 0 };
for (const { id, spec } of classIds.filter((c) => c.spec.withComments)) {
  const learners = await getClassSummary(id, 2);
  for (const [i, learner] of learners.entries()) {
    const slot = i % 3;
    if (slot === 2) {
      counts.empty++;
      continue;
    }
    const text = writeComment(learner, i);
    await pool.query(
      `INSERT INTO comments (learner_id, subject_id, term, draft_text, final_text, status)
       VALUES ($1, NULL, 2, $2, $3, $4)`,
      [learner.learner_id, text, slot === 0 ? text : null, slot === 0 ? 'approved' : 'draft'],
    );
    counts[slot === 0 ? 'approved' : 'draft']++;
  }
}

await pool.end();
console.log(`Log in as ${DEMO_EMAIL} / ${DEMO_PASSWORD} (${DEMO_NAME})`);
for (const { spec } of classIds) console.log(`  ${spec.name}: ${spec.names.length} learners, ${spec.subjects.join(', ')}`);
console.log(`  5B term 2 comments: ${counts.approved} approved, ${counts.draft} to review, ${counts.empty} not drafted yet`);
