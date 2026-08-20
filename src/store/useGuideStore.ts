import { create } from 'zustand';
import { Guide, GuideRoute } from '../types';
import { guides } from '../data/guides';
import { guideRoutes, getRoutesByGuideId, getRoutesByAttractionId } from '../data/guideRoutes';

interface GuideState {
  allGuides: Guide[];
  allGuideRoutes: GuideRoute[];
  filteredGuides: Guide[];
  selectedGuideId: string | null;
  selectedRouteId: string | null;

  filterBySpecialty: (area: string) => void;
  filterByPriceRange: (min: number, max: number) => void;
  filterWithRoutes: () => void;
  filterFreelance: () => void;
  resetFilter: () => void;

  selectGuide: (id: string | null) => void;
  selectRoute: (id: string | null) => void;

  getGuideById: (id: string) => Guide | undefined;
  getGuideRoutes: (guideId: string) => GuideRoute[];
  getRouteById: (id: string) => GuideRoute | undefined;
  getRoutesByAttraction: (attractionId: string) => GuideRoute[];
  getGuideForRoute: (routeId: string) => Guide | undefined;
}

export const useGuideStore = create<GuideState>((set) => ({
  allGuides: guides,
  allGuideRoutes: guideRoutes,
  filteredGuides: guides,
  selectedGuideId: null,
  selectedRouteId: null,

  filterBySpecialty: (area) => {
    set({
      filteredGuides: guides.filter(g =>
        g.specialtyAreas.some(s => s.includes(area))
      ),
    });
  },

  filterByPriceRange: (min, max) => {
    set({
      filteredGuides: guides.filter(
        g => g.perDayPrice >= min && g.perDayPrice <= max
      ),
    });
  },

  filterWithRoutes: () => {
    set({ filteredGuides: guides.filter(g => g.routeIds.length > 0) });
  },

  filterFreelance: () => {
    set({ filteredGuides: guides.filter(g => g.routeIds.length === 0) });
  },

  resetFilter: () => set({ filteredGuides: guides }),

  selectGuide: (id) => set({ selectedGuideId: id }),
  selectRoute: (id) => set({ selectedRouteId: id }),

  getGuideById: (id) => guides.find(g => g.id === id),

  getGuideRoutes: (guideId) => getRoutesByGuideId(guideId),

  getRouteById: (id) => guideRoutes.find(r => r.id === id),

  getRoutesByAttraction: (attractionId) => getRoutesByAttractionId(attractionId),

  getGuideForRoute: (routeId) => {
    const route = guideRoutes.find(r => r.id === routeId);
    if (!route) return undefined;
    return guides.find(g => g.id === route.guideId);
  },
}));
