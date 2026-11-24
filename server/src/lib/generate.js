import { buildSystemPrompt, buildLearnerMessage, checkDraft, fillName } from './prompt.js';
import { AiSetupError } from './ai.js';

const CONCURRENCY = 5;

// Drafts one comment per learner. `draft` is the model call (ai.js
// draftComment in the app, a stand-in in tests). Each learner gets one
// retry if the call fails or the draft fails its checks; after that they
// are left for the teacher to write.
// Returns [{ learner_id, text }] where text is null for failures.
export async function generateDrafts(learners, { grade, term, styleExamples, draft }) {
  const system = buildSystemPrompt(styleExamples);

  async function draftOne(learner) {
    const message = buildLearnerMessage(learner, { grade, term });
    let problem;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const text = await draft({ system, message });
        problem = checkDraft(text);
        if (!problem) return { learner_id: learner.learner_id, text: fillName(text, learner.first_name) };
      } catch (err) {
        if (err instanceof AiSetupError) throw err;
        problem = err.message;
      }
    }
    // Logged by learner id only, never by name.
    console.warn(`Draft failed for learner ${learner.learner_id}: ${problem}`);
    return { learner_id: learner.learner_id, text: null };
  }

  const results = [];
  const queue = [...learners];
  async function worker() {
    try {
      while (queue.length) results.push(await draftOne(queue.shift()));
    } catch (err) {
      queue.length = 0; // stop the other workers too
      throw err;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return results;
}
