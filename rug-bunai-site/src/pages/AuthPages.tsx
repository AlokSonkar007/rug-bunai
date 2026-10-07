import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function LoginPage({ adminOnly = false }: { adminOnly?: boolean }) {
  const { configured, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [isNew, setIsNew] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (isNew) {
        const result = await signUp(email, password);
        setNotice(result.needsEmailConfirmation
          ? 'Check your email to confirm your account, then sign in.'
          : 'Your customer account is ready. You can now sign in.');
        setIsNew(false);
      } else {
        const profile = await signIn(email, password);
        if (adminOnly && profile.role !== 'admin') {
          throw new Error('This account is not an administrator. Use the customer sign-in instead.');
        }
        navigate(adminOnly ? '/admin' : '/', { replace: true });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to continue.');
    } finally {
      setBusy(false);
    }
  };

  const title = adminOnly ? 'Administrator sign in' : isNew ? 'Create your account' : 'Welcome back';
  return (
    <div className="wrap section" style={{ maxWidth: 520 }}>
      <p className="eyebrow">{adminOnly ? 'Rug Bunai studio' : 'Customer account'}</p>
      <h1 className="headline" style={{ marginTop: 10 }}>{title}</h1>
      {!configured && (
        <p className="field-error" style={{ marginTop: 18 }}>
          Authentication has not been connected yet. Add the Supabase values in <code>.env</code>.
        </p>
      )}
      <form onSubmit={submit} className="summary-card" style={{ marginTop: 28 }}>
        <div className="field">
          <label htmlFor="auth-email">Email</label>
          <input id="auth-email" type="email" autoComplete="email" value={email}
            onChange={(event) => setEmail(event.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="auth-password">Password</label>
          <input id="auth-password" type="password" autoComplete={isNew ? 'new-password' : 'current-password'}
            minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
        </div>
        {error && <p className="field-error">{error}</p>}
        {notice && <p className="muted">{notice}</p>}
        <button className="btn btn-solid btn-block" disabled={busy || !configured} type="submit">
          {busy ? 'Please wait…' : isNew ? 'Create customer account' : 'Sign in'}
        </button>
      </form>
      {!adminOnly && (
        <p className="muted" style={{ marginTop: 16, textAlign: 'center' }}>
          {isNew ? 'Already have an account?' : 'New to Rug Bunai?'}{' '}
          <button className="clear-all" onClick={() => { setIsNew((value) => !value); setError(null); setNotice(null); }}>
            {isNew ? 'Sign in' : 'Create one'}
          </button>
        </p>
      )}
      <p style={{ textAlign: 'center', marginTop: 22 }}><Link className="clear-all" to="/">Return to the collection</Link></p>
    </div>
  );
}
