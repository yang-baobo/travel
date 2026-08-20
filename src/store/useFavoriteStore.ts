import { create } from 'zustand';

interface FavoriteState {
  favoriteGuideIds: string[];
  favoriteRouteIds: string[];
  favoriteAttractionIds: string[];
  favoriteHotelIds: string[];
  favoriteRestaurantIds: string[];
  favoriteFlightIds: string[];

  toggleFavoriteGuide: (id: string) => void;
  toggleFavoriteRoute: (id: string) => void;
  toggleFavoriteAttraction: (id: string) => void;
  toggleFavoriteHotel: (id: string) => void;
  toggleFavoriteRestaurant: (id: string) => void;
  toggleFavoriteFlight: (id: string) => void;

  isFavoriteGuide: (id: string) => boolean;
  isFavoriteRoute: (id: string) => boolean;
  isFavoriteAttraction: (id: string) => boolean;
  isFavoriteHotel: (id: string) => boolean;
  isFavoriteRestaurant: (id: string) => boolean;
  isFavoriteFlight: (id: string) => boolean;

  resetFavorites: () => void;
}

const toggleId = (current: string[], id: string) =>
  current.includes(id) ? current.filter(x => x !== id) : [...current, id];

export const useFavoriteStore = create<FavoriteState>((set, get) => ({
  favoriteGuideIds: [],
  favoriteRouteIds: [],
  favoriteAttractionIds: [],
  favoriteHotelIds: [],
  favoriteRestaurantIds: [],
  favoriteFlightIds: [],

  toggleFavoriteGuide: (id) => set({ favoriteGuideIds: toggleId(get().favoriteGuideIds, id) }),
  toggleFavoriteRoute: (id) => set({ favoriteRouteIds: toggleId(get().favoriteRouteIds, id) }),
  toggleFavoriteAttraction: (id) => set({ favoriteAttractionIds: toggleId(get().favoriteAttractionIds, id) }),
  toggleFavoriteHotel: (id) => set({ favoriteHotelIds: toggleId(get().favoriteHotelIds, id) }),
  toggleFavoriteRestaurant: (id) => set({ favoriteRestaurantIds: toggleId(get().favoriteRestaurantIds, id) }),
  toggleFavoriteFlight: (id) => set({ favoriteFlightIds: toggleId(get().favoriteFlightIds, id) }),

  isFavoriteGuide: (id) => get().favoriteGuideIds.includes(id),
  isFavoriteRoute: (id) => get().favoriteRouteIds.includes(id),
  isFavoriteAttraction: (id) => get().favoriteAttractionIds.includes(id),
  isFavoriteHotel: (id) => get().favoriteHotelIds.includes(id),
  isFavoriteRestaurant: (id) => get().favoriteRestaurantIds.includes(id),
  isFavoriteFlight: (id) => get().favoriteFlightIds.includes(id),

  resetFavorites: () => set({
    favoriteGuideIds: [],
    favoriteRouteIds: [],
    favoriteAttractionIds: [],
    favoriteHotelIds: [],
    favoriteRestaurantIds: [],
    favoriteFlightIds: [],
  }),
}));
