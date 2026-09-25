# WhatsApp setup (AiSensy)

The app sends four WhatsApp messages once this is set up:

| Message | When | Template / API campaign name |
|---|---|---|
| Booking confirmation, as a ticket with QR code and View Ticket / PDF buttons | Right after booking, or once online payment succeeds | `booking_confirmation` |
| Event reminder | About 3 hours before the event starts | `event_reminder` |
| Booking cancelled | When a customer or the organizer cancels | `booking_cancelled` |
| Thank-you | 10:00 AM (India time) the day after the event, with photo and rating links | `post_event_thanks` |

Messages go through the background queue, like emails: a failed send is
retried 5 times, and WhatsApp problems never block a booking. Nothing is
sent until the settings in step 7 are in place.

---

## 1. Before you start

- [ ] A **Facebook account that is an admin of the Inveon Technologies Meta
      Business account** (business.facebook.com). Create the business
      account first if there isn't one.
- [ ] A **phone number for WhatsApp that is not already on WhatsApp**.
      Delete the WhatsApp account on it first if it is. It must be able to
      receive an SMS or call for a code. A new SIM or a landline both work.
- [ ] Business documents for Meta verification: GST certificate, or the
      company PAN plus a utility bill or incorporation certificate.
- [ ] The website live with a privacy policy page.

> **Important, so you can leave AiSensy later:** when AiSensy's signup opens
> the Facebook window, log in with the account above and pick the
> **Inveon Technologies** business, not a new one or AiSensy's. Moving the
> number to Meta directly later only works between accounts of the same
> business.

## 2. Create the AiSensy account and connect WhatsApp

1. Sign up at [aisensy.com](https://aisensy.com) with the company email.
2. Choose **Apply for WhatsApp Business API** (or **Connect WhatsApp**). A
   Facebook window opens.
3. Log in, select the Inveon Technologies business, and create a new
   WhatsApp Business Account.
4. **Display name:** `Inveon Events`. It must match the business or brand on
   your website, or Meta rejects it.
5. Enter the phone number and verify it with the code.
6. Back in AiSensy, the number shows as connected. The display name is
   usually approved within a day.

## 3. Verify the business with Meta

In Meta Business Settings → **Security Centre** → **Start verification**,
upload the documents from step 1. It takes 1–5 working days.

Until then the number can message **250 customers a day**. After
verification the limit rises in steps (1,000, then 10,000, and so on) as
long as the quality rating stays green.

## 4. Pick a plan

**Basic** is enough to start: API sending plus the shared inbox for
replies. Ask AiSensy to confirm two things on Basic before you pay:

- the monthly limit on **API campaign** sends;
- whether **delivery-status webhooks** are included.

## 5. Create the four templates

In AiSensy go to **Manage → Template Messages → New Template**. For each
template below:

- **Category:** Utility
- **Language:** English
- **Name:** as shown
- **Body:** copy the text exactly, including where each `{{number}}` sits.
  The app fills them in this order.
- **Samples:** Meta asks for example values; use the ones given.

Submit, then wait for **Approved**. That's usually minutes, at most a day.

### `booking_confirmation`

This one looks like a ticket: the header is a picture of the ticket (event
photo, details and the QR code), and it has **View Ticket** and **Download
Ticket PDF** buttons. The app draws the picture for each booking.

**Header:** choose **Image**. For the sample, upload
[`whatsapp-sample-card.jpg`](whatsapp-sample-card.jpg) from this folder.

**Body:**
```
🎟️ *Booking Confirmed!*

Hi {{1}},
Your booking for *{{2}}* is confirmed. {{3}}

📅 {{4}}
⏰ {{5}}
📍 {{6}}
🎫 Ticket ID: {{7}}
🧾 Booking ID: {{8}}

Need help? Contact {{9}}.
```
Samples: `Rahul` · `Rajgad Sunrise Trek` · `Your payment has been verified and your ticket is ready.` · `Saturday, 18 October 2026` · `Reporting time: 5:30 AM` · `Pune → Rajgad` · `INV-TKT-2026-8F3K2Q-01` · `INV-BKG-2026-8F3K2Q` · `Eco Pandhari Club: 0788 750 3856`

**Footer:**
```
Keep this ticket on your phone and show the QR code at check-in.
```

**Buttons:** choose **Call to action**, then add two buttons:

| Type | Button text | URL type | URL |
|---|---|---|---|
| Visit website | `View Ticket` | Dynamic | `https://events.inveontechnologies.in/t/{{1}}` |
| Visit website | `Download Ticket PDF` | Dynamic | `https://events.inveontechnologies.in/api/ticket-pdf/{{1}}` |

For each button's sample value, use `INV-BKG-2026-8F3K2Q.sample`. Use your
own site address if it's different: it must be the same as `WEB_PUBLIC_URL`
on the server.

What the app fills in, for reference:

| | Value |
|---|---|
| `{{3}}` | "Your ticket is ready." (free) · "Your payment has been verified and your ticket is ready." (paid online) · "Please pay ₹… at the venue; your ticket is ready." (cash) |
| `{{5}}` | "Reporting time: …" if the event has a gate-open time, else "Starts at: …" |
| `{{6}}` | "Pickup → Venue" when the event has a pickup point, else the venue |
| `{{7}}` | One ticket: its ID. Several: "…-01 to -03 (3 tickets)". Each person's QR code is on the ticket page and in the PDF. |
| `{{9}}` | "Organizer: phone" if the organizer added a phone number, else "Organizer via your ticket page" |
| Buttons | The booking's private ticket link (no login needed) |

If the WhatsApp message fails, the booking still goes through, the ticket
still arrives by email, and the ticket page shows WhatsApp as "Not
delivered".

### `event_reminder`

```
Hi {{1}}, a reminder that {{2}} starts today at {{3}}.

Venue: {{4}}
Directions: {{5}}

Keep your QR code ready for check-in (booking ref {{6}}). Have a great time!
```
Samples: `Asha` · `Rajgad Sunrise Trek` · `6:30 am` · `Gunjavane village, Pune` · `https://www.google.com/maps/search/?api=1&query=Gunjavane` · `INV-BKG-2026-8F3K2Q`

### `booking_cancelled`

```
Hi {{1}}, your booking {{2}} for {{3}} has been cancelled. {{4}}

If you have any questions, just reply to this message.
```
Samples: `Asha` · `INV-BKG-2026-8F3K2Q` · `Rajgad Sunrise Trek` · `A refund of ₹1,000 has been started to your original payment method.`

### `post_event_thanks`

```
Hi {{1}}, thank you for joining {{2}} with {{3}}! {{4}}

Please rate your experience at {{5}}. Your feedback helps us plan better events.
```
Samples: `Asha` · `Rajgad Sunrise Trek` · `Eco Pandhari Club` · `See the photos and videos here: https://drive.google.com/drive/folders/abc` · `https://events.inveontechnologies.in/bookings/INV-BKG-2026-8F3K2Q/feedback`

Meta may approve `post_event_thanks` as **Marketing** instead of Utility,
because it asks for a rating. That's about ₹1.09 a message instead of
₹0.145. It still works either way. To save money, you can skip creating it
and the thank-you goes out by email only.

## 6. Create one API campaign per template

The app sends each message by triggering an AiSensy **API campaign**. In
**Campaigns → Launch → API Campaign**:

1. **Campaign name:** exactly the template name: `booking_confirmation`,
   `event_reminder`, `booking_cancelled`, `post_event_thanks`.
2. Pick the matching template.
3. Leave the parameters as they are. The app sends them.
4. Set the campaign **Live**.

## 7. Turn it on in the app

1. In AiSensy: **Manage → API Key**. Copy the key and keep it secret; it
   can send messages as your business.
2. On the server, add to `apps/api/.env`:
   ```
   WHATSAPP_PROVIDER=aisensy
   AISENSY_API_KEY=<the key>
   WEB_PUBLIC_URL=https://events.inveontechnologies.in
   ```
   `WEB_PUBLIC_URL` is required: WhatsApp downloads the ticket picture from
   it, and the buttons open pages on it.
3. Restart the API (`docker compose up -d events-api`), or redeploy.
4. **Test:** book a free ticket on a test event with your own WhatsApp
   number. The confirmation should arrive within a few seconds. The API
   log shows `WhatsApp message sent`:
   ```
   docker compose logs events-api --since 5m | grep -i whatsapp
   ```

To switch WhatsApp off again, remove `WHATSAPP_PROVIDER` and restart.

## Troubleshooting

| Log message | Fix |
|---|---|
| `WhatsApp provider returned 400 … campaign` | The API campaign name doesn't match exactly, or the campaign isn't Live. |
| `… template … not approved` / `paused` | Check the template's status in AiSensy. Meta pauses templates that many people block or report. |
| `Not a usable WhatsApp number` | The customer typed an invalid number. That message is skipped; the email still goes. |
| Nothing in the logs | `WHATSAPP_PROVIDER` or `AISENSY_API_KEY` is missing, or the API wasn't restarted. |
| `… media … download` / message without picture | WhatsApp couldn't fetch the ticket picture. Open `https://<your site>/api/t/<token>/card.png` from a phone: it must load over HTTPS. |
| Sends stop after 250 a day | Business verification (step 3) isn't finished yet. |

Customer replies land in the **AiSensy inbox**. Anyone on the team with
an AiSensy login can answer them there.

## Costs

AiSensy's rate is about ₹0.145 per utility message and ₹1.09 per
marketing message, plus the plan fee and 18% GST. At 1,000 bookings a
month that's about 3,000 messages, roughly ₹500 in messages plus the
plan.

## Moving to Meta directly later (no provider fee)

The code already supports it; only settings change.

1. In Meta's WhatsApp Manager (business.facebook.com → WhatsApp
   accounts), create the same four templates (same names and texts), or
   let the migration copy the approved ones.
2. Ask AiSensy to release the number, and turn off two-step verification
   on it.
3. Migrate the number to the Cloud API (Meta's *phone number migration*).
   You keep the number, the green tick, the quality rating and the
   templates.
4. Create a **System User** with a permanent access token that has the
   `whatsapp_business_messaging` permission.
5. Change `apps/api/.env`:
   ```
   WHATSAPP_PROVIDER=meta
   WHATSAPP_PHONE_NUMBER_ID=<from WhatsApp Manager → Phone numbers>
   WHATSAPP_ACCESS_TOKEN=<system user token>
   ```
6. Restart the API and send a test booking.

Expect a few minutes without WhatsApp during the move; emails keep
working throughout.
