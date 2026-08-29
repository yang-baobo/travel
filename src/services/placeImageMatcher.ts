import type { FliggyAttractionEditorial, TravelPlace } from '../types/travel';

export type VerifiedPlaceImage = {
  imageUrl: string;
  source: 'fliggy';
  sourcePoiId: string;
  matchMethod: 'exact_name_and_geo' | 'exact_name_and_address';
  confidence: number;
  distanceMeters: number | null;
  evidence: string;
};

export type ResolvedPlaceImage = {
  imageUrl: string | null;
  imageSource: 'amap' | 'fliggy' | 'none';
  flyaiSourcePoiId: string | null;
  matchEvidence: string | null;
};

export const PLACE_IMAGE_SOURCE_LABEL: Record<ResolvedPlaceImage['imageSource'], string> = {
  amap: '高德图',
  fliggy: 'FLYAI 图',
  none: '暂无图片',
};

const MAX_MATCH_DISTANCE_METERS = 1_500;

/** Normalize only punctuation/spacing variants; never performs fuzzy matching. */
export function normalizePlaceName(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/^\s*北京市/, '')
    .replace(/[\s·•・()（）\[\]【】\-—_]/g, '')
    .toLocaleLowerCase();
}

/** Strict identity helper; never performs substring or fuzzy matching. */
export function samePlaceName(left: string, right: string): boolean {
  return normalizePlaceName(left) === normalizePlaceName(right);
}

function normalizeAddress(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFKC')
    .replace(/[\s·•・,，。()（）\-—_]/g, '')
    .toLocaleLowerCase();
}

function distanceMeters(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
): number {
  const earthRadius = 6_371_000;
  const latitudeDelta = (right.latitude - left.latitude) * Math.PI / 180;
  const longitudeDelta = (right.longitude - left.longitude) * Math.PI / 180;
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(left.latitude * Math.PI / 180)
      * Math.cos(right.latitude * Math.PI / 180)
      * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function addressTokens(value: string): string[] {
  const normalized = normalizeAddress(value);
  const tokens = normalized.match(/[\u4e00-\u9fa5]{2,10}(?:区|路|街|巷|门|号|园|桥|站)/g) || [];
  return Array.from(new Set(tokens));
}

function addressEvidence(place: TravelPlace, candidate: FliggyAttractionEditorial): string | null {
  const placeAddress = normalizeAddress(`${place.district || ''}${place.address || ''}`);
  const candidateAddress = normalizeAddress(candidate.address);
  if (!placeAddress || !candidateAddress) return null;

  const district = normalizeAddress(place.district);
  if (district && district.length >= 2 && candidateAddress.includes(district)) {
    return `行政区一致：${place.district}`;
  }

  const sharedToken = addressTokens(placeAddress).find(token => candidateAddress.includes(token));
  return sharedToken ? `地址交集：${sharedToken}` : null;
}

function coordinatesFor(place: TravelPlace): { latitude: number; longitude: number } | null {
  const latitude = Number(place.location?.latitude);
  const longitude = Number(place.location?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

function candidateCoordinates(candidate: FliggyAttractionEditorial): { latitude: number; longitude: number } | null {
  const latitude = Number(candidate.latitude);
  const longitude = Number(candidate.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

/**
 * Find one FlyAI image only when it is provably the same POI.
 * Name equality is mandatory; coordinates or address provide the second
 * independent identity signal. A fuzzy-name-only match always returns null.
 */
export function matchFlyAiImage(
  place: TravelPlace,
  candidates: FliggyAttractionEditorial[],
  usedSourcePoiIds: ReadonlySet<string> = new Set(),
): VerifiedPlaceImage | null {
  const normalizedName = normalizePlaceName(place.name);
  if (!normalizedName) return null;

  for (const candidate of candidates) {
    if (!candidate.imageUrl || !candidate.sourcePoiId || usedSourcePoiIds.has(candidate.sourcePoiId)) continue;
    if (!samePlaceName(candidate.name, place.name)) continue;

    const placeCoordinates = coordinatesFor(place);
    const candidateCoordinatesValue = candidateCoordinates(candidate);
    if (placeCoordinates && candidateCoordinatesValue) {
      const distance = distanceMeters(placeCoordinates, candidateCoordinatesValue);
      if (distance > MAX_MATCH_DISTANCE_METERS) continue;
      const confidence = Math.max(0.9, 0.995 - distance / 100_000);
      return {
        imageUrl: candidate.imageUrl,
        source: 'fliggy',
        sourcePoiId: candidate.sourcePoiId,
        matchMethod: 'exact_name_and_geo',
        confidence,
        distanceMeters: Math.round(distance),
        evidence: `名称完全一致；坐标距离 ${Math.round(distance)} 米`,
      };
    }

    const evidence = addressEvidence(place, candidate);
    if (evidence) {
      return {
        imageUrl: candidate.imageUrl,
        source: 'fliggy',
        sourcePoiId: candidate.sourcePoiId,
        matchMethod: 'exact_name_and_address',
        confidence: 0.9,
        distanceMeters: null,
        evidence: `名称完全一致；${evidence}`,
      };
    }
  }
  return null;
}

/** Apply the display priority while preserving image provenance metadata. */
export function resolvePlaceImage(
  place: TravelPlace,
  candidates: FliggyAttractionEditorial[],
  usedSourcePoiIds: ReadonlySet<string> = new Set(),
): ResolvedPlaceImage {
  const amapImage = place.photoUrls.find(url => Boolean(url)) || null;
  if (amapImage) {
    return { imageUrl: amapImage, imageSource: 'amap', flyaiSourcePoiId: null, matchEvidence: null };
  }
  const verified = matchFlyAiImage(place, candidates, usedSourcePoiIds);
  if (!verified) {
    return { imageUrl: null, imageSource: 'none', flyaiSourcePoiId: null, matchEvidence: null };
  }
  return {
    imageUrl: verified.imageUrl,
    imageSource: 'fliggy',
    flyaiSourcePoiId: verified.sourcePoiId,
    matchEvidence: verified.evidence,
  };
}

export const placeImageMatchPolicy = {
  maxDistanceMeters: MAX_MATCH_DISTANCE_METERS,
} as const;
