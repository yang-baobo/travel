import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  CacheMiss,
  CacheMissReason,
  ensureRefreshJob,
  hotelSearchQueryHash,
  readCache,
  upsertCache,
} from './db/node_repository.mjs';

const execFileAsync = promisify(execFile);

// Hotel cache TTLs per DATA_CACHE_EXECUTION_FRAMEWORK.md:
//   fresh 10 minutes, stale until 30 minutes, expired after that.
const HOTEL_FRESH_MS = 10 * 60 * 1000;
const HOTEL_STALE_MS = 30 * 60 * 1000;
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = resolve(
  projectRoot,
  'node_modules/@fly-ai/flyai-cli/dist/flyai-bundle.cjs',
);
const PRICE_DISCLAIMER = '飞猪搜索参考价，可能随房型、库存和下单时间变化；最终价格以飞猪预订页为准。';
const TRUSTED_BOOKING_HOSTS = ['feizhu.com', 'fliggy.com', 'alitrip.com'];
const SORT_MAP = {
  none: 'no_rank',
  price_asc: 'price_asc',
  price_desc: 'price_desc',
  distance_candidate: 'distance_asc',
};

function errorResponse(response, status, code, message) {
  response.status(status).json({ detail: { code, message } });
}

function cleanText(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function finiteNumber(value) {
  if (typeof value === 'boolean' || value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function coordinate(value, limit) {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= -limit && parsed <= limit ? parsed : null;
}

function referencePrice(value) {
  if (typeof value === 'boolean' || value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const text = cleanText(value);
  if (!text || /[xX*]/.test(text)) return null;
  const match = text.replaceAll(',', '').match(/(?:¥|￥)?\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function trustedBookingUrl(value) {
  const url = cleanText(value);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:') return null;
    return TRUSTED_BOOKING_HOSTS.some(suffix => host === suffix || host.endsWith(`.${suffix}`))
      ? url
      : null;
  } catch {
    return null;
  }
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return Number.isFinite(parsed.getTime())
    && parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function localTodayISO(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function normalizeSearchRequest(value) {
  const body = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const destination = cleanText(body.destination);
  if (!destination || destination.length > 80) throw new TypeError('destination 必须填写');
  if (!validDate(body.checkInDate) || !validDate(body.checkOutDate)) {
    throw new TypeError('入住和退房日期格式必须为 YYYY-MM-DD');
  }
  if (body.checkInDate < localTodayISO()) {
    const error = new TypeError('入住日期不能早于今天，请重新选择日期');
    error.code = 'HOTEL_DATE_IN_PAST';
    throw error;
  }
  if (body.checkOutDate <= body.checkInDate) throw new TypeError('退房日期必须晚于入住日期');
  const sortBy = body.sortBy ?? 'none';
  if (sortBy === 'rating') {
    const error = new Error('当前 FlyAI 酒店评分字段不稳定，暂不支持按评分排序');
    error.code = 'HOTEL_CAPABILITY_UNAVAILABLE';
    throw error;
  }
  if (!(sortBy in SORT_MAP)) throw new TypeError('不支持该排序方式');
  const maxReferencePrice = body.maxReferencePrice === null || body.maxReferencePrice === undefined
    ? null
    : finiteNumber(body.maxReferencePrice);
  if (body.maxReferencePrice !== null && body.maxReferencePrice !== undefined
      && (maxReferencePrice === null || maxReferencePrice <= 0)) {
    throw new TypeError('最高参考价必须大于 0');
  }
  let stars = null;
  if (body.stars !== null && body.stars !== undefined) {
    if (!Array.isArray(body.stars)) throw new TypeError('酒店星级必须是数组');
    stars = [...new Set(body.stars)].sort();
    if (!stars.length || stars.some(star => !Number.isInteger(star) || star < 1 || star > 5)) {
      throw new TypeError('酒店星级必须在 1 到 5 之间');
    }
  }
  const keyword = cleanText(body.keyword);
  const poiName = cleanText(body.poiName);
  if ((keyword?.length ?? 0) > 80 || (poiName?.length ?? 0) > 80) {
    throw new TypeError('关键词长度不能超过 80');
  }
  return {
    destination,
    checkInDate: body.checkInDate,
    checkOutDate: body.checkOutDate,
    maxReferencePrice,
    stars,
    keyword,
    poiName,
    sortBy,
  };
}

export function buildFlyAiArgs(params) {
  const args = [
    cliPath,
    'search-hotel',
    '--dest-name', params.destination,
    '--check-in-date', params.checkInDate,
    '--check-out-date', params.checkOutDate,
  ];
  if (params.maxReferencePrice !== null) args.push('--max-price', String(params.maxReferencePrice));
  if (params.stars) args.push('--hotel-stars', params.stars.join(','));
  if (params.keyword) args.push('--key-words', params.keyword);
  if (params.poiName) args.push('--poi-name', params.poiName);
  args.push('--sort', SORT_MAP[params.sortBy]);
  return args;
}

export function adaptFlyAiHotel(raw, params) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const sourceHotelId = cleanText(raw.shId);
  const name = cleanText(raw.name);
  if (!sourceHotelId || !name) return null;
  const priceText = cleanText(raw.price);
  const latitude = coordinate(raw.latitude, 90);
  const longitude = coordinate(raw.longitude, 180);
  const bookingUrl = [raw.detailUrl, raw.jumpUrl, raw.bookingUrl]
    .map(trustedBookingUrl)
    .find(Boolean) ?? null;
  const tags = [cleanText(raw.brandName), cleanText(raw.star)].filter(Boolean);
  return {
    id: `fliggy:${sourceHotelId}`,
    source: 'fliggy',
    sourceHotelId,
    name,
    city: cleanText(raw.city),
    district: cleanText(raw.district),
    address: cleanText(raw.address),
    latitude,
    longitude,
    coordinateSource: latitude !== null && longitude !== null ? 'provider' : null,
    coordinateVerified: false,
    geoStatus: 'unresolved',
    geoMatchLevel: null,
    geoConfidence: null,
    amapPoiId: null,
    geocodedAt: null,
    star: finiteNumber(raw.starLevel),
    starLabel: cleanText(raw.star),
    rating: finiteNumber(raw.rate),
    reviewCount: null,
    referencePrice: referencePrice(raw.price),
    priceText,
    priceCurrency: priceText?.trimStart().startsWith('¥') || priceText?.trimStart().startsWith('￥') ? 'CNY' : null,
    priceType: 'search_reference',
    priceDisclaimer: PRICE_DISCLAIMER,
    originalPrice: referencePrice(raw.originalPrice),
    roomInformation: null,
    roomAvailability: null,
    imageUrl: cleanText(raw.mainPic),
    tags,
    facilities: null,
    distanceMeters: null,
    nearbyText: cleanText(raw.interestsPoi),
    bookingUrl,
    checkInDate: params.checkInDate,
    checkOutDate: params.checkOutDate,
  };
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return errorResponse(response, 405, 'METHOD_NOT_ALLOWED', '酒店搜索只接受 POST');
  }
  const apiKey = String(process.env.FLYAI_API_KEY ?? '').trim();
  if (!apiKey) return errorResponse(response, 503, 'HOTEL_PROVIDER_NOT_CONFIGURED', 'FlyAI 服务端凭证未配置');
  if (!existsSync(cliPath)) return errorResponse(response, 503, 'HOTEL_PROVIDER_NOT_CONFIGURED', 'FlyAI 官方 CLI 未安装在服务端运行环境');

  let params;
  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    params = normalizeSearchRequest(body);
  } catch (error) {
    const code = error?.code ?? 'HOTEL_INVALID_REQUEST';
    return errorResponse(response, 422, code, error instanceof Error ? error.message : '酒店查询参数无效');
  }

  // ── Phase 3 cache: read snapshot before starting the CLI ───────────────────
  const queryParams = {
    destination: params.destination,
    checkInDate: params.checkInDate,
    checkOutDate: params.checkOutDate,
    maxReferencePrice: params.maxReferencePrice,
    stars: params.stars,
    keyword: params.keyword,
    poiName: params.poiName,
    sortBy: params.sortBy,
  };
  const cached = await readCache('fliggy', 'hotel_search', queryParams);
  if (!(cached instanceof CacheMiss) && (cached.tier === 'fresh' || cached.tier === 'stale')) {
    const payloadOut = cached.payload ?? {};
    const hotels = Array.isArray(payloadOut.hotels) ? payloadOut.hotels : [];
    // A stale price snapshot must never masquerade as a live price.
    const isPriceStale = cached.tier === 'stale';
    if (cached.tier === 'stale') {
      // Serve stale immediately; enqueue a deduplicated refresh job.
      await ensureRefreshJob('hotel', 'fliggy', 'hotel_search', queryParams);
    }
    return response.status(200).json({
      ...payloadOut,
      meta: {
        ...payloadOut.meta,
        cacheStatus: cached.tier,
        fetchedAt: cached.fetched_at,
        expiresAt: cached.expires_at,
        staleUntil: cached.stale_until,
        isPriceStale,
      },
    });
  }

  let stdout;
  try {
    ({ stdout } = await execFileAsync(process.execPath, buildFlyAiArgs(params), {
      cwd: projectRoot,
      env: { ...process.env, FLYAI_API_KEY: apiKey },
      encoding: 'utf8',
      timeout: 40_000,
      maxBuffer: 5 * 1024 * 1024,
    }));
  } catch (error) {
    // Provider failed: try to serve a stale snapshot as graceful degradation
    // (price marked stale), never expose the provider error to the page.
    if (!(cached instanceof CacheMiss) && cached.payload?.hotels) {
      return response.status(200).json({
        ...cached.payload,
        meta: {
          ...cached.payload.meta,
          cacheStatus: 'stale',
          fetchedAt: cached.fetched_at,
          expiresAt: cached.expires_at,
          staleUntil: cached.stale_until,
          isPriceStale: true,
        },
      });
    }
    if (error?.killed || error?.signal === 'SIGTERM') {
      return errorResponse(response, 504, 'HOTEL_PROVIDER_TIMEOUT', 'FlyAI 酒店搜索超时');
    }
    const stderr = String(error?.stderr ?? '');
    if (/Invalid API key|HTTP 401|HTTP 403/i.test(stderr)) {
      return errorResponse(response, 502, 'HOTEL_PROVIDER_AUTHENTICATION', 'FlyAI 凭证无效或没有酒店搜索权限');
    }
    return errorResponse(response, 502, 'HOTEL_PROVIDER_UNAVAILABLE', 'FlyAI 酒店搜索暂时不可用');
  }

  let payload;
  try {
    payload = JSON.parse(String(stdout).trim());
  } catch {
    return errorResponse(response, 502, 'HOTEL_PROVIDER_MALFORMED_RESPONSE', 'FlyAI 返回了无法识别的数据格式');
  }
  if (!payload || typeof payload !== 'object' || payload.status !== 0) {
    return errorResponse(response, 502, 'HOTEL_PROVIDER_UNAVAILABLE', 'FlyAI 酒店搜索返回失败状态');
  }
  const items = payload.data?.itemList;
  if (!Array.isArray(items)) {
    return errorResponse(response, 502, 'HOTEL_PROVIDER_MALFORMED_RESPONSE', 'FlyAI 响应缺少 itemList 数组');
  }
  const hotels = items.map(item => adaptFlyAiHotel(item, params)).filter(Boolean);
  const responseBody = {
    hotels,
    meta: {
      source: 'fliggy',
      count: hotels.length,
      queryStatus: hotels.length ? 'ok' : 'no_results',
      priceMeaning: 'search_reference',
      priceDisclaimer: PRICE_DISCLAIMER,
      nearbyPrecision: params.poiName ? 'candidate_recall_only' : 'not_requested',
      ratingAvailable: hotels.some(hotel => hotel.rating !== null),
    },
  };

  // Persist: query snapshot + hotel_properties + date-bound price snapshots.
  const fetchedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + HOTEL_FRESH_MS).toISOString();
  const staleUntil = new Date(Date.now() + HOTEL_STALE_MS).toISOString();
  await upsertCache('fliggy', 'hotel_search', queryParams, responseBody, {
    fetchedAt,
    expiresAt,
    staleUntil,
  });
  await persistHotels(hotels, queryParams, fetchedAt, expiresAt, staleUntil);

  response.status(200).json({
    ...responseBody,
    meta: {
      ...responseBody.meta,
      cacheStatus: 'miss',
      fetchedAt,
      expiresAt,
      staleUntil,
      isPriceStale: false,
    },
  });
}

// ── Persistence helpers ────────────────────────────────────────────────────────

/**
 * Upsert hotel base properties (7-day fresh / 30-day stale) and date-bound
 * price snapshots (10-min fresh / 30-min stale). A search price never becomes
 * a hotel's permanent price: prices live only in hotel_price_snapshots tied to
 * (source_hotel_id, check_in, check_out).
 */
async function persistHotels(hotels, queryParams, fetchedAt, expiresAt, staleUntil) {
  try {
    const { getPool } = await import('./db/node_repository.mjs');
    if (!hotels.length) return;
    const pool = await getPool();
    if (!pool) return;
    const qh = hotelSearchQueryHash(queryParams);
    const now = new Date();
    const propertyFresh = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const propertyStale = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    for (const hotel of hotels) {
      await pool.query(
        `INSERT INTO hotel_properties (
           source, source_hotel_id, name, city, district, address, star, star_label,
           rating, review_count, image_url, tags_json, facilities_json,
           latitude_provider, longitude_provider, booking_url,
           fetched_at, refreshed_at, expires_at, stale_until
         ) VALUES (
           'fliggy', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb,
           $13, $14, $15, $16, NOW(), $17, $18
         )
         ON CONFLICT (source, source_hotel_id) DO UPDATE SET
           name            = EXCLUDED.name,
           city            = EXCLUDED.city,
           district        = EXCLUDED.district,
           address         = EXCLUDED.address,
           star            = EXCLUDED.star,
           star_label      = EXCLUDED.star_label,
           rating          = EXCLUDED.rating,
           review_count    = EXCLUDED.review_count,
           image_url       = EXCLUDED.image_url,
           tags_json       = EXCLUDED.tags_json,
           facilities_json = EXCLUDED.facilities_json,
           latitude_provider  = EXCLUDED.latitude_provider,
           longitude_provider = EXCLUDED.longitude_provider,
           booking_url     = EXCLUDED.booking_url,
           fetched_at      = EXCLUDED.fetched_at,
           refreshed_at    = NOW(),
           expires_at      = EXCLUDED.expires_at,
           stale_until     = EXCLUDED.stale_until`,
        [
          hotel.sourceHotelId,
          hotel.name,
          hotel.city,
          hotel.district,
          hotel.address,
          hotel.star,
          hotel.starLabel,
          hotel.rating,
          hotel.reviewCount,
          hotel.imageUrl,
          JSON.stringify(hotel.tags ?? []),
          JSON.stringify(hotel.facilities ?? []),
          hotel.latitude,
          hotel.longitude,
          hotel.bookingUrl,
          fetchedAt,
          propertyFresh,
          propertyStale,
        ],
      );
      // Date-bound price snapshot; keyed by hotel + dates (+ guests).
      await pool.query(
        `INSERT INTO hotel_price_snapshots (
           source_hotel_id, check_in, check_out, guests, price, price_type,
           price_description, room_availability, jump_url, query_hash,
           fetched_at, expires_at, stale_until
         ) VALUES ($1, $2, $3, $4, $5, 'search_reference', $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT DO NOTHING`,
        [
          hotel.sourceHotelId,
          queryParams.checkInDate,
          queryParams.checkOutDate,
          null,
          hotel.referencePrice,
          hotel.priceText,
          hotel.roomAvailability,
          hotel.bookingUrl,
          qh,
          fetchedAt,
          expiresAt,
          staleUntil,
        ],
      );
    }
  } catch {
    // Persistence is best-effort; the response still succeeds without DB.
  }
}
