import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { Control } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useStatus } from '../status/StatusContext';
import { Icon } from '../components/Icon';
import { InstallPrompt } from '../components/InstallPrompt';
import { Card, ErrorText, Spinner } from '../components/ui';

export default function Home() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { forControl } = useStatus();
  const [controls, setControls] = useState<Control[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.get<{ controls: Control[] }>('/controls').then((r) => setControls(r.controls)).catch(setError);
  }, []);

  if (error) return <div className="page"><ErrorText error={error} /></div>;
  if (!controls) return <Spinner />;

  return (
    <div className="page">
      <div className="page-head">
        <p className="muted">{t('home.hello', { name: user?.name.split(' ')[0] })}</p>
        <h1>{t('home.title')}</h1>
      </div>

      {controls.length === 0 ? (
        <Card className="empty">
          <div className="empty-icon"><Icon name="radio" size={40} /></div>
          <h2>{t('home.emptyTitle')}</h2>
          <p className="muted">{t('home.emptyText')}</p>
        </Card>
      ) : (
        <div className="grid">
          {controls.map((c) => {
            const online = forControl(c.id)?.online ?? c.is_online;
            const draft = c.status === 'draft';
            return (
              <Link key={c.id} to={draft ? `/controls/${c.id}/setup` : `/controls/${c.id}`} className="card control-card">
                <div className="control-icon"><Icon name={c.type} size={28} /></div>
                <strong>{c.name}</strong>
                {draft ? (
                  <span className="badge badge-warn">{t('home.draft')}</span>
                ) : (
                  <span className={`badge ${online ? 'badge-ok' : 'badge-bad'}`}>
                    <i className="dot" />{online ? t('home.online') : t('home.offline')}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <InstallPrompt />

      <Link to="/add" className="fab" aria-label={t('home.add')}>
        <Icon name="plus" size={22} /> <span>{t('home.add')}</span>
      </Link>
    </div>
  );
}
