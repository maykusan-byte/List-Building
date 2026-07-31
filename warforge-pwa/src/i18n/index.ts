import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { readLocale } from '../domain/storage';
import { en, fr } from './locales';

export const SUPPORTED_LOCALES = ['fr', 'en'] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];

export function supportedLocale(value: string | undefined | null): SupportedLocale {
  return value === 'en' ? 'en' : 'fr';
}

export function localeTag(locale: string): string {
  return supportedLocale(locale) === 'fr' ? 'fr-FR' : 'en-GB';
}

void i18n
  .use(initReactI18next)
  .init({
    resources: { fr: { translation: fr }, en: { translation: en } },
    lng: readLocale(),
    fallbackLng: 'fr',
    supportedLngs: SUPPORTED_LOCALES,
    interpolation: { escapeValue: false },
    returnNull: false
  });

export default i18n;
