# Outgoing email (SMTP)

Three messages leave this application, all as plain text through one
`nodemailer` transport in [`src/shared/mail/mailer.ts`](../src/shared/mail/mailer.ts):

| Message             | Sent when                           | Failure is               |
| ------------------- | ----------------------------------- | ------------------------ |
| Verification code   | registration, password reset        | **fatal to the request** |
| Order confirmation  | checkout commits                    | logged, order stands     |
| Order status change | any status transition, incl. cancel | logged, change stands    |

That split is deliberate. The OTP **is** the request — if it cannot be sent,
the caller must be told, because an account nobody can verify is worse than a
failed registration they can retry. An order confirmation is a courtesy: the
order is already paid for and persisted, and failing it to report an email
problem would be an actively worse outcome for the customer.

## Configuration

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587                  # 587 = STARTTLS, 465 = implicit TLS
SMTP_USER=you@example.com
SMTP_PASS=...                  # an app password, not an account password
MAIL_FROM=you@example.com      # optional, falls back to SMTP_USER
```

Only these exact names are read. Anything else in `.env` is ignored **without
an error** — a misspelled variable looks identical to an unconfigured mailer.

| `SMTP_HOST`         | `NODE_ENV`         | Behaviour                                       |
| ------------------- | ------------------ | ----------------------------------------------- |
| set                 | any                | real send                                       |
| unset               | development / test | message written to the log, not sent            |
| unset               | production         | refuses, `503 Email delivery is not configured` |
| set but unreachable | any                | refuses, `503 Could not send the email`         |

The dev fallback is what keeps `npm test` and a fresh clone working with no
credentials at all: the OTP is readable in the console, so registration can be
completed locally. It is disabled in production on purpose — logging a
verification code to a production log **and reporting success** is the worst
available outcome, so the mailer would rather fail loudly.

## What the live run proved (2026-08-09)

Run against a real Gmail account with an app password, driving the actual HTTP
API, with the receiving inbox inspected directly.

| Check                                                                          | Result |
| ------------------------------------------------------------------------------ | ------ |
| Credentials accepted (`transporter.verify()`)                                  | pass   |
| Registration → verification code arrives in a real inbox                       | pass   |
| That code verifies the account                                                 | pass   |
| Checkout → order confirmation arrives, correct items and total                 | pass   |
| Status change → handed to the mail server, `250 OK`                            | pass   |
| SMTP unreachable → order still placed (`201`) and status still changed (`200`) | pass   |
| SMTP unreachable → failure logged with the real reason (`ECONNREFUSED`)        | pass   |
| SMTP unreachable → registration returns `503`, not `500`                       | pass   |

The app password was configured with the spaces Google displays in it
(`xxxx xxxx xxxx xxxx`). Gmail ignores them, so it works either way —
`SMTP_PASS` is deliberately not trimmed, because passwords may legitimately
contain spaces.

## Gmail silently discards mail, and nothing here can detect it

The single most important finding from that run, and the reason this document
exists.

While testing, a burst of roughly fifteen messages in ten minutes produced a
mixture: some arrived within seconds, and **the rest never appeared at all** —
not in the inbox, not in spam, not in trash. Every one of them was accepted by
Gmail's SMTP server with `250 2.0.0 OK` and a message id.

It was not the content. The same message body and subject were delivered at one
moment and dropped a few minutes later, and a deliberately plain control
message sent to a fresh address arrived at 14:49 and vanished at 14:51. Delivery
resumed on its own once the burst stopped. This is consumer-account throttling
and reputation filtering, applied after the SMTP transaction has already been
answered successfully.

The consequence for this codebase: **acceptance is not delivery, and the
application cannot tell the difference.** `sendMail` resolving means the message
was handed over, nothing more. That is why the mailer now logs the provider's
message id on every send — when a customer says they never received something,
that id is the only handle that ties the complaint to a specific attempt, and
it is the last thing this application knows about the message.

**A personal Gmail account is therefore not a production email channel for this
app.** It is fine for a demo. For real traffic, use a transactional provider
(Amazon SES, SendGrid, Brevo, Postmark) on a domain with SPF, DKIM and DMARC
records — those give per-message delivery and bounce events, which is the only
way to know a message actually landed.

## Known limitations

- **No bounce or delivery tracking.** Nothing consumes provider webhooks, so a
  hard bounce is invisible. A recipient the server rejects outright _is_ logged
  as a warning, but that only covers rejection during the SMTP transaction.
- **No retry.** A failed order notification is logged and dropped. The order is
  correct either way, and retrying email on a timer with nobody watching was not
  worth the machinery at this stage.
- **Plain text only.** No HTML alternative part.
- **No unsubscribe / preference handling.** Every customer gets every message
  about their own orders; there is nothing marketing-like to opt out of.
- **`npm test` never touches SMTP.** The suite mocks the transport, so a green
  run says nothing about credentials — that is what the live checks above are
  for.
