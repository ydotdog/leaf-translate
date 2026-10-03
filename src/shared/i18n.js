import en from './locales/en.json' with {type:'json'};
import zhCN from './locales/zh_CN.json' with {type:'json'};
import zhTW from './locales/zh_TW.json' with {type:'json'};

export const catalogs={en,'zh-CN':zhCN,'zh-TW':zhTW};
export function resolveLocale(language='en') {
  const parts=String(language).toLowerCase().replaceAll('_','-').split('-');
  if(parts[0]!=='zh')return 'en';
  if(parts.includes('hant'))return 'zh-TW';
  if(parts.includes('hans'))return 'zh-CN';
  return parts.some(p=>['tw','hk','mo'].includes(p))?'zh-TW':'zh-CN';
}
export function uiLocale(){return resolveLocale(globalThis.chrome?.i18n?.getUILanguage?.() || 'en');}
export function hasMessage(key){return typeof key==='string' && Object.hasOwn(en,key);}
export function translateMessage(key,values={},locale=uiLocale()) {
  const catalog=catalogs[resolveLocale(locale)];
  const text=hasMessage(key)?(catalog[key] || en[key]):en.errorUnexpected;
  return text.replace(/\{(\w+)\}/g,(match,name)=>Object.hasOwn(values,name)?String(values[name]):match);
}
export const t=translateMessage;
export function errorText(error,locale=uiLocale()) {
  // Native errors cross a process boundary. Render only known local messages;
  // never show arbitrary upstream text (which may contain request data).
  const key=(hasMessage(error?.messageKey)?error.messageKey:null) || (hasMessage(error?.message)?error.message:null) || (hasMessage(error)?error:null);
  return t(key || 'errorUnexpected',{},locale);
}
export function localizeDocument(document,locale=uiLocale()) {
  document.documentElement.lang=resolveLocale(locale);
  for(const element of document.querySelectorAll('[data-i18n]'))element.textContent=t(element.dataset.i18n,{},locale);
  for(const attribute of ['title','aria-label'])for(const element of document.querySelectorAll(`[data-i18n-${attribute}]`))element.setAttribute(attribute,t(element.getAttribute(`data-i18n-${attribute}`),{},locale));
}
