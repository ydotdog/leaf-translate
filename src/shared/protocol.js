import {hasMessage,t} from './i18n.js';
export const HOST = 'com.leaf_translate.host';
export const APP_NAME = 'Leaf Translate';
export const LANGUAGES = { 'zh-CN': '简体中文', 'zh-TW': '繁體中文', en: 'English', ja: '日本語', ko: '한국어', fr: 'Français', de: 'Deutsch', es: 'Español', ar: 'العربية' };
export const DEFAULTS = { target: 'zh-CN', model: '', mode: 'bilingual', scope: 'article', style: 'subtle' };
export class AppError extends Error {
  constructor(code, messageKey, details = {}) { super(t(messageKey,{},'en')); this.code = code; this.messageKey = hasMessage(messageKey)?messageKey:'errorUnexpected'; this.details = details; }
}
export function publicError(error) {
  const messageKey=error instanceof AppError?error.messageKey:'errorUnexpected';
  return { code: error.code || 'UNEXPECTED', messageKey, message:t(messageKey,{},'en'), details: error instanceof AppError ? error.details : {} };
}
export function validateBatch(value) {
  if (!value || !Object.hasOwn(LANGUAGES, value.target) || typeof value.model !== 'string' || !/^[a-zA-Z0-9._:/-]{1,100}$/.test(value.model)) throw new AppError('INVALID_INPUT', 'errorLanguageModel');
  if (!Array.isArray(value.items) || !value.items.length || value.items.length > 12) throw new AppError('INVALID_INPUT', 'errorBatchCount');
  const ids = new Set(); let total = 0;
  for (const item of value.items) {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id) || ids.has(item.id) || typeof item.text !== 'string' || !item.text.trim() || item.text.length > 6000) throw new AppError('INVALID_INPUT', 'errorBatchFormat');
    total += item.text.length; ids.add(item.id);
  }
  if (total > 18000) throw new AppError('INVALID_INPUT', 'errorBatchSize');
  return { target: value.target, model: value.model, items: value.items.map(({id,text})=>({id,text})) };
}
export function parseTranslations(text, items) {
  let result;
  try { result = JSON.parse(text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')); } catch { throw new AppError('BAD_TRANSLATION', 'errorTranslationFormat'); }
  if (!Array.isArray(result?.translations) || result.translations.length !== items.length) throw new AppError('BAD_TRANSLATION', 'errorTranslationIncomplete');
  const mapped = new Map();
  for (const entry of result.translations) {
    if (typeof entry?.id !== 'string' || typeof entry.text !== 'string' || !entry.text.trim() || entry.text.length > 24000 || mapped.has(entry.id)) throw new AppError('BAD_TRANSLATION', 'errorTranslationBlock');
    mapped.set(entry.id, entry.text);
  }
  return items.map(item => {
    const translated = mapped.get(item.id);
    if (!translated) throw new AppError('BAD_TRANSLATION', 'errorTranslationMatch');
    const markers = s => [...s.matchAll(/⟦\/?\d+⟧/g)].map(m=>m[0]).sort().join('|');
    if (markers(item.text) !== markers(translated)) throw new AppError('BAD_TRANSLATION', 'errorTranslationMarkers');
    return { id: item.id, text: translated };
  });
}
