import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { Control } from '../api/types';
import { Icon } from './Icon';
import { Button, ErrorText } from './ui';

type Phase = 'intro' | 'listening' | 'done' | 'failed';

interface Props {
  control: Control;
  actionName: string;
  label?: string;           // custom buttons only
  onLearned(control: Control): void;
  onClose?(): void;         // skip / cancel
  closeLabel?: string;
}

export const actionIcon = (name: string): string =>
  ({ mode_cool: 'snow', mode_heat: 'flame', mode_dry: 'drop', mode_fan: 'fan', temp_up: 'plus', temp_down: 'minus',
     ch_up: 'up', ch_down: 'down', fan_speed: 'fan' } as Record<string, string>)[name] ?? name;

/** One capture: tell the backend to put the IR device in learn mode, then poll until the code arrives. */
export function LearnPanel({ control, actionName, label, onLearned, onClose, closeLabel }: Props) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('intro');
  const [error, setError] = useState<unknown>(null);
  const [learned, setLearned] = useState<Control | null>(null);
  const alive = useRef(true);
  const poll = useRef<number>();

  useEffect(() => {
    alive.current = true; // must be re-armed: StrictMode (dev) mounts, unmounts, then remounts
    return () => { alive.current = false; clearTimeout(poll.current); };
  }, []);
  // reset when the step changes
  const run = useRef(0);
  useEffect(() => {
    run.current++;                 // invalidate any poll still running for the previous step
    clearTimeout(poll.current);
    setPhase('intro'); setError(null); setLearned(null);
  }, [actionName]);

  const title = label || t(`actions.${actionName}`);
  const isAcDetect = control.type === 'ac' && actionName === 'power_on';

  const start = useCallback(async () => {
    setError(null);
    try {
      const { job_id } = await api.post<{ job_id: number }>(`/controls/${control.id}/learn`, { action_name: actionName, label });
      setPhase('listening');
      const my = ++run.current;
      const tick = async () => {
        if (!alive.current || my !== run.current) return;
        try {
          const s = await api.get<{ status: string; control?: Control }>(`/controls/${control.id}/learn/${job_id}`);
          if (!alive.current || my !== run.current) return;
          if (s.status === 'done' && s.control) {
            navigator.vibrate?.(30);
            setLearned(s.control);
            setPhase('done');
            return;
          }
          if (s.status === 'expired' || s.status === 'cancelled') { setPhase('failed'); return; }
        } catch (e) {
          if (alive.current && my === run.current) { setError(e); setPhase('failed'); }
          return;
        }
        poll.current = window.setTimeout(tick, 1500);
      };
      poll.current = window.setTimeout(tick, 1500);
    } catch (e) {
      setError(e);
    }
  }, [control.id, actionName, label]);

  return (
    <div className="learn">
      <div className={`learn-icon ${phase}`}>
        {phase === 'done' ? <Icon name="check" size={44} /> : <Icon name={actionIcon(actionName)} size={44} />}
        {phase === 'listening' && <span className="pulse" />}
      </div>
      <h2>{phase === 'done' ? t('setup.success') : phase === 'failed' ? t('setup.failed') : title}</h2>

      {phase === 'intro' && (
        <>
          <p className="muted">{isAcDetect ? t('setup.acInstruction') : t('setup.instruction', { action: title })}</p>
          <ErrorText error={error} />
          <Button onClick={start}>{t('setup.start')}</Button>
        </>
      )}
      {phase === 'listening' && (
        <>
          <p className="muted"><strong>{t('setup.listening')}</strong><br />{t('setup.listeningHelp')}</p>
          <div className="dots" aria-hidden><i /><i /><i /></div>
        </>
      )}
      {phase === 'failed' && (
        <>
          <ErrorText error={error} />
          <Button onClick={start}>{t('setup.tryAgain')}</Button>
        </>
      )}
      {phase === 'done' && learned && (
        <>
          {isAcDetect && (
            <p className="muted">
              <strong>{t('setup.detected', { protocol: learned.actions.find((a) => a.action_name === 'power_on')?.protocol })}</strong>
              <br />
              {learned.ac_mode === 'state' ? t('setup.acStateOk') : t('setup.acRawInfo')}
            </p>
          )}
          <Button onClick={() => onLearned(learned)}>{t('common.next')}</Button>
        </>
      )}
      {onClose && phase !== 'done' && <Button variant="ghost" onClick={onClose}>{closeLabel ?? t('common.skip')}</Button>}
    </div>
  );
}
