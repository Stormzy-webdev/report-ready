import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, ShieldCheck, Feather, FileSpreadsheet, Sparkles, Download } from 'lucide-react';
import { getFlag, setFlag } from '../api.js';

const WELCOME_STEPS = [
  { icon: Feather, title: 'Show it your style', text: 'Paste 3–5 comments you have written before, so drafts sound like you.' },
  { icon: FileSpreadsheet, title: 'Import your marks', text: 'Upload your usual Excel mark sheet, or paste the cells straight in.' },
  { icon: Sparkles, title: 'Draft every comment in one click', text: 'Each draft is based on that learner’s real marks.' },
  { icon: Download, title: 'Review, approve and export', text: 'Edit anything you like, then export to Excel, Word or PDF.' },
];

// Shown once, the first time a teacher with an empty account logs in.
export function WelcomeGuide({ name, onClose }) {
  const startButton = useRef(null);
  useEffect(() => {
    startButton.current?.focus();
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  function close() {
    setFlag('welcome_seen');
    onClose();
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="card modal">
        <div>
          <h1 id="welcome-title">Welcome{name ? `, ${name}` : ''}!</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Report comments in four steps. The first time takes about 10 minutes; after that, a class takes far less.
          </p>
        </div>
        <div className="welcome-steps">
          {WELCOME_STEPS.map(({ icon: Icon, title, text }, i) => (
            <div className="welcome-step" key={title}>
              <span className="step-num">{i + 1}</span>
              <div><strong><Icon size={15} style={{ verticalAlign: -2, marginRight: 6 }} />{title}</strong><span>{text}</span></div>
            </div>
          ))}
        </div>
        <div className="alert alert-info">
          <ShieldCheck size={17} />
          <div>Learners’ names are never sent to the AI, and surnames are never stored. Nothing is final until you approve it.</div>
        </div>
        <div className="row spread">
          <button className="btn btn-ghost" onClick={close}>I’ll explore myself</button>
          <Link ref={startButton} to="/style" className="btn btn-primary" onClick={close}>
            Start with step 1 <ChevronRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}

// A checklist that ticks itself off from the teacher's real progress.
export function GettingStarted({ exampleCount, classes, onNewClass, onHide }) {
  const firstClass = classes[0];
  const withLearners = classes.find((c) => c.learner_count > 0);
  const withComments = classes.find((c) => c.comments_term);
  const steps = [
    {
      label: `Add 3 example comments on My style${exampleCount < 3 ? ` (${exampleCount}/3)` : ''}`,
      done: exampleCount >= 3,
      to: '/style',
    },
    { label: 'Create a class', done: classes.length > 0, action: onNewClass },
    { label: 'Import the class’s marks', done: Boolean(withLearners), to: firstClass && `/classes/${firstClass.id}` },
    {
      label: 'Draft comments with one click',
      done: Boolean(withComments),
      to: withLearners && `/classes/${withLearners.id}/comments?term=1`,
    },
    {
      label: 'Approve and export your comments',
      done: classes.some((c) => c.comments_approved > 0),
      to: withComments && `/classes/${withComments.id}/comments?term=${withComments.comments_term}`,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const nextIndex = steps.findIndex((s) => !s.done);
  if (nextIndex === -1) return null;

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Getting started</h2>
          <p>{doneCount} of {steps.length} done. Follow the steps in order the first time.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => { setFlag('checklist_hidden'); onHide(); }}>Hide</button>
      </div>
      <div className="bar" style={{ marginBottom: 12 }}><div style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
      <div className="checklist">
        {steps.map((step, i) => {
          const className = `check-item ${step.done ? 'done' : ''} ${i === nextIndex ? 'next' : ''}`;
          const body = (
            <>
              <span className="check-dot"><Check size={14} /></span>
              <span className="check-label">{step.label}</span>
              {i === nextIndex && <span className="go">Do this next <ChevronRight size={14} /></span>}
            </>
          );
          if (step.done || (!step.to && !step.action)) return <div key={step.label} className={className}>{body}</div>;
          if (step.action) {
            return (
              <button key={step.label} className={className} onClick={step.action}
                style={{ border: 'none', background: i === nextIndex ? undefined : 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                {body}
              </button>
            );
          }
          return <Link key={step.label} to={step.to} className={className}>{body}</Link>;
        })}
      </div>
    </section>
  );
}

export const shouldShowWelcome = () => !getFlag('welcome_seen');
export const checklistHidden = () => getFlag('checklist_hidden');
