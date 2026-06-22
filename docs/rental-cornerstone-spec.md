# Cornerstone Spec — Land Cruiser Rental (SA)

**Status:** draft for build · **Owner:** Wesley · **Drafted:** 2026-06-22
**Page:** `/useful-info/land-cruiser-rental-south-africa/`

> **Strategic frame.** Rental is high transactional intent, already converting
> (#3.5, ~14% CTR), and — crucially — *white space*: no one owns "Land Cruiser
> rental" as a category, and no trackable affiliate exists. So per the locked
> [monetization philosophy] this is **not** a lead-gen page. It's a two-step play:
> **(1) own the category with the definitive resource** (this spec), which **(2)
> becomes the skeleton of a booking platform** — the "Booking.com for Land Cruiser
> stuff" moat — if/when we choose to go there. The comparison table *is* the
> future inventory list. Build v1 so v3 is a natural extension, not a rewrite.

---

## 1. Goals & success metrics
- **Be the single best SA Land Cruiser rental resource** — genuinely useful enough to be cited (by users and LLMs) and to keep readers on-page.
- **Protect & grow the ranking** for "land cruiser rental south africa" + sibling queries (this extends bet **P5** in the prediction ledger).
- **Lift engagement** from signpost-level to destination-level (target: avg engagement time and pages/session up — measure in GA4 + Plausible against the 2026-06-22 benchmark).
- **Lay the booking-platform foundation** (structured operator data + comparison UX).
- Explicitly **not** a goal: lead-gen revenue. v1 earns its keep as authority/traffic/moat.

---

## 2. Page structure (v1)
Keep it as the existing MDX post (preserves FAQ schema, post layout, SEO) and embed Astro components for the interactive parts.

1. **Hero + direct answer** — what renting a kitted LC in SA involves, who it's for.
2. **"Which rental is right for you?"** — interactive decision helper (see §4).
3. **Operator comparison table** — the centrepiece (see §3).
4. **Operator profiles** — short, honest write-up per operator (current prose, expanded).
5. **What it costs** — seasonal rate ranges, deposit, excess, km policy, cross-border fees.
6. **What good kit looks like** — equipment checklist (largely existing content).
7. **Cross-border & routes** — which operators allow which countries; link to route guides.
8. **Pre-collection checklist + breakdown/puncture questions** (existing, keep).
9. **FAQ** (FAQPage schema — expand existing).

---

## 3. Operator data model  ⭐ (the reusable core / future inventory)
Store as `src/data/rental-operators.ts` (mirrors `partners.ts`). Forward-compatible
with a booking platform. Per operator:

```ts
interface RentalOperator {
  slug: string;
  name: string;
  website: string;            // editorial outbound (rel="noopener", NOT sponsored — no paid deal)
  logo?: string;
  // Location & coverage
  basedIn: string[];          // e.g. ["Midrand, Gauteng"]
  pickupPoints: string[];     // e.g. ["OR Tambo", "Cape Town Intl"]
  countriesCovered: string[]; // ["South Africa","Namibia","Botswana",...]
  // Fleet
  vehicles: {
    model: string;            // "Land Cruiser 79 Double Cab"
    sleeps: number;
    rooftopTents: number;
    selfDrive: boolean;       // vs guided
  }[];
  // What's included
  equipment: string[];        // ["Rooftop tent","Fridge","Dual battery + solar","Recovery kit",...]
  // Commercials
  pricePerDayZar?: { low: number; high: number };  // seasonal range, ZAR
  minRentalDays?: number;
  unlimitedKm?: boolean;
  depositNote?: string;
  excessNote?: string;
  crossBorder: boolean;
  oneWay?: boolean;
  // Trust (accuracy = the citation moat — be honest about confidence)
  rating?: { value: number; source: 'Google'|'Trustpilot'|'TripAdvisor'; count: number; verified: boolean };
  yearsOperating?: number;
  usp: string;                // one-line standout
  lastVerified: string;       // ISO date — show "verified <date>" + "confirm before booking"
  // --- Future (booking platform) — unused in v1 but reserved ---
  bookingMethod?: 'website'|'enquiry'|'platform';
  partnerStatus?: 'none'|'contacted'|'agreed';
  commissionPct?: number;
}
```

**Accuracy rules:** never publish an unverified review number as fact (use
`verified:false` → render qualitatively, e.g. "well-reviewed", not "4.7/129").
Always show `lastVerified` + a "confirm rates/terms before booking" line. Stale
operator data is worse than none — it breaks the trust the whole strategy rests on.

**v1 seed set (researched 2026-06-22):** Bushlore, Voetspore, Adventus, SA 4x4
Rentals, Asco (+ optionally Avis Safari, Bushtrackers). Bushlore 4.7/Google and
Asco 4.7/Trustpilot are *verified*; others render qualitatively until confirmed.

---

## 4. "Which rental is right for you?" — decision helper
Lightweight client-side filter (no backend). Inputs → filters/ranks the operator list:
- **Start city / region** (Cape Town side vs JHB side vs Namibia) → matches `basedIn`/`pickupPoints`
- **Cross-border?** (yes/no + which country) → `crossBorder`/`countriesCovered`
- **Group size** → `vehicles.sleeps`
- **Self-drive vs guided** → `vehicles.selfDrive`
- **Budget band** → `pricePerDayZar`
- **Trip length** → respects `minRentalDays`

Output: ranked shortlist of matching operators (re-uses the table rows). Pure
utility = dwell time + genuine help. Degrades gracefully with JS off (full table still shows).

---

## 5. Technical approach
- **Data:** `src/data/rental-operators.ts` (typed, version-controlled, like partners).
- **Components:** `RentalComparisonTable.astro` (server-rendered, sortable via small client script) + `RentalFinder.astro` (the helper, client-side filtering). Embed both in the MDX (we already import `PostCTA` into MDX — same pattern).
- **SEO/schema:** keep the URL + FAQPage. Add `ItemList` JSON-LD for the operators. Only emit aggregate rating schema where `verified:true`.
- **Links:** editorial outbound to operators — `rel="noopener"` (NOT `sponsored`; no paid relationship). No UTM (not lead-gen).

---

## 6. Phasing (v1 → moat)
- **Phase 1 — Cornerstone (this spec):** data file + comparison table + finder + cost depth + routes + schema. Pure authority. *No monetization.* Ship, then let it gather a month vs the benchmark.
- **Phase 2 — Decision point (philosophy-gated):** do NOT add leaky enquiry/lead-gen. Only proceed if we commit to facilitating the transaction (Phase 3). Otherwise stay at Phase 1 as an authority asset.
- **Phase 3 — Booking moat ("Booking.com for LC"):** availability calendar, on-site enquiry→booking, payment (Yoco/Payfast/Stripe), commission taken on our terms. Requires operator partnerships (`partnerStatus`), payments, and ops. Major build — the operator data model above is deliberately its foundation. Spec separately when we choose to commit.

---

## 7. Open questions / risks
- **Operator buy-in** for Phase 3 — would Bushlore/Voetspore/Adventus list with us and accept a commission? (No need to answer for v1; flag for Phase 2.)
- **Data freshness** — who re-verifies operator rates/terms, and how often? (Quarterly? A `lastVerified` audit.)
- **Review verification** — Google blocks scraping; some ratings stay qualitative until manually confirmed.
- **Measurement** — a content+UX revamp blurs the isolated P5 URL test; accept it as a combined "rental cornerstone" bet and track engagement + the rental queries together.
- **Scope creep** — keep v1 to authority + comparison; resist drifting into half-built booking features.

---

## 8. Definition of done (v1)
- `rental-operators.ts` populated + verified for the seed set with `lastVerified`.
- Comparison table + finder live and embedded, graceful without JS.
- Cost/cross-border/routes sections written; FAQ + ItemList schema valid.
- Accurate, honest, no unverified numbers stated as fact.
- Old URLs still 301; new URL ranking watched via P5.
