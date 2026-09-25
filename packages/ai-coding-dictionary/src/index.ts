/** Bilingual reading data from indie-builder/dictionary-of-ai-coding@ed1ebed. */
import catalog from '../catalog.json';

export type Language = 'zh' | 'en';
export type DictionaryEntry = {
  term: string;
  section: number;
  description: Record<Language, string>;
  body: Record<Language, string[]>;
  related: string[];
};

export const sections = catalog.sections as { en: string; zh: string }[];
export const entries = catalog.entries as DictionaryEntry[];
