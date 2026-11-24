import { useState } from 'react';
import { FileSpreadsheet, FileDown, LoaderCircle, Check, ClipboardPaste, ArrowLeft, Sparkles, ShieldCheck } from 'lucide-react';
import { api } from '../api.js';
import { Alert, Help, TermPicker } from './ui.jsx';
import {
  parsePasted, isLongFormat, longFormatRows, guessHeaderRow, guessMapping, buildRows, resolveLearners,
  rememberMapping, recallMapping,
} from '../lib/mapping.js';

const NAME_FORMATS = {
  first: 'First name only',
  first_last: 'First name, then surname',
  last_first: 'Surname, then first name',
};

function downloadTemplate() {
  const csv = 'Learner name,Learner code,Test 1 (50),Assignment (30)\nThandi,L01,38,22\nSipho,L02,41,25\n';
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  Object.assign(document.createElement('a'), { href: url, download: 'marks-template.csv' }).click();
  URL.revokeObjectURL(url);
}

const headerLabel = (headers, col) => headers[col] || `Column ${col + 1}`;

export default function ImportWizard({ classId, subjects, defaultTerm, onImported }) {
  const [stage, setStage] = useState('start'); // start | map | check
  const [source, setSource] = useState('upload'); // upload | paste
  const [pasted, setPasted] = useState('');
  const [sheets, setSheets] = useState([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState(null);
  const [recalled, setRecalled] = useState(false);
  const [subject, setSubject] = useState('');
  const [term, setTerm] = useState(defaultTerm);
  const [check, setCheck] = useState(null);
  const [fromMapping, setFromMapping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const grid = sheets[sheetIndex]?.rows ?? [];
  const headers = mapping ? grid[mapping.headerRow] ?? [] : [];

  function reset() {
    setStage('start');
    setSheets([]);
    setMapping(null);
    setCheck(null);
    setPasted('');
    setError('');
  }

  async function runCheck(rows, extra = {}) {
    setBusy(true);
    setError('');
    try {
      const result = await api(`/classes/${classId}/import/check`, { method: 'POST', body: { rows } });
      setCheck({ ...result, ...extra });
      setStage('check');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function prepare(allSheets, index) {
    const rows = allSheets[index]?.rows ?? [];
    setSheets(allSheets);
    setSheetIndex(index);
    setMessage('');
    if (rows.length < 2) {
      setError('That sheet looks empty. It needs a header row and at least one learner.');
      return;
    }
    // The app's own long format needs no matching.
    if (isLongFormat(rows[0])) {
      setFromMapping(false);
      runCheck(longFormatRows(rows));
      return;
    }
    const guessed = guessMapping(rows, guessHeaderRow(rows));
    const memory = recallMapping(classId, rows[guessed.headerRow], guessed);
    // Teachers often name each sheet after its subject ("Mathematics", "English").
    const sheetName = allSheets[index].name.trim();
    const genericName = /^(sheet|blad|pasted)\b|^\d+$/i.test(sheetName);
    const subjectFromSheet = subjects.find((s) => s.toLowerCase().startsWith(sheetName.toLowerCase()))
      ?? (genericName ? null : sheetName);
    setMapping(memory.mapping);
    setRecalled(memory.recalled);
    setSubject(subjectFromSheet ?? memory.subject ?? (subjects.length === 1 ? subjects[0] : ''));
    setStage('map');
  }

  async function upload(file) {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const { sheets: read } = await api(`/classes/${classId}/import/sheet`, { method: 'POST', body });
      prepare(read.map((s) => ({ ...s, file: file.name })), 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function usePasted() {
    setError('');
    const rows = parsePasted(pasted);
    if (rows.length < 2) {
      setError('Paste at least a header row and one learner row.');
      return;
    }
    prepare([{ name: 'Pasted cells', rows }], 0);
  }

  function changeHeaderRow(headerRow) {
    setMapping(guessMapping(grid, headerRow));
    setRecalled(false);
  }

  const updateMapping = (changes) => setMapping({ ...mapping, ...changes });
  const updateAssessment = (col, changes) => updateMapping({
    assessments: mapping.assessments.map((a) => (a.col === col ? { ...a, ...changes } : a)),
  });

  const included = mapping?.assessments.filter((a) => a.include) ?? [];
  const missingMax = included.filter((a) => !(Number(a.max) > 0));
  const { learners: resolved, clashes } = mapping ? resolveLearners(grid, mapping) : { learners: new Map(), clashes: [] };
  const unresolved = clashes.filter((c) => !c.resolved);
  const canCheck = mapping && subject.trim() && included.length > 0 && missingMax.length === 0 && unresolved.length === 0;

  function checkMapped() {
    const { rows, skippedBlanks } = buildRows(grid, mapping, { subject: subject.trim(), term });
    setFromMapping(true);
    runCheck(rows, { skippedBlanks });
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      const { saved } = await api(`/classes/${classId}/import/confirm`, { method: 'POST', body: { rows: check.rows } });
      if (fromMapping) rememberMapping(classId, headers, mapping, subject.trim());
      reset();
      setMessage(`Saved ${saved.marks} marks for ${saved.learners} learners in ${saved.subjects.join(', ')}.`);
      onImported();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // A few learners as they will be imported, so the teacher can sanity-check.
  const sampleLearners = [...resolved.entries()].slice(0, 3).map(([index, learner]) => ({ row: grid[index], learner }));

  return (
    <section className="card stack">
      <div className="row spread">
        <div>
          <h2>
            Import marks
            <Help>Use the mark sheet you already have: one row per learner and a column for each test or task. You'll match the columns next, and the app remembers your choices.</Help>
          </h2>
          <div className="steps-bar" style={{ marginTop: 6 }}>
            <span className={stage === 'start' ? 'on' : ''}>1. Choose marks</span><span className="sep">›</span>
            <span className={stage === 'map' ? 'on' : ''}>2. Match columns</span><span className="sep">›</span>
            <span className={stage === 'check' ? 'on' : ''}>3. Check and save</span>
          </div>
        </div>
        {stage === 'start' && (
          <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}><FileDown size={15} /> Example sheet</button>
        )}
        {stage !== 'start' && (
          <button className="btn btn-ghost btn-sm" onClick={reset}><ArrowLeft size={15} /> Start over</button>
        )}
      </div>

      {stage === 'start' && (
        <>
          <div className="segmented" role="tablist" style={{ alignSelf: 'flex-start' }}>
            <button className={source === 'upload' ? 'on' : ''} onClick={() => setSource('upload')}>
              <FileSpreadsheet size={15} /> Upload a file
            </button>
            <button className={source === 'paste' ? 'on' : ''} onClick={() => setSource('paste')}>
              <ClipboardPaste size={15} /> Paste from Excel
            </button>
          </div>

          {source === 'upload' ? (
            <label
              className={`dropzone ${over ? 'over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files[0]); }}
            >
              {busy ? <LoaderCircle size={28} className="spin dz-icon" /> : <FileSpreadsheet size={28} className="dz-icon" />}
              <strong>{busy ? 'Reading your file…' : 'Drop your Excel or CSV file here, or click to choose'}</strong>
              <span className="file-format">.xlsx or .csv. Nothing is saved until you confirm.</span>
              <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={busy} onChange={(e) => { upload(e.target.files[0]); e.target.value = ''; }} />
            </label>
          ) : (
            <div className="stack">
              <p className="muted small">In Excel, select the cells including the header row, press Ctrl+C, then click below and press Ctrl+V.</p>
              <textarea className="paste-box" value={pasted} onChange={(e) => setPasted(e.target.value)}
                placeholder={'Name\tTest 1 (50)\tAssignment (30)\nThandi\t38\t22'} />
              <div><button className="btn btn-primary" disabled={!pasted.trim()} onClick={usePasted}>Next: match columns</button></div>
            </div>
          )}
        </>
      )}

      {stage === 'map' && mapping && (
        <div className="stack">
          {recalled && <Alert tone="success">Used the same column choices as your last import. Check them and carry on.</Alert>}

          <div className="map-grid">
            {sheets.length > 1 && (
              <label className="field">Sheet
                <select value={sheetIndex} onChange={(e) => prepare(sheets, Number(e.target.value))}>
                  {sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}
                </select>
              </label>
            )}
            <label className="field">
              <span>Header row<Help>The row with your column titles. Rows above it, like a title, are ignored.</Help></span>
              <select value={mapping.headerRow} onChange={(e) => changeHeaderRow(Number(e.target.value))}>
                {grid.slice(0, 15).map((r, i) => (
                  <option key={i} value={i}>Row {i + 1}: {r.filter(Boolean).slice(0, 3).join(', ').slice(0, 40) || '(empty)'}</option>
                ))}
              </select>
            </label>
            <label className="field">Learner names
              <select value={mapping.nameCol} onChange={(e) => updateMapping({ nameCol: Number(e.target.value) })}>
                {headers.map((h, i) => <option key={i} value={i}>{headerLabel(headers, i)}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Names are written as<Help>Only first names are kept. Surnames are removed on your computer and never saved or sent anywhere.</Help></span>
              <select value={mapping.nameFormat} onChange={(e) => updateMapping({ nameFormat: e.target.value })}>
                {Object.entries(NAME_FORMATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Learner code<Help>Your own number for each learner, like an admission or register number. It links marks across terms. Without one, first names are used, so two learners can't share a name.</Help></span>
              <select value={mapping.codeCol} onChange={(e) => updateMapping({ codeCol: Number(e.target.value) })}>
                <option value={-1}>None: use first names</option>
                {headers.map((h, i) => <option key={i} value={i}>{headerLabel(headers, i)}</option>)}
              </select>
            </label>
            {mapping.nameFormat === 'first' && (
              <label className="field">
                <span>Surname column<Help>Optional. Only used when two learners share a first name: they're shown as "Thandi M." and "Thandi D.". Only that one letter is kept.</Help></span>
                <select value={mapping.surnameCol} onChange={(e) => updateMapping({ surnameCol: Number(e.target.value) })}>
                  <option value={-1}>None</option>
                  {headers.map((h, i) => <option key={i} value={i}>{headerLabel(headers, i)}</option>)}
                </select>
              </label>
            )}
            <label className="field">Subject
              <input list="class-subjects" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Mathematics" />
              <datalist id="class-subjects">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
            </label>
            <div className="field">Term<TermPicker term={term} onChange={setTerm} showLabel={false} /></div>
          </div>

          <div>
            <h3 style={{ marginBottom: 8 }}>
              Mark columns
              <Help>Tick the columns that are marks. Totals and percentages are unticked, because the app works out averages itself. Weight 2 counts a column double, e.g. a test versus homework.</Help>
            </h3>
            {mapping.assessments.length === 0 ? (
              <Alert tone="warning">No columns with marks were found under this header row. Try a different header row.</Alert>
            ) : (
              <div className="table-wrap">
                <table className="assess-table">
                  <thead><tr><th>Use</th><th>Column</th><th>Name in reports</th><th>Out of</th><th>Weight</th></tr></thead>
                  <tbody>
                    {mapping.assessments.map((a) => (
                      <tr key={a.col} className={a.include ? '' : 'off'}>
                        <td><input type="checkbox" checked={a.include} onChange={(e) => updateAssessment(a.col, { include: e.target.checked })} aria-label={`Use ${a.header}`} /></td>
                        <td>{a.header}</td>
                        <td><input value={a.name} onChange={(e) => updateAssessment(a.col, { name: e.target.value })} /></td>
                        <td><input className="num" type="number" min="1" step="any" value={a.max ?? ''} placeholder="?"
                          style={a.include && !(Number(a.max) > 0) ? { borderColor: 'var(--amber)' } : undefined}
                          onChange={(e) => updateAssessment(a.col, { max: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                        <td><input className="num" type="number" min="0.1" step="any" value={a.weight}
                          onChange={(e) => updateAssessment(a.col, { weight: Number(e.target.value) || 1 })} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {sampleLearners.length > 0 && (
            <div className="sample">
              <strong className="small">How the first learners will be imported</strong>
              {sampleLearners.map(({ row: r, learner }, i) => (
                <span key={i}>
                  <strong>{learner.initial ? `${learner.firstName} ${learner.initial}.` : learner.firstName}</strong>
                  {mapping.codeCol >= 0 && <span className="muted"> ({r[mapping.codeCol]})</span>}
                  {': '}
                  {included.map((a) => `${a.name} ${r[a.col] || 'blank'}/${a.max ?? '?'}`).join(' · ') || 'no columns ticked'}
                </span>
              ))}
              <span className="muted small row" style={{ gap: 6 }}><ShieldCheck size={13} /> Surnames stay on your computer.</span>
            </div>
          )}

          {clashes.filter((c) => c.resolved).map((c) => (
            <Alert key={c.firstName} tone="info">
              {c.count} learners are called {c.firstName}. They'll be shown as {c.labels.join(' and ')} so you can tell them apart.
              {c.labels.some((l) => l.endsWith('.')) && ' Only the surname initial is kept, and comments still just say "' + c.firstName + '".'}
            </Alert>
          ))}
          {unresolved.length > 0 && (
            <Alert tone="warning">
              <strong>
                {unresolved.map((c) => `${c.count} learners are called ${c.firstName}`).join('; ')}, and the app can't tell them apart.
              </strong>{' '}
              Choose a <em>Learner code</em> column (like an admission number){mapping.nameFormat === 'first' ? ', or a surname column,' : ''} so
              each one gets their own marks and comment.
            </Alert>
          )}
          {missingMax.length > 0 && (
            <Alert tone="warning">Enter what {missingMax.map((a) => `"${a.name}"`).join(', ')} {missingMax.length > 1 ? 'are' : 'is'} out of.</Alert>
          )}
          <div className="row">
            <button className="btn btn-primary" disabled={!canCheck || busy} onClick={checkMapped}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />} Check marks
            </button>
            {!subject.trim() && <span className="muted small">Choose a subject to continue.</span>}
          </div>
        </div>
      )}

      {stage === 'check' && check && (
        <div className="stack">
          <div className="row">
            <span className="chip chip-neutral">{check.summary.learners} learners</span>
            <span className="chip chip-neutral">{check.summary.subjects.join(', ') || 'no subject'}</span>
            <span className="chip chip-neutral">{check.summary.assessments} assessments</span>
            <span className="chip chip-neutral">{check.summary.marks} marks</span>
          </div>
          {check.skippedBlanks > 0 && (
            <Alert tone="info">{check.skippedBlanks} blank cell{check.skippedBlanks > 1 ? 's were' : ' was'} skipped (not counted as zero). Averages use the marks that are there.</Alert>
          )}
          {check.errors.length > 0 ? (
            <>
              <Alert tone="error">
                <strong>{check.errors.length} problem{check.errors.length > 1 ? 's' : ''} to fix.</strong>{' '}
                {fromMapping ? 'Go back and adjust the columns, or fix the sheet and start over.' : 'Fix them in your file and upload it again.'}
              </Alert>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Sheet row</th><th>Learner</th><th>Problem</th></tr></thead>
                  <tbody>
                    {check.errors.slice(0, 50).map((err, i) => (
                      <tr key={i}><td>{err.row ?? '–'}</td><td>{err.learner_code || '–'}</td><td style={{ whiteSpace: 'normal' }}>{err.message}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {fromMapping && <div><button className="btn btn-secondary" onClick={() => setStage('map')}><ArrowLeft size={15} /> Back to columns</button></div>}
            </>
          ) : (
            <>
              <Alert tone="success">Everything checks out. Save to add these marks to the class.</Alert>
              <div className="row">
                <button className="btn btn-primary" onClick={save} disabled={busy}>
                  {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />} Save {check.rows.length} marks
                </button>
                {fromMapping && <button className="btn btn-ghost" onClick={() => setStage('map')}>Back</button>}
              </div>
            </>
          )}
        </div>
      )}

      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
    </section>
  );
}
