import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from './es.json';
import en from './en.json';
import type { Lang } from '../api/types';

const KEY = 'lang';

function stored(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'es' || v === 'en') return v;
  } catch {
    /* storage unavailable */
  }
  return 'es'; // Spanish by default
}

i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en } },
  lng: stored(),
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: Lang) {
  i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* ignore */
  }
}
document.documentElement.lang = i18n.language;

export default i18n;
