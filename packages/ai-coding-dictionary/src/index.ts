/** Bilingual reading data synchronized from indie-builder/dictionary-of-ai-coding. */
import catalog from '../catalog.json';

export type Language = 'zh' | 'en';
export type DictionaryEntry = {
  term: string;
  section: number;
  description: Record<Language, string>;
  summary?: { zh: string };
  body: Record<Language, string[]>;
  related: string[];
};

export const sections = catalog.sections as { en: string; zh: string }[];
export const entries = catalog.entries as DictionaryEntry[];
