# Free email delivery for the fixture-sync and game-morning jobs

**Question.** Which free email route can send two automated emails from an unattended job to two Gmail recipients: a daily text-only "fixture sync" diff, and a "game morning" email with a 1 to 5 MB PDF on match days? The jobs run on GitHub Actions (public repo, scheduled workflow) and possibly from a Claude Code cloud routine that can run shell or Python, has secrets as env vars and outbound HTTPS, and probably cannot open SMTP ports.

**Date checked.** 2026-10-22. Every claim below comes from the provider's own pricing page, docs or README, with the URL after it. Volume for this project is about 2 to 4 emails a day (two recipients, one or two messages), so roughly 60 to 120 a month.

## Recommendation

Use **Resend** if you own (or will buy) a domain, otherwise use **Mailgun's free plan with its sandbox domain**. Resend's free plan is permanent, needs no card, allows 3,000 emails a month and 100 a day, accepts emails up to 40 MB after base64 encoding, and sends over a plain HTTPS JSON API with base64 attachments, so one Python snippet works from both GitHub Actions and an HTTPS-only cloud routine. Its one cost is DNS: Resend refuses to send from a shared or public domain, so you must add DKIM and SPF records for a domain you control (usually verified within 15 minutes). If there is no domain, Mailgun's free plan (100 a day, no card, HTTPS API, 25 MB per message) lets you send from the auto-created sandbox domain to up to 5 "authorized recipients" who click an activation link; two Gmail recipients fit, with no DNS at all, at the price of a `postmaster@sandbox…mailgun.org` From address and only one day of logs. The fallback for the GitHub Actions job alone is **Gmail SMTP with an app password** (free, 500 messages a day, 25 MB attachments, Google signs the mail so no DNS), but it is SMTP-only, so it does not cover the cloud routine. Drop the rest: SendGrid's free plan ended in 2025 and new accounts get a 60-day trial, Postmark gives 100 a month and bans Gmail addresses and requires your own domain plus manual approval, Brevo rewrites a Gmail From address to an `@…t-sender-sib.com` address and its documented attachment guidance is muddled around 4 MB, and Amazon SES's new free plan closes the account after 6 months unless you upgrade to a paid plan.

## Comparison

| Provider | Free limit | Persists? | Card? | Max message size | Custom domain needed? | API or SMTP | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Gmail SMTP + app password | 500 messages/day (personal) | Yes | No | 25 MB attachments | No; sends as your Gmail | SMTP only (REST API needs OAuth, not app password) | Needs 2-Step Verification; app passwords revoked when you change the account password |
| Resend | 3,000/month, 100/day | Yes ("free-forever") | No (ToS: no billing info for Free Tier) | 40 MB after base64 | Yes, must verify a domain you own (DKIM + SPF) | HTTPS API (JSON, base64 attachments) and SMTP | 30-day log retention; `onboarding@resend.dev` is test only |
| Mailgun | 100/day | Yes | No, but without a card you can only send to up to 5 authorized recipients via the sandbox domain | 25 MB (uncompressed request body) | No, if you use the sandbox domain; 1 custom domain allowed | HTTPS API (multipart) and SMTP | 1 day of logs; docs conflict on whether a custom domain needs a card |
| Brevo | 300/day | Yes ("free forever") | No | 20 MB total for transactional; one article says each attachment "should be less than 4MB" | Not required, but a gmail.com sender is rewritten to `…@NNN.t-sender-sib.com` and cannot be authenticated | HTTPS API (base64 or URL attachments) and SMTP | Account must be approved before sending; free plan carries Brevo branding |
| SendGrid (Twilio) | None; 60-day trial at 100/day | No, trial | Not stated for trial | Not checked (route rejected) | Yes for real sending | HTTPS API and SMTP | Free plan retired from 27 May 2025; sending stops when the trial ends |
| Postmark | 100/month | Yes ("doesn't expire") | No | 10 MB total after base64 | Yes; public domains such as Gmail refused; manual account approval | HTTPS API (base64 attachments) and SMTP | 100/month is too tight for a daily email to two people |
| Amazon SES | Sandbox: 200/24h to verified recipients; $0.10 per 1,000 after credits | No: free plan closes after 6 months or when credits run out | Not required "for most new customers" | 40 MB after base64 (API v2 or SMTP) | Verified sender identity (email or domain); recipients must be verified while in sandbox | HTTPS API (SigV4-signed) and SMTP | The old "3,000/month for 12 months" tier is not on the pricing page any more |
| dawidd6/action-send-mail | n/a (wraps SMTP) | n/a | n/a | depends on server | depends on server | SMTP only; GitHub Actions only | Nodemailer-based; README's example is Gmail on port 465 with an app password |

## Gmail SMTP with an app password

- Personal Gmail sending limit: "Sending more than 500 emails in a day" triggers the "You have reached a limit for sending mail" error; also triggered by a message to more than 500 recipients. https://support.google.com/mail/answer/22839
- App passwords need 2-Step Verification: "App passwords can only be used with accounts that have 2-Step Verification turned on." Google "revoke[s] your app passwords when you change your Google Account password." Not available on accounts using security keys only, on Advanced Protection, or on Workspace accounts where the admin has not allowed them. https://support.google.com/accounts/answer/185833
- Attachment limit for personal accounts: "25 MB"; larger files are replaced by a Google Drive link. https://support.google.com/mail/answer/6584
- SMTP server details (Google Workspace knowledge page, same server for personal accounts): `smtp.gmail.com`, port 465 (SSL) or 587 (TLS), authentication required with the account address and an app password. The Workspace limit on that page is 2,000 a day; personal accounts use the 500 limit above. https://knowledge.workspace.google.com/admin/gmail/send-email-from-a-printer-scanner-or-app
- Custom domain or DNS: none. Mail goes out from your `@gmail.com` address and Google signs it, so Gmail's "SPF or DKIM" requirement for all senders is met by Google. https://support.google.com/a/answer/81126
- HTTPS alternative: the Gmail REST API (`POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send`) takes a base64url-encoded raw MIME message and requires an OAuth 2.0 bearer token with the `gmail.send` scope. App passwords do not work with it, so the cloud-routine case would need an OAuth client and a refresh token. The messages.send reference page does not state a total size limit. https://developers.google.com/workspace/gmail/api/guides/sending and https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send
- Secret stored: `GMAIL_USER` and `GMAIL_APP_PASSWORD` (16-character app password) as GitHub Actions secrets. For the cloud routine this route only works if the sandbox allows outbound 465/587.
- Setup: turn on 2-Step Verification, create an app password for "Mail", store it as a secret, send with Python `smtplib` (or the dawidd6 action, below).

## Resend

- Free plan: "3,000" emails a month and "The Free plan is limited to 100 emails per day"; 3 domains; 30-day data retention; described as a "free-forever plan". https://resend.com/pricing
- Card: "You are not required to provide billing information to use the Free Tier." https://resend.com/legal/terms-of-service (section 6)
- Message size: "Emails can be no larger than 40MB (including attachments after Base64 encoding)." Attachments cannot be sent through the batch endpoint. https://resend.com/docs/dashboard/emails/attachments
- Domain: "Resend sends emails using a domain you own (i.e., not a shared or public domain). You must add and verify at least one domain to send emails with Resend." https://resend.com/docs/dashboard/domains/introduction
- DNS: add "the DKIM and SPF configurations (TXT and MX or CNAME records)" shown in the domain's Records tab; "will often verify within 15 minutes", up to 72 hours. https://resend.com/docs/add-a-domain
- Test sender: "`onboarding@resend.dev` is for testing only"; the quickstart lists "A verified domain" as a prerequisite and stores the key in `RESEND_API_KEY`. https://resend.com/docs/send-with-python
- API: `POST https://api.resend.com/emails` with `Authorization: Bearer re_…`; `attachments[]` items take `content` (base64 string), `filename`, or `path` (hosted URL); "max 40MB per email, after Base64 encoding of the attachments". https://resend.com/docs/api-reference/emails/send-email
- Secret stored: `RESEND_API_KEY`. Works from any HTTPS client, so one snippet serves GitHub Actions and the cloud routine.

## Mailgun

- Free plan: "$0/mo", "100 emails/day included", "1 custom sending domain", "RESTful email APIs and SMTP relay", "1 day log retention", "2 API keys". Cheapest paid plan: Basic from $15/month for 10,000 emails. https://www.mailgun.com/pricing/
- No card: "Mailgun's Free plan requires no credit card and offers the following: 100 messages per day, 1 custom domain can be added to your account, verified, and utilized to send email…" (article updated 2024-12-17). https://help.mailgun.com/hc/en-us/articles/203068914-What-does-the-Free-plan-offer
- Authorized recipients (article updated 2025-08-18): "If you're on the Free plan without credit card information present or using your sandbox domain for testing, you're restricted to sending just to Authorized Recipients." Adding a card "upgrades your account, to allow you to add custom domains." "Up to 5 Authorized Recipients can be added." Each recipient must click an activation link before you can send to them. https://help.mailgun.com/hc/en-us/articles/217531258-Authorized-Recipients
- Sandbox domain: "can only send to authorized recipients"; mailing lists limited to 5 authorized participants. https://documentation.mailgun.com/docs/mailgun/user-manual/domains/domains-sandbox
- Message size: 25 MB, enforced on the uncompressed request body; attachments must be `multipart/form-data`. https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-http
- API: `POST https://api.mailgun.net/v3/<domain>/messages` (EU region: `api.eu.mailgun.net`), HTTP basic auth user `api`, password = API key, `attachment` as a repeated multipart file field. https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/messages
- Secret stored: `MAILGUN_API_KEY` and `MAILGUN_DOMAIN` (the sandbox domain name).
- Conflict to note: the free-plan article says a custom domain is included; the authorized-recipients article says adding a card is what unlocks custom domains. For this project the sandbox route needs neither a domain nor a card.

## Brevo

- Free plan: "Free forever, no credit card needed"; FAQ: "Once we approve your account for sending, you can start sending up to 300 emails per day." Payment FAQ: "Do I have to enter my credit card details to sign up? No." "No Brevo logo" is listed as a paid-plan feature, so free-plan emails carry a "Sent with Brevo" footer. https://www.brevo.com/pricing/
- Transactional attachment limits (help article updated 2026-10-08): "The size limit for transactional emails is 20MB, including attachments and email content." In the template section it adds "The attachment should be less than 4MB." The API section repeats the 20 MB total and lists `pdf` among allowed extensions; max 99 recipients per email with an attachment. https://help.brevo.com/hc/en-us/articles/4402811730962-Add-an-attachment-to-a-transactional-email
- API: `POST https://api.brevo.com/v3/smtp/email` with header `api-key: xkeysib-…`; the sender must be "registered and verified". https://developers.brevo.com/docs/send-a-transactional-email
- Attachment fields: `attachment[].url` (absolute URL, no local paths) or `attachment[].content` (base64) plus `name`. https://developers.brevo.com/reference/sendtransacemail
- Free-webmail senders: "free sender domains cannot be authenticated, so you'll need to purchase your own domain." https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email
- Rewriting: "If you are sending from a free email address or have not authenticated your domain, Brevo temporarily replaces your sender address with a compliant one"; example for transactional email: `mycompany@gmail.com` becomes `mycompany@5000001.t-sender-sib.com`. https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders
- Secret stored: `BREVO_API_KEY`. HTTPS API works from both runtimes.

## SendGrid (Twilio)

- Free plan retired: "Twilio SendGrid will be retiring its Free Email API and Free Marketing Campaigns plan starting May 27, 2025." After 60 days "Email sending will be paused for accounts on all free plans." https://www.twilio.com/en-us/changelog/sendgrid-free-plan
- New accounts: "users will be given a 60 day timed free trial plan"; "Send up to 100 email messages via web API or SMTP per day"; afterwards "Any active email send integration using your account's API keys will stop sending messages." https://support.sendgrid.com/hc/en-us/articles/35270136965403-Overview-of-60-Day-Free-Trial-Plans-for-New-SendGrid-Accounts
- The old pricing URL now redirects to twilio.com, whose header reads "Sign up for a free trial—no credit card required." https://sendgrid.com/en-us/pricing
- Rejected: no persistent free tier, so attachment limits and DNS were not pursued.

## Postmark

- Free tier: "100 emails/month", "No overages allowed in this plan", "Use it for however long you need, it doesn't expire", "Try Postmark Free No Credit Card Required". Basic paid plan $15/month for 10,000. https://postmarkapp.com/pricing
- Size: "Total message size, including attachments, can be up to 10MB total" (measured after base64). API `POST https://api.postmarkapp.com/email` with `X-Postmark-Server-Token`; attachments as `Name`, `Content` (base64), `ContentType`. Requires "a registered and confirmed sender signature with the sender email". https://postmarkapp.com/developer/user-guide/send-email-with-api
- Public domains refused: signup error "Sorry, we don't allow email addresses on public domains such as Gmail and Yahoo." https://postmarkapp.com/blog/why-cant-i-use-gmail-address
- Approval: until approved "you won't be able to send to any email address outside the domains you've added and verified"; review "in less than 24 hours on weekdays". https://postmarkapp.com/support/article/1084-how-does-the-account-approval-process-work
- Rejected: 100/month is below this project's likely volume, and it needs a domain plus a manual review.

## Amazon SES

- Pricing: "$0.10 / 1,000 emails" outbound, "$0.12 per GB of attachment data sent". Free tier text: "New AWS customers will receive up to $200 in AWS Free Tier credits"; "The free plan will be available for 6 months after account creation"; "All Free Tier credits must be used within 12 months of your account creation date." The page no longer mentions 3,000 free messages a month. https://aws.amazon.com/ses/pricing/
- Free plan mechanics: "you get $100 in credits immediately", up to $200; "The account closes on its own 6 months after you open it or when your credits run out, whichever comes first." https://aws.amazon.com/free/
- Card: "A payment method isn't required to sign up for most new customers." https://aws.amazon.com/free/free-tier-faqs/
- Sandbox: "You can only send mail to verified email addresses and domains", "a maximum of 200 messages per 24-hour period", "1 message per second". Production access is a manual request answered "within 96 hours". https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html
- Message size: API v2 or SMTP "40 MB per message (after base64 encoding)"; v1 API 10 MB. https://docs.aws.amazon.com/ses/latest/dg/quotas.html
- Identities: an email address can be verified by clicking a link that "expires after 24 hours"; domain identities need three DKIM CNAME records. https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html
- API over HTTPS: "Make direct HTTPS requests" requires you to handle signing; SDKs (boto3) do it for you. SMTP credentials differ from access keys. https://docs.aws.amazon.com/ses/latest/dg/send-email-api.html and https://docs.aws.amazon.com/ses/latest/dg/send-email-smtp.html
- For two recipients the sandbox would do (verify both Gmail addresses as identities), but the account expires after 6 months without a paid plan, which fails the "free, no card" test.

## dawidd6/action-send-mail (GitHub Actions marketplace)

- Sends through SMTP using nodemailer; `connection_url` accepts `smtp://`, `smtps://` (port 465) and `smtp+starttls://` (587); inputs include `server_address`, `server_port`, `secure`, `username`, `password`, `from`, `to`, `attachments` (comma-separated paths with globbing). The README example uses `smtp.gmail.com` on port 465 and the troubleshooting section says to "use an App password" after enabling 2-Step Verification. https://github.com/dawidd6/action-send-mail
- It is a convenience wrapper for the Gmail SMTP route (or any SMTP provider above). It only runs inside GitHub Actions, so it does not help the cloud routine.

## Setup for the recommended route (Resend)

1. Create a Resend account (no card). Add your domain under Domains and copy the DKIM and SPF records (TXT plus MX or CNAME) into your DNS host. Wait for "Verified" (usually under 15 minutes).
2. Create an API key with "Sending access" only.
3. Store secrets:
   - GitHub Actions: repository secrets `RESEND_API_KEY`, `MAIL_FROM` (an address on the verified domain, e.g. `lions-bot@yourdomain`), `MAIL_TO` (comma-separated two Gmail addresses).
   - Cloud routine: the same three names as env vars.
4. Use the same Python snippet in both places. It needs only the standard library.

```python
# send_mail.py — usage: python send_mail.py "Subject" body.txt [attachment.pdf]
import base64, json, os, sys, urllib.request

subject, body_path = sys.argv[1], sys.argv[2]
attachment = sys.argv[3] if len(sys.argv) > 3 else None

payload = {
    "from": os.environ["MAIL_FROM"],
    "to": [a.strip() for a in os.environ["MAIL_TO"].split(",")],
    "subject": subject,
    "text": open(body_path, encoding="utf-8").read(),
}
if attachment:
    with open(attachment, "rb") as f:
        payload["attachments"] = [{
            "filename": os.path.basename(attachment),
            "content": base64.b64encode(f.read()).decode("ascii"),
        }]

req = urllib.request.Request(
    "https://api.resend.com/emails",
    data=json.dumps(payload).encode(),
    headers={
        "Authorization": f"Bearer {os.environ['RESEND_API_KEY']}",
        "Content-Type": "application/json",
    },
)
with urllib.request.urlopen(req, timeout=30) as resp:
    print(resp.status, resp.read().decode())
```

GitHub Actions step:

```yaml
- name: Send game-morning email
  env:
    RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
    MAIL_FROM: ${{ secrets.MAIL_FROM }}
    MAIL_TO: ${{ secrets.MAIL_TO }}
  run: python scripts/send_mail.py "Game morning: Lions v Opponent" out/body.txt out/game-pack.pdf
```

Equivalent `curl` for a text-only message (the daily diff):

```bash
curl -sS -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg from "$MAIL_FROM" --arg to "$MAIL_TO" --rawfile text out/diff.txt \
        '{from:$from, to:($to|split(",")), subject:"Fixture sync", text:$text}')"
```

Fallback without a domain (Mailgun sandbox): in the Mailgun control panel select the sandbox domain, add both Gmail addresses as Authorized Recipients and have each click the activation link; store `MAILGUN_API_KEY` and `MAILGUN_DOMAIN`; send with
`curl -sS --user "api:$MAILGUN_API_KEY" https://api.mailgun.net/v3/$MAILGUN_DOMAIN/messages -F from="Lions Bot <postmaster@$MAILGUN_DOMAIN>" -F to="$MAIL_TO" -F subject="Game morning" -F text=@out/body.txt -F attachment=@out/game-pack.pdf`
(use `api.eu.mailgun.net` if the account is in the EU region).

Fallback for GitHub Actions only (Gmail SMTP): secrets `GMAIL_USER`, `GMAIL_APP_PASSWORD`; `smtp.gmail.com:465` with SSL via `smtplib.SMTP_SSL` or the dawidd6/action-send-mail step.

## Open questions / things not verifiable from docs

- Whether the project has (or wants to buy) a domain. This decides Resend versus Mailgun sandbox.
- Mailgun: deliverability to Gmail from a `sandbox…mailgun.org` From address, and whether Mailgun signs sandbox mail with DKIM, are not stated in the docs checked. Also the two help articles disagree on whether a custom domain on the free plan needs a card on file.
- Mailgun authorized-recipient activation emails go to the two recipients; both must click before the first send.
- Resend: whether the daily counter counts each recipient as one email (a message to two addresses may count as two). At this volume it does not matter.
- Brevo: whether "The attachment should be less than 4MB" applies to API attachments or only template attachments; the API section states only the 20 MB total.
- Gmail REST API total message size: the messages.send reference does not state it; related Google pages give 25 MB. If the cloud routine used Gmail, OAuth refresh-token lifetime for an unpublished OAuth app would also need checking.
- Whether the Claude Code cloud routine can open outbound 465/587. If it can, Gmail SMTP becomes viable there too.
- SES: whether accounts created before the July 2025 free-tier change still get 3,000 free messages a month for 12 months; the current pricing page does not mention it.
- Help-centre pages for Brevo and Mailgun were read through their Zendesk JSON endpoints because the HTML pages returned 403 to automated fetches; the content is the same article body.
