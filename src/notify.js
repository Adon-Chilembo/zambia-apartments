// Email notifications for the events landlords and tenants care about.
// Each function looks up what it needs, respects the person's email setting, and never throws,
// so callers can fire and forget: notify.issueReported(id).
const { get, run } = require('./db');
const mailer = require('./mailer');
const { money, period, people, NETWORKS, STATUS_LABEL } = require('./helpers');

const e = mailer.escapeHtml;
const base = () => (process.env.PUBLIC_URL || `http://localhost:${Number(process.env.PORT) || 3000}`).replace(/\/$/, '');

// ---------- Layout ----------

function layout({ preheader, heading, intro, rows = [], quote, button, after }) {
  const rowHtml = rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border:1px solid #e7e0d6;border-radius:12px;border-collapse:separate">
        ${rows.map(([k, v], i) => `<tr><td style="padding:10px 14px;color:#8a837c;font-size:13px;width:38%;vertical-align:top;${i ? 'border-top:1px solid #efe9df;' : ''}">${e(k)}</td>
          <td style="padding:10px 14px;color:#15130f;font-size:14px;font-weight:600;${i ? 'border-top:1px solid #efe9df;' : ''}">${v}</td></tr>`).join('')}
      </table>`
    : '';
  const quoteHtml = quote
    ? `<div style="margin:16px 0;padding:12px 16px;background:#f5f3ee;border-left:4px solid #17702f;border-radius:8px;color:#3d3a35;font-size:14px;white-space:pre-line">${e(quote)}</div>`
    : '';
  const buttonHtml = button
    ? `<p style="margin:24px 0 8px"><a href="${button.href}" style="display:inline-block;background:#17702f;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">${e(button.label)}</a></p>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(heading)}</title></head><body>
<div style="display:none;max-height:0;overflow:hidden">${e(preheader || intro || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ee;padding:24px 12px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7e0d6">
      <tr><td style="height:5px;background:linear-gradient(90deg,#17702f 0 70%,#de2010 70% 80%,#111 80% 90%,#ef7d00 90% 100%);background-color:#17702f"></td></tr>
      <tr><td style="padding:20px 26px 0;font-weight:800;font-size:17px;color:#15130f">Zambia <span style="color:#e8790c">Apartments</span></td></tr>
      <tr><td style="padding:14px 26px 26px">
        <h1 style="margin:0 0 10px;font-size:22px;line-height:1.25;color:#15130f">${e(heading)}</h1>
        ${intro ? `<p style="margin:0;color:#3d3a35;font-size:15px;line-height:1.55">${intro}</p>` : ''}
        ${rowHtml}${quoteHtml}${buttonHtml}
        ${after ? `<p style="margin:14px 0 0;color:#57534e;font-size:14px;line-height:1.55">${after}</p>` : ''}
      </td></tr>
      <tr><td style="padding:16px 26px;background:#faf8f4;border-top:1px solid #efe9df;color:#8a837c;font-size:12px;line-height:1.5">
        You're getting this because you have an account on Zambia Apartments.
        <a href="${base()}/account" style="color:#17702f">Turn email alerts off</a>.
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

/** Plain-text version for mail apps that don't show HTML. */
function textVersion({ heading, introText, rows = [], quote, button }) {
  return [
    heading, '', introText || '',
    ...rows.map(([k, v]) => `${k}: ${String(v).replace(/<[^>]+>/g, '')}`),
    quote ? `\n"${quote}"` : '',
    button ? `\n${button.label}: ${button.href}` : '',
    `\nTurn email alerts off: ${base()}/account`,
  ].join('\n');
}

/** Send to one user if they have email alerts on. */
async function toUser(userId, kind, content) {
  const u = get('SELECT id, name, email, email_notifications FROM users WHERE id = ?', userId);
  if (!u) return 'skipped';
  const subject = content.subject;
  if (!u.email_notifications) {
    run('INSERT INTO email_log (user_id, to_email, kind, subject, status) VALUES (?, ?, ?, ?, ?)', u.id, u.email, kind, subject, 'opted_out');
    return 'opted_out';
  }
  return mailer.send({
    to: u.email,
    userId: u.id,
    kind,
    subject,
    html: layout(content),
    text: textVersion({ ...content, introText: String(content.intro || '').replace(/<[^>]+>/g, '') }),
  });
}

const safely = (fn) => (...args) =>
  Promise.resolve()
    .then(() => fn(...args))
    .catch((err) => console.error('Notification failed:', err.message));

const firstName = (name) => String(name || '').split(' ')[0];
const place = (a) => `${e(a.neighbourhood)}, ${e(a.city)}`;

// ---------- Events ----------

/** A tenant applied for an apartment: tell the landlord. */
const applicationReceived = safely((applicationId) => {
  const ap = get(
    `SELECT ap.*, a.id AS apt_id, a.title, a.neighbourhood, a.city, a.landlord_id, l.name AS landlord_name,
            u.name, u.email, u.phone, u.occupation
       FROM applications ap JOIN apartments a ON a.id = ap.apartment_id
       JOIN users u ON u.id = ap.tenant_id JOIN users l ON l.id = a.landlord_id WHERE ap.id = ?`,
    applicationId
  );
  if (!ap) return;
  return toUser(ap.landlord_id, 'application_received', {
    subject: `New application for ${ap.title}`,
    preheader: `${ap.name} wants to rent ${ap.title}`,
    heading: `${ap.name} applied for ${ap.title}`,
    intro: `Hi ${e(firstName(ap.landlord_name))}, someone wants to rent your apartment in ${place(ap)}.`,
    rows: [
      ['Applicant', e(ap.name)],
      ['Household', e(people(ap.occupants)) + (ap.household_note ? `<br><span style="font-weight:400;color:#57534e">${e(ap.household_note)}</span>` : '')],
      ['Phone', e(ap.phone || '—')],
      ['Email', e(ap.email)],
      ['Occupation', e(ap.occupation || '—')],
    ],
    quote: ap.message || null,
    button: { label: 'Review the application', href: `${base()}/landlord/apartments/${ap.apt_id}` },
  });
});

/** The landlord approved or declined an application: tell the applicant. */
const applicationDecided = safely((applicationId, reason = null) => {
  const ap = get(
    `SELECT ap.*, a.title, a.neighbourhood, a.city, a.rent_amount, l.name AS landlord_name, l.phone AS landlord_phone, l.email AS landlord_email, u.name
       FROM applications ap JOIN apartments a ON a.id = ap.apartment_id
       JOIN users u ON u.id = ap.tenant_id JOIN users l ON l.id = a.landlord_id WHERE ap.id = ?`,
    applicationId
  );
  if (!ap || ap.status === 'pending') return;
  if (ap.status === 'approved') {
    return toUser(ap.tenant_id, 'application_approved', {
      subject: `Your application for ${ap.title} was approved`,
      heading: 'Welcome to your new home!',
      intro: `Hi ${e(firstName(ap.name))}, ${e(ap.landlord_name)} approved your application for <b>${e(ap.title)}</b> in ${place(ap)}. You're now connected to the apartment and your landlord.`,
      rows: [
        ['Rent', `${money(ap.rent_amount)} / month`],
        ['Landlord', e(ap.landlord_name)],
        ['Landlord phone', e(ap.landlord_phone || '—')],
        ['Landlord email', e(ap.landlord_email)],
      ],
      button: { label: 'Go to My home', href: `${base()}/tenant` },
      after: 'From My home you can pay rent with Mobile Money and report any problems to your landlord.',
    });
  }
  return toUser(ap.tenant_id, 'application_declined', {
    subject: `Update on your application for ${ap.title}`,
    heading: 'Your application was not successful',
    intro: `Hi ${e(firstName(ap.name))}, ${reason === 'taken' ? `<b>${e(ap.title)}</b> in ${place(ap)} has now been rented to someone else.` : `${e(ap.landlord_name)} has decided not to go ahead with your application for <b>${e(ap.title)}</b> in ${place(ap)}.`}`,
    button: { label: 'Browse other apartments', href: `${base()}/#listings` },
    after: 'There are more homes available across Zambia. Good luck with your search.',
  });
});

/** A tenant joined with an invite code: tell the landlord. */
const tenantJoined = safely((tenancyId) => {
  const t = get(
    `SELECT t.*, a.id AS apt_id, a.title, a.neighbourhood, a.city, a.landlord_id, l.name AS landlord_name, u.name, u.phone, u.email
       FROM tenancies t JOIN apartments a ON a.id = t.apartment_id JOIN users u ON u.id = t.tenant_id
       JOIN users l ON l.id = a.landlord_id WHERE t.id = ?`,
    tenancyId
  );
  if (!t) return;
  return toUser(t.landlord_id, 'tenant_joined', {
    subject: `${t.name} has moved into ${t.title}`,
    heading: `${t.name} connected to ${t.title}`,
    intro: `Hi ${e(firstName(t.landlord_name))}, ${e(t.name)} used your invite code and is now the tenant of your apartment in ${place(t)}.`,
    rows: [
      ['Tenant', e(t.name)],
      ['Household', e(people(t.occupants)) + (t.household_note ? `<br><span style="font-weight:400;color:#57534e">${e(t.household_note)}</span>` : '')],
      ['Phone', e(t.phone || '—')],
      ['Email', e(t.email)],
    ],
    button: { label: 'See the tenant', href: `${base()}/landlord/apartments/${t.apt_id}` },
  });
});

/** A tenant reported a problem or suggestion: tell the landlord. */
const issueReported = safely((issueId) => {
  const i = get(
    `SELECT i.*, a.id AS apt_id, a.title AS apt_title, a.neighbourhood, a.city, a.landlord_id, l.name AS landlord_name, u.name AS tenant_name, u.phone
       FROM issues i JOIN apartments a ON a.id = i.apartment_id JOIN users u ON u.id = i.tenant_id
       JOIN users l ON l.id = a.landlord_id WHERE i.id = ?`,
    issueId
  );
  if (!i) return;
  const isProblem = i.kind === 'problem';
  const urgent = i.urgency === 'urgent';
  return toUser(i.landlord_id, isProblem ? 'problem_reported' : 'suggestion_made', {
    subject: `${urgent ? 'URGENT: ' : ''}${isProblem ? 'Problem reported' : 'Suggestion'} at ${i.apt_title}: ${i.title}`,
    heading: isProblem ? `${urgent ? 'Urgent problem' : 'New problem'}: ${i.title}` : `New suggestion: ${i.title}`,
    intro: `Hi ${e(firstName(i.landlord_name))}, ${e(i.tenant_name)} ${isProblem ? 'reported a problem' : 'made a suggestion'} for <b>${e(i.apt_title)}</b> in ${place(i)}.`,
    rows: [
      ['Type', isProblem ? 'Problem' : 'Suggestion'],
      ['Category', e(i.category)],
      ['Urgency', urgent ? '<span style="color:#b42318">Urgent</span>' : e(i.urgency[0].toUpperCase() + i.urgency.slice(1))],
      ['Tenant', `${e(i.tenant_name)}${i.phone ? ` · ${e(i.phone)}` : ''}`],
    ],
    quote: i.description || null,
    button: { label: 'Reply and update the status', href: `${base()}/landlord/apartments/${i.apt_id}?tab=issues` },
  });
});

/** The landlord replied to or changed the status of an issue: tell the tenant. */
const issueUpdated = safely((issueId) => {
  const i = get(
    `SELECT i.*, a.title AS apt_title, l.name AS landlord_name, u.name AS tenant_name
       FROM issues i JOIN apartments a ON a.id = i.apartment_id JOIN users l ON l.id = a.landlord_id
       JOIN users u ON u.id = i.tenant_id WHERE i.id = ?`,
    issueId
  );
  if (!i) return;
  const status = STATUS_LABEL[i.status] || i.status;
  const headline = { open: 'Your landlord replied', in_progress: 'Your landlord is working on it', resolved: 'Marked as resolved' }[i.status];
  return toUser(i.tenant_id, 'issue_updated', {
    subject: `Update on "${i.title}": ${status}`,
    heading: headline,
    intro: `Hi ${e(firstName(i.tenant_name))}, ${e(i.landlord_name)} updated the ${i.kind === 'problem' ? 'problem' : 'suggestion'} you raised for <b>${e(i.apt_title)}</b>.`,
    rows: [
      ['About', e(i.title)],
      ['Status', i.status === 'resolved' ? '<span style="color:#17702f">Resolved</span>' : e(status)],
    ],
    quote: i.landlord_response ? `${i.landlord_name}: ${i.landlord_response}` : null,
    button: { label: 'View it on My home', href: `${base()}/tenant?tab=issues` },
    after: i.status === 'resolved' ? "If it isn't fixed after all, report it again from My home." : null,
  });
});

/** Rent was paid: tell the landlord and send the tenant a receipt. */
const paymentReceived = safely((reference) => {
  const p = get(
    `SELECT p.*, a.id AS apt_id, a.title, a.neighbourhood, a.city, a.landlord_id, l.name AS landlord_name, u.name AS tenant_name
       FROM payments p JOIN apartments a ON a.id = p.apartment_id JOIN users u ON u.id = p.tenant_id
       JOIN users l ON l.id = a.landlord_id WHERE p.reference = ? AND p.status = 'success'`,
    reference
  );
  if (!p) return;
  const via = NETWORKS[p.network] || 'Mobile Money';
  return Promise.all([
    toUser(p.landlord_id, 'payment_received', {
      subject: `Rent received: ${money(p.amount)} from ${p.tenant_name}`,
      heading: `${money(p.amount)} rent received`,
      intro: `Hi ${e(firstName(p.landlord_name))}, ${e(p.tenant_name)} paid rent for <b>${e(p.title)}</b> in ${place(p)}.`,
      rows: [['For', e(period(p.period))], ['Amount', money(p.amount)], ['Paid with', `${e(via)} · ${e(p.phone || '')}`], ['Reference', e(p.reference)]],
      button: { label: 'See all payments', href: `${base()}/landlord/payments` },
    }),
    toUser(p.tenant_id, 'payment_receipt', {
      subject: `Receipt: ${money(p.amount)} rent for ${period(p.period)}`,
      heading: 'Payment receipt',
      intro: `Hi ${e(firstName(p.tenant_name))}, thank you. We've received your rent for <b>${e(p.title)}</b>.`,
      rows: [['For', e(period(p.period))], ['Amount', money(p.amount)], ['Paid with', `${e(via)} · ${e(p.phone || '')}`], ['Reference', e(p.reference)], ['Landlord', e(p.landlord_name)]],
      button: { label: 'View payment history', href: `${base()}/tenant?tab=payments` },
    }),
  ]);
});

module.exports = { applicationReceived, applicationDecided, tenantJoined, issueReported, issueUpdated, paymentReceived, layout };
