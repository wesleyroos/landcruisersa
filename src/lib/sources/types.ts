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
  fuel_type?: string;
  fuel_consumption?: number;
  power_kw?: number;
  seats?: number;
  co2?: number;
}

export type LivenessResult = 'live' | 'removed' | 'unknown';

export interface SourceAdapter {
  source: string;
  discover(): Promise<DiscoveredRef[]>;
  fetchListing(ref: DiscoveredRef): Promise<NormalizedListing | null>;
  isStillLive(ref: DiscoveredRef): Promise<LivenessResult>;
}
