import nodemailer from 'nodemailer';

const oneLine = s => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();

export function formatMessage(config, row) {
  const { fields } = row;
  const who = oneLine(fields.name || fields.company || fields.email || 'visitor');
  const lines = Object.entries(fields).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  return {
    from: config.mail.from,
    to: config.mail.to,
    ...(fields.email ? { replyTo: oneLine(fields.email) } : {}),
    subject: `${config.mail.subjectPrefix} ${row.form} — ${who}`.slice(0, 200),
    text: `${lines.join('\n')}\n\n---\nForm: ${row.form}\nLanguage: ${row.lang || '-'}\nPage: ${row.page || '-'}\nSubmission #${row.id}\n`,
  };
}

// Returns async (row) => { sent: boolean }. With mail disabled it does nothing, so the
// server can always call it. `transport` is injectable for tests.
export function createMailer(config, { env = process.env, transport } = {}) {
  if (!config.mail.enabled) return async () => ({ sent: false });
  const { smtp } = config.mail;
  const tx = transport || nodemailer.createTransport({
    host: smtp.host, port: smtp.port, secure: smtp.secure,
    ...(smtp.user ? { auth: { user: smtp.user, pass: env.SMTP_PASSWORD } } : {}),
  });
  return async row => {
    await tx.sendMail(formatMessage(config, row));
    return { sent: true };
  };
}
