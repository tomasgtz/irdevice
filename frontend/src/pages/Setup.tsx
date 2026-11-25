import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { AC_ACTIONS, TV_ACTIONS, type Control } from '../api/types';
import { Icon } from '../components/Icon';
import { LearnPanel, actionIcon } from '../components/LearnPanel';
import { Button, ErrorText, Spinner } from '../components/ui';

const stepsFor = (c: Control): string[] =>
  c.type === 'tv' ? TV_ACTIONS : c.ac_mode === 'raw' ? AC_ACTIONS : ['power_on'];

/**
 * Learn wizard. Progress is persisted server-side (each captured action is saved immediately),
 * so reopening the app resumes at the first button that isn't configured yet.
 * AC with a supported protocol needs a single capture (state-based); otherwise every button.
 */
export default function Setup() {
  const { id } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const [control, setControl] = useState<Control | null>(null);
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const init = useRef(false);

  useEffect(() => {
    api.get<{ control: Control }>(`/controls/${id}`)
      .then(({ control }) => {
        setControl(control);
        if (!init.current) {
          init.current = true;
          const steps = stepsFor(control);
          const first = steps.findIndex((s) => !control.actions.some((a) => a.action_name === s));
          setIdx(first === -1 ? steps.length : first);
        }
      })
      .catch(() => nav('/home', { replace: true }));
  }, [id, nav]);

  if (!control) return <Spinner />;
  const steps = stepsFor(control);
  const learned = (n: string) => control.actions.some((a) => a.action_name === n);

  const finish = async () => {
    setBusy(true); setError(null);
    try {
      await api.post(`/controls/${control.id}/finish`);
      nav(`/controls/${control.id}`, { replace: true });
    } catch (e) { setError(e); setBusy(false); }
  };

  if (idx >= steps.length) {
    return (
      <div className="page">
        <div className="learn">
          <div className="learn-icon done"><Icon name="check" size={44} /></div>
          <h2>{t('setup.summaryTitle')}</h2>
          {control.type === 'ac' && control.ac_mode === 'state' && <p className="muted">{t('setup.acStateOk')}</p>}
          <p className="muted">{t('setup.summaryText')}</p>
          <ul className="summary">
            {control.actions.map((a) => (
              <li key={a.action_name}><Icon name="check" size={16} /> {a.label || t(`actions.${a.action_name}`)}</li>
            ))}
          </ul>
          <ErrorText error={error} />
          <Button loading={busy} disabled={control.actions.length === 0} onClick={finish}>{t('setup.finish')}</Button>
        </div>
      </div>
    );
  }

  const current = steps[idx];
  return (
    <div className="page">
      <div className="page-head">
        <p className="muted">{control.name} · {t('setup.progress', { n: idx + 1, total: steps.length })}</p>
        <div className="progress"><i style={{ width: `${((idx + 1) / steps.length) * 100}%` }} /></div>
      </div>

      <LearnPanel
        control={control}
        actionName={current}
        onLearned={(c) => { setControl(c); setIdx(idx + 1); }}
        onClose={() => setIdx(idx + 1)}
        closeLabel={learned(current) ? t('common.next') : t('common.skip')}
      />

      <div className="steps-dots" aria-hidden>
        {steps.map((s, i) => (
          <span key={s} className={`${i === idx ? 'cur' : ''} ${learned(s) ? 'ok' : ''}`} title={t(`actions.${s}`)}>
            <Icon name={learned(s) ? 'check' : actionIcon(s)} size={14} />
          </span>
        ))}
      </div>
    </div>
  );
}

export function SetupRedirect() {
  const { id } = useParams();
  return <Navigate to={`/controls/${id}/setup`} replace />;
}
