import type { TransportPreference, TransportRule } from '../types';
import type { TravelRouteEndpoint, TravelRouteSegment } from '../types/travel';

export class RealRouteUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RealRouteUnavailableError';
  }
}

export type RouteSegmentFetcher = (
  origin: TravelRouteEndpoint,
  destination: TravelRouteEndpoint,
  preference: TransportPreference,
  rule: Pick<TransportRule, 'defaultMode'>,
) => Promise<TravelRouteSegment>;

export async function buildRealDurationMatrix(
  nodes: TravelRouteEndpoint[],
  preference: TransportPreference,
  rule: Pick<TransportRule, 'defaultMode'>,
  fetchSegment: RouteSegmentFetcher,
): Promise<{
  node_ids: string[];
  durations: number[][];
  segments: TravelRouteSegment[];
}> {
  const uniqueNodes = Array.from(new Map(nodes.map(node => [node.id, node])).values());
  if (uniqueNodes.length !== nodes.length) {
    throw new RealRouteUnavailableError('真实路线矩阵节点 ID 必须唯一。');
  }
  const segments: TravelRouteSegment[] = [];
  const durations = Array.from({ length: nodes.length }, () => Array(nodes.length).fill(0));
  const pairs: Array<Promise<void>> = [];
  nodes.forEach((origin, originIndex) => {
    nodes.forEach((destination, destinationIndex) => {
      if (originIndex === destinationIndex) return;
      pairs.push((async () => {
        const segment = await fetchSegment(origin, destination, preference, rule);
        if (segment.status !== 'available' || segment.durationMinutes === null || segment.durationMinutes <= 0) {
          throw new RealRouteUnavailableError(`${origin.name} → ${destination.name} 暂无高德真实路线。`);
        }
        durations[originIndex][destinationIndex] = segment.durationMinutes;
        segments.push(segment);
      })());
    });
  });
  await Promise.all(pairs);
  return { node_ids: nodes.map(node => node.id), durations, segments };
}
