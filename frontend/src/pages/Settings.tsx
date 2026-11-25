import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { User } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { InstallPrompt } from '../components/InstallPrompt';
import { Button, Card, ErrorText, Field, LangToggle } from '../components/ui';

export default function Settings() {
  const { t } = useTranslation();
  const { user, updateProfile, logout, adopt } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState(user?.name ?? '');
  const [pErr, setPErr] = useState<unknown>(null);
  const [pOk, setPOk] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [wErr, setWErr] = useState<unknown>(null);
  const [wOk, setWOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setPErr(null); setPOk(false); setBusy(true);
    try { await updateProfile({ name: name.trim() }); setPOk(true); } catch (err) { setPErr(err); }
    setBusy(false);
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setWErr(null); setWOk(false); setBusy(true);
    try {
      const res = await api.post<{ access_token: string; user: User }>('/me/password', { current_password: cur, new_password: next });
      adopt(res); setCur(''); setNext(''); setWOk(true);
    } catch (err) { setWErr(err); }
    setBusy(false);
  };

  return (
    <div className="page">
      <div className="page-head"><h1>{t('settings.title')}</h1></div>

      <Card className="stack">
        <h2>{t('settings.profile')}</h2>
        <form onSubmit={saveProfile} className="stack">
          <Field label={t('auth.name')} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} required />
          <Field label={t('auth.email')} value={user?.email ?? ''} disabled readOnly />
          <ErrorText error={pErr} />
          {pOk && <p className="notice">{t('settings.saved')}</p>}
          <Button type="submit" loading={busy} disabled={!name.trim() || name.trim() === user?.name}>{t('common.save')}</Button>
        </form>
        <div className="row between">
          <span>{t('common.language')}</span>
          <LangToggle />
        </div>
      </Card>

      <Card className="stack">
        <h2>{t('settings.security')}</h2>
        <form onSubmit={changePassword} className="stack">
          <Field label={t('auth.currentPassword')} type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required />
          <Field label={t('auth.newPassword')} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required
                 error={next.length > 0 && next.length < 8 ? t('auth.passwordMin') : undefined} />
          <ErrorText error={wErr} />
          {wOk && <p className="notice">{t('settings.passwordChanged')}</p>}
          <Button type="submit" variant="secondary" loading={busy} disabled={!cur || next.length < 8}>{t('settings.changePassword')}</Button>
        </form>
      </Card>

      <InstallPrompt />

      <Button variant="ghost" onClick={async () => { await logout(); nav('/welcome', { replace: true }); }}>
        <Icon name="logout" size={18} /> {t('auth.signOut')}
      </Button>
    </div>
  );
}
