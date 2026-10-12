import fs from 'node:fs';
import { defaultForms } from './forms.mjs';

const emailLike = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export const defaultConfig = {
  mail: {
    enabled: false,
    to: ['info@biskett.com'],
    from: 'Biskett Website <no-reply@biskett.com>',
    subjectPrefix: '[biskett.com]',
    smtp: { host: '', port: 587, secure: false, user: '' },
  },
  forms: defaultForms,
};

// Merge a user config over the defaults and validate it. Throws one Error listing every
// problem, so a bad file is fixed in one pass instead of one restart per mistake.
export function parseConfig(raw = {}, env = process.env) {
  const cfg = {
    mail: { ...defaultConfig.mail, ...raw.mail, smtp: { ...defaultConfig.mail.smtp, ...raw.mail?.smtp } },
    forms: { ...defaultConfig.forms, ...raw.forms },
  };
  const errors = [];
  const { mail } = cfg;
  if (typeof mail.enabled !== 'boolean') errors.push('mail.enabled must be true or false');
  if (mail.enabled) {
    if (!Array.isArray(mail.to) || !mail.to.length || !mail.to.every(a => typeof a === 'string' && emailLike.test(a))) errors.push('mail.to must be a non-empty list of email addresses');
    if (typeof mail.from !== 'string' || !mail.from.trim()) errors.push('mail.from is required');
    if (!mail.smtp.host) errors.push('mail.smtp.host is required when mail is enabled');
    if (!Number.isInteger(mail.smtp.port) || mail.smtp.port < 1 || mail.smtp.port > 65535) errors.push('mail.smtp.port must be a port number');
    if (mail.smtp.user && !env.SMTP_PASSWORD) errors.push('SMTP_PASSWORD is not set (mail.smtp.user is configured)');
  }
  for (const [name, def] of Object.entries(cfg.forms)) {
    if (!Array.isArray(def?.required) || !def.required.every(k => typeof k === 'string')) errors.push(`forms.${name}.required must be a list of field names`);
  }
  if (errors.length) throw new Error(`Invalid biskett config:\n - ${errors.join('\n - ')}`);
  return cfg;
}

export function loadConfig(file = process.env.BISKETT_CONFIG || 'biskett.config.json', env = process.env) {
  if (!fs.existsSync(file)) return parseConfig({}, env);
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`Cannot read ${file}: ${e.message}`); }
  return parseConfig(raw, env);
}
