// Form definitions shared by the server. T8 lets biskett.config.json override `required`.
export const defaultForms = {
  contact: { required: ['name', 'email', 'message'] },
  partnership: { required: ['company', 'country', 'name', 'email'] },
};

const emailLike = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Returns an error message for a submission, or null when it is acceptable.
export function validate(form, fields, forms = defaultForms) {
  const def = forms[form];
  if (!def) return 'Unknown form';
  const missing = def.required.filter(key => !String(fields[key] ?? '').trim());
  if (missing.length) return `Missing required field: ${missing.join(', ')}`;
  if (fields.email && !emailLike.test(fields.email)) return 'Invalid email address';
  return null;
}
