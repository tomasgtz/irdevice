import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { DeviceStatus } from '../api/types';

interface StatusCtx {
  devices: DeviceStatus[];
  /** null until the first response */
  loaded: boolean;
  /** phone has network (navigator.onLine) */
  network: boolean;
  refresh(): void;
  forControl(id: number): DeviceStatus | undefined;
}

const Ctx = createContext<StatusCtx>(null!);
export const useStatus = () => useContext(Ctx);

const POLL_MS = 6000;

/** Polls /status while the app is visible so the top bar always reflects the IR device state. */
export function StatusProvider({ children }: { children: ReactNode }) {
  const [devices, setDevices] = useState<DeviceStatus[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [network, setNetwork] = useState(navigator.onLine);
  const timer = useRef<number>();

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ devices: DeviceStatus[] }>('/status');
      setDevices(res.devices);
      setLoaded(true);
    } catch {
      /* keep last known state */
    }
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    tick();
    timer.current = window.setInterval(tick, POLL_MS);
    const onNet = () => {
      setNetwork(navigator.onLine);
      if (navigator.onLine) refresh();
    };
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    window.addEventListener('online', onNet);
    window.addEventListener('offline', onNet);
    return () => {
      clearInterval(timer.current);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
      window.removeEventListener('online', onNet);
      window.removeEventListener('offline', onNet);
    };
  }, [refresh]);

  const value = useMemo<StatusCtx>(
    () => ({ devices, loaded, network, refresh, forControl: (id) => devices.find((d) => d.control_ids.includes(id)) }),
    [devices, loaded, network, refresh]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
