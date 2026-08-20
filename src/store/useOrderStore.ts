import { create } from 'zustand';
import { Order, OrderStatus } from '../types';

interface OrderState {
  orders: Order[];
  addOrder: (order: Omit<Order, 'id' | 'createdAt'>) => string;
  payOrder: (orderId: string) => void;
  completeOrder: (orderId: string) => void;
  cancelOrder: (orderId: string) => void;
  getOrdersByStatus: (status: OrderStatus) => Order[];
}

let orderCounter = 0;
const cancelTimers: Record<string, ReturnType<typeof setTimeout>> = {};

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: [],

  addOrder: (orderData) => {
    orderCounter += 1;
    const id = `ORD${Date.now()}-${orderCounter}`;
    const order: Order = {
      ...orderData,
      id,
      createdAt: Date.now(),
    };
    set({ orders: [order, ...get().orders] });

    // Start 15-min auto-cancel timer for pending orders
    if (order.status === 'pending') {
      cancelTimers[id] = setTimeout(() => {
        const current = get().orders.find(o => o.id === id);
        if (current && current.status === 'pending') {
          set({
            orders: get().orders.map(o =>
              o.id === id ? { ...o, status: 'cancelled' as OrderStatus } : o
            ),
          });
        }
        delete cancelTimers[id];
      }, 15 * 60 * 1000); // 15 minutes
    }

    return id;
  },

  payOrder: (orderId) => {
    // Clear cancel timer
    if (cancelTimers[orderId]) {
      clearTimeout(cancelTimers[orderId]);
      delete cancelTimers[orderId];
    }
    set({
      orders: get().orders.map(o =>
        o.id === orderId ? { ...o, status: 'paid' as OrderStatus, paidAt: Date.now() } : o
      ),
    });
  },

  completeOrder: (orderId) => {
    set({
      orders: get().orders.map(o =>
        o.id === orderId ? { ...o, status: 'completed' as OrderStatus } : o
      ),
    });
  },

  cancelOrder: (orderId) => {
    if (cancelTimers[orderId]) {
      clearTimeout(cancelTimers[orderId]);
      delete cancelTimers[orderId];
    }
    set({
      orders: get().orders.map(o =>
        o.id === orderId ? { ...o, status: 'cancelled' as OrderStatus } : o
      ),
    });
  },

  getOrdersByStatus: (status) => {
    return get().orders.filter(o => o.status === status);
  },
}));
