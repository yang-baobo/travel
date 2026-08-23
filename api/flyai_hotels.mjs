import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
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
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

export function normalizeSearchRequest(value) {
  const body = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const destination = cleanText(body.destination);
  if (!destination || destination.length > 80) throw new TypeError('destination 必须填写');
  if (!validDate(body.checkInDate) || !validDate(body.checkOutDate)) {
    throw new TypeError('入住和退房日期格式必须为 YYYY-MM-DD');
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
  response.status(200).json({
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
  });
}
