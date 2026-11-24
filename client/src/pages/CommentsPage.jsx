import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Sparkles, Download, Check, Undo2, Save, LoaderCircle, ShieldCheck, PenLine, Copy, RefreshCw,
  ChevronDown, FileSpreadsheet, FileText, Printer, FileDown,
} from 'lucide-react';
import { api, download } from '../api.js';
import { PageHeader, Alert, EmptyState, FlagChip, LevelPill, Delta, Avatar, TermPicker, Help, displayName } from '../components/ui.jsx';

const MAX_CHARS = 400;

function ExportMenu({ classId, term, disabled, onError }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  function get(format) {
    setOpen(false);
    if (format === 'pdf') {
      window.open(`/classes/${classId}/print?term=${term}`, '_blank');
      return;
    }
    download(`/classes/${classId}/export?term=${term}&format=${format}`).catch((err) => onError(err.message));
  }

  const options = [
    { format: 'xlsx', icon: FileSpreadsheet, title: 'Excel (.xlsx)', text: 'A list to copy into SA-SAMS or a school sheet' },
    { format: 'docx', icon: FileText, title: 'Word (.docx)', text: 'One comment per learner, ready to edit or print' },
    { format: 'pdf', icon: Printer, title: 'PDF / print', text: 'Opens a clean page; choose "Save as PDF"' },
    { format: 'csv', icon: FileDown, title: 'CSV', text: 'Plain data for other systems' },
  ];

  return (
    <div className="menu-wrap" ref={ref}>
      <button className="btn btn-secondary" disabled={disabled} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(!open)}>
        <Download size={17} /> Export approved <ChevronDown size={15} />
      </button>
      {open && (
        <div className="menu" role="menu">
          {options.map(({ format, icon: Icon, title, text }) => (
            <button key={format} role="menuitem" onClick={() => get(format)}>
              <Icon size={17} /><div><strong>{title}</strong><span>{text}</span></div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CommentCard({ learner, aiReady, hidden, onSaved, onDirtyChange, onApproved }) {
  const [text, setText] = useState(learner.text);
  const [busy, setBusy] = useState(null); // 'save' | 'redraft' | null
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const approved = learner.status === 'approved';
  const missing = learner.comment_id && !learner.draft_text && !learner.text;
  const changed = text.trim() !== learner.text.trim();

  useEffect(() => setText(learner.text), [learner.text]);
  useEffect(() => onDirtyChange(learner.learner_id, changed), [changed, learner.learner_id, onDirtyChange]);

  async function run(kind, request) {
    setBusy(kind);
    setError('');
    try {
      onSaved(learner.learner_id, await request());
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  const save = (body) => run('save', () => api(`/comments/${learner.comment_id}`, { method: 'PATCH', body }));

  // Approving moves straight on to the next comment that still needs review.
  async function approve() {
    if (await save({ text, approved: true })) onApproved(learner.learner_id);
  }

  function onKeyDown(e) {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || busy) return;
    e.preventDefault();
    if (!approved && text.trim()) approve();
    else if (changed) save({ text });
  }

  function redraft() {
    if ((changed || approved) && !confirm(`Replace ${displayName(learner)}'s comment with a new draft? Your current text will be lost.`)) return;
    run('redraft', () => api(`/comments/${learner.comment_id}/redraft`, { method: 'POST' }));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy. Select the text and press Ctrl+C instead.');
    }
  }

  return (
    <li hidden={hidden} className={`card comment-card ${approved ? 'is-approved' : ''} ${missing ? 'is-missing' : ''} ${changed ? 'is-dirty' : ''}`}>
      <div className="head">
        <span className="learner-cell">
          <Avatar name={learner.first_name} />
          <span><strong>{displayName(learner)}</strong> <span className="muted small">{learner.learner_code}</span></span>
        </span>
        <span className="row" style={{ gap: 6 }}>
          <FlagChip flag={learner.flag} />
          {approved
            ? <span className="chip chip-approved"><Check size={12} /> Approved</span>
            : learner.comment_id && <span className="chip chip-draft">To review</span>}
        </span>
      </div>

      <div className="facts">
        {learner.subjects.map((s) => (
          <span key={s.subject_id} className="fact">
            {s.subject}
            {s.average == null ? <span className="muted">no marks</span> : (
              <>
                <strong>{s.average}%</strong>
                <LevelPill level={s.level} />
                <Delta average={s.average} previous={s.previous_average} />
              </>
            )}
          </span>
        ))}
      </div>

      {learner.comment_id ? (
        <>
          {missing && <Alert tone="warning">The AI couldn't draft this one. Write it yourself, or click Draft again.</Alert>}
          <textarea id={`comment-${learner.learner_id}`} rows={3} value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown} disabled={busy === 'redraft'} aria-label={`Comment for ${displayName(learner)}`} />
          <div className="foot">
            <span className="row" style={{ gap: 4 }}>
              <span className={`charcount ${text.length > MAX_CHARS ? 'over' : ''}`}>{text.length} / {MAX_CHARS}</span>
              {changed && <span className="chip chip-slipping">Unsaved</span>}
              <button className="btn btn-ghost btn-sm" onClick={copy} disabled={!text.trim()} title="Copy to paste into SA-SAMS">
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
              </button>
              {aiReady && (
                <button className="btn btn-ghost btn-sm" onClick={redraft} disabled={!!busy} title="Get a fresh AI draft for this learner">
                  {busy === 'redraft' ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />} Redraft
                </button>
              )}
            </span>
            <span className="row" style={{ gap: 8 }}>
              {changed && (
                <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => save({ text })}>
                  <Save size={14} /> Save edit
                </button>
              )}
              {approved ? (
                <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => save({ approved: false })}>
                  <Undo2 size={14} /> Unapprove
                </button>
              ) : (
                <button className="btn btn-primary btn-sm" disabled={!!busy || !text.trim()}
                  onClick={approve} title="Approve and go to the next comment (Ctrl+Enter)">
                  {busy === 'save' ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}
                  {changed ? 'Save and approve' : 'Approve'}
                </button>
              )}
            </span>
          </div>
        </>
      ) : (
        <p className="muted small">No draft yet. Click "Draft comments" above.</p>
      )}
      {error && <Alert tone="error">{error}</Alert>}
    </li>
  );
}

export default function CommentsPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const term = Number(params.get('term')) || 1;
  const [data, setData] = useState(null);
  const [cls, setCls] = useState(null);
  const [filter, setFilter] = useState('all');
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [dirty, setDirty] = useState(() => new Set());

  const load = useCallback(
    () => api(`/classes/${id}/comments?term=${term}`).then(setData).catch((err) => setError(err.message)),
    [id, term],
  );

  const onDirtyChange = useCallback((learnerId, isDirty) => {
    setDirty((prev) => {
      if (prev.has(learnerId) === isDirty) return prev;
      const next = new Set(prev);
      if (isDirty) next.add(learnerId); else next.delete(learnerId);
      return next;
    });
  }, []);

  // Warn before closing or reloading the tab with unsaved edits.
  useEffect(() => {
    if (dirty.size === 0) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api(`/classes/${id}`).then(setCls).catch(() => {}); }, [id]);

  async function generate() {
    setGenerating(true);
    setError('');
    setMessage('');
    try {
      const result = await api(`/classes/${id}/comments/generate?term=${term}`, { method: 'POST' });
      setMessage(
        `Drafted ${result.drafted} comment${result.drafted === 1 ? '' : 's'}.`
        + (result.failed ? ` ${result.failed} couldn't be drafted; write those yourself or draft again.` : ''),
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  function onSaved(learnerId, updated) {
    setData((prev) => {
      const learners = prev.learners.map((l) => (l.learner_id === learnerId ? { ...l, ...updated } : l));
      return { ...prev, learners, approved: learners.filter((l) => l.status === 'approved').length };
    });
  }

  // After an approval, jump to the next learner (wrapping round) whose comment still needs review.
  function goToNext(learnerId) {
    const list = data.learners;
    const start = list.findIndex((l) => l.learner_id === learnerId);
    const ordered = [...list.slice(start + 1), ...list.slice(0, start)];
    const next = ordered.find((l) => l.comment_id && l.status !== 'approved');
    if (!next) return;
    if (filter === 'approved') setFilter('all');
    requestAnimationFrame(() => {
      const box = document.getElementById(`comment-${next.learner_id}`);
      box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      box?.focus({ preventScroll: true });
    });
  }

  const crumbs = (
    <div className="crumbs">
      <Link to={`/classes/${id}?term=${term}`}><ArrowLeft size={15} /> {cls ? `Class ${cls.name}` : 'Back to class'}</Link>
    </div>
  );

  if (!data) {
    return error ? <><PageHeader crumbs={crumbs} title="Report comments" /><Alert tone="error">{error}</Alert></> : <p className="muted">Loading…</p>;
  }

  const needDrafts = data.learners.filter((l) => !l.draft_text && !l.text).length;
  const toReview = data.learners.filter((l) => l.status !== 'approved').length;
  const shown = data.learners.filter((l) =>
    filter === 'all' || (filter === 'approved' ? l.status === 'approved' : l.status !== 'approved'));
  const percent = data.total ? Math.round((data.approved / data.total) * 100) : 0;

  return (
    <>
      <PageHeader
        crumbs={crumbs}
        title={`Term ${term} comments`}
        badge={cls && <span className="chip chip-neutral">Class {cls.name} · Grade {cls.grade}</span>}
        actions={<TermPicker term={term} onChange={(t) => setParams({ term: t })} />}
      />

      {data.total === 0 ? (
        <div className="card">
          <EmptyState icon={PenLine} title="No learners in this class yet"
            action={<Link to={`/classes/${id}`} className="btn btn-primary">Import marks</Link>}>
            Import marks first; then you can draft a comment for every learner in one click.
          </EmptyState>
        </div>
      ) : (
        <>
          <section className="card progress-card">
            <div className="row spread">
              <div>
                <div className="big-count">
                  {data.approved} <span>of {data.total} approved</span>
                  <Help>Read each draft next to the learner's marks, fix anything that isn't right, then approve it. Only approved comments are exported. Tip: Ctrl+Enter approves and jumps to the next one.</Help>
                </div>
              </div>
              <div className="row">
                {needDrafts === 0 && !generating ? (
                  <span className="chip chip-improving"><Check size={13} /> All drafted</span>
                ) : (
                  <span className="row" style={{ gap: 0 }}>
                    <button className="btn btn-primary" onClick={generate} disabled={generating || !data.ai_configured}>
                      {generating ? <LoaderCircle size={17} className="spin" /> : <Sparkles size={17} />}
                      {generating ? `Drafting ${needDrafts}…` : `Draft ${needDrafts} comment${needDrafts === 1 ? '' : 's'}`}
                    </button>
                    <Help>Writes a first draft for every learner who doesn't have one yet, using their marks and your My style examples. It never overwrites a comment you've written or edited.</Help>
                  </span>
                )}
                <ExportMenu classId={id} term={term} disabled={data.approved === 0} onError={setError} />
              </div>
            </div>
            <div className="bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${percent}%` }} />
            </div>
            <div className="row spread">
              <div className="segmented" role="group" aria-label="Filter comments">
                <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All <span className="count">{data.total}</span></button>
                <button className={filter === 'review' ? 'on' : ''} onClick={() => setFilter('review')}>To review <span className="count">{toReview}</span></button>
                <button className={filter === 'approved' ? 'on' : ''} onClick={() => setFilter('approved')}>Approved <span className="count">{data.approved}</span></button>
              </div>
              <span className="ai-note">
                <ShieldCheck size={15} /> Drafted by {data.ai_description}. Names are added after drafting.
              </span>
            </div>
            {!data.ai_configured && (
              <Alert tone="warning">AI drafting isn't set up yet: add ANTHROPIC_API_KEY to server/.env, or set AI_PROVIDER=ollama, and restart the API.</Alert>
            )}
            {generating && <Alert tone="info">Drafting can take a minute or two for a full class. You can keep this page open.</Alert>}
            {message && <Alert tone="success">{message} Drafts follow your <Link to="/style">My style</Link> examples.</Alert>}
            {error && <Alert tone="error">{error}</Alert>}
          </section>

          <ul className="plain stack">
            {/* Filtered-out cards are hidden, not unmounted, so unsaved edits survive a filter change. */}
            {data.learners.map((learner) => (
              <CommentCard key={learner.learner_id} learner={learner} aiReady={data.ai_configured}
                hidden={!shown.includes(learner)} onSaved={onSaved} onDirtyChange={onDirtyChange} onApproved={goToNext} />
            ))}
          </ul>
          {shown.length === 0 && (
            <p className="muted" style={{ textAlign: 'center' }}>
              {filter === 'approved' ? 'Nothing approved yet.' : 'Everything is approved. Nice work! Export when you are ready.'}
            </p>
          )}
        </>
      )}
    </>
  );
}
