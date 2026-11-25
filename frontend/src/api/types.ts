export type Lang = 'es' | 'en';
export type ControlType = 'tv' | 'ac';

export interface User {
  id: number;
  name: string;
  email: string;
  language: Lang;
}

export interface AcState {
  power: boolean;
  mode: 'cool' | 'heat' | 'dry' | 'fan';
  temp: number;
  fan: 'auto' | 'low' | 'medium' | 'high';
  swing: boolean;
}

export interface ActionRow {
  action_name: string;
  label: string | null;
  protocol: string;
  learned_at: string;
}

export interface Control {
  id: number;
  name: string;
  type: ControlType;
  status: 'draft' | 'ready';
  device_code: string;
  is_online: boolean;
  last_seen_at: string | null;
  /** 'state': protocol supported by IRac (state-based). 'raw': replay each learned code. */
  ac_mode: 'state' | 'raw' | null;
  state: AcState | null;
  actions: ActionRow[];
}

export interface DeviceStatus {
  code: string;
  online: boolean;
  last_seen_at: string | null;
  control_ids: number[];
}

export const TV_ACTIONS = ['power_on', 'power_off', 'ch_up', 'ch_down', 'vol_up', 'vol_down', 'mute', 'input'];
export const AC_ACTIONS = [
  'power_on', 'power_off', 'mode_cool', 'mode_heat', 'mode_dry', 'mode_fan', 'temp_up', 'temp_down', 'fan_speed', 'swing',
];
