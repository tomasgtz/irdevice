import { useEffect } from 'react';
import { Link, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { useStatus } from '../status/StatusContext';

function fmtSince(iso: string | null, lang: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat(lang, sameDay ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
}

/** Always-visible indicator of the IR device's availability (fed by MQTT status/LWT via the backend). */
function StatusChip() {
  const { t, i18n } = useTranslation();
  const { devices, loaded, network, forControl } = useStatus();
  const match = useMatch('/controls/:id/*');
  const controlId = match ? Number(match.params.id) : null;

  let tone: 'ok' | 'warn' | 'bad' | 'idle' = 'idle';
  let text = t('status.checking');

  if (controlId !== null) {
    const d = forControl(controlId);
    if (loaded && d) {
      tone = d.online && network ? 'ok' : 'bad';
      const since = d.online ? null : fmtSince(d.last_seen_at, i18n.language);
      text = d.online ? t('status.online') : t('status.offline') + (since ? ` · ${t('status.since', { time: since })}` : '');
    }
  } else if (loaded) {
    if (devices.length === 0) return <span />;
    const off = devices.filter((d) => !d.online).length;
    if (!network || off === devices.length) { tone = 'bad'; text = t('status.noneOnline'); }
    else if (off > 0) { tone = 'warn'; text = t('status.someOffline', { n: off }); }
    else { tone = 'ok'; text = t('status.allOnline'); }
  }

  return (
    <span className={`chip chip-${tone}`} role="status" aria-live="polite">
      <i className="dot" aria-hidden />
      <span className="chip-text">{text}</span>
    </span>
  );
}

export function TopBar() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const { network, refresh } = useStatus();
  const atHome = loc.pathname === '/home';
  const match = useMatch('/controls/:id/*');
  const controlId = match?.params.id;

  // Re-check immediately when entering a control (it may have just been created)
  useEffect(() => { refresh(); }, [controlId, refresh]);

  return (
    <>
      <header className="topbar">
        {atHome ? (
          <Link to="/home" className="brand" aria-label={t('app.name')}>
            <Icon name="radio" size={22} />
          </Link>
        ) : (
          <button className="icon-btn" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/home'))} aria-label={t('common.back')}>
            <Icon name="back" />
          </button>
        )}
        <StatusChip />
        <Link to="/settings" className="icon-btn" aria-label={t('settings.title')}>
          <Icon name="user" />
        </Link>
      </header>
      {!network && <div className="banner" role="alert">{t('status.noNetwork')}</div>}
    </>
  );
}
