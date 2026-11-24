import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Sparkles, PenLine, ShieldCheck, LoaderCircle } from 'lucide-react';
import { api, setSession } from '../api.js';
import { APP_NAME, APP_TAGLINE, Alert, ThemeToggle } from '../components/ui.jsx';

const BENEFITS = [
  { icon: Sparkles, title: 'Drafts in your voice', text: 'Give it a few of your old comments and every draft follows your tone.' },
  { icon: PenLine, title: 'You stay in charge', text: 'Read, edit and approve each comment. Nothing is final until you say so.' },
  { icon: ShieldCheck, title: 'Private by design', text: "Learners' names never reach the AI, and no surnames or ID numbers are stored." },
];

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const registering = mode === 'register';

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { token, teacher } = await api(`/auth/${mode}`, { method: 'POST', body: form });
      setSession(token, teacher);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-hero">
        <div className="brand">
          <span className="brand-mark"><GraduationCap size={20} /></span>
          <span className="brand-name">{APP_NAME}<small>{APP_TAGLINE}</small></span>
        </div>
        <h1>Report comments, <em>without the late nights.</em></h1>
        <div className="benefits">
          {BENEFITS.map(({ icon: Icon, title, text }) => (
            <div className="benefit" key={title}>
              <span className="benefit-icon"><Icon size={19} /></span>
              <div><strong>{title}</strong><span>{text}</span></div>
            </div>
          ))}
        </div>
      </section>

      <section className="auth-panel">
        <div style={{ position: 'absolute', top: 16, right: 16, color: 'var(--muted)' }}><ThemeToggle /></div>
        <form onSubmit={submit} className="auth-card">
          <div>
            <h1>{registering ? 'Create your account' : 'Welcome back'}</h1>
            <p className="muted" style={{ marginTop: 6 }}>
              {registering ? 'It takes less than a minute.' : 'Log in to pick up where you left off.'}
            </p>
          </div>

          <div className="segmented" role="tablist">
            <button type="button" className={!registering ? 'on' : ''} onClick={() => { setMode('login'); setError(''); }}>
              Log in
            </button>
            <button type="button" className={registering ? 'on' : ''} onClick={() => { setMode('register'); setError(''); }}>
              Create account
            </button>
          </div>

          {registering && (
            <label className="field">Your name
              <input value={form.name} onChange={update('name')} placeholder="e.g. Ms Dlamini" autoComplete="name" required />
            </label>
          )}
          <label className="field">Email
            <input type="email" value={form.email} onChange={update('email')} placeholder="you@school.co.za" autoComplete="email" required />
          </label>
          <label className="field">Password
            <input type="password" value={form.password} onChange={update('password')}
              minLength={registering ? 8 : undefined} autoComplete={registering ? 'new-password' : 'current-password'} required />
            {registering && <span className="hint">At least 8 characters.</span>}
          </label>

          {error && <Alert tone="error">{error}</Alert>}

          <button className="btn btn-primary btn-lg" disabled={busy}>
            {busy && <LoaderCircle size={17} className="spin" />}
            {registering ? 'Create account' : 'Log in'}
          </button>
        </form>
      </section>
    </div>
  );
}
