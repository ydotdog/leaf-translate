import {resolveLocale,t} from '../shared/i18n.js';

const escape=text=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function callbackPage(locale,success) {
  const language=resolveLocale(locale);
  const title=t(success?'connected':'callbackFailure',{},language);
  const body=t(success?'callbackSuccess':'callbackRetry',{},language);
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Leaf Translate</title><style>body{font:18px/1.7 system-ui;max-width:560px;margin:15vh auto;padding:32px;color:#174b3c;background:#f4f6f1}h1{font-size:28px}</style></head><body><h1>${escape(title)}</h1><p>${escape(body)}</p></body></html>`;
}
