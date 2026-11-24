import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users, ChevronRight, GraduationCap, X } from 'lucide-react';
import { api, getTeacherName } from '../api.js';
import { PageHeader, Alert, EmptyState, Help } from '../components/ui.jsx';
import { WelcomeGuide, GettingStarted, shouldShowWelcome, checklistHidden } from '../components/Onboarding.jsx';

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

// "Thandeka Mokoena" -> "Thandeka", but keep "Ms Mokoena" whole.
function shortName(name) {
  const [first, ...rest] = name.trim().split(/\s+/);
  return /^(ms|mr|mrs|miss|dr|prof|mx)\.?$/i.test(first) && rest.length ? name.trim() : first;
}

export default function Classes() {
  const [classes, setClasses] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', grade: '', year: new Date().getFullYear() });
  const [error, setError] = useState('');
  const [exampleCount, setExampleCount] = useState(null);
  const [welcome, setWelcome] = useState(false);
  const [showChecklist, setShowChecklist] = useState(() => !checklistHidden());
  const name = getTeacherName();

  useEffect(() => {
    Promise.all([api('/classes'), api('/style-examples')])
      .then(([list, examples]) => {
        setClasses(list);
        setExampleCount(examples.length);
        // Brand-new account: show the welcome guide once.
        if (list.length === 0 && examples.length === 0 && shouldShowWelcome()) setWelcome(true);
      })
      .catch((err) => setError(err.message));
  }, []);

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      const created = await api('/classes', {
        method: 'POST',
        body: { name: form.name, grade: Number(form.grade), year: Number(form.year) },
      });
      setClasses([{ ...created, learner_count: 0 }, ...classes]);
      setForm({ ...form, name: '', grade: '' });
      setShowForm(false);
    } catch (err) {
      setError(err.message);
    }
  }

  const newClassButton = (
    <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={17} /> New class</button>
  );

  return (
    <>
      <PageHeader
        title={`${greeting()}${name ? `, ${shortName(name)}` : ''}`}
        subtitle="Pick a class to import marks, check how learners are doing and write this term's report comments."
        actions={!showForm && classes?.length > 0 && newClassButton}
      />

      {welcome && <WelcomeGuide name={name && shortName(name)} onClose={() => setWelcome(false)} />}

      {showChecklist && classes && exampleCount != null && (
        <GettingStarted exampleCount={exampleCount} classes={classes}
          onNewClass={() => setShowForm(true)} onHide={() => setShowChecklist(false)} />
      )}

      {showForm && (
        <form onSubmit={create} className="card stack">
          <div className="row spread">
            <h2>New class<Help>One class per group you write reports for, e.g. 5B. You'll import its marks next; learners and subjects are added from your mark sheet.</Help></h2>
            <button type="button" className="icon-btn" onClick={() => setShowForm(false)} aria-label="Close"><X size={18} /></button>
          </div>
          <div className="form-grid">
            <label className="field">Class name
              <input placeholder="e.g. 5B" value={form.name} autoFocus
                onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label className="field">Grade
              <input type="number" min="1" max="12" placeholder="5" value={form.grade}
                onChange={(e) => setForm({ ...form, grade: e.target.value })} required />
            </label>
            <label className="field">Year
              <input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} required />
            </label>
            <button className="btn btn-primary">Create class</button>
          </div>
        </form>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      {classes?.length === 0 && !showForm && (
        <div className="card">
          <EmptyState icon={GraduationCap} title="Add your first class" action={newClassButton}>
            Create a class, then import its marks from a spreadsheet. It only takes a couple of minutes.
          </EmptyState>
        </div>
      )}

      {classes?.length > 0 && (
        <div className="class-grid">
          {classes.map((c) => (
            <Link key={c.id} to={`/classes/${c.id}`} className="card class-card">
              <div className="row spread">
                <span className="class-badge">{c.name}</span>
                <ChevronRight size={20} className="muted" />
              </div>
              <div>
                <h2>Class {c.name}</h2>
                <p className="muted small">Grade {c.grade} · {c.year}</p>
              </div>
              <div className="meta">
                <span className="row" style={{ gap: 6 }}><Users size={15} /> {c.learner_count} learners</span>
              </div>
              {c.comments_term ? (
                <div className="card-progress">
                  <div className="row spread small">
                    <span className="muted">Term {c.comments_term} comments</span>
                    <strong>{c.comments_approved} / {c.learner_count} approved</strong>
                  </div>
                  <div className="bar"><div style={{ width: `${c.learner_count ? (c.comments_approved / c.learner_count) * 100 : 0}%` }} /></div>
                </div>
              ) : (
                <span className="muted small">{c.learner_count ? 'No comments started yet' : 'Import marks to get started'}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
