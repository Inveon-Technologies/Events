# Cashfree setup (payments + organizer payouts)

Inveon Events takes online payments through **Cashfree Payment Gateway**.
Each organizer's share goes straight to them through **Easy Split**
(vendors). Inveon keeps the platform fee.

- Customer pays ₹1,000 with a 5 % fee: the organizer's vendor account gets ₹950 and Inveon keeps ₹50.
- The fee is `PLATFORM_FEE_PERCENT` (0–50). It is set in the super admin portal and applies to new orders straight away.

You can set everything below from the super admin portal:
**Settings → Integrations → Cashfree payments**. It needs no restart.
Values saved there are encrypted and override `apps/api/.env`.

After changing anything, open **Technical → Config check** in the portal.
It logs in to Cashfree with your keys and tells you what is wrong.

---

## 1. Sandbox (testing, no real money)

1. Sign in at <https://merchant.cashfree.com> and switch the top bar to **Test** mode.
2. Go to **Developers → API Keys** and generate keys. The App ID starts with `TEST`.
3. In the portal, save:

   | Key | Value |
   |---|---|
   | `CASHFREE_APP_ID` | the `TEST…` App ID |
   | `CASHFREE_SECRET_KEY` | the secret key |
   | `CASHFREE_ENV` | `sandbox` |
   | `PLATFORM_FEE_PERCENT` | e.g. `5` |

4. Test a booking with Cashfree's test cards or UPI: <https://docs.cashfree.com/docs/test-data>

Sandbox payments never move real money. Sandbox vendors don't need real KYC.

## 2. Going live (production)

Do these in order.

1. **Activate the account.** Finish business KYC in the Cashfree dashboard (Live mode) and wait for "Activated".
2. **Enable Easy Split.** Ask Cashfree support or your account manager to enable *Easy Split / Split Payments* on the live account. Without it, every order with a vendor split fails.
3. **Whitelist the website domain.** Cashfree only opens checkout for approved domains.
   1. Go to **Developers → Whitelisting → Payment Gateway**.
   2. Add `events.inveontechnologies.in`.
   3. Wait for approval, usually a few hours.
   4. Until it is approved, customers see Cashfree's **"Something went wrong. Share a screenshot with the seller"** page.
4. **Generate live keys.** In Live mode, go to **Developers → API Keys**. The App ID does **not** start with `TEST`.
5. **Save them in the portal**, all at once:
   - `CASHFREE_APP_ID` = live App ID
   - `CASHFREE_SECRET_KEY` = live secret
   - `CASHFREE_ENV` = `production`
6. **Webhook.** Every order already tells Cashfree where to send payment updates:

   ```
   https://events.inveontechnologies.in/api/webhooks/cashfree
   ```

   As a backup, also add that URL in **Developers → Webhooks** (Payment Gateway, API version `2023-08-01`). Webhooks are signed with your secret key, and the API rejects any with a bad signature.
7. **Check.** In **Config check**, every item in *Payments* should be green:
   - keys present
   - mode matches the keys
   - "Cashfree accepted the keys"
   - webhook URL is https
8. **Organizers re-do payout KYC.** Sandbox vendors don't exist in live mode. Each organizer must submit their bank/KYC details again in the organizer portal (Payments tab), which creates their live vendor. Until then they can't sell paid tickets.
9. **Do a real ₹1 test.**
   1. Create a ₹1 ticket and pay with your own card or UPI.
   2. Check that the booking is confirmed.
   3. Check the payment in **Commerce → Payments**, using **Check with Cashfree**.
   4. Check that the vendor split appears in the Cashfree dashboard.

The checkout page gets the mode (sandbox or production) from the API with each order.
The old web build setting `VITE_CASHFREE_MODE` is only a fallback.
Switching `CASHFREE_ENV` in the portal is therefore enough, with no rebuild.

## 3. Troubleshooting

| What you see | Why | Fix |
|---|---|---|
| Cashfree page: *"Something went wrong. Share a screenshot with the seller"* with a `session_…payment` ID | Cashfree refused to open the payment session. The ID ending in `…payment` is normal. | Check, in this order: (1) domain not whitelisted in live mode; (2) the order expired (a payment link is valid for 20 minutes, so reopening an old tab fails); (3) the payment session was opened in the wrong mode, which v2.0.1 fixed; (4) Cashfree had a short outage (<https://status.cashfree.com>). Run **Config check** and use **Check with Cashfree** on the booking. |
| Config check: *Cashfree rejected the keys (401)* | Wrong App ID or secret, or keys from the other mode | Re-copy both keys from the same mode as `CASHFREE_ENV` |
| Config check: *Mode is production but the App ID is a TEST key* | Mixed-up keys | Use live keys or set `CASHFREE_ENV=sandbox` |
| Booking stays "pending" after the customer paid | The webhook didn't arrive | Before releasing an unpaid booking's seats, the API asks Cashfree directly and confirms the booking if it was paid. Check with **Check with Cashfree** on the Payments page. |
| Order creation fails: *Organizer has no registered payment vendor* | The organizer hasn't finished payout KYC in this mode | The organizer completes the Payments tab |
| Split / vendor errors in live mode | Easy Split isn't enabled | Ask Cashfree support to enable it |

## 4. Reference

| Setting | Where | Default |
|---|---|---|
| `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY` | portal or `apps/api/.env` | none |
| `CASHFREE_ENV` | portal or `.env` | `sandbox` (anything else than `production` = sandbox) |
| `PLATFORM_FEE_PERCENT` | portal or `.env` | `5` (0 is allowed) |
| `CASHFREE_API_VERSION` | `.env` only | `2023-08-01` |
| `API_PUBLIC_URL` | `.env` only | none (required: builds the webhook URL) |

The code lives in:
- `apps/api/src/services/cashfreeClient.ts`: API calls
- `apps/api/src/services/cashfreeOrders.ts`: orders, split and webhook handling
- `apps/api/src/services/configCheck.ts`: the live check
