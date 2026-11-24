import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { FLAGS, FlagChip, LevelPill, Delta, Avatar, EmptyState, displayName } from './ui.jsx';

function MarkCell({ result }) {
  if (result.average == null) return <td className="muted small">No marks</td>;
  return (
    <td>
      <span className="mark-cell">
        <strong>{result.average}%</strong>
        <LevelPill level={result.level} />
        <Delta average={result.average} previous={result.previous_average} />
      </span>
    </td>
  );
}

export default function SummaryTable({ summary }) {
  const [filter, setFilter] = useState('all');
  const { learners, term } = summary;

  if (learners.length === 0) {
    return (
      <EmptyState icon={BarChart3} title="No learners yet">
        Import a spreadsheet of marks and each learner's averages, CAPS levels and trends will show up here.
      </EmptyState>
    );
  }

  const subjects = learners[0].subjects.map((s) => s.subject);
  const counts = learners.reduce((acc, l) => ({ ...acc, [l.flag]: (acc[l.flag] ?? 0) + 1 }), {});
  const shown = filter === 'all' ? learners : learners.filter((l) => l.flag === filter);

  return (
    <div className="stack">
      <div className="row spread">
        <div className="segmented" role="group" aria-label="Filter learners">
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
            All <span className="count">{learners.length}</span>
          </button>
          {Object.entries(FLAGS).map(([key, { label }]) => (
            <button key={key} className={filter === key ? 'on' : ''} onClick={() => setFilter(key)}>
              {label} <span className="count">{counts[key] ?? 0}</span>
            </button>
          ))}
        </div>
        <p className="muted small">
          {term > 1 ? `Arrows compare with term ${term - 1}.` : 'Trends start from term 2.'}
        </p>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Learner</th>{subjects.map((s) => <th key={s}>{s}</th>)}<th>Overall</th></tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.learner_id}>
                <td>
                  <span className="learner-cell">
                    <Avatar name={l.first_name} />
                    <span><strong>{displayName(l)}</strong> <span className="muted small">{l.learner_code}</span></span>
                  </span>
                </td>
                {l.subjects.map((s) => <MarkCell key={s.subject_id} result={s} />)}
                <td><FlagChip flag={l.flag} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length === 0 && <p className="muted small">No learners in this group for term {term}.</p>}
    </div>
  );
}
