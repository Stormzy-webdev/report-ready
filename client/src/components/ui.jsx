import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, TrendingDown, TrendingUp, Minus, Sun, Moon } from 'lucide-react';

// A small "?" that opens a one- or two-sentence explanation on click (not
// hover, so it works on touch screens and with the keyboard).
export function Help({ children, label = 'What is this?' }) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState('');
  const wrap = useRef(null);
  const pop = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !wrap.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  // Keep the bubble on screen near the left/right edges.
  useLayoutEffect(() => {
    if (!open || !pop.current) return;
    const rect = pop.current.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) setAlign('align-right');
    else if (rect.left < 8) setAlign('align-left');
  }, [open]);

  return (
    <span className="help-wrap" ref={wrap}>
      <button type="button" className="help-btn" aria-label={label} aria-expanded={open} aria-controls={id}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAlign(''); setOpen(!open); }}>
        ?
      </button>
      {open && <span id={id} role="note" ref={pop} className={`help-pop ${align}`}>{children}</span>}
    </span>
  );
}

export function getTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState(getTheme);
  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('rca_theme', next); } catch { /* still switches for this visit */ }
    setTheme(next);
  }
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button className="icon-btn theme-toggle" onClick={toggle} title={label} aria-label={label}>
      {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

export const APP_NAME = 'ReportReady';
export const APP_TAGLINE = 'Report comments, made easy';

export function PageHeader({ crumbs, title, badge, subtitle, actions }) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      {crumbs}
      <div className="page-header">
        <div>
          <div className="title-row">
            <h1>{title}</h1>
            {badge}
          </div>
          {subtitle && <p className="subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </div>
    </div>
  );
}

const ALERT_ICONS = { error: CircleAlert, warning: TriangleAlert, success: CircleCheck, info: Info };

export function Alert({ tone = 'info', children }) {
  const Icon = ALERT_ICONS[tone];
  return (
    <div className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <Icon size={17} />
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon size={26} /></div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}

export const FLAGS = {
  struggling: { label: 'Struggling', help: 'Below 40% in a subject' },
  slipping: { label: 'Slipping', help: 'Down 5+ points since last term' },
  improving: { label: 'Improving', help: 'Up 5+ points since last term' },
  steady: { label: 'Steady', help: 'Within 5 points of last term' },
};

export function FlagChip({ flag }) {
  if (!flag) return <span className="muted">–</span>;
  return (
    <span className={`chip chip-${flag}`} title={FLAGS[flag].help}>
      <span className="dot" /> {FLAGS[flag].label}
    </span>
  );
}

export function LevelPill({ level }) {
  if (level == null) return null;
  const tone = level <= 2 ? 'low' : level <= 4 ? 'mid' : 'high';
  return <span className={`level level-${tone}`} title={`CAPS level ${level}`}>L{level}</span>;
}

export function Delta({ average, previous }) {
  if (average == null || previous == null) return null;
  const change = Math.round((average - previous) * 10) / 10;
  if (Math.abs(change) < 0.5) return <span className="delta flat"><Minus size={13} />0</span>;
  const up = change > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`delta ${up ? 'up' : 'down'}`} title={`Last term: ${previous}%`}>
      <Icon size={13} />{up ? '+' : ''}{change}
    </span>
  );
}

// "Thandi", or "Thandi M." when two learners in the class share a first name.
export const displayName = (learner) =>
  (learner.initial ? `${learner.first_name} ${learner.initial}.` : learner.first_name);

export function Avatar({ name }) {
  return <span className="avatar" aria-hidden="true">{(name ?? '?').slice(0, 1).toUpperCase()}</span>;
}

export function TermPicker({ term, onChange, showLabel = true }) {
  return (
    <div className="row" style={{ gap: 8 }}>
      {showLabel && <span className="seg-label">Term</span>}
      <div className="segmented" role="group" aria-label="Term">
        {[1, 2, 3, 4].map((t) => (
          <button key={t} type="button" className={t === term ? 'on' : ''} aria-pressed={t === term}
            onClick={() => onChange(t)}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
