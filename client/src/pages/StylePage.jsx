import { useEffect, useState } from 'react';
import { Quote, Trash2, Plus, Feather } from 'lucide-react';
import { api } from '../api.js';
import { PageHeader, Alert, EmptyState, Help } from '../components/ui.jsx';

const RECOMMENDED = 5;

// Shows {name} as a highlighted token so teachers see where the name goes.
function WithNameTokens({ text }) {
  return text.split(/(\{name\})/g).map((part, i) =>
    part === '{name}' ? <span key={i} className="name-token">name</span> : part);
}

export default function StylePage() {
  const [examples, setExamples] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api('/style-examples').then(setExamples).catch((err) => setError(err.message));
  }, []);

  async function add(e) {
    e.preventDefault();
    setError('');
    try {
      const example = await api('/style-examples', { method: 'POST', body: { text } });
      setExamples([...examples, example]);
      setText('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    await api(`/style-examples/${id}`, { method: 'DELETE' });
    setExamples(examples.filter((ex) => ex.id !== id));
  }

  const count = examples?.length ?? 0;

  return (
    <>
      <PageHeader
        title="My style"
        subtitle="Paste a few report comments you've written before. Every draft will follow your vocabulary, sentence length and warmth."
        actions={(
          <div className="stack" style={{ gap: 6, alignItems: 'flex-end' }}>
            <div className="progress-dots">
              {Array.from({ length: RECOMMENDED }, (_, i) => <span key={i} className={i < count ? 'done' : ''} />)}
            </div>
            <span className="muted small">{count} of {RECOMMENDED} recommended examples</span>
          </div>
        )}
      />

      <Alert tone="info">
        Write <code>{'{name}'}</code> wherever the learner's name goes. Names of learners in your classes are swapped
        automatically. What you see below is exactly what the AI sees; no real names are sent.
      </Alert>

      {examples?.length === 0 && (
        <div className="card">
          <EmptyState icon={Feather} title="Teach it your style">
            Add 3–5 of your own comments below. The more typical they are of how you write, the better the drafts.
          </EmptyState>
        </div>
      )}

      {examples?.length > 0 && (
        <ul className="plain stack">
          {examples.map((ex, i) => (
            <li key={ex.id} className="card example">
              <span className="example-num">{i + 1}</span>
              <p className="example-text"><WithNameTokens text={ex.text} /></p>
              <button className="btn btn-ghost btn-sm" onClick={() => remove(ex.id)} aria-label="Delete example">
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="card stack">
        <div className="row" style={{ gap: 8 }}>
          <Quote size={18} className="muted" />
          <h2>
            Add an example
            <Help>Paste a real comment you wrote for a past report, then replace the learner's name with {'{name}'}. Mix strong and struggling learners so drafts get the tone right for both.</Help>
          </h2>
        </div>
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="{name} has worked hard this term and it shows. Next term, {name} should…" required />
        <div className="row spread">
          <span className="muted small">Tip: pick comments for different kinds of learners, not only top performers.</span>
          <button className="btn btn-primary"><Plus size={16} /> Add example</button>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </>
  );
}
