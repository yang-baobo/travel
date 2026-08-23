import type { TravelRouteSegment } from '../types/travel';

export interface RealRouteValidationIssue {
  code: 'real_route_unavailable' | 'invalid_real_duration';
  day: number;
  message: string;
}

export function validateTravelRouteSegments(segments: TravelRouteSegment[]): RealRouteValidationIssue[] {
  const issues: RealRouteValidationIssue[] = [];
  segments.forEach(segment => {
    if (segment.status !== 'available' || segment.durationMinutes === null) {
      issues.push({
        code: 'real_route_unavailable',
        day: 0,
        message: `${segment.originName} → ${segment.destinationName} 暂无可用高德路线。`,
      });
      return;
    }
    const sameEndpoint = segment.originId === segment.destinationId;
    if (segment.durationMinutes < 0 || (segment.durationMinutes === 0 && !sameEndpoint)) {
      issues.push({
        code: 'invalid_real_duration',
        day: 0,
        message: `${segment.originName} → ${segment.destinationName} 的真实交通耗时无效。`,
      });
    }
  });
  return issues;
}
