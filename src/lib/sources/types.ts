export interface DiscoveredRef {
  source: string;
  source_id: string;
  source_url: string;
}

export interface NormalizedListing {
  source: string;
  source_id: string;
  source_url: string;
  title: string;
  model: string;
  year: number;
  price: number;
  mileage: number;
  province: string;
  new_or_used: 'New' | 'Used';
  transmission: 'manual' | 'automatic';
  colour: string;
  description: string;
  photos: string[];
  seller_name: string;
  // Adapter-declared segment override (e.g. 'other-4x4' for non-Toyota game
  // viewers from the keyword crawl). When absent, ingest derives it from model.
  segment?: string;
  fuel_type?: string;
  fuel_consumption?: number;
  power_kw?: number;
  seats?: number;
  co2?: number;
}

export type LivenessResult = 'live' | 'removed' | 'unknown';

// Per-run discovery telemetry — populated by an adapter's discover() so the
// ingest script can report penetration (found vs source-reported total) and
// whether a pagination cap was hit. Read after discover() resolves.
export interface DiscoverStats {
  sourceTotal: number | null; // total the source's own counter reported for our queries; null if not exposed
  capHit: boolean;            // a pagination ceiling was reached this run — we may be truncating
}

export interface SourceAdapter {
  source: string;
  discover(): Promise<DiscoveredRef[]>;
  fetchListing(ref: DiscoveredRef): Promise<NormalizedListing | null>;
  isStillLive(ref: DiscoveredRef): Promise<LivenessResult>;
}
