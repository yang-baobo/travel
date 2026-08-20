import { Flight, FlightClass, AirlineType, LuggageOption, TimePeriod } from '../types';

// 航空公司数据
const AIRLINES = {
  standard: [
    { code: 'CZ', name: '南方航空' },
    { code: 'CA', name: '中国国航' },
    { code: 'MU', name: '东方航空' },
    { code: 'HU', name: '海南航空' },
    { code: 'ZH', name: '深圳航空' },
  ],
  budget: [
    { code: '9C', name: '春秋航空' },
    { code: 'GJ', name: '长龙航空' },
    { code: 'AQ', name: '九元航空' },
  ],
};

// 基础价格矩阵 (经济舱基准)
const BASE_PRICES: Record<string, { standard: number; budget: number }> = {
  '2026-03-24': { standard: 860, budget: 520 },
  '2026-03-25': { standard: 920, budget: 580 },
  '2026-03-26': { standard: 780, budget: 450 },
  '2026-03-27': { standard: 850, budget: 510 },
  '2026-03-28': { standard: 1100, budget: 680 }, // 周末贵
  '2026-03-29': { standard: 1150, budget: 720 }, // 周末贵
  '2026-03-30': { standard: 830, budget: 490 },
  '2026-03-31': { standard: 800, budget: 460 },
  '2026-04-01': { standard: 890, budget: 540 },
  '2026-04-02': { standard: 950, budget: 600 },
  '2026-04-03': { standard: 1200, budget: 750 }, // 清明前贵
  '2026-04-04': { standard: 1350, budget: 850 }, // 清明假期最贵
};

// 舱位价格系数
const CABIN_MULTIPLIER: Record<FlightClass, number> = {
  economy: 1.0,
  premium: 1.6,
  first: 3.2,
};

// 出发时间段模板 - 直飞航班
const DIRECT_DEPARTURE_TIMES = [
  '06:30', '07:50', '09:10', '10:35', '12:05',
  '13:45', '15:20', '17:10', '19:00', '21:15',
];

// 出发时间段模板 - 中转航班
const CONNECTING_DEPARTURE_TIMES = [
  '06:00', '07:20', '08:40', '10:00', '11:30',
  '13:15', '14:50', '16:40', '18:30', '20:45',
];

// 飞行时间 (大连-深圳约3小时，经停+40~60min)
const DIRECT_DURATION = 185; // 3小时5分
const LAYOVER_DURATION_RANGE = [240, 280]; // 4小时~4小时40分

// 经停城市
const STOP_CITIES = ['武汉', '长沙', '南京', '青岛', '郑州'];

// 计算到达时间
function calcArrivalTime(dep: string, durationMin: number): string {
  const [h, m] = dep.split(':').map(Number);
  const totalMin = h * 60 + m + durationMin;
  const ah = Math.floor(totalMin / 60) % 24;
  const am = totalMin % 60;
  return `${String(ah).padStart(2, '0')}:${String(am).padStart(2, '0')}`;
}

// 生成航班号
function genFlightNo(airlineCode: string, idx: number): string {
  return `${airlineCode}${3000 + idx}`;
}

// 伪随机数 (基于种子)
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateFlightsForDate(date: string, direction: 'DLC-SZX' | 'SZX-DLC'): Flight[] {
  const flights: Flight[] = [];
  const prices = BASE_PRICES[date] || { standard: 900, budget: 550 };
  const dateSeed = date.split('-').map(Number).reduce((a, b) => a * 100 + b, 0);
  const dirSeed = direction === 'DLC-SZX' ? 1 : 2;

  const departureCity = direction === 'DLC-SZX' ? '大连' : '深圳';
  const arrivalCity = direction === 'DLC-SZX' ? '深圳' : '大连';
  const departureAirport = direction === 'DLC-SZX' ? '大连周水子国际机场' : '深圳宝安国际机场';
  const arrivalAirport = direction === 'DLC-SZX' ? '深圳宝安国际机场' : '大连周水子国际机场';

  let flightIdx = 0;

  // 生成航班的辅助函数
  const createFlightsForSlot = (
    i: number,
    isDirect: boolean,
    depTime: string,
  ) => {
    const slotGroupId = `${direction}-${date}-${isDirect ? 'direct' : 'connect'}-${i}`;
    const seed = dateSeed + dirSeed * 1000 + i + (isDirect ? 0 : 500);
    const rand = seededRandom(seed);

    // 决定航司类型: 前6班大概率普通航空, 后4班大概率廉航
    const isStandard = i < 6 ? rand > 0.2 : rand > 0.6;
    const airlineType: AirlineType = isStandard ? 'standard' : 'budget';
    const airlineList = AIRLINES[airlineType];
    const airline = airlineList[Math.floor(seededRandom(seed + 100) * airlineList.length)];

    const stopCity = isDirect ? undefined : STOP_CITIES[Math.floor(seededRandom(seed + 300) * STOP_CITIES.length)];
    const stopDurationMin = isDirect ? undefined : Math.floor(30 + seededRandom(seed + 400) * 40);
    const durationMin = isDirect
      ? DIRECT_DURATION + Math.floor(seededRandom(seed + 150) * 20 - 10)
      : LAYOVER_DURATION_RANGE[0] + Math.floor(seededRandom(seed + 500) * (LAYOVER_DURATION_RANGE[1] - LAYOVER_DURATION_RANGE[0]));

    // 给出发时间添加微小偏移 (±5分钟) 使同日航班时间不完全一致
    const [h, m] = depTime.split(':').map(Number);
    const offsetMin = Math.floor(seededRandom(seed + 700) * 10 - 5);
    const adjustedMin = Math.max(0, Math.min(59, m + offsetMin));
    const adjustedDepTime = `${String(h).padStart(2, '0')}:${String(adjustedMin).padStart(2, '0')}`;
    const arrTime = calcArrivalTime(adjustedDepTime, durationMin);

    const basePrice = airlineType === 'standard' ? prices.standard : prices.budget;
    const priceVariation = 1 + (seededRandom(seed + 600) * 0.3 - 0.15);

    const fuelSurcharge = airlineType === 'standard' ? 60 : 0;
    const airportTax = 0; // 已取消机建费

    const cabinConfigs: { cabin: FlightClass; luggage: LuggageOption; luggageAddOn: number }[] = [
      { cabin: 'economy', luggage: 'carryOnly', luggageAddOn: 0 },
      { cabin: 'economy', luggage: 'checked', luggageAddOn: airlineType === 'budget' ? 180 : 0 },
      { cabin: 'premium', luggage: 'checked', luggageAddOn: 0 },
      { cabin: 'first', luggage: 'checked', luggageAddOn: 0 },
    ];

    for (const config of cabinConfigs) {
      const cabinBase = Math.round(basePrice * priceVariation * CABIN_MULTIPLIER[config.cabin]);
      const routeDiscount = isDirect ? 1 : 0.9;
      const finalBase = Math.round(cabinBase * routeDiscount);
      const totalPrice = finalBase + fuelSurcharge + airportTax + config.luggageAddOn;

      flightIdx++;
      flights.push({
        id: `${direction}-${date}-${flightIdx}`,
        flightNo: genFlightNo(airline.code, flightIdx + (direction === 'SZX-DLC' ? 500 : 0)),
        airline: airline.name,
        airlineType,
        departureCity,
        arrivalCity,
        departureAirport,
        arrivalAirport,
        departureTime: adjustedDepTime,
        arrivalTime: arrTime,
        date,
        durationMin,
        cabin: config.cabin,
        basePrice: finalBase,
        luggageOption: config.luggage,
        luggageAddOnPrice: config.luggageAddOn,
        isDirect,
        stopCity,
        stopDurationMin,
        fuelSurcharge,
        airportTax,
        totalPrice,
        slotGroupId,
      });
    }
  };

  // 10 班直飞航班
  for (let i = 0; i < 10; i++) {
    createFlightsForSlot(i, true, DIRECT_DEPARTURE_TIMES[i]);
  }

  // 10 班中转航班
  for (let i = 0; i < 10; i++) {
    createFlightsForSlot(i, false, CONNECTING_DEPARTURE_TIMES[i]);
  }

  return flights;
}

// 生成所有日期的航班数据
function generateAllFlights(): Flight[] {
  const allFlights: Flight[] = [];
  const dates = Object.keys(BASE_PRICES);
  for (const date of dates) {
    allFlights.push(...generateFlightsForDate(date, 'DLC-SZX'));
    allFlights.push(...generateFlightsForDate(date, 'SZX-DLC'));
  }
  return allFlights;
}

export const mockFlights = generateAllFlights();

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function matchFlightTimePeriod(departureTime: string, period?: TimePeriod | 'any'): boolean {
  if (!period || period === 'any') return true;
  const minutes = timeToMinutes(departureTime);
  if (period === 'morning') return minutes >= 6 * 60 && minutes < 12 * 60;
  if (period === 'afternoon') return minutes >= 12 * 60 && minutes < 17 * 60;
  if (period === 'evening') return minutes >= 17 * 60 && minutes < 21 * 60;
  return minutes >= 21 * 60 || minutes < 6 * 60;
}

// 搜索航班
export function searchFlights(params: {
  departureCity: string;
  arrivalCity: string;
  date: string;
  cabin?: FlightClass | 'any';
  airlineType?: AirlineType | 'any';
  directOnly?: boolean;
  luggageOption?: LuggageOption | 'any';
  maxPrice?: number;
  timePeriod?: TimePeriod | 'any';
}): Flight[] {
  return mockFlights.filter(f => {
    if (f.departureCity !== params.departureCity) return false;
    if (f.arrivalCity !== params.arrivalCity) return false;
    if (f.date !== params.date) return false;
    if (params.cabin && params.cabin !== 'any' && f.cabin !== params.cabin) return false;
    if (params.airlineType && params.airlineType !== 'any' && f.airlineType !== params.airlineType) return false;
    if (params.directOnly && !f.isDirect) return false;
    if (params.luggageOption && params.luggageOption !== 'any' && f.luggageOption !== params.luggageOption) return false;
    if (params.maxPrice && f.totalPrice > params.maxPrice) return false;
    if (!matchFlightTimePeriod(f.departureTime, params.timePeriod)) return false;
    return true;
  }).sort((a, b) => a.totalPrice - b.totalPrice);
}

// 查找低价航班 (价格提醒用)
export function findCheapFlights(params: {
  departureCity: string;
  arrivalCity: string;
  excludeDate?: string;
  priceThreshold: number;
  cabin?: FlightClass | 'any';
}): Flight[] {
  return mockFlights.filter(f => {
    if (f.departureCity !== params.departureCity) return false;
    if (f.arrivalCity !== params.arrivalCity) return false;
    if (params.excludeDate && f.date === params.excludeDate) return false;
    if (f.totalPrice > params.priceThreshold) return false;
    if (params.cabin && params.cabin !== 'any' && f.cabin !== params.cabin) return false;
    return true;
  }).sort((a, b) => a.totalPrice - b.totalPrice);
}

// 获取某航班对应的超级经济舱选项 (用于自动升舱比较)
export function findPremiumAlternative(flight: Flight): Flight | null {
  if (flight.cabin !== 'economy') return null;
  return mockFlights.find(f =>
    f.date === flight.date &&
    f.departureCity === flight.departureCity &&
    f.arrivalCity === flight.arrivalCity &&
    f.departureTime === flight.departureTime &&
    f.airline === flight.airline &&
    f.cabin === 'premium'
  ) || null;
}

// 查找同一时段的所有方案 (同slotGroupId)
export function findFlightsByGroup(slotGroupId: string): Flight[] {
  return mockFlights.filter(f => f.slotGroupId === slotGroupId).sort((a, b) => a.totalPrice - b.totalPrice);
}

// 查找同一时段的其他方案 (排除自身)
export function findSameSlotAlternatives(flight: Flight): Flight[] {
  return mockFlights.filter(f => f.slotGroupId === flight.slotGroupId && f.id !== flight.id).sort((a, b) => a.totalPrice - b.totalPrice);
}

// 查找同日同方向最便宜的航班 (用于价差提醒)
export function findCheaperAlternative(selectedFlight: Flight): { cheapest: Flight; diff: number } | null {
  const cheaper = mockFlights.filter(f =>
    f.date === selectedFlight.date &&
    f.departureCity === selectedFlight.departureCity &&
    f.arrivalCity === selectedFlight.arrivalCity &&
    f.id !== selectedFlight.id
  ).sort((a, b) => a.totalPrice - b.totalPrice);
  if (cheaper.length === 0) return null;
  const cheapest = cheaper[0];
  const diff = selectedFlight.totalPrice - cheapest.totalPrice;
  if (diff <= 0) return null;
  return { cheapest, diff };
}

// 查找临近日期(前后各2天)最便宜的航班 (用于临近日期差价提醒)
export function findCheaperNearbyDate(selectedFlight: Flight): { cheapest: Flight; diff: number; date: string } | null {
  const baseDate = new Date(selectedFlight.date);
  const nearbyDates: string[] = [];
  for (let offset = -2; offset <= 2; offset++) {
    if (offset === 0) continue;
    const d = new Date(baseDate);
    d.setDate(d.getDate() + offset);
    nearbyDates.push(d.toISOString().split('T')[0]);
  }
  const candidates = mockFlights.filter(f =>
    nearbyDates.includes(f.date) &&
    f.departureCity === selectedFlight.departureCity &&
    f.arrivalCity === selectedFlight.arrivalCity &&
    f.cabin === selectedFlight.cabin &&
    f.luggageOption === selectedFlight.luggageOption
  ).sort((a, b) => a.totalPrice - b.totalPrice);
  if (candidates.length === 0) return null;
  const cheapest = candidates[0];
  const diff = selectedFlight.totalPrice - cheapest.totalPrice;
  if (diff <= 0) return null;
  return { cheapest, diff, date: cheapest.date };
}
