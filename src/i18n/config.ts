import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '../../messages/en.json';
import fr from '../../messages/fr.json';
import de from '../../messages/de.json';
import es from '../../messages/es.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      de: { translation: de },
      es: { translation: es },
    },
    fallbackLng: 'en',
    // Dev-only safety net for keys the static build guard (scripts/check-i18n.mjs) can't see -
    // dynamically-built ones like t(`${ns}.suffix`). Fires only when a key resolves to nothing in
    // en too (untranslated fr/de/es fall back to en and are expected), the instant a component
    // renders it. Off in production: no overhead, no console noise.
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: (_lngs, _ns, key) => {
      if (import.meta.env.DEV && !i18n.exists(key, { lng: 'en' })) {
        console.error(`[i18n] Missing key — renders as its raw path to users: "${key}"`);
      }
    },
    interpolation: {
      escapeValue: false
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage']
    }
  });

export default i18n;