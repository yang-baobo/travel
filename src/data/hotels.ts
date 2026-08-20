import { Hotel, RoomOption } from '../types';
import { additionalHotels } from './additionalHotels';

// 默认房型配置
const defaultRoomTypes: RoomOption[] = [
  { type: '标准间', priceAdjust: 1.0, maxOccupancy: 2, description: '标准双人间' },
  { type: '大床房', priceAdjust: 1.1, maxOccupancy: 2, description: '一张1.8米大床' },
  { type: '双床房', priceAdjust: 1.05, maxOccupancy: 2, description: '两张1.2米单人床' },
  { type: '亲子房', priceAdjust: 1.3, maxOccupancy: 3, description: '一大一小床，含儿童用品' },
  { type: '套房', priceAdjust: 2.0, maxOccupancy: 4, description: '独立客厅+卧室' },
];

const budgetRoomTypes: RoomOption[] = [
  { type: '标准间', priceAdjust: 1.0, maxOccupancy: 2, description: '标准双人间' },
  { type: '大床房', priceAdjust: 1.1, maxOccupancy: 2, description: '一张1.5米大床' },
  { type: '双床房', priceAdjust: 1.0, maxOccupancy: 2, description: '两张1.2米单人床' },
];

const luxuryRoomTypes: RoomOption[] = [
  { type: '大床房', priceAdjust: 1.0, maxOccupancy: 2, description: '一张2.0米豪华大床' },
  { type: '双床房', priceAdjust: 1.0, maxOccupancy: 2, description: '两张1.5米单人床' },
  { type: '亲子房', priceAdjust: 1.2, maxOccupancy: 3, description: '一大一小床，含儿童欢迎礼' },
  { type: '套房', priceAdjust: 1.8, maxOccupancy: 4, description: '豪华独立客厅+卧室+浴缸' },
];

// 根据酒店等级返回房型
export const getRoomTypesForHotel = (hotel: Hotel): RoomOption[] => {
  if (hotel.roomTypes) return hotel.roomTypes;
  if (hotel.level === 'luxury') return luxuryRoomTypes;
  if (hotel.level === 'budget') return budgetRoomTypes;
  return defaultRoomTypes;
};

// 根据人数推荐房型
export const getRecommendedRoomTypes = (groupSize: number, hotel: Hotel): RoomOption[] => {
  const rooms = getRoomTypesForHotel(hotel);
  if (groupSize <= 2) return rooms.filter(r => r.type === '大床房' || r.type === '双床房' || r.type === '标准间');
  if (groupSize <= 3) return rooms.filter(r => r.type === '亲子房' || r.type === '双床房' || r.type === '套房');
  return rooms.filter(r => r.type === '套房' || r.maxOccupancy >= groupSize);
};

export const hotels: Hotel[] = [
  // ===== Zone A: 南山区 (3家) =====
  {
    id: 'h01',
    name: '深圳蛇口希尔顿南海酒店',
    description: '位于蛇口海上世界旁的五星级酒店，尽享无敌海景和便利的商业配套。',
    zone: 'A',
    level: 'luxury',
    pricePerNight: 980,
    rating: 4.7,
    location: { latitude: 22.4850, longitude: 113.9200, address: '南山区望海路1177号' },
    imageUrl: 'https://picsum.photos/seed/hotel01/400/300',
    amenities: ['泳池', '健身房', 'SPA', '海景房', '自助早餐', '商务中心', 'WiFi'],
    nearbyAttractions: ['a05', 'a04'],
    breakfastOptions: { included: true, price: 0, optional: false },
  },
  {
    id: 'h02',
    name: '深圳湾万怡酒店',
    description: '毗邻世界之窗和欢乐谷，出行便利，性价比优秀的商务酒店。',
    zone: 'A',
    level: 'mid',
    pricePerNight: 520,
    rating: 4.4,
    location: { latitude: 22.5380, longitude: 113.9750, address: '南山区深南大道9028号' },
    imageUrl: 'https://picsum.photos/seed/hotel02/400/300',
    amenities: ['健身房', '商务中心', '自助早餐', 'WiFi', '泳池'],
    nearbyAttractions: ['a01', 'a02', 'a03'],
    breakfastOptions: { included: true, price: 0, optional: false },
  },
  {
    id: 'h03',
    name: '深圳南山智选假日酒店',
    description: '地铁口旁的经济型酒店，干净舒适，交通便利，适合预算有限的旅客。',
    zone: 'A',
    level: 'budget',
    pricePerNight: 280,
    rating: 4.1,
    location: { latitude: 22.5300, longitude: 113.9500, address: '南山区南海大道2230号' },
    imageUrl: 'https://picsum.photos/seed/hotel03/400/300',
    amenities: ['WiFi', '自助早餐'],
    nearbyAttractions: ['a04', 'a05'],
    breakfastOptions: { included: true, price: 0, optional: false },
  },

  // ===== Zone B: 福田区 (3家) =====
  {
    id: 'h04',
    name: '深圳香格里拉大酒店',
    description: '位于福田CBD核心区的顶级五星酒店，俯瞰莲花山，尽享城市繁华。',
    zone: 'B',
    level: 'luxury',
    pricePerNight: 1200,
    rating: 4.8,
    location: { latitude: 22.5480, longitude: 114.0600, address: '福田区福华一路1号' },
    imageUrl: 'https://picsum.photos/seed/hotel04/400/300',
    amenities: ['泳池', '健身房', 'SPA', '商务中心', 'WiFi', '自助早餐'],
    nearbyAttractions: ['a06', 'a07'],
    breakfastOptions: { included: true, price: 0, optional: false },
  },
  {
    id: 'h05',
    name: '深圳福田维也纳酒店',
    description: '紧邻华强北商圈的中端酒店，周边美食和购物选择丰富。',
    zone: 'B',
    level: 'mid',
    pricePerNight: 420,
    rating: 4.3,
    location: { latitude: 22.5460, longitude: 114.0850, address: '福田区华强北路2006号' },
    imageUrl: 'https://picsum.photos/seed/hotel05/400/300',
    amenities: ['健身房', 'WiFi', '自助早餐', '商务中心'],
    nearbyAttractions: ['a08', 'a10'],
    breakfastOptions: { included: true, price: 0, optional: false },
  },
  {
    id: 'h06',
    name: '深圳福田汉庭酒店',
    description: '性价比之选，地铁直达各大景点，适合自由行旅客。',
    zone: 'B',
    level: 'budget',
    pricePerNight: 250,
    rating: 4.0,
    location: { latitude: 22.5500, longitude: 114.0700, address: '福田区深南中路3001号' },
    imageUrl: 'https://picsum.photos/seed/hotel06/400/300',
    amenities: ['WiFi'],
    nearbyAttractions: ['a06', 'a07', 'a10'],
    breakfastOptions: { included: false, price: 38, optional: true },
  },

  // ===== Zone C: 罗湖区 (1家) =====
  {
    id: 'h07',
    name: '深圳彭年万丽酒店',
    description: '罗湖口岸附近的老牌五星级酒店，交通枢纽位置，去香港或东部都方便。',
    zone: 'C',
    level: 'mid',
    pricePerNight: 480,
    rating: 4.3,
    location: { latitude: 22.5490, longitude: 114.1160, address: '罗湖区嘉宾路2002号' },
    imageUrl: 'https://picsum.photos/seed/hotel07/400/300',
    amenities: ['泳池', '健身房', 'WiFi', '自助早餐', '商务中心'],
    nearbyAttractions: ['a11'],
    breakfastOptions: { included: true, price: 0, optional: false },
  },

  // ===== Zone D: 龙岗区 (1家) =====
  {
    id: 'h08',
    name: '深圳龙岗珠江皇冠假日酒店',
    description: '龙岗中心城地标酒店，靠近甘坑客家小镇，适合深度文化游。',
    zone: 'D',
    level: 'mid',
    pricePerNight: 380,
    rating: 4.2,
    location: { latitude: 22.6500, longitude: 114.1200, address: '龙岗区龙翔大道' },
    imageUrl: 'https://picsum.photos/seed/hotel08/400/300',
    amenities: ['泳池', '健身房', 'WiFi', '自助早餐', '亲子乐园'],
    nearbyAttractions: ['a12'],
    breakfastOptions: { included: true, price: 0, optional: false },
  },

  // ===== Zone E: 盐田/大鹏 (2家) =====
  {
    id: 'h09',
    name: '大梅沙京基喜来登度假酒店',
    description: '坐落在大梅沙海滩旁的度假酒店，推窗即见碧海蓝天。',
    zone: 'E',
    level: 'luxury',
    pricePerNight: 880,
    rating: 4.6,
    location: { latitude: 22.5980, longitude: 114.3080, address: '盐田区大梅沙盐梅路9号' },
    imageUrl: 'https://picsum.photos/seed/hotel09/400/300',
    amenities: ['泳池', 'SPA', '海景房', '健身房', 'WiFi'],
    nearbyAttractions: ['a13', 'a14'],
    breakfastOptions: { included: false, price: 88, optional: true },
  },
  {
    id: 'h10',
    name: '大鹏佳兆业万豪酒店',
    description: '大鹏半岛上的滨海度假酒店，远离城市喧嚣，适合周末度假。',
    zone: 'E',
    level: 'mid',
    pricePerNight: 650,
    rating: 4.5,
    location: { latitude: 22.5800, longitude: 114.4500, address: '大鹏新区金沙大道' },
    imageUrl: 'https://picsum.photos/seed/hotel10/400/300',
    amenities: ['泳池', '亲子乐园', '海景房', 'WiFi', '自助早餐'],
    nearbyAttractions: ['a15', 'a13'],
  },
  ...additionalHotels,
];

// 按区域分组
export const getHotelsByZone = (zone: string): Hotel[] =>
  hotels.filter(h => h.zone === zone);

// 按等级筛选
export const getHotelsByLevel = (level: Hotel['level']): Hotel[] =>
  hotels.filter(h => h.level === level);

// 按ID查找
export const getHotelById = (id: string): Hotel | undefined =>
  hotels.find(h => h.id === id);
