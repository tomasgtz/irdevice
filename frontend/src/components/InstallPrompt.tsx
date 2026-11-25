import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card } from './ui';

interface BIPEvent extends Event {
  prompt(): Promise<void>;
}

const DISMISS_KEY = 'installDismissed';

function standalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

/** Nudges the user to install the PWA: installed apps keep their session far longer on iOS. */
export function InstallPrompt() {
  const { t } = useTranslation();
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  if (hidden || standalone() || (!evt && !ios)) return null;

  const dismiss = () => {
    setHidden(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
  };

  return (
    <Card className="install">
      <strong>{t('settings.install')}</strong>
      <p>{evt ? t('settings.installText') : t('settings.installIos')}</p>
      <div className="row">
        {evt && <Button onClick={async () => { await evt.prompt(); dismiss(); }}>{t('settings.installButton')}</Button>}
        <Button variant="ghost" onClick={dismiss}>{t('settings.notNow')}</Button>
      </div>
    </Card>
  );
}
