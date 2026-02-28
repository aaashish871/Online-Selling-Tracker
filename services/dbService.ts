import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { Order, InventoryItem, UserProfile } from "../types.ts";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://yvugbgjrakdcgirxpcvi.supabase.co';
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const hardcodedKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2dWdiZ2pyYWtkY2dpcnhwY3ZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3Mzc5MjAsImV4cCI6MjA4NjMxMzkyMH0.s-IFW7LEuGHT8tnVvJ2WczckZN9Y9Uup1pGG-YaH1h0';

// Only use the environment key if it's NOT a Stripe key
const supabaseKey = (envKey && !envKey.startsWith('sb_') && !envKey.startsWith('pk_')) 
  ? envKey 
  : hardcodedKey;

if (envKey && (envKey.startsWith('sb_') || envKey.startsWith('pk_'))) {
  console.warn("⚠️ DATABASE CONFIGURATION WARNING: The environment variable VITE_SUPABASE_ANON_KEY appears to be a Stripe key. Using hardcoded Supabase key instead.");
}

let supabase: SupabaseClient | null = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

export const dbService = {
  // Helper for retrying fetches
  async retryFetch<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      if (retries > 0 && (error.message === 'Failed to fetch' || error.status === 502)) {
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.retryFetch(fn, retries - 1, delay * 2);
      }
      throw error;
    }
  },

  isConfigured(): boolean {
    return !!supabase;
  },

  async checkConnection(): Promise<boolean> {
    if (!supabase) return false;
    try {
      const { error } = await supabase.from('osot_profiles').select('count', { count: 'exact', head: true });
      return !error;
    } catch {
      return false;
    }
  },

  // --- Auth Operations ---
  async login(email: string, password: string): Promise<{ user: User | null; error: any }> {
    if (!supabase) return { user: null, error: { message: 'Supabase not configured' } };
    return this.retryFetch(async () => {
      const { data, error } = await supabase!.auth.signInWithPassword({ email, password });
      if (data?.user) await this.syncProfile(data.user);
      return { user: data?.user || null, error };
    });
  },

  async register(email: string, password: string, role: string = 'Staff'): Promise<{ user: User | null; error: any }> {
    if (!supabase) return { user: null, error: { message: 'Supabase not configured' } };
    return this.retryFetch(async () => {
      const { data, error } = await supabase!.auth.signUp({ email, password });
      if (data?.user) await this.syncProfile(data.user, role);
      return { user: data?.user || null, error };
    });
  },

  async logout(): Promise<void> {
    if (supabase) await supabase.auth.signOut();
  },

  async getCurrentUser(): Promise<User | null> {
    if (!supabase) return null;
    return this.retryFetch(async () => {
      const { data: { user } } = await supabase!.auth.getUser();
      return user;
    });
  },

  async syncProfile(user: User, role?: string): Promise<void> {
    if (!supabase) return;
    
    const profileData: any = { 
      id: user.id, 
      email: user.email, 
      updated_at: new Date().toISOString() 
    };

    if (role) profileData.role = role;

    return this.retryFetch(async () => {
      const { error } = await supabase!
        .from('osot_profiles')
        .upsert(profileData, { onConflict: 'id' });
      if (error) throw error;
    });
  },

  async getAllProfiles(): Promise<UserProfile[]> {
    if (!supabase) return [];
    return this.retryFetch(async () => {
      const { data, error } = await supabase!.from('osot_profiles').select('*');
      if (error) throw error;
      return (data as UserProfile[]) || [];
    });
  },

  // --- Admin Data Sharing ---
  async shareData(targetUserId: string, options: { inventory: boolean; orders: boolean }): Promise<void> {
    if (!supabase) return;
    const user = await this.getCurrentUser();
    if (!user) return;

    if (options.inventory) {
      const { data: inv } = await supabase.from('osot_inventory').select('*').eq('user_id', user.id);
      if (inv) {
        const itemsToShare = inv.map(item => {
          const { id, created_at, ...rest } = item;
          return { ...rest, user_id: targetUserId };
        });
        await supabase.from('osot_inventory').insert(itemsToShare);
      }
    }

    if (options.orders) {
      const { data: orders } = await supabase.from('osot_orders').select('*').eq('user_id', user.id);
      if (orders) {
        const ordersToShare = orders.map(order => {
          const { id, ...rest } = order;
          return { ...rest, user_id: targetUserId };
        });
        await supabase.from('osot_orders').insert(ordersToShare);
      }
    }
  },

  // --- Inventory Operations ---
  async getInventory(): Promise<InventoryItem[]> {
    if (!supabase) return [];
    const user = await this.getCurrentUser();
    if (!user) return [];

    return this.retryFetch(async () => {
      const { data, error } = await supabase!.from('osot_inventory')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data as InventoryItem[]) || [];
    });
  },

  async saveInventoryItem(item: InventoryItem): Promise<void> {
    if (!supabase) return;
    const user = await this.getCurrentUser();
    if (!user) return;
    return this.retryFetch(async () => {
      const { error } = await supabase!.from('osot_inventory').insert([{ ...item, user_id: user.id }]);
      if (error) throw error;
    });
  },

  async updateInventoryItem(item: InventoryItem): Promise<void> {
    if (!supabase) return;
    return this.retryFetch(async () => {
      const { error } = await supabase!.from('osot_inventory').update(item).eq('id', item.id);
      if (error) throw error;
    });
  },

  // --- Order Operations ---
  async getOrders(): Promise<Order[]> {
    if (!supabase) return [];
    const user = await this.getCurrentUser();
    if (!user) return [];

    return this.retryFetch(async () => {
      const { data, error } = await supabase!.from('osot_orders')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });
      if (error) throw error;
      return (data as Order[]) || [];
    });
  },

  async saveOrder(order: Order): Promise<void> {
    if (!supabase) return;
    const user = await this.getCurrentUser();
    if (!user) return;
    return this.retryFetch(async () => {
      const { error } = await supabase!.from('osot_orders').insert([{ ...order, user_id: user.id }]);
      if (error) throw error;
    });
  },

  async updateOrder(order: Order): Promise<void> {
    if (!supabase) return;
    return this.retryFetch(async () => {
      const { error } = await supabase!.from('osot_orders').update(order).eq('id', order.id);
      if (error) throw error;
    });
  }
};
