import { create } from 'zustand';
import { CostItem, CostCategory } from '../types';

export interface CartRouteInfo {
  routeType: 'guide' | 'system';
  routeId: string;
  title: string;
  durationDays: number;
  guideId?: string;
  attractionIds: string[];
  restaurantIds?: string[];
}

interface CartState {
  items: CostItem[];
  groupSize: number;
  routeInfo: CartRouteInfo | null;

  addItem: (item: CostItem) => void;
  removeItem: (id: string) => void;
  toggleItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  setGroupSize: (size: number) => void;
  setRouteInfo: (info: CartRouteInfo) => void;

  // 批量操作
  addMandatoryItems: (items: CostItem[]) => void;
  addOptionalItems: (items: CostItem[]) => void;
  clearAllItems: () => void;

  // 计算相关
  getTotalPrice: () => number;
  getSelectedTotal: () => number;
  getCategoryTotal: (category: CostCategory) => number;
  getCategorySummary: () => { category: CostCategory; total: number }[];
  getPerPersonTotal: () => number;

  resetCart: () => void;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  groupSize: 1,
  routeInfo: null,

  addItem: (item) => {
    const current = get().items;
    if (current.some(i => i.id === item.id)) return;
    set({ items: [...current, item] });
  },

  removeItem: (id) => {
    set({ items: get().items.filter(i => i.id !== id) });
  },

  toggleItem: (id) => {
    set({
      items: get().items.map(i =>
        i.id === id ? { ...i, selected: !i.selected } : i
      ),
    });
  },

  updateQuantity: (id, quantity) => {
    set({
      items: get().items.map(i =>
        i.id === id ? { ...i, quantity } : i
      ),
    });
  },

  setGroupSize: (size) => set({ groupSize: size }),

  setRouteInfo: (info) => set({ routeInfo: info }),

  addMandatoryItems: (newItems) => {
    const current = get().items;
    const mapped = newItems.map(item => ({
      ...item,
      selected: true,
      mandatory: true,
    }));
    const existing = new Set(current.map(i => i.id));
    const toAdd = mapped.filter(i => !existing.has(i.id));
    set({ items: [...current, ...toAdd] });
  },

  addOptionalItems: (newItems) => {
    const current = get().items;
    const mapped = newItems.map(item => ({
      ...item,
      selected: false,
      mandatory: false,
    }));
    const existing = new Set(current.map(i => i.id));
    const toAdd = mapped.filter(i => !existing.has(i.id));
    set({ items: [...current, ...toAdd] });
  },

  clearAllItems: () => set({ items: [] }),

  getTotalPrice: () => {
    const { items, groupSize } = get();
    return items.reduce((total, item) => {
      if (!item.selected) return total;
      const base = item.unitPrice * item.quantity;
      return total + base * (item.mandatory ? groupSize : 1);
    }, 0);
  },

  getSelectedTotal: () => {
    const { items } = get();
    return items
      .filter(i => i.selected)
      .reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  },

  getCategoryTotal: (category) => {
    const { items } = get();
    return items
      .filter(i => i.selected && i.category === category)
      .reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  },

  getCategorySummary: () => {
    const { items } = get();
    const catMap: Record<string, number> = {};
    for (const item of items) {
      if (!item.selected) continue;
      const cat = item.category;
      catMap[cat] = (catMap[cat] || 0) + item.unitPrice * item.quantity;
    }
    return Object.entries(catMap).map(([category, total]) => ({
      category: category as CostCategory,
      total,
    }));
  },

  getPerPersonTotal: () => {
    const total = get().getTotalPrice();
    const groupSize = get().groupSize;
    return groupSize > 0 ? Math.ceil(total / groupSize) : total;
  },

  resetCart: () => set({ items: [], groupSize: 1, routeInfo: null }),
}));
