import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { Control, ControlType } from '../api/types';
import { Icon } from '../components/Icon';
import { Button, ErrorText, Field } from '../components/ui';

/** 3 steps: IR device ID -> control type -> name. Then hands over to the learn wizard. */
export default function AddDevice() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [code, setCode] = useState('');
  const [type, setType] = useState<ControlType | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const id = code.trim();
      await api.get(`/ir-devices/${encodeURIComponent(id)}`);
      setCode(id);
      setStep(2);
    } catch (err) { setError(err); }
    setBusy(false);
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!type) return;
    setBusy(true); setError(null);
    try {
      const { control } = await api.post<{ control: Control }>('/controls', { ir_device_code: code, type, name: name.trim() });
      nav(`/controls/${control.id}/setup`, { replace: true });
    } catch (err) { setError(err); setBusy(false); }
  };

  const en = i18n.language === 'en';
  const suggestions = type === 'tv'
    ? (en ? ['Living room TV', 'Bedroom TV'] : ['TV de la sala', 'TV de la recámara'])
    : (en ? ['Bedroom AC', 'Living room AC'] : ['Aire de la recámara', 'Aire de la sala']);

  return (
    <div className="page">
      <div className="page-head">
        <p className="muted">{t('add.step', { n: step })}</p>
        <div className="progress"><i style={{ width: `${(step / 3) * 100}%` }} /></div>
      </div>

      {step === 1 && (
        <form onSubmit={verify} className="stack">
          <h1>{t('add.idTitle')}</h1>
          <p className="muted">{t('add.idHelp')}</p>
          <Field label={t('add.idLabel')} placeholder={t('add.idPlaceholder')} value={code} onChange={(e) => setCode(e.target.value)}
                 autoCapitalize="characters" autoCorrect="off" spellCheck={false} required maxLength={64} />
          <ErrorText error={error} />
          <Button type="submit" loading={busy} disabled={!code.trim()}>{t('add.idCheck')}</Button>
        </form>
      )}

      {step === 2 && (
        <div className="stack">
          <h1>{t('add.typeTitle')}</h1>
          <div className="choice-grid">
            {(['tv', 'ac'] as const).map((k) => (
              <button key={k} className={`choice ${type === k ? 'on' : ''}`} onClick={() => setType(k)}>
                <Icon name={k} size={40} />
                <strong>{t(`add.${k}`)}</strong>
              </button>
            ))}
          </div>
          <Button disabled={!type} onClick={() => setStep(3)}>{t('common.next')}</Button>
          <Button variant="ghost" onClick={() => setStep(1)}>{t('common.back')}</Button>
        </div>
      )}

      {step === 3 && (
        <form onSubmit={create} className="stack">
          <h1>{t('add.nameTitle')}</h1>
          <Field label={t('add.nameLabel')} placeholder={t('add.namePlaceholder')} value={name} maxLength={60}
                 onChange={(e) => setName(e.target.value)} required autoFocus />
          <div>
            <p className="muted small">{t('add.suggestions')}</p>
            <div className="chips">
              {suggestions.map((s) => <button type="button" key={s} className="chip-btn" onClick={() => setName(s)}>{s}</button>)}
            </div>
          </div>
          <ErrorText error={error} />
          <Button type="submit" loading={busy} disabled={!name.trim()}>{t('add.create')}</Button>
          <Button type="button" variant="ghost" onClick={() => setStep(2)}>{t('common.back')}</Button>
        </form>
      )}
    </div>
  );
}
