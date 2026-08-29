import type { TransportPreference, TransportRule } from '../types';
import type { TravelRouteEndpoint, TravelRouteSegment } from '../types/travel';

export class RealRouteUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RealRouteUnavailableError';
  }
}

export const MAX_ROUTE_MATRIX_CONCURRENCY = 3;

export type RouteSegmentFetcher = (
  origin: TravelRouteEndpoint,
  destination: TravelRouteEndpoint,
  preference: TransportPreference,
  rule: Pick<TransportRule, 'defaultMode'> & Partial<Pick<TransportRule, 'walkMaxKm' | 'maxTransitMinutes' | 'maxWalkToStationKm'>>,
) => Promise<TravelRouteSegment>;

export async function buildRealDurationMatrix(
  nodes: TravelRouteEndpoint[],
  preference: TransportPreference,
  rule: Pick<TransportRule, 'defaultMode'> & Partial<Pick<TransportRule, 'walkMaxKm' | 'maxTransitMinutes' | 'maxWalkToStationKm'>>,
  fetchSegment: RouteSegmentFetcher,
): Promise<{
  node_ids: string[];
  durations: number[][];
  segments: TravelRouteSegment[];
  failedPairs?: Array<{ originId: string; destinationId: string; reason: string }>;
}> {
  const uniqueNodes = Array.from(new Map(nodes.map(node => [node.id, node])).values());
  if (uniqueNodes.length !== nodes.length) {
    throw new RealRouteUnavailableError('真实路线矩阵节点 ID 必须唯一。');
  }
  const segments: TravelRouteSegment[] = [];
  const failedPairs: Array<{ originId: string; destinationId: string; reason: string }> = [];
  const durations = Array.from({ length: nodes.length }, () => Array(nodes.length).fill(0));
  const pairs: Array<{ origin: TravelRouteEndpoint; destination: TravelRouteEndpoint; originIndex: number; destinationIndex: number }> = [];
  nodes.forEach((origin, originIndex) => {
    nodes.forEach((destination, destinationIndex) => {
      if (originIndex === destinationIndex) return;
      pairs.push({ origin, destination, originIndex, destinationIndex });
    });
  });
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const pair = pairs[cursor++];
      if (!pair) return;
      try {
        const segment = await fetchSegment(pair.origin, pair.destination, preference, rule);
        if (segment.status !== 'available' || segment.durationMinutes === null || segment.durationMinutes <= 0) {
          throw new RealRouteUnavailableError(`${pair.origin.name} → ${pair.destination.name} 暂无高德真实路线。`);
        }
        durations[pair.originIndex][pair.destinationIndex] = segment.durationMinutes;
        segments.push(segment);
      } catch (error) {
        failedPairs.push({
          originId: pair.origin.id,
          destinationId: pair.destination.id,
          reason: error instanceof Error ? error.message : '真实路线请求失败。',
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_ROUTE_MATRIX_CONCURRENCY, Math.max(1, pairs.length)) }, () => worker()));
  return { node_ids: nodes.map(node => node.id), durations, segments, failedPairs };
}
