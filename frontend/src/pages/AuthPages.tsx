import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { User } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { Button, ErrorText, Field, LangToggle } from '../components/ui';

function AuthShell({ title, children, back = true }: { title: string; children: React.ReactNode; back?: boolean }) {
  const { t } = useTranslation();
  return (
    <main className="auth">
      <div className="auth-top">
        {back ? <Link to="/welcome" className="icon-btn" aria-label={t('common.back')}><Icon name="back" /></Link> : <span />}
        <LangToggle />
      </div>
      <h1>{title}</h1>
      {children}
    </main>
  );
}

export function Welcome() {
  const { t } = useTranslation();
  return (
    <main className="welcome">
      <div className="auth-top"><span /><LangToggle /></div>
      <div className="welcome-hero">
        <div className="logo"><Icon name="radio" size={44} /></div>
        <h1>{t('app.name')}</h1>
        <p className="muted">{t('app.tagline')}</p>
      </div>
      <div className="stack">
        <Link to="/sign-up" className="btn btn-primary">{t('auth.signUp')}</Link>
        <Link to="/sign-in" className="btn btn-secondary">{t('auth.signIn')}</Link>
      </div>
    </main>
  );
}

export function SignIn() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await login(email, password); nav('/', { replace: true }); }
    catch (err) { setError(err); setBusy(false); }
  };

  return (
    <AuthShell title={t('auth.signInTitle')}>
      <form onSubmit={submit} className="stack">
        <Field label={t('auth.email')} type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label={t('auth.password')} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <ErrorText error={error} />
        <Button type="submit" loading={busy}>{t('auth.signIn')}</Button>
        <Link to="/forgot-password" className="link center">{t('auth.forgot')}</Link>
      </form>
      <p className="muted center">{t('auth.noAccount')} <Link to="/sign-up" className="link">{t('auth.signUp')}</Link></p>
    </AuthShell>
  );
}

export function SignUp() {
  const { t, i18n } = useTranslation();
  const { register } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const short = f.password.length > 0 && f.password.length < 8;
  const mismatch = f.confirm.length > 0 && f.confirm !== f.password;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (short || mismatch) return;
    setBusy(true); setError(null);
    try { await register(f.name, f.email, f.password, i18n.language === 'en' ? 'en' : 'es'); nav('/', { replace: true }); }
    catch (err) { setError(err); setBusy(false); }
  };

  return (
    <AuthShell title={t('auth.signUpTitle')}>
      <form onSubmit={submit} className="stack">
        <Field label={t('auth.name')} autoComplete="name" required maxLength={80} value={f.name} onChange={set('name')} />
        <Field label={t('auth.email')} type="email" autoComplete="email" inputMode="email" required value={f.email} onChange={set('email')} />
        <Field label={t('auth.password')} type="password" autoComplete="new-password" required value={f.password} onChange={set('password')} error={short ? t('auth.passwordMin') : undefined} />
        <Field label={t('auth.confirmPassword')} type="password" autoComplete="new-password" required value={f.confirm} onChange={set('confirm')} error={mismatch ? t('auth.passwordsDontMatch') : undefined} />
        <ErrorText error={error} />
        <Button type="submit" loading={busy}>{t('auth.signUp')}</Button>
      </form>
      <p className="muted center">{t('auth.haveAccount')} <Link to="/sign-in" className="link">{t('auth.signIn')}</Link></p>
    </AuthShell>
  );
}

export function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api.post('/auth/forgot', { email }); setSent(true); }
    catch (err) { setError(err); }
    setBusy(false);
  };

  return (
    <AuthShell title={t('auth.forgotTitle')}>
      {sent ? (
        <div className="stack">
          <p className="notice">{t('auth.linkSent')}</p>
          <Link to="/sign-in" className="btn btn-secondary">{t('auth.backToSignIn')}</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="stack">
          <p className="muted">{t('auth.forgotHelp')}</p>
          <Field label={t('auth.email')} type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <ErrorText error={error} />
          <Button type="submit" loading={busy}>{t('auth.sendLink')}</Button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPassword() {
  const { t } = useTranslation();
  const { adopt } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const short = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (short || mismatch) return;
    setBusy(true); setError(null);
    try {
      const res = await api.post<{ access_token: string; user: User }>('/auth/reset', { token: params.get('token') ?? '', password });
      adopt(res);
      nav('/', { replace: true });
    } catch (err) { setError(err); setBusy(false); }
  };

  return (
    <AuthShell title={t('auth.resetTitle')} back={false}>
      <form onSubmit={submit} className="stack">
        <Field label={t('auth.newPassword')} type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={short ? t('auth.passwordMin') : undefined} />
        <Field label={t('auth.confirmPassword')} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={mismatch ? t('auth.passwordsDontMatch') : undefined} />
        <ErrorText error={error} />
        <Button type="submit" loading={busy}>{t('auth.resetSubmit')}</Button>
      </form>
    </AuthShell>
  );
}
