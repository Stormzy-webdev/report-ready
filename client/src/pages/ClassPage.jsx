import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Users, BookOpen, TriangleAlert, TrendingDown, PenLine, Plus, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import ImportWizard from '../components/ImportWizard.jsx';
import SummaryTable from '../components/SummaryTable.jsx';
import { PageHeader, Alert, TermPicker, Help } from '../components/ui.jsx';

function Stat({ icon: Icon, tone, value, label, help }) {
  return (
    <div className="card stat">
      <span className={`stat-icon tone-${tone}`}><Icon size={20} /></span>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}{help && <Help>{help}</Help>}</div>
      </div>
    </div>
  );
}

export default function ClassPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const term = Number(params.get('term')) || 1;
  const [cls, setCls] = useState(null);
  const [summary, setSummary] = useState(null);
  const [subjectName, setSubjectName] = useState('');
  const [error, setError] = useState('');

  const loadClass = useCallback(
    () => api(`/classes/${id}`).then(setCls).catch((err) => setError(err.message)),
    [id],
  );
  const loadSummary = useCallback(
    () => api(`/classes/${id}/summary?term=${term}`).then(setSummary).catch((err) => setError(err.message)),
    [id, term],
  );

  useEffect(() => { loadClass(); }, [loadClass]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  async function addSubject(e) {
    e.preventDefault();
    setError('');
    try {
      await api(`/classes/${id}/subjects`, { method: 'POST', body: { name: subjectName } });
      setSubjectName('');
      loadClass();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteClass() {
    if (!confirm(`Delete class ${cls.name} with all its learners, marks and comments? This cannot be undone.`)) return;
    await api(`/classes/${id}`, { method: 'DELETE' });
    navigate('/');
  }

  if (!cls) return error ? <Alert tone="error">{error}</Alert> : <p className="muted">Loading…</p>;

  const learners = summary?.learners ?? [];
  const empty = summary && learners.length === 0;
  const count = (flag) => learners.filter((l) => l.flag === flag).length;

  const importer = (
    <ImportWizard classId={id} subjects={cls.subjects.map((s) => s.name)} defaultTerm={term}
      onImported={() => { loadClass(); loadSummary(); }} />
  );

  return (
    <>
      <PageHeader
        crumbs={<div className="crumbs"><Link to="/"><ArrowLeft size={15} /> All classes</Link></div>}
        title={`Class ${cls.name}`}
        badge={<span className="chip chip-neutral">Grade {cls.grade} · {cls.year}</span>}
        actions={(
          <>
            <TermPicker term={term} onChange={(t) => setParams({ term: t })} />
            <Link to={`/classes/${id}/comments?term=${term}`} className={`btn ${empty ? 'btn-secondary' : 'btn-primary'}`}>
              <PenLine size={17} /> Write term {term} comments
            </Link>
          </>
        )}
      />

      {empty && (
        <Alert tone="info">
          <strong>Start by importing this class's marks.</strong> Upload your usual Excel mark sheet or paste the cells.
          Once marks are in, you'll see how every learner is doing and can draft their comments.
        </Alert>
      )}
      {empty && importer}

      <div className="stats">
        <Stat icon={Users} tone="green" value={learners.length} label="Learners" />
        <Stat icon={BookOpen} tone="blue" value={cls.subjects.length} label="Subjects" />
        <Stat icon={TriangleAlert} tone="red" value={count('struggling')} label="Struggling"
          help="Learners with an average below 40% in at least one subject this term." />
        <Stat icon={TrendingDown} tone="amber" value={count('slipping')} label="Slipping"
          help="Learners whose average dropped by 5 or more points since last term in at least one subject." />
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>
              Term {term} overview
              <Help>Each mark is the learner's weighted term average. L1–L7 is the CAPS achievement level (L7 = 80%+, L4 = 50–59%, L1 = below 30%). Arrows show the change since last term.</Help>
            </h2>
            <p>Each learner's average per subject, CAPS level and change since last term.</p>
          </div>
        </div>
        {summary && <SummaryTable summary={summary} />}
      </section>

      {!empty && importer}

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div><h2>Subjects</h2><p>Added automatically when you import marks.</p></div>
          </div>
          <div className="stack">
            {cls.subjects.length > 0 ? (
              <div className="subject-list">
                {cls.subjects.map((s) => <span key={s.id} className="chip chip-neutral">{s.name}</span>)}
              </div>
            ) : (
              <p className="muted small">No subjects yet.</p>
            )}
            <form onSubmit={addSubject} className="inline-form">
              <input placeholder="Add a subject, e.g. Life Skills" value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)} required />
              <button className="btn btn-secondary"><Plus size={16} /> Add</button>
            </form>
          </div>
        </section>

        <section className="card">
          <div className="card-head" style={{ marginBottom: 10 }}>
            <div><h2>Delete class</h2><p>Removes all its learners, marks and comments for good.</p></div>
          </div>
          <button className="btn btn-danger" onClick={deleteClass}><Trash2 size={16} /> Delete class {cls.name}</button>
        </section>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
    </>
  );
}
