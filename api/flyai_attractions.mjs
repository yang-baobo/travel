import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = resolve(projectRoot, 'node_modules/@fly-ai/flyai-cli/dist/flyai-bundle.cjs');
const TRUSTED_IMAGE_HOSTS = ['alicdn.com', 'tbcdn.cn', 'alibabausercontent.com'];
const TRUSTED_BOOKING_HOSTS = ['feizhu.com', 'fliggy.com', 'alitrip.com'];
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let memoryCache = null;

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

function trustedHttpsUrl(value, trustedHosts) {
  const url = cleanText(value);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:') return null;
    return trustedHosts.some(suffix => host === suffix || host.endsWith(`.${suffix}`)) ? url : null;
  } catch {
    return null;
  }
}

export function buildFlyAiPoiArgs() {
  return [cliPath, 'search-poi', '--city-name', '北京', '--poi-level', '5'];
}

export function adaptFlyAiAttraction(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const sourcePoiId = cleanText(raw.id);
  const name = cleanText(raw.name);
  const imageUrl = trustedHttpsUrl(raw.mainPic, TRUSTED_IMAGE_HOSTS);
  if (!sourcePoiId || !name || !imageUrl) return null;
  const jumpUrl = trustedHttpsUrl(raw.jumpUrl, TRUSTED_BOOKING_HOSTS);
  const ticket = raw.ticketInfo && typeof raw.ticketInfo === 'object' && !Array.isArray(raw.ticketInfo)
    ? {
        itemId: cleanText(raw.ticketInfo.itemId),
        name: cleanText(raw.ticketInfo.ticketName),
        priceText: cleanText(raw.ticketInfo.price),
      }
    : null;
  return {
    id: `fliggy:${sourcePoiId}`,
    source: 'fliggy',
    sourcePoiId,
    city: '北京',
    name,
    address: cleanText(raw.address),
    latitude: finiteNumber(raw.latitude),
    longitude: finiteNumber(raw.longitude),
    category: cleanText(raw.category),
    poiLevel: cleanText(raw.poiLevel),
    description: cleanText(raw.description),
    imageUrl,
    jumpUrl,
    ticket,
  };
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return errorResponse(response, 405, 'METHOD_NOT_ALLOWED', '景点图片只接受 GET');
  }

  const now = Date.now();
  if (memoryCache && memoryCache.expiresAt > now) {
    response.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
    return response.status(200).json(memoryCache.payload);
  }

  const apiKey = String(process.env.FLYAI_API_KEY ?? '').trim();
  if (!apiKey) return errorResponse(response, 503, 'ATTRACTION_PROVIDER_NOT_CONFIGURED', 'FlyAI 服务端凭证未配置');
  if (!existsSync(cliPath)) return errorResponse(response, 503, 'ATTRACTION_PROVIDER_NOT_CONFIGURED', 'FlyAI 官方 CLI 未安装在服务端运行环境');

  let stdout;
  try {
    ({ stdout } = await execFileAsync(process.execPath, buildFlyAiPoiArgs(), {
      cwd: projectRoot,
      env: { ...process.env, FLYAI_API_KEY: apiKey },
      encoding: 'utf8',
      timeout: 40_000,
      maxBuffer: 5 * 1024 * 1024,
    }));
  } catch (error) {
    if (error?.killed || error?.signal === 'SIGTERM') {
      return errorResponse(response, 504, 'ATTRACTION_PROVIDER_TIMEOUT', 'FlyAI 景点搜索超时');
    }
    const stderr = String(error?.stderr ?? '');
    if (/Invalid API key|HTTP 401|HTTP 403/i.test(stderr)) {
      return errorResponse(response, 502, 'ATTRACTION_PROVIDER_AUTHENTICATION', 'FlyAI 凭证无效或没有景点搜索权限');
    }
    return errorResponse(response, 502, 'ATTRACTION_PROVIDER_UNAVAILABLE', 'FlyAI 景点搜索暂时不可用');
  }

  let payload;
  try {
    payload = JSON.parse(String(stdout).trim());
  } catch {
    return errorResponse(response, 502, 'ATTRACTION_PROVIDER_MALFORMED_RESPONSE', 'FlyAI 返回了无法识别的数据格式');
  }
  if (!payload || typeof payload !== 'object' || payload.status !== 0) {
    return errorResponse(response, 502, 'ATTRACTION_PROVIDER_UNAVAILABLE', 'FlyAI 景点搜索返回失败状态');
  }
  const items = payload.data?.itemList;
  if (!Array.isArray(items)) {
    return errorResponse(response, 502, 'ATTRACTION_PROVIDER_MALFORMED_RESPONSE', 'FlyAI 响应缺少 itemList 数组');
  }

  const attractions = items.map(adaptFlyAiAttraction).filter(Boolean);
  const responsePayload = {
    attractions,
    meta: {
      source: 'fliggy',
      city: '北京',
      count: attractions.length,
      imageMeaning: 'FlyAI 景点 mainPic；与同条景点名称绑定',
      generatedAt: new Date(now).toISOString(),
    },
  };
  memoryCache = { payload: responsePayload, expiresAt: now + CACHE_TTL_MS };
  response.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
  return response.status(200).json(responsePayload);
}
