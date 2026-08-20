import { create } from 'zustand';
import { Attraction } from '../types';
import { attractions } from '../data/attractions';
import { attractionCategoryMap } from '../data/categories';

interface AttractionState {
  allAttractions: Attraction[];
  filteredAttractions: Attraction[];
  selectedAttractionIds: string[];

  filterByZone: (zone: string) => void;
  filterByCategories: (categoryIds: string[]) => void;
  filterByTags: (tags: string[]) => void;
  searchByName: (keyword: string) => void;
  resetFilter: () => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  getById: (id: string) => Attraction | undefined;
  getRecommendations: (categoryIds: string[], count?: number) => Attraction[];
}

export const useAttractionStore = create<AttractionState>((set, get) => ({
  allAttractions: attractions,
  filteredAttractions: attractions,
  selectedAttractionIds: [],

  filterByZone: (zone) => {
    set({ filteredAttractions: attractions.filter(a => a.zone === zone) });
  },

  filterByCategories: (categoryIds) => {
    if (categoryIds.length === 0) {
      set({ filteredAttractions: attractions });
      return;
    }
    const matchingIds = new Set<string>();
    for (const catId of categoryIds) {
      for (const [attrId, cats] of Object.entries(attractionCategoryMap)) {
        if (cats.includes(catId)) matchingIds.add(attrId);
      }
    }
    set({ filteredAttractions: attractions.filter(a => matchingIds.has(a.id)) });
  },

  filterByTags: (tags) => {
    set({
      filteredAttractions: attractions.filter(a =>
        tags.some(tag => a.tags.includes(tag))
      ),
    });
  },

  searchByName: (keyword) => {
    const kw = keyword.toLowerCase();
    set({
      filteredAttractions: attractions.filter(a =>
        a.name.toLowerCase().includes(kw) ||
        a.description.toLowerCase().includes(kw)
      ),
    });
  },

  resetFilter: () => set({ filteredAttractions: attractions }),

  toggleSelect: (id) => {
    const current = get().selectedAttractionIds;
    if (current.includes(id)) {
      set({ selectedAttractionIds: current.filter(i => i !== id) });
    } else {
      set({ selectedAttractionIds: [...current, id] });
    }
  },

  clearSelection: () => set({ selectedAttractionIds: [] }),

  getById: (id) => attractions.find(a => a.id === id),

  getRecommendations: (categoryIds, count = 6) => {
    if (categoryIds.length === 0) {
      return [...attractions].sort((a, b) => b.rating - a.rating).slice(0, count);
    }
    const scored = attractions.map(a => {
      const cats = attractionCategoryMap[a.id] || [];
      const matchCount = cats.filter(c => categoryIds.includes(c)).length;
      return { attraction: a, score: matchCount * 10 + a.rating };
    });
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map(s => s.attraction);
  },
}));
