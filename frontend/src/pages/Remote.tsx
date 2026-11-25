import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type { AcState, Control } from '../api/types';
import { useStatus } from '../status/StatusContext';
import { Icon } from '../components/Icon';
import { Spinner } from '../components/ui';

export default function Remote() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const { forControl } = useStatus();
  const [control, setControl] = useState<Control | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>();

  useEffect(() => {
    api.get<{ control: Control }>(`/controls/${id}`).then((r) => setControl(r.control)).catch(() => nav('/home', { replace: true }));
  }, [id, nav]);

  if (!control) return <Spinner />;
  if (control.status === 'draft') return <Navigate to={`/controls/${control.id}/setup`} replace />;

  const online = forControl(control.id)?.online ?? control.is_online;
  const stateful = control.type === 'ac' && control.ac_mode === 'state';
  const has = (n: string) => control.actions.some((a) => a.action_name === n);
  const enabled = (n: string) => online && (stateful && !n.startsWith('custom_') ? true : has(n));

  const showError = (e: unknown) => {
    const code = e instanceof ApiError ? e.code : 'generic';
    setToast(i18n.exists(`errors.${code}`) ? t(`errors.${code}`) : t('errors.generic'));
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  };

  const send = async (action: string) => {
    if (!enabled(action)) return;
    navigator.vibrate?.(15);
    try {
      const r = await api.post<{ state?: AcState }>(`/controls/${control.id}/send`, { action_name: action });
      if (r.state) setControl((c) => (c ? { ...c, state: r.state! } : c));
    } catch (e) { showError(e); }
  };

  const Btn = ({ a, icon, label, cls = '' }: { a: string; icon?: string; label?: string; cls?: string }) => (
    <button className={`rbtn ${cls}`} disabled={!enabled(a)} onClick={() => send(a)} aria-label={label ?? t(`actions.${a}`)}>
      <Icon name={icon ?? a} size={26} />
      {label !== '' && <span>{label ?? t(`actions.${a}`)}</span>}
    </button>
  );

  const Rocker = ({ title, up, down, upIcon, downIcon }: { title: string; up: string; down: string; upIcon: string; downIcon: string }) => (
    <div className="rocker">
      <button disabled={!enabled(up)} onClick={() => send(up)} aria-label={t(`actions.${up}`)}><Icon name={upIcon} size={28} /></button>
      <span>{title}</span>
      <button disabled={!enabled(down)} onClick={() => send(down)} aria-label={t(`actions.${down}`)}><Icon name={downIcon} size={28} /></button>
    </div>
  );

  const customs = control.actions.filter((a) => a.action_name.startsWith('custom_'));
  const s = control.state;
  const fanLabel = s ? t(`remote.fan${s.fan[0].toUpperCase()}${s.fan.slice(1)}`) : '';

  return (
    <div className="page remote-page">
      <div className="remote-head">
        <div>
          <p className="muted small">{t(`add.${control.type}`)}</p>
          <h1>{control.name}</h1>
        </div>
        <Link to={`/controls/${control.id}/edit`} className="icon-btn" aria-label={t('edit.title')}><Icon name="edit" size={20} /></Link>
      </div>

      {!online && <p className="notice warn">{t('remote.offlineHint')}</p>}

      {control.type === 'tv' ? (
        <div className="remote">
          <div className="pair">
            <Btn a="power_on" icon="power" cls="rbtn-on" />
            <Btn a="power_off" icon="power" cls="rbtn-off" />
          </div>
          <div className="rocker-row">
            <Rocker title={t('remote.volume')} up="vol_up" down="vol_down" upIcon="plus" downIcon="minus" />
            <Btn a="mute" cls="round" label="" />
            <Rocker title={t('remote.channel')} up="ch_up" down="ch_down" upIcon="up" downIcon="down" />
          </div>
          <Btn a="input" cls="wide" />
        </div>
      ) : (
        <div className="remote">
          {stateful && s && (
            <div className="card ac-display">
              <button className="round-btn" disabled={!enabled('temp_down') || !s.power} onClick={() => send('temp_down')} aria-label={t('actions.temp_down')}><Icon name="minus" size={28} /></button>
              <div className={`ac-temp ${s.power ? '' : 'off'}`}>
                <b>{s.power ? s.temp : '--'}<sup>°C</sup></b>
                <small>{s.power ? `${t(`actions.mode_${s.mode}`)} · ${fanLabel}` : t('remote.off')}</small>
              </div>
              <button className="round-btn" disabled={!enabled('temp_up') || !s.power} onClick={() => send('temp_up')} aria-label={t('actions.temp_up')}><Icon name="plus" size={28} /></button>
            </div>
          )}
          {!stateful && (
            <div className="pair">
              <Btn a="temp_down" icon="minus" cls="round" label="" />
              <Btn a="temp_up" icon="plus" cls="round" label="" />
            </div>
          )}
          <div className="pair">
            <Btn a="power_on" icon="power" cls="rbtn-on" />
            <Btn a="power_off" icon="power" cls="rbtn-off" />
          </div>
          <p className="section-title">{t('remote.mode')}</p>
          <div className="modes">
            {(['cool', 'heat', 'dry', 'fan'] as const).map((m) => (
              <button key={m} className={`mode ${s?.power && s.mode === m ? 'on' : ''}`} disabled={!enabled(`mode_${m}`)} onClick={() => send(`mode_${m}`)}>
                <Icon name={m === 'cool' ? 'snow' : m === 'heat' ? 'flame' : m === 'dry' ? 'drop' : 'fan'} size={24} />
                <span>{t(`actions.mode_${m}`)}</span>
              </button>
            ))}
          </div>
          <div className="pair">
            <button className="rbtn" disabled={!enabled('fan_speed')} onClick={() => send('fan_speed')}>
              <Icon name="fan" size={24} /><span>{t('remote.fan')}{stateful && s ? `: ${fanLabel}` : ''}</span>
            </button>
            <button className={`rbtn ${s?.swing ? 'active' : ''}`} disabled={!enabled('swing')} onClick={() => send('swing')}>
              <Icon name="swing" size={24} /><span>{t('remote.swing')}{stateful && s ? `: ${s.swing ? t('remote.swingOn') : t('remote.swingOff')}` : ''}</span>
            </button>
          </div>
        </div>
      )}

      {customs.length > 0 && (
        <>
          <p className="section-title">{t('remote.custom')}</p>
          <div className="custom-grid">
            {customs.map((a) => (
              <button key={a.action_name} className="rbtn" disabled={!online} onClick={() => send(a.action_name)}>
                <Icon name="star" size={22} /><span>{a.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {toast && <div className="toast" role="alert">{toast}</div>}
    </div>
  );
}
