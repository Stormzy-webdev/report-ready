import Anthropic from '@anthropic-ai/sdk';

// AI_PROVIDER=ollama (default): free, runs on this computer, nothing leaves it.
// AI_PROVIDER=claude: Claude API, needs ANTHROPIC_API_KEY and paid credits.
const PROVIDER = process.env.AI_PROVIDER ?? 'ollama';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'llama3.2:3b';

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5';
// Short, low-stakes writing: low effort keeps a class of 30+ quick and cheap.
const CLAUDE_EFFORT = process.env.ANTHROPIC_EFFORT ?? 'low';

const COMMENT_SCHEMA = {
  type: 'object',
  properties: { comment: { type: 'string' } },
  required: ['comment'],
  additionalProperties: false,
};

export class AiSetupError extends Error {}

export function aiConfigured() {
  return PROVIDER === 'ollama' || Boolean(process.env.ANTHROPIC_API_KEY);
}

export function aiDescription() {
  return PROVIDER === 'ollama'
    ? `${OLLAMA_MODEL} on this computer (free; nothing leaves it)`
    : `Claude (${CLAUDE_MODEL})`;
}

// Returns the draft comment text, or throws.
export function draftComment(prompt) {
  return PROVIDER === 'ollama' ? draftWithOllama(prompt) : draftWithClaude(prompt);
}

async function draftWithOllama({ system, message }) {
  let res;
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: COMMENT_SCHEMA,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: message },
        ],
      }),
    });
  } catch {
    throw new AiSetupError('Ollama is not running. Open the Ollama app, then try again.');
  }
  if (res.status === 404) {
    throw new AiSetupError(`The model ${OLLAMA_MODEL} isn't downloaded. Run: ollama pull ${OLLAMA_MODEL}`);
  }
  if (!res.ok) throw new Error(`Ollama error ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.message?.content ?? '{}').comment;
}

let client;

async function draftWithClaude({ system, message }) {
  // The SDK already retries rate limits, timeouts and server errors.
  client ??= new Anthropic({ maxRetries: 3 });

  let response;
  try {
    response = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      // If the model declines, the API re-runs the request on a fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: CLAUDE_EFFORT,
        format: { type: 'json_schema', schema: COMMENT_SCHEMA },
      },
      // The system prompt (rules + style examples) is the same for every
      // learner in a run, so cache it.
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: message }],
    });
  } catch (err) {
    // Not worth retrying per learner: the whole run would fail the same way.
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new AiSetupError('The AI service rejected the API key. Check ANTHROPIC_API_KEY in server/.env.');
    }
    throw err;
  }

  if (response.stop_reason === 'refusal') throw new Error('the model declined to write this comment');
  if (response.stop_reason === 'max_tokens') throw new Error('the reply was cut off');

  const text = response.content.find((block) => block.type === 'text')?.text;
  return JSON.parse(text ?? '{}').comment;
}
