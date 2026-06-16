# Spec — Seller opt-in: "Receive a dealer offer"

**Status:** Spec only — build when the dealer loop is commercially validated (Gys Pitzer / Andries confirms + terms agreed).
**Goal:** Let a private seller, at listing time, opt in to receiving a direct cash offer from a vetted Land Cruiser dealer. Capture the consent, flag the listing, and surface opted-in sellers in admin so Wesley can broker the intro. Nothing about the public listing page changes.

This is the "capture → store → surface in admin" half of the loop. Sending to the dealer and tracking the fee stays **manual** for V1 (one dealer, low volume). See *Future* for the V2 deal/fee tracking table.

---

## Design decision: column on `listings`, NOT a separate table

The seller IS the listing owner — their contact already lives on the row (`seller_name` / `seller_email` / `seller_phone`, `src/db/schema.ts:19-21`). The opt-in is a 1:1 per-listing flag, so it mirrors the existing `featured` / `review_flag` booleans exactly. A separate `seller_optins` table would just duplicate seller contact and force a join. Rejected.

(The finance-leads table is separate because a finance lead is a *buyer* — a different person from the seller, many-per-listing. Different shape, different storage. Don't copy that pattern here.)

A separate table **does** become correct in V2, when we track the brokered *deal* lifecycle (offer made → amount → accepted → fee invoiced → fee paid). That's money-tracking, not consent-capture — defer it until terms exist.

---

## V1 data model

One boolean column on `listings`, defaulting false:

```ts
// src/db/schema.ts — listings table, add next to featured/review_flag (~line 33)
dealer_offer_optin: integer('dealer_offer_optin', { mode: 'boolean' }).notNull().default(false),
```

> Optional (skip for V1): `dealer_offer_optin_at` timestamp. `created_at` already approximates it for form submissions; only worth adding if you care about the exact time when Wesley toggles it on for an *existing* listing in admin.

### ⚠️ Migration — the prod-500 gotcha (do BOTH or the deploy 500s the whole site)

`scripts/migrate.mjs` runs at container start (`Dockerfile:29`) and hard-fails the boot if any `REQUIRED_COLS` entry is missing. Adding the Drizzle column above is **not enough** — you must also:

1. Add an `addCol` call (alongside the others ~`migrate.mjs:55-60`):
   ```js
   addCol('dealer_offer_optin', "dealer_offer_optin INTEGER NOT NULL DEFAULT 0");
   ```
2. Add the name to `REQUIRED_COLS` (`migrate.mjs:246-254`):
   ```js
   'dealer_offer_optin',
   ```

Miss step 1 or 2 and prod breaks on deploy. (This is the recurring trap — see memory `project-prod-migrations`.)

---

## Seller-facing capture (submit form)

**File:** `src/pages/listings/submit.astro`, Step 4 (Contact Information, lines 252-283), after the phone field (~line 273).

- **Only render for `listing_type === 'for_sale'`** — show_off builds aren't for sale.
- **Opt-IN, not pre-checked.** Unchecked by default. Optional (never blocks submit). Framed as a benefit.
- The checkbox text doubles as **POPIA consent** to share their details with a dealer (same principle as the finance-lead consent at `[slug].astro:408-411`). Style it like that `.fin-consent` block (small, muted, accent-color checkbox).

Suggested copy:

> ☐ **Open to a dealer offer?** Tick to let a vetted Land Cruiser dealer make you a direct cash offer on this vehicle — a fast, hassle-free alternative to a private sale. We'll only share your details with a dealer if you tick this. You can still sell privately.

Wiring:
- Give it `id="f-dealer-optin"`.
- Add to the POST payload assembled ~`submit.astro:984-1002`:
  ```js
  dealer_offer_optin: (document.getElementById('f-dealer-optin') as HTMLInputElement)?.checked || false,
  ```
- No change to the Step-3/Step-4 validation (lines 916-942) — it's optional.

---

## API wiring

**File:** `src/pages/api/listings/index.ts` (the POST handler).

1. Destructure with a safe default (~lines 16-23):
   ```js
   dealer_offer_optin = false,
   ```
2. Add to the insert `values({...})` (~lines 36-57):
   ```js
   dealer_offer_optin: dealer_offer_optin === true,
   ```
3. **Admin notification email** (~lines 59-79): add one line to the existing "[LCSA] New listing pending" email body so Wesley sees it instantly without opening admin:
   ```
   Dealer offer opt-in: YES   // only show the line when true
   ```

**File:** `src/pages/api/listings/[id].ts` (the PATCH handler, ~lines 16-66): add `dealer_offer_optin` to the set of updatable fields, so Wesley can toggle it from the admin edit page (needed for sellers who already submitted — e.g. Jared).

---

## Admin surfacing

Two small additions; no new page needed for V1.

**1. Listings dashboard** (`src/pages/admin/index.astro`)
- Add a filter toggle **"Wants dealer offer"** alongside the existing toggles (Price Drops / Posted to IG, ~lines 304-374) → filters `dealer_offer_optin = true`.
- Add a small badge on cards where opted in (card display ~lines 402-490), e.g. an amber "🏷️ Dealer offer" pill, so it's visible at a glance.

**2. Listing edit page** (`src/pages/admin/listings/[id].astro`)
- Add a checkbox/toggle in the Status & Type section (form ~lines 88-243), mirroring the `featured` toggle, bound to `dealer_offer_optin`. This is how Wesley flags **existing** listings (Jared's already-live Meano V8) without the seller re-submitting.

> Upgrade (optional, not V1): a dedicated `/admin/dealer-opt-ins` page using `AdminLayout` + the insights leads-table pattern (`admin/insights.astro:900-953`), with a funnel metric (opt-ins ÷ for-sale submissions). Only worth it once volume justifies a working queue.

---

## Handling Jared / existing listings

Jared already submitted and verbally consented over WhatsApp. Don't wait for the build — once the edit-page toggle (above) ships, just open his listing in admin and flip `dealer_offer_optin` on. Until then his consent is recorded in the WhatsApp thread and the dealer-sourcing-fee memory.

---

## Out of scope for V1 (future)

- **V2 deal/fee tracking** — a `dealer_deals` table (`listing_id`, `dealer`, `offer_amount`, `status: offered|accepted|declined`, `fee_amount`, `fee_status: due|invoiced|paid`, timestamps) to track money once terms with Andries exist. This is what "complete the loop with commercial terms" turns into.
- **Multi-dealer panel** — let 2-4 dealers bid; surface the best offer to the seller. Diversifies away from single-dealer lowball/dependency.
- **Public "request a dealer offer" button** on the seller's own listing, so already-listed sellers can opt in themselves rather than Wesley toggling it.
- Automated forwarding of opt-in listings to dealer email(s) (mirror `finance-lead.ts`'s `FINANCE_RECIPIENTS` → a `DEALER_RECIPIENTS`) — only once a written referral agreement is in place.

---

## File-by-file change checklist

| # | File | Change |
|---|------|--------|
| 1 | `src/db/schema.ts` (~L33) | Add `dealer_offer_optin` boolean column to `listings` |
| 2 | `scripts/migrate.mjs` (~L55-60) | Add `addCol('dealer_offer_optin', "... INTEGER NOT NULL DEFAULT 0")` |
| 3 | `scripts/migrate.mjs` (L246-254) | Add `'dealer_offer_optin'` to `REQUIRED_COLS` ⚠️ |
| 4 | `src/pages/listings/submit.astro` (~L273) | Add opt-in checkbox in Step 4, for_sale only |
| 5 | `src/pages/listings/submit.astro` (~L984-1002) | Add field to POST payload |
| 6 | `src/pages/api/listings/index.ts` (~L16-57) | Destructure + insert the field |
| 7 | `src/pages/api/listings/index.ts` (~L59-79) | Add "Dealer offer opt-in: YES" line to admin email |
| 8 | `src/pages/api/listings/[id].ts` (~L16-66) | Allow PATCH to update the field |
| 9 | `src/pages/admin/index.astro` (filters + cards) | Filter toggle + badge |
| 10 | `src/pages/admin/listings/[id].astro` (~L88-243) | Admin toggle (for existing listings) |

**Effort:** ~1.5 hours. Schema + migration is the only step with a sharp edge (the dual migrate.mjs entries); the rest is copy-the-existing-pattern.
