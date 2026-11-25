import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { setLanguage } from '../i18n';
import { useAuth } from '../auth/AuthContext';

export function Button({
  variant = 'primary',
  loading,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean }) {
  return (
    <button className={`btn btn-${variant}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? <span className="spinner" aria-hidden /> : children}
    </button>
  );
}

export function Field({ label, error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...rest} aria-invalid={!!error} />
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  const { t, i18n } = useTranslation();
  if (!error) return null;
  const code = error instanceof ApiError ? error.code : 'generic';
  const key = `errors.${code}`;
  return <p className="form-error" role="alert">{i18n.exists(key) ? t(key) : t('errors.generic')}</p>;
}

export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...rest}>{children}</div>;
}

export function Spinner() {
  return <div className="center-fill"><span className="spinner big" aria-label="loading" /></div>;
}

export function LangToggle() {
  const { i18n } = useTranslation();
  const { user, updateProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const pick = async (l: 'es' | 'en') => {
    setLanguage(l);
    if (user && !busy) {
      setBusy(true);
      try { await updateProfile({ language: l }); } catch { /* local change already applied */ }
      setBusy(false);
    }
  };
  return (
    <div className="seg seg-sm" role="group" aria-label="language">
      {(['es', 'en'] as const).map((l) => (
        <button key={l} className={i18n.language === l ? 'on' : ''} onClick={() => pick(l)}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}
