# Land Cruiser SA — Indicative Valuation Certificate v1 (Build-Ready Spec)

> **Status:** Final v1 specification. Decisive. Build from this without further design.
> **Depends on:** the shipped valuation tool (`src/lib/valuation.ts`, `POST /api/valuation`, `valuation_requests` table).
> **House disclaimer phrase (canonical — import `VALUATION_DISCLAIMER`, never re-type):**
> *"Estimates from observed asking prices, not confirmed sale prices — and not a finance or insurance valuation."*

---

## 0. What this is (and what it is deliberately NOT)

A one-click **PDF certificate** generated off a valuation result: a branded, dated, uniquely-numbered document stating an *indicative market value* for a specific vehicle's declared spec, backed by the live-comp methodology we already run.

This is the **free indicative tier** of the two-tier plan (see `docs/` discussion / monetization notes). It is **NOT**:

- an *accredited* valuation (there is no statutory vehicle-valuer accreditation in SA — authority is de facto, earned via track record or borrowed via a data partner; out of scope here);
- an *independent* valuation for related-party transactions (a cert generated on our own platform fails the arm's-length test — stated explicitly on the document);
- a *VIN-verified* valuation (VIN is captured-only, never decoded/verified in v1 — that's the paid tier, gated on a NaTIS/Lightstone/mSure data partnership).

The honesty framing is **load-bearing and printed on the artifact**, exactly as it is in the tool. The certificate must never read as more authoritative than the number behind it.

**Strategic role:** top-of-funnel authority surface + accuracy-receipt accumulator. Every cert is a timestamped, verifiable prediction that the asking-vs-selling ledger can later score. It costs us ~one PDFShift credit and earns a shareable, branded document that carries the brand into WhatsApp groups, dealer desks, and email threads.

---

## 1. Scope (IN / OUT)

| IN v1 | OUT (deferred) |
|---|---|
| "Download certificate (PDF)" action on the valuation result card | "Prepared for [name]" identity line (→ v1.1, needs `/privacy`) |
| `POST /api/valuation-certificate` — recompute + render + PDFShift + store + persist row | VIN capture **on the cert** / VIN decode / verification (→ paid tier) |
| `valuation_certificates` table (vehicle + valuation; **optional email** with consent) | QR code on the PDF (→ v1.1; v1 prints the verify URL + cert ID as text) |
| **Optional "email me a copy"** → Resend with PDF attached (consent-gated) | Multi-currency / multi-vehicle / portfolio certs |
| **Minimal `/privacy` page** (POPIA gate for the optional email — prerequisite) | Accredited / independent / finance-grade framing |
| HTML certificate template (`src/lib/certificate.ts`) | TransUnion/Lightstone book-value line (paid data) |
| PDFShift integration (`renderPdf`) with R2 caching by `cert_id` | Indexable cert pages (verify page is `noindex`) |
| Public verify page `GET /valuation/certificate/[certId]` (valid/expired + PDF link) | |
| 30-day validity stamp + expiry handling | |
| Per-IP rate limit, honeypot, draft-linked, no-cert-when-unavailable | |

**Governing principle (inherited):** *we only make a claim we can defend.* No estimate (`confidence: 'none'`) → no certificate. The button simply isn't shown.

---

## 2. Data model — `valuation_certificates`

New table. Per `scripts/migrate.mjs` convention: a **new table uses `CREATE TABLE IF NOT EXISTS`** — do **NOT** add these to `REQUIRED_COLS` (that guard is the `listings` table only). Mirror the `valuation_requests`/`valuation_feedback` block. Future columns go through the idempotent `addCol` pattern shown there.

> ⚠️ **Prod-migration trap** (see memory `project-prod-migrations`): the table must be created in `scripts/migrate.mjs`, not only in `src/db/schema.ts`. Drizzle schema alone does not run on deploy — `migrate.mjs` does. Miss this and the first cert request 500s prod.

```sql
CREATE TABLE IF NOT EXISTS valuation_certificates (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  cert_id        TEXT    NOT NULL UNIQUE,     -- public slug, e.g. 'LCSA-2026-7F3K9Q'
  draft_id       INTEGER,                     -- FK→valuation_requests.id (linkage, nullable)
  -- vehicle (declared, denormalised onto the cert so it's immutable)
  model          TEXT    NOT NULL,
  year           INTEGER NOT NULL,
  mileage        INTEGER NOT NULL,
  condition      TEXT,
  province       TEXT,
  spec_label     TEXT,                         -- specLabel(), e.g. '2.5 D-4D Raised Body'
  cohort_label   TEXT,                         -- e.g. '2014–2018 2.5 D-4D Raised Body Fortuner D-4D'
  -- the valuation as issued (immutable point-in-time snapshot)
  sell_low       INTEGER NOT NULL,
  sell_mid       INTEGER NOT NULL,
  sell_high      INTEGER NOT NULL,
  asking_ceiling INTEGER NOT NULL,
  confidence     TEXT    NOT NULL,
  cohort_size    INTEGER,
  cohort_p25     INTEGER,
  cohort_p75     INTEGER,
  cohort_p90     INTEGER,
  -- artifact
  pdf_url        TEXT,                         -- R2 public URL (null until first render succeeds)
  issued_at      INTEGER NOT NULL,             -- unix ts
  expires_at     INTEGER NOT NULL,             -- issued_at + 30 days
  -- optional email delivery (PII — only present if the user opted in)
  email          TEXT,                         -- null unless "email me a copy" was used
  consent_at     INTEGER,                      -- ts of POPIA consent; non-null iff email non-null
  emailed_at     INTEGER,                      -- ts the Resend send succeeded
  source_path    TEXT,
  utm_source     TEXT
);
CREATE INDEX IF NOT EXISTS valuation_certificates_cert ON valuation_certificates (cert_id);
CREATE INDEX IF NOT EXISTS valuation_certificates_draft ON valuation_certificates (draft_id);
```

Add the matching `sqliteTable` to `src/db/schema.ts` (mirroring the existing style) so the app's Drizzle queries are typed. The cert itself is anonymous; **`email`/`consent_at` are the only PII**, populated *only* when the user opts into "email me a copy" — which is why the minimal `/privacy` page is a v1.0 prerequisite (§8).

**`cert_id` format:** `LCSA-<year>-<6 chars>`, charset Crockford base32 (no `0/O/1/I`), from `crypto.randomBytes`. Collision-checked against the unique index (retry on the astronomically-rare clash). Human-readable enough to quote over the phone.

**Validity:** 30 days. Market moves and the cohort shifts; a short window is both honest and a re-engagement hook. The verify page flips to **EXPIRED** past `expires_at` (data still shown, clearly stamped stale).

---

## 3. Endpoint — `POST /api/valuation-certificate`

`export const prerender = false`. Built to mirror `POST /api/valuation` (same validation, same honeypot, same IP limiter — import/reuse, don't fork the logic).

**Request body** (same shape the form already POSTs, so the client just re-sends what it has):
```jsonc
{
  "model": "fortuner-d4d", "year": 2016, "mileage": 145000,
  "condition": "good", "province": "Gauteng",
  "engine": "2.5 D-4D", "grade": null, "body": "Raised Body",  // spec axes (optional)
  "draftId": 1234,                                              // optional, for linkage
  "email": "wes@example.com",                                  // optional — "email me a copy"
  "consent": true,                                             // required iff email present (POPIA)
  "utm_source": null, "source_path": "/valuation/",
  "lcsa_hp": ""                                                 // honeypot
}
```

**Flow:**
1. Honeypot (`lcsa_hp` non-empty → silent `{ ok: true }`). Reuse `clientIp` + a **dedicated, tighter limiter** (e.g. `MAX_HITS = 6` per 10-min window — each call can cost a PDFShift credit).
2. Validate **identically** to `/api/valuation` (model in `LC_MODEL_SLUG_SET`, year in `MODEL_YEAR_RANGE`, mileage 0–600k, spec via `isSpecValue`). On fail → 400 with the same messages.
3. **Recompute** with `valuate(input)` — **server-side, never trust client prices.** Spec axes come from the body because `valuation_requests` does not persist them; `draftId` is linkage only. If `!v.available` → `400 { error: 'No certifiable estimate for this vehicle.' }` (button shouldn't have shown, but guard anyway).
4. Mint `cert_id`. Compute `issued_at = now`, `expires_at = now + 30d`.
5. `buildCertificateHtml(certData)` → HTML string (§5).
6. `renderPdf(html)` → PDF `Buffer` via PDFShift (§4). On PDFShift failure: log, return `502 { error: 'Certificate service unavailable, please retry.' }` — **do not** persist a row without a PDF.
7. Store PDF to R2 at `certificates/<cert_id>.pdf` (reuse the R2 helper in `src/lib/sources/r2.ts` — confirm exact export at build); get public `pdf_url`.
8. **Email (optional):** if `email` is a valid address **and** `consent === true`, send via Resend (reuse the `sendSellerLiveEmail` pattern in `src/lib/seller-live-email.ts` — same `RESEND_API_KEY`) with the PDF as an attachment (`attachments: [{ filename, content: <base64> }]`) and the verify link in the body. Set `emailed_at` on success. **Best-effort** — a Resend failure must not fail the request (the user still has the download). If `email` is present but `consent !== true`, ignore the email silently (don't store it).
9. Insert the `valuation_certificates` row (best-effort try/catch like the snapshot insert, but here the row is the receipt — if the insert throws, still return the PDF; log loudly). Persist `email`/`consent_at` **only** when consented.
10. Respond:
```json
{ "ok": true, "certId": "LCSA-2026-7F3K9Q",
  "pdfUrl": "https://<r2>/certificates/LCSA-2026-7F3K9Q.pdf",
  "verifyUrl": "https://landcruisersa.co.za/valuation/certificate/LCSA-2026-7F3K9Q",
  "expiresAt": 1750000000 }
```

**Idempotency / cost guard:** if the request carries a `draftId` that already has a cert row **and** that row is unexpired, return the existing `cert_id`/`pdf_url` instead of re-rendering (saves a PDFShift credit and keeps one cert per valuation). New compute → new cert.

Client then triggers the download from `pdfUrl` (and we surface the `verifyUrl`).

---

## 4. PDFShift integration — `src/lib/certificate.ts`

```ts
// Env, following the repo convention (import.meta.env ?? process.env):
const PDFSHIFT_API_KEY = import.meta.env.PDFSHIFT_API_KEY ?? process.env.PDFSHIFT_API_KEY ?? '';
```
Set it as a Fly secret: `fly secrets set PDFSHIFT_API_KEY=… -a landcruisersa`. Add to `.env` for local. If the key is missing, `renderPdf` throws a clear error and the endpoint returns 502 (never silently emit a broken/blank cert).

**Call (PDFShift v3):**
```ts
const res = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
  method: 'POST',
  headers: {
    // PDFShift uses HTTP Basic auth: username 'api', password = API key.
    'Authorization': 'Basic ' + Buffer.from('api:' + PDFSHIFT_API_KEY).toString('base64'),
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    source: html,           // raw HTML string
    format: 'A4',
    margin: '0',            // template owns its own padding
    use_print: true,        // honour print CSS
    sandbox: SANDBOX,       // true in dev → no credit billed, adds a watermark
  }),
});
if (!res.ok) throw new Error(`PDFShift ${res.status}: ${await res.text()}`);
const pdf = Buffer.from(await res.arrayBuffer());
```
- `SANDBOX = import.meta.env.DEV` (or an explicit `PDFSHIFT_SANDBOX` flag) so local/dev builds never burn credits.
- **Remote rendering caveat:** PDFShift fetches the HTML on its own servers, so **every asset URL in the template must be absolute** (`https://landcruisersa.co.za/...`), never root-relative. Logo, fonts, any image. Use `SITE_URL` (`process.env.SITE_URL ?? 'https://landcruisersa.co.za'`). Prefer fully inlined CSS + an inlined/absolute logo to avoid font-loading races.
- **Cost:** PDFShift bills per conversion. Defences: the tighter rate limit (§3.1), the draft-dedup guard (§3), `sandbox` in dev, and R2 caching so a given cert renders exactly once. Log every live (non-sandbox) conversion so spend is auditable.

`certificate.ts` exports: `buildCertificateHtml(data): string`, `renderPdf(html): Promise<Buffer>`, and the `cert_id` minting helper.

---

## 5. The certificate template (HTML → PDF)

Single self-contained HTML doc, inline `<style>`, print-first. Brand palette from the result card: amber `#F5A623`, near-black `#111`, white. A4 portrait.

**Layout, top → bottom:**

1. **Header band** — Land Cruiser SA logo (absolute URL) + wordmark, right-aligned title **"Indicative Market Valuation"**. Subtle full-bleed `INDICATIVE` watermark behind the body (low-opacity, diagonal) so the document can never be passed off as a formal/accredited valuation.
2. **Certificate meta row** — `Certificate No. LCSA-2026-7F3K9Q` · `Issued 23 June 2026` · `Valid until 23 July 2026`.
3. **Vehicle block** — Year + model label + spec label (e.g. *2016 Toyota Fortuner — 2.5 D-4D Raised Body*), Mileage, Condition (declared), Province. Label each as **"declared by requester"** — we did not inspect the vehicle.
4. **The valuation (hero)** — large **realistic-sell range** `R{sellLow} – R{sellHigh}`, with `sellMid` as the headline figure and `asking_ceiling` shown as *"Typical asking for a vehicle like this."* Confidence badge (High/Medium/Low) with the same dot-colour language as the on-site card.
5. **Methodology box** — plain-English, citing the real numbers: *"Based on {cohort_size} comparable Land Cruiser SA listings ({cohort_label}) observed up to {issued date}. Method: median comparable asking price, adjusted for mileage and condition, discounted to a realistic private-sale figure using an industry trade proxy. Observed market spread (25th–75th percentile): R{p25} – R{p75}."* This transparency **is** the credibility — show the working.
6. **Disclaimers (boxed, unmissable)** —
   - the canonical `VALUATION_DISCLAIMER`;
   - *"This is an indicative market estimate, not an accredited, finance, or insurance valuation."*
   - *"Not an independent valuation for related-party or tax purposes — for those, obtain a valuation from a party unconnected to the transaction."* (directly serves the SARS-style use case honestly);
   - *"Based on details declared by the requester; the vehicle was not physically inspected."*
7. **Footer** — verify line: *"Verify this certificate at landcruisersa.co.za/valuation/certificate/LCSA-2026-7F3K9Q"* + the cert ID repeated. Generated timestamp. Source attribution. (QR code → v1.1.)

Keep it to **one page**. The on-screen card stays the interactive surface; the PDF is the portable, quotable artifact.

---

## 6. Verify page — `GET /valuation/certificate/[certId].astro`

`prerender = false`, SSR. The trust anchor that makes the document non-repudiable.

- Look up `cert_id`. **404** if unknown.
- Render the same vehicle + valuation + methodology data as HTML (reuse the cert data shape).
- Status banner: **VALID** (green) if `now < expires_at`, else **EXPIRED** (amber/grey) — data still shown, clearly stamped stale.
- **"Download PDF"** button → `pdf_url` (R2). If `pdf_url` is null (render failed earlier), offer a "regenerate" that re-hits the endpoint.
- `<meta name="robots" content="noindex">` — these are thin, per-vehicle, and we don't want them in the index.
- No PII shown (there is none in v1.0).

This page is what a buyer, dealer, or financier visits to confirm a forwarded certificate is genuine and current — the whole reason a unique cert ID exists.

---

## 7. Front-end — result card hook (`src/components/ValuationTool.astro`)

The result card is injected via client `innerHTML` (global `.vt` styles). Add to the rendered result, **only when `estimate` is present** (hidden for `confidence: 'none'`):

- A secondary button **"Download valuation certificate (PDF)"** beside/under the existing `.vr-btn`.
- **Optional email row:** a collapsed *"Email me a copy"* control revealing an `email` input + a **consent checkbox** — *"I agree to Land Cruiser SA storing my email to send this certificate ([privacy policy](/privacy))."* The download path works with both fields empty; the email only sends when the box is ticked. Sending an email without a ticked consent box is a client-side no-op (and the server ignores it anyway).
- On click: POST the **same input payload** the page already holds (plus `email`/`consent` if provided) to `/api/valuation-certificate`; show a brief spinner (PDFShift round-trip is ~1–3s); on success open `pdfUrl` in a new tab and reveal a small line: *"Certificate {certId} — verify at {verifyUrl}"* (and *"Sent to {email}"* if emailed). On error show an inline retry message.
- Reuse the existing fetch/error patterns in the component's client script; no framework, plain JS.

Microcopy under the button: *"A shareable, dated PDF of this estimate. Indicative — not an accredited or independent valuation."* (sets expectations, mirrors the disclaimer).

---

## 8. POPIA & abuse

- **The certificate is anonymous; the only PII is the optional email.** The cert artifact and the row hold vehicle + valuation only — unless the user opts into "email me a copy," which captures `email` + `consent_at`. Because that capture exists, a **minimal `/privacy` page is a v1.0 prerequisite** (POPIA: lawful basis = consent, stated purpose = sending this certificate). No email/consent → no PII stored, download still works.
- **`/privacy` (minimal, ship with v1.0):** who the responsible party is, what's collected (email, for sending the certificate), purpose limitation (we don't market off it unless separately opted-in), retention, and the data-subject rights + contact (`info@landcruisersa.co.za`). A single static Astro page; this same page unblocks the deferred dealer-lead capture later, so it's reused, not throwaway.
- **Identity name + VIN remain held to v1.1** (more PII, more consent surface) — the email is the *only* PII we take on in v1.0.
- **Abuse/cost:** tighter per-IP limiter (≈6/10min), honeypot, recompute-server-side (no client-supplied prices), draft-dedup, dev `sandbox`, R2 cache (one render per cert). Log every live conversion.
- **Misrepresentation risk:** mitigated by the `INDICATIVE` watermark, the boxed disclaimers, the 30-day expiry, and the public verify page (anyone can check a cert is genuine and current).

---

## 9. Build checklist (in order)

1. `valuation_certificates` table → **`scripts/migrate.mjs`** (`CREATE TABLE IF NOT EXISTS` + indexes; **not** `REQUIRED_COLS`) **and** mirror in `src/db/schema.ts`.
2. `src/lib/certificate.ts` — `buildCertificateHtml`, `renderPdf` (PDFShift, Basic auth, sandbox-in-dev, absolute asset URLs), `cert_id` minter.
3. **`/privacy` minimal page** (§8) — prerequisite for the optional email capture.
4. `POST /api/valuation-certificate` — validate (reuse `/api/valuation` logic) → `valuate()` → mint → HTML → PDF → R2 → optional Resend email (consent-gated) → insert → respond. Dedup on unexpired `draftId`.
5. `GET /valuation/certificate/[certId].astro` — verify page (valid/expired, PDF link, `noindex`).
6. `ValuationTool.astro` — "Download certificate" button + optional email+consent row + client POST + verify-line reveal.
7. `PDFSHIFT_API_KEY` → Fly secret + `.env`. Confirm R2 helper export name. (`RESEND_API_KEY` already set.)
8. Verify end-to-end against a live prod-data cohort (e.g. the 2016 Fortuner 2.5 D-4D RB used in this session — there are real D-4D comps in prod): cert renders, R2 stores, verify page resolves, expiry math correct, optional email arrives with the PDF attached, dev runs in sandbox (no credits burned).

**Deferred to v1.1:** "Prepared for [name]" + VIN on cert (more PII/consent surface), QR code. **Paid tier (separate spec):** VIN-verified, data-partner-backed *certified* valuation — the genuinely accredited document, gated on a NaTIS/Lightstone/mSure data partnership.
