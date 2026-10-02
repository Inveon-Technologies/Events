# Email deliverability

Why booking, OTP and account emails were landing in spam, and how to set up sending so they reach the inbox.

## Why mail went to spam

The API sent every email through Gmail SMTP from a personal `@gmail.com` address (`office.inveontech@gmail.com`). Inbox providers treat that as suspicious for transactional mail:

- **The From domain is not ours.** A ticket email from `@gmail.com` that links to `events.inveontechnologies.in` looks like phishing. Our domain has no SPF, DKIM or DMARC that ties it to the mail, so it builds no sending reputation.
- **Personal Gmail is not a sending service.** It caps at about 500 messages a day, and bursts of automated mail from one consumer account are a known spam pattern.
- **HTML-only messages.** Emails had no plain-text part, which spam filters score against. This is fixed in code now: every email carries a plain-text version.

## The fix: a transactional provider on our own domain

Send from an address on `inveontechnologies.in` (for example `tickets@inveontechnologies.in`) through a transactional email provider, with SPF, DKIM and DMARC published in DNS.

Recommended: **ZeptoMail** (by Zoho, built for transactional mail, billed in INR, pay per 10,000 emails). Brevo (free tier of 300 emails/day) and Amazon SES (Mumbai region, cheapest at volume, needs a production-access request) work the same way. Any of them only needs SMTP settings in the app.

### 1. Add and verify the domain at the provider

ZeptoMail: sign up at zeptomail.zoho.in, create a Mail Agent, then **Domains → Add domain → `inveontechnologies.in`**. It shows the exact DKIM and bounce (CNAME) records for your account; add those in DNS as below and click Verify.

### 2. DNS records (at your domain registrar or DNS host)

| Type | Host / Name | Value | Notes |
|---|---|---|---|
| TXT | *(given by provider, e.g. `xxxx._domainkey`)* | *(long DKIM key from the provider)* | DKIM. Copy exactly from the provider's domain page. |
| CNAME | *(given by provider, e.g. `bounce-zem`)* | *(given by provider)* | Bounce/return-path domain. With ZeptoMail this is what makes SPF pass and align, so no change to the root SPF record is needed. |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@inveontechnologies.in; adkim=r; aspf=r` | DMARC. Start with `p=none`, move to `p=quarantine` after 2–4 weeks of clean reports. The `rua` mailbox must exist, or drop that part. |

Use exactly the records the provider's domain page shows; the table only tells you what each one is for. A domain may have only **one** SPF record (`v=spf1 ...` on `@`): if a provider asks you to add an SPF include, merge it into the existing record rather than adding a second one.

For Brevo, add `include:spf.brevo.com` to the root SPF record plus its DKIM records; for Amazon SES, add the three DKIM CNAMEs and a custom MAIL FROM domain (MX + SPF) that SES gives you.

### 3. App settings

In the super admin portal, **Settings → Integrations → Email (SMTP)** (or the same names in `apps/api/.env`):

| Setting | ZeptoMail value |
|---|---|
| `SMTP_HOST` | `smtp.zeptomail.in` |
| `SMTP_PORT` | `465` (or `587`) |
| `SMTP_USER` | `emailapikey` |
| `SMTP_PASS` | the Mail Agent's SMTP password / send-mail token |
| `SMTP_FROM_EMAIL` | `tickets@inveontechnologies.in` (must be on the verified domain) |
| `SMTP_FROM_NAME` | `Inveon Events` |

Brevo: host `smtp-relay.brevo.com`, port `587`, user and key from **SMTP & API**. Amazon SES: host `email-smtp.ap-south-1.amazonaws.com`, port `465`, SMTP credentials from the SES console.

Also set **Settings → Branding → Support email** to a mailbox on the domain (e.g. `support@inveontechnologies.in`). Every email's Reply-To and footer use it, so replies still reach a person.

Saved settings take effect within 30 seconds, with no restart. **Ops → Config check** confirms the SMTP login works; then send a test email from the Messages page.

### 4. Check the result

- Send a test email to a Gmail account, open it, **⋮ → Show original**: SPF, DKIM and DMARC should all say `PASS`, and DKIM should be for `inveontechnologies.in`.
- Send one to the address shown at https://www.mail-tester.com and aim for 9/10 or better.
- Register the domain at https://postmaster.google.com to watch spam rate and reputation. Keep the spam rate under 0.3%.

## Keeping it out of spam

- Ask customers who find an email in spam to mark it "Not spam"; early signals build reputation fast on a new domain.
- Keep marketing-style mail (post-event broadcasts) low-volume. If it grows, send it from a subdomain such as `news.inveontechnologies.in` with a one-click unsubscribe, so it can't hurt ticket and OTP delivery.
- Don't put URL shorteners or third-party image hosts in templates; link to our own domain.
