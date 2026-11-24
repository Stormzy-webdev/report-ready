import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import { api } from '../api.js';
import { displayName } from '../components/ui.jsx';

// A plain white page of approved comments. The browser's print dialog
// turns it into a PDF ("Save as PDF"), so no PDF library is needed.
export default function PrintPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const term = Number(params.get('term')) || 1;
  const [cls, setCls] = useState(null);
  const [learners, setLearners] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api(`/classes/${id}`), api(`/classes/${id}/comments?term=${term}`)])
      .then(([c, comments]) => {
        setCls(c);
        setLearners(comments.learners.filter((l) => l.status === 'approved'));
        document.title = `Class ${c.name} term ${term} comments`;
      })
      .catch((err) => setError(err.message));
  }, [id, term]);

  return (
    <div className="print-page">
      <div className="print-toolbar">
        <Link to={`/classes/${id}/comments?term=${term}`} className="btn btn-ghost" style={{ color: '#3d4b45' }}>
          <ArrowLeft size={16} /> Back to comments
        </Link>
        <span style={{ color: '#6b7a73', fontSize: '0.85rem' }}>In the print window, choose "Save as PDF" as the printer.</span>
        <button className="btn btn-primary" onClick={() => window.print()} disabled={!learners?.length}>
          <Printer size={16} /> Print / Save as PDF
        </button>
      </div>

      <div className="print-sheet">
        {error && <p>{error}</p>}
        {cls && learners && (
          <>
            <h1>Class {cls.name}: term {term} report comments</h1>
            <p className="print-meta">Grade {cls.grade} · {cls.year} · {learners.length} approved comment{learners.length === 1 ? '' : 's'}</p>
            {learners.length === 0 && <p>No comments have been approved for this term yet.</p>}
            {learners.map((l) => (
              <div key={l.learner_id} className="print-entry">
                <strong>{displayName(l)}</strong><span className="code">{l.learner_code}</span>
                <p>{l.text}</p>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
