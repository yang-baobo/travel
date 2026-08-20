import type { CustomStackParamList, ScheduleItem } from '../types';
import type { AssistantReviewSection } from '../store/useAssistantStore';
import { getAttractionById } from '../data/attractions';
import { getGuideById } from '../data/guides';
import { getHotelById } from '../data/hotels';
import { getRestaurantById } from '../data/restaurants';
import { formatPrice } from './formatters';

function sentence(text: string): string {
  return text.replace(/[。！!]+$/g, '');
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]}和${names[1]}`;
  return `${names.slice(0, -1).join('、')}，以及${names[names.length - 1]}`;
}

function buildMealIntro(item: ScheduleItem, label: string): string | null {
  if (!item.restaurantId) return null;
  const restaurant = getRestaurantById(item.restaurantId);
  if (!restaurant) return null;
  return `${label}安排在${restaurant.name}，主打${restaurant.cuisineType}，${sentence(restaurant.description)}。`;
}

function buildHotelIntro(item: ScheduleItem): string | null {
  if (!item.hotelId) return null;
  const hotel = getHotelById(item.hotelId);
  if (!hotel) return null;
  const amenityText = hotel.amenities.slice(0, 3).join('、');
  return `晚上入住${hotel.name}，每晚约${formatPrice(hotel.pricePerNight)}，${sentence(hotel.description)}。常见设施有${amenityText}。`;
}

function buildOverviewSection(
  selectedDays: number,
  totalPrice: number,
  orderedIds: string[],
  selectedGuideId: string | null
): AssistantReviewSection {
  const guide = selectedGuideId ? getGuideById(selectedGuideId) : null;
  const guideText = guide
    ? `另外安排的是${guide.name}导游，他擅长${guide.specialtyAreas.slice(0, 2).join('和')}。`
    : '这次行程暂时没有安排导游。';
  return {
    id: 'overview',
    kind: 'overview',
    title: '总览',
    spokenText: `行程已经整理好了。这次一共${selectedDays}天，安排了${orderedIds.length}个景点，当前预计总价是${formatPrice(totalPrice)}。${guideText}接下来我会按天给您介绍，哪里不满意您随时打断我。`,
    confirmationPrompt: '我先从第一天开始介绍，好吗？',
  };
}

function buildDaySection(day: number, dayItems: ScheduleItem[]): AssistantReviewSection {
  const attractionNames = dayItems
    .filter(item => item.type === 'attraction' && item.attractionId)
    .map(item => getAttractionById(item.attractionId!)?.name || item.title)
    .filter(Boolean);

  const lunch = dayItems.find(item => item.id === `${day}-lunch` || (item.type === 'restaurant' && item.startTime <= '14:00' && item.restaurantId));
  const dinner = [...dayItems].reverse().find(item => item.id === `${day}-dinner` || (item.type === 'restaurant' && item.startTime >= '17:00' && item.restaurantId));
  const hotel = [...dayItems].reverse().find(item => item.type === 'hotel' && item.hotelId);
  const flight = dayItems.find(item => item.type === 'flight');
  const freeBlock = dayItems.find(item => item.type === 'custom' && item.title.includes('自由'));

  const pieces: string[] = [`现在介绍第${day}天。`];

  if (flight) {
    pieces.push(`${flight.title}，时间是${flight.startTime}到${flight.endTime}。`);
  }

  if (freeBlock) {
    pieces.push('这一天主要留给自由活动和休息，不强行排景点。');
  } else if (attractionNames.length > 0) {
    pieces.push(`景点安排有${joinNames(attractionNames)}。`);
  } else {
    pieces.push('这一天景点安排比较轻，可以按现场状态灵活调整。');
  }

  const lunchIntro = lunch ? buildMealIntro(lunch, '午餐') : null;
  if (lunchIntro) pieces.push(lunchIntro);

  const dinnerIntro = dinner ? buildMealIntro(dinner, '晚餐') : null;
  if (dinnerIntro && dinner !== lunch) pieces.push(dinnerIntro);

  const hotelIntro = hotel ? buildHotelIntro(hotel) : null;
  if (hotelIntro) pieces.push(hotelIntro);

  return {
    id: `day-${day}`,
    kind: 'day',
    day,
    title: `第${day}天`,
    spokenText: pieces.join(''),
    confirmationPrompt: `第${day}天先这样安排，您满意吗？如果想改景点、餐厅或者酒店，直接跟我说就行。`,
  };
}

function buildPaymentSection(totalPrice: number): AssistantReviewSection {
  return {
    id: 'payment',
    kind: 'payment',
    title: '支付确认',
    spokenText: `目前整条行程我已经陪您确认完了，预计总价是${formatPrice(totalPrice)}。如果您觉得没有问题，我可以直接带您去支付页面。`,
    confirmationPrompt: '您要现在去支付吗？',
  };
}

export function buildRouteReviewSections(
  schedule: ScheduleItem[][],
  selectedDays: number,
  totalPrice: number,
  orderedIds: string[],
  selectedGuideId: string | null
): AssistantReviewSection[] {
  const sections: AssistantReviewSection[] = [
    buildOverviewSection(selectedDays, totalPrice, orderedIds, selectedGuideId),
  ];

  schedule.forEach((dayItems, index) => {
    sections.push(buildDaySection(index + 1, dayItems));
  });

  sections.push(buildPaymentSection(totalPrice));
  return sections;
}

export function buildSettlementParams(params: CustomStackParamList['Settlement']): CustomStackParamList['Settlement'] {
  return params;
}
