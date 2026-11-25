import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { AC_ACTIONS, TV_ACTIONS, type Control } from '../api/types';
import { Icon } from '../components/Icon';
import { LearnPanel } from '../components/LearnPanel';
import { Button, ErrorText, Field, Spinner } from '../components/ui';

export default function EditControl() {
  const { id } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const [control, setControl] = useState<Control | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [learning, setLearning] = useState<{ action: string; label?: string } | null>(null);
  const [customLabel, setCustomLabel] = useState('');

  useEffect(() => {
    api.get<{ control: Control }>(`/controls/${id}`)
      .then(({ control }) => { setControl(control); setName(control.name); })
      .catch(() => nav('/home', { replace: true }));
  }, [id, nav]);

  if (!control) return <Spinner />;

  if (learning) {
    return (
      <div className="page">
        <LearnPanel
          control={control}
          actionName={learning.action}
          label={learning.label}
          onLearned={(c) => { setControl(c); setLearning(null); }}
          onClose={() => setLearning(null)}
          closeLabel={t('common.cancel')}
        />
      </div>
    );
  }

  const learned = (n: string) => control.actions.some((a) => a.action_name === n);
  const catalog = control.type === 'tv' ? TV_ACTIONS : control.ac_mode === 'raw' ? AC_ACTIONS : ['power_on'];
  const customs = control.actions.filter((a) => a.action_name.startsWith('custom_'));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { control: c } = await api.patch<{ control: Control }>(`/controls/${control.id}`, { name: name.trim() });
      setControl(c);
    } catch (err) { setError(err); }
    setBusy(false);
  };

  const removeAction = async (action: string) => {
    try {
      const { control: c } = await api.del<{ control: Control }>(`/controls/${control.id}/actions/${action}`);
      setControl(c);
    } catch (err) { setError(err); }
  };

  const remove = async () => {
    if (!window.confirm(t('edit.deleteConfirm'))) return;
    try { await api.del(`/controls/${control.id}`); nav('/home', { replace: true }); }
    catch (err) { setError(err); }
  };

  const startCustom = (e: FormEvent) => {
    e.preventDefault();
    const suffix = Math.random().toString(36).slice(2, 8);
    setLearning({ action: `custom_${suffix}`, label: customLabel.trim() });
    setCustomLabel('');
  };

  return (
    <div className="page">
      <div className="page-head"><h1>{t('edit.title')}</h1></div>

      <form onSubmit={save} className="stack">
        <Field label={t('edit.rename')} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} required />
        <Button type="submit" loading={busy} disabled={!name.trim() || name.trim() === control.name}>{t('common.save')}</Button>
      </form>
      <ErrorText error={error} />

      <p className="section-title">{t('edit.actions')}</p>
      <ul className="list">
        {catalog.map((a) => (
          <li key={a}>
            <span className="list-main"><Icon name={learned(a) ? 'check' : 'plus'} size={18} /> {t(`actions.${a}`)}</span>
            <span className="row">
              <button className="link" onClick={() => setLearning({ action: a })}>{learned(a) ? t('edit.relearn') : t('setup.start')}</button>
            </span>
          </li>
        ))}
        {customs.map((a) => (
          <li key={a.action_name}>
            <span className="list-main"><Icon name="star" size={18} /> {a.label}</span>
            <span className="row">
              <button className="link" onClick={() => setLearning({ action: a.action_name, label: a.label ?? undefined })}>{t('edit.relearn')}</button>
              <button className="icon-btn danger" onClick={() => removeAction(a.action_name)} aria-label={t('edit.removeButton')}><Icon name="trash" size={18} /></button>
            </span>
          </li>
        ))}
      </ul>

      <form onSubmit={startCustom} className="stack">
        <Field label={t('edit.addCustom')} placeholder={t('edit.customPlaceholder')} value={customLabel} maxLength={60} onChange={(e) => setCustomLabel(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={!customLabel.trim()}>{t('setup.start')}</Button>
      </form>

      <Button variant="danger" onClick={remove}><Icon name="trash" size={18} /> {t('edit.deleteControl')}</Button>
    </div>
  );
}
