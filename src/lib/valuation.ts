import { getCohortStats, getModelSupply, type CohortStats } from '@/lib/market-position';
import { MODEL_LAUNCH_YEAR, modelLabel } from '@/lib/sources/normalize';

// Land Cruiser valuation engine. Turns user-entered (model, year, mileage,
// condition) into an HONEST realistic-sell range plus a suggested asking ceiling,
// built from live comparable asking prices via getCohortStats.
//
// Parameters below were validated by the A2 bracket test against ~2,100 real
// listings (scripts/valuation-bracket-test.mjs): ~68% of listings fall inside
// the computed band, the rest are genuinely cheap/dear — the structural ceiling
// for a market-comp tool without per-VIN spec data. The framing is therefore
// "realistic-sell estimate + the real cohort spread", never a false-precise point.

const DEPRECIATION_RATE = 0.0000018;   // fraction of value per km (~0.18% per 1,000 km)
const MILEAGE_CAP = 0.15;              // ± cap on the mileage adjustment
const SELL_DISCOUNT = 0.10;            // asking → realistic private-sale: conservative industry proxy
const NEW_VEHICLE_DISCOUNT = 0.04;     // young cohort (near-MSRP cars)
const CONDITION_FACTOR: Record<string, number> = { excellent: 0.03, good: 0, fair: -0.05, rough: -0.12 };
const TIER_WIDTH = { high: 0.06, medium: 0.09, low: 0.13 } as const;

const CUR_YEAR = new Date().getFullYear();

// Canonical house disclaimer — imported by the endpoint and every page that
// shows an estimate, so the honesty framing is byte-identical everywhere.
export const VALUATION_DISCLAIMER =
  'Estimates from observed asking prices, not confirmed sale prices — and not a finance or insurance valuation.';

export type Confidence = 'high' | 'medium' | 'low' | 'none';

export interface ValuationInput {
  model: string;
  year: number;
  mileage: number;
  condition?: 'excellent' | 'good' | 'fair' | 'rough';
  province?: string; // captured for routing, not used in the math
}

export interface CohortContext {
  label: string;
  size: number;
  medianPrice: number;
  p25: number;
  p75: number;
  p90: number;
  minPrice: number;
  maxPrice: number;
  avgMileage: number | null;
  modelSupply: number;
  anchorBasis: 'delisted' | 'active';
}

export interface Valuation {
  available: true;
  sellLow: number;
  sellMid: number;
  sellHigh: number;
  askingCeiling: number;
  confidence: Exclude<Confidence, 'none'>;
  confidenceReasons: string[];
  mileageAdjusted: boolean;
  isYoung: boolean;
  cohort: CohortContext;
}

export interface NoValuation {
  available: false;
  confidence: 'none';
  cohortSize: number;
  modelSupply: number;
  modelLabel: string;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// Proportional rounding — coarser on expensive cars, finer on cheap ones, so a
// R1.7m estimate doesn't show false R1,000 precision and a R180k one doesn't jump.
function roundRand(x: number): number {
  return x >= 400000 ? Math.round(x / 5000) * 5000
    : x >= 150000 ? Math.round(x / 2000) * 2000
    : Math.round(x / 1000) * 1000;
}

export function valuate(input: ValuationInput): Valuation | NoValuation {
  // target: 10 — seek a stable cohort so a thin (5-comp) year-window doesn't
  // land on a noisy median that values an older year above a newer one.
  const c = getCohortStats({ model: input.model, year: input.year }, { target: 10 });
  if (!c) {
    return {
      available: false,
      confidence: 'none',
      cohortSize: 0,
      modelSupply: getModelSupply(input.model),
      modelLabel: modelLabel(input.model),
    };
  }
  return computeFromCohort(input, c);
}

function computeFromCohort(input: ValuationInput, c: CohortStats): Valuation {
  const launch = MODEL_LAUNCH_YEAR[input.model] ?? 0;
  const isYoung =
    (CUR_YEAR - input.year) <= 2 ||
    c.cohortMinYear >= CUR_YEAR - 2 ||
    (launch !== 0 && input.year <= launch + 1);
  const d = isYoung ? NEW_VEHICLE_DISCOUNT : SELL_DISCOUNT;

  // Mileage delta — flat %-of-value, capped. A heuristic (not a per-cohort fit),
  // so it fires whenever we have ≥3 km comps and the user gave mileage, including
  // young cohorts. Fewer km than the cohort average ⇒ positive adjustment.
  let M = 0;
  let mileageAdjusted = false;
  if (c.avgMileage !== null && c.kmCompCount >= 3 && input.mileage > 0) {
    M = clamp(
      c.medianPrice * DEPRECIATION_RATE * (c.avgMileage - input.mileage),
      -MILEAGE_CAP * c.medianPrice,
      MILEAGE_CAP * c.medianPrice,
    );
    mileageAdjusted = true;
  }
  const base = c.medianPrice + M;

  // Confidence from cohort size, then downgrade one step on any weak-input signal.
  let tier: Exclude<Confidence, 'none'> = c.cohortSize >= 12 ? 'high' : c.cohortSize >= 8 ? 'medium' : 'low';
  // Weak-input signals downgrade confidence one step (and are surfaced to the
  // user). NB: every v1 estimate is asking-price-based by design — that honesty
  // lives in the disclaimer and the sell discount, not a per-result penalty.
  const reasons: string[] = [];
  if (c.span === 3) reasons.push('Widened to a 7-year span to find enough comparable vehicles.');
  if (!mileageAdjusted) reasons.push('Mileage not factored — too few comparable listings report it.');
  else if (c.kmCompCount < 5) reasons.push('Mileage factored from a small sample.');
  if (isYoung) reasons.push('Recent model — limited used-market depreciation data.');
  if (reasons.length) tier = tier === 'high' ? 'medium' : 'low';

  // IQR floor: a wide/skewed cohort shows an honestly wide band, not false precision.
  let w: number = TIER_WIDTH[tier];
  if (c.medianPrice > 0) w = Math.max(w, 0.5 * (c.p75 - c.p25) / c.medianPrice);

  // Realistic-sell band (NO condition/extras — a buyer won't pay for self-report).
  // Symmetric around the mileage-adjusted mid. NB: no cohort-p25 compound floor —
  // it inverted the band (sellLow > sellMid) for high-mileage cars whose estimate
  // legitimately falls below the cohort's 25th percentile. The mileage cap (±15%)
  // and the discount already bound how low the mid can go.
  const sellMid = base * (1 - d);
  const sellLow = sellMid * (1 - w);
  const sellHigh = sellMid * (1 + w);

  // "Typical asking" for a car like this = the mileage/condition-adjusted asking
  // MIDPOINT (not an inflated ceiling). Kept at/above the top of the realistic-
  // sell band (you list above what you'll take) and never above the 90th pct of
  // real comparable asking. NB: previously base×(1+w) clamped up to p75, which
  // printed a "list at" number ~21% above the sell estimate AND above the shown
  // range — confusing, and it ignored the subject's mileage at the p75 floor.
  const condFactor = 1 + (CONDITION_FACTOR[input.condition ?? 'good'] ?? 0);
  const askingCeiling = clamp(base * condFactor, sellHigh, c.p90);

  return {
    available: true,
    sellLow: roundRand(sellLow),
    sellMid: roundRand(sellMid),
    sellHigh: roundRand(sellHigh),
    askingCeiling: roundRand(askingCeiling),
    confidence: tier,
    confidenceReasons: reasons,
    mileageAdjusted,
    isYoung,
    cohort: {
      label: c.cohortLabel,
      size: c.cohortSize,
      medianPrice: c.medianPrice,
      p25: c.p25,
      p75: c.p75,
      p90: c.p90,
      minPrice: c.minPrice,
      maxPrice: c.maxPrice,
      avgMileage: c.avgMileage,
      modelSupply: c.modelSupply,
      anchorBasis: c.anchorBasis,
    },
  };
}
