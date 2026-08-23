import { create } from 'zustand';
import { Hotel, HotelLevel } from '../types';
import { hotels } from '../data/hotels';

interface HotelState {
  allHotels: Hotel[];
  filteredHotels: Hotel[];

  filterByZone: (zone: string) => void;
  filterByLevel: (level: HotelLevel) => void;
  filterByPriceRange: (min: number, max: number) => void;
  resetFilter: () => void;
  getById: (id: string) => Hotel | undefined;
  getRecommendedForZone: (zone: string) => Hotel[];
}

export const useHotelStore = create<HotelState>((set) => ({
  allHotels: hotels,
  filteredHotels: hotels,

  filterByZone: (zone) => {
    set({ filteredHotels: hotels.filter(h => h.zone === zone) });
  },

  filterByLevel: (level) => {
    set({ filteredHotels: hotels.filter(h => h.level === level) });
  },

  filterByPriceRange: (min, max) => {
    set({
      filteredHotels: hotels.filter(
        h => h.pricePerNight >= min && h.pricePerNight <= max
      ),
    });
  },

  resetFilter: () => set({ filteredHotels: hotels }),

  getById: (id) => hotels.find(h => h.id === id),

  getRecommendedForZone: (zone) => {
    const zoneHotels = hotels.filter(h => h.zone === zone);
    return zoneHotels.length > 0
      ? zoneHotels.sort((a, b) => b.rating - a.rating)
      : hotels.sort((a, b) => b.rating - a.rating).slice(0, 3);
  },
}));
