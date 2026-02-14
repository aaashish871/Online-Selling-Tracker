
import React, { useState, useMemo, useEffect } from 'react';
import { Order, InventoryItem } from './types.ts';
import { INITIAL_STATUSES, CATEGORIES } from './constants.tsx';
import StatsCard from './components/StatsCard.tsx';
import OrderForm from './components/OrderForm.tsx';
import InventoryForm from './components/InventoryForm.tsx';
import { getAIAnalysis } from './services/geminiService.ts';
import { dbService } from './services/dbService.ts';
import { User } from '@supabase/supabase-js';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

type ViewMode = 'dashboard' | 'orders' | 'inventory' | 'reports' | 'settings';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');

  const [view, setView] = useState<ViewMode>('dashboard');
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  
  const [statuses, setStatuses] = useState<string[]>(INITIAL_STATUSES);
  const [categories, setCategories] = useState<string[]>(CATEGORIES);
  const [editingIndex, setEditingIndex] = useState<{type: 'cat' | 'status', index: number} | null>(null);
  const [editValue, setEditValue] = useState('');

  const [orderMonthFilter, setOrderMonthFilter] = useState<string>('all');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');

  const [isInvFormOpen, setIsInvFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [dbErrorMessage, setDbErrorMessage] = useState<string | null>(null);
  const [returnModalOrder, setReturnModalOrder] = useState<Order | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [orphanedCount, setOrphanedCount] = useState({ orders: 0, inventory: 0 });

  const isDbConfigured = dbService.isConfigured();

  // Handle Authentication Session
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const currentUser = await dbService.getCurrentUser();
        setUser(currentUser);
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    const { user: loggedInUser, error } = await dbService.login(email, password);
    if (error) {
      setAuthError(error.message);
      setAuthLoading(false);
    } else {
      setUser(loggedInUser);
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await dbService.logout();
    setUser(null);
    setOrders([]);
    setInventory([]);
    setView('dashboard');
  };

  const loadData = async () => {
    if (!user || !isDbConfigured) return;
    setIsLoading(true);
    setDbErrorMessage(null);
    try {
      const [fetchedOrders, fetchedInventory, orphans] = await Promise.all([
        dbService.getOrders(),
        dbService.getInventory(),
        dbService.getOrphanedCounts()
      ]);
      const sortedOrders = (fetchedOrders || []).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setOrders(sortedOrders);
      setInventory(fetchedInventory || []);
      setOrphanedCount(orphans);
    } catch (error: any) {
      console.error("Database error", error);
      if (error.message === 'SCHEMA_MISSING_USER_ID') {
        setDbErrorMessage("MISSING_USER_ID");
      } else {
        setDbErrorMessage(error.message || "An unexpected database error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const handleClaimLegacyData = async () => {
    if (!confirm("This will attempt to assign all 'orphaned' records (data with no owner) to your account via the App Session. Proceed?")) return;
    setIsMigrating(true);
    const result = await dbService.claimLegacyData();
    setIsMigrating(false);
    if (result.success) {
      if (result.count > 0) {
        alert(`Success! ${result.count} records recovered. Refreshing...`);
        loadData();
      } else {
        alert("No orphaned records were found via the app session. This might be due to Database security policies (RLS). Please use the Manual SQL method provided in Settings.");
      }
    } else {
      alert(`Migration failed: ${result.error || 'Check console'}. Use the Manual SQL command provided below.`);
    }
  };

  const stats = useMemo(() => {
    const settledOrders = orders.filter(o => o.status === 'Settled');
    const revenue = settledOrders.reduce((sum, o) => sum + (Number(o.settledAmount) || 0), 0);
    const totalSettledProfit = settledOrders.reduce((sum, o) => sum + (Number(o.profit) || 0), 0);
    const activeReturnLosses = orders.filter(o => o.status === 'Returned' && o.claimStatus !== 'Approved').reduce((sum, o) => sum + (Number(o.lossAmount) || 0), 0);
    const netProfit = totalSettledProfit - activeReturnLosses;
    return { totalRevenue: revenue, totalProfit: netProfit, avgMargin: revenue > 0 ? (netProfit / revenue) * 100 : 0, orderCount: orders.length };
  }, [orders]);

  const monthlyData = useMemo(() => {
    const map: Record<string, { month: string; revenue: number; profit: number }> = {};
    orders.forEach(o => {
      const month = o.date.substring(0, 7);
      if (!map[month]) map[month] = { month, revenue: 0, profit: 0 };
      if (o.status === 'Settled') { map[month].revenue += Number(o.settledAmount); map[month].profit += Number(o.profit); }
      else if (o.status === 'Returned' && o.claimStatus !== 'Approved') { map[month].profit -= Number(o.lossAmount); }
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const monthMatches = orderMonthFilter === 'all' || o.date.startsWith(orderMonthFilter);
      const statusMatches = orderStatusFilter === 'all' || o.status === orderStatusFilter;
      return monthMatches && statusMatches;
    });
  }, [orders, orderMonthFilter, orderStatusFilter]);

  const uniqueMonths = useMemo(() => {
    const months = new Set<string>();
    orders.forEach(o => months.add(o.date.substring(0, 7)));
    return Array.from(months).sort();
  }, [orders]);

  const sortedStatusSummary = useMemo(() => {
    const summary = statuses.map(s => ({ name: s, count: orders.filter(o => o.status === s).length }));
    return summary.sort((a, b) => b.count - a.count);
  }, [orders, statuses]);

  // Inventory/Order CRUD logic with User scoping
  const addInvItem = async (item: InventoryItem) => {
    setIsSyncing(true);
    try { await dbService.saveInventoryItem(item); setInventory(prev => [item, ...prev]); } finally { setIsSyncing(false); }
  };
  const updateInvItem = async (item: InventoryItem) => {
    setIsSyncing(true);
    try { await dbService.updateInventoryItem(item); setInventory(prev => prev.map(i => i.id === item.id ? item : i)); } finally { setIsSyncing(false); }
  };
  const deleteInvItem = async (id: string) => {
    if (!confirm("Delete product?")) return;
    setIsSyncing(true);
    try { await dbService.deleteInventoryItem(id); setInventory(prev => prev.filter(i => i.id !== id)); } finally { setIsSyncing(false); }
  };
  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    const orderToUpdate = orders.find(o => o.id === orderId);
    if (!orderToUpdate) return;
    if (newStatus === 'Returned') { setReturnModalOrder({ ...orderToUpdate, status: newStatus, returnType: orderToUpdate.returnType || 'Courier', claimStatus: orderToUpdate.claimStatus || 'Pending' }); return; }
    const updatedOrder = { ...orderToUpdate, status: newStatus };
    setIsSyncing(true);
    try { await dbService.updateOrder(updatedOrder); setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o)); } finally { setIsSyncing(false); }
  };
  const handleReturnDetailSubmit = async (details: Order) => {
    setIsSyncing(true);
    try { await dbService.updateOrder(details); setOrders(prev => prev.map(o => o.id === details.id ? details : o)); setReturnModalOrder(null); } finally { setIsSyncing(false); }
  };
  const addOrder = async (order: Order) => {
    setIsSyncing(true);
    try { await dbService.saveOrder(order); setOrders(prev => [...prev, order].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())); } finally { setIsSyncing(false); }
  };
  const deleteOrder = async (id: string) => {
    if (!confirm("Delete order?")) return;
    setIsSyncing(true);
    try { await dbService.deleteOrder(id); setOrders(prev => prev.filter(o => o.id !== id)); } finally { setIsSyncing(false); }
  };

  // Login View
  if (!user && !authLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-12 border border-slate-100 animate-in fade-in zoom-in duration-500">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center text-white font-black text-4xl shadow-xl mx-auto mb-6">O</div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Order Analyzer</h1>
            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-1">Ahuja Edition - Secure Login</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Email or Phone</label>
              <input 
                type="text" 
                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-100 transition-all" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Password</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-100 transition-all pr-14" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268-2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                </button>
              </div>
            </div>
            {authError && <p className="text-rose-500 text-[10px] font-black uppercase text-center">{authError}</p>}
            <button 
              type="submit" 
              className="w-full py-5 bg-indigo-600 text-white font-black uppercase text-xs tracking-[0.2em] rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all"
            >
              Enter Dashboard
            </button>
          </form>
          <div className="mt-8 text-center"><p className="text-[9px] font-bold text-slate-400">Secure AES-256 Cloud Synchronization Active</p></div>
        </div>
      </div>
    );
  }

  if (authLoading || isLoading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      {/* Header */}
      <nav className="bg-white border-b border-slate-100 sticky top-0 z-50 px-4 py-4 md:px-8 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg">O</div>
              <div>
                <h1 className="text-sm font-black text-slate-900 tracking-tight leading-none">Order Analyzer</h1>
                <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest">{user?.email?.split('@')[0]} Edition</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase flex items-center gap-1.5 ${isSyncing ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-amber-500 animate-ping' : 'bg-emerald-500'}`}></div>
                {isSyncing ? 'Syncing' : 'Live'}
              </div>
              <button onClick={handleLogout} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              </button>
            </div>
          </div>
          <div className="flex overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide gap-1 no-scrollbar">
            {(['dashboard', 'orders', 'inventory', 'reports', 'settings'] as ViewMode[]).map(m => (
              <button key={m} onClick={() => setView(m)} className={`px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${view === m ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="flex-grow max-w-7xl mx-auto w-full px-4 md:px-8 py-6 pb-24">
        {dbErrorMessage ? (
           <div className="text-center py-10 bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100 max-w-2xl mx-auto">
             <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">⚠️</div>
             <h2 className="text-2xl font-black text-slate-800 mb-4">Database Setup Required</h2>
             
             {dbErrorMessage === "MISSING_USER_ID" ? (
               <div className="space-y-4">
                 <p className="text-sm font-medium text-slate-600 mb-4 text-left">Your Supabase tables are missing the <code className="bg-slate-100 px-1 rounded">user_id</code> column. Please run this SQL in your Supabase SQL Editor:</p>
                 <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-[10px] font-mono text-left overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-inner">
{`ALTER TABLE osot_inventory ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();
ALTER TABLE osot_orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();
ALTER TABLE osot_inventory ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE osot_orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();`}
                 </pre>
                 <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-4">After running the SQL, click the button below.</p>
               </div>
             ) : (
               <p className="text-sm text-slate-500 mb-6">{dbErrorMessage}</p>
             )}
             
             <button onClick={loadData} className="mt-8 px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">Retry Connection</button>
           </div>
        ) : (
          <>
            {view === 'dashboard' && (
              <div className="space-y-6 animate-in fade-in duration-500">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatsCard label="Net Settled" value={`₹${stats.totalRevenue.toLocaleString()}`} color="bg-indigo-600" icon="₹" />
                  <StatsCard label="Net Profit" value={`₹${stats.totalProfit.toLocaleString()}`} color="bg-emerald-500" icon="📈" />
                  <StatsCard label="Margin (%)" value={`${stats.avgMargin.toFixed(1)}%`} color="bg-amber-500" icon="%" />
                  <StatsCard label="Total Orders" value={stats.orderCount} color="bg-slate-800" icon="📦" />
                </div>
                
                {(orders.length === 0 || orphanedCount.orders > 0) && !isLoading && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between">
                    <p className="text-xs font-bold text-amber-700">Records detected in database but not assigned to you. Recover them in the Settings tab.</p>
                    <button onClick={() => setView('settings')} className="text-[10px] font-black uppercase text-indigo-600">Fix Now</button>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-4"><OrderForm onAdd={addOrder} inventory={inventory} statuses={statuses} /></div>
                  <div className="lg:col-span-8 space-y-6">
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 h-[350px]">
                       <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6">Profitability Trend</h3>
                       <div className="h-full pb-8">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={monthlyData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 9, fontWeight: 900}} />
                            <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 9, fontWeight: 900}} />
                            <Tooltip contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}} />
                            <Area type="monotone" dataKey="profit" stroke="#10b981" fillOpacity={1} fill="url(#colorProfit)" />
                            <defs>
                              <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                            </defs>
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {view === 'orders' && (
              <div className="space-y-6 animate-in slide-in-from-bottom-10">
                <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                  {sortedStatusSummary.map(s => (
                    <div key={s.name} className="bg-white border border-slate-100 px-4 py-3 rounded-2xl min-w-[120px] shadow-sm flex flex-col gap-1 transition-all hover:border-indigo-200 hover:shadow-md">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest truncate">{s.name}</span>
                      <span className={`text-lg font-black ${s.count > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>{s.count}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 shadow-sm">
                  <h3 className="text-lg font-black text-slate-800 tracking-tight">Order Management</h3>
                  <div className="flex gap-2 w-full md:w-auto overflow-x-auto no-scrollbar pb-1 md:pb-0">
                    <select value={orderMonthFilter} onChange={(e) => setOrderMonthFilter(e.target.value)} className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-600 outline-none transition-all">
                      <option value="all">All Months</option>
                      {uniqueMonths.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select value={orderStatusFilter} onChange={(e) => setOrderStatusFilter(e.target.value)} className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-600 outline-none transition-all">
                      <option value="all">All Statuses</option>
                      {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
                  {filteredOrders.length === 0 ? (
                    <div className="bg-white p-12 text-center rounded-[2rem] border border-dashed border-slate-200">
                       <p className="text-sm font-bold text-slate-400">No orders found.</p>
                       <button onClick={() => { setOrderMonthFilter('all'); setOrderStatusFilter('all'); }} className="mt-4 text-xs font-black text-indigo-600 uppercase">Clear All Filters</button>
                    </div>
                  ) : (
                    filteredOrders.map(o => (
                      <div key={o.id} className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm transition-all hover:shadow-md">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full uppercase">{o.id}</span>
                            <h4 className="mt-2 text-base font-black text-slate-800 tracking-tight leading-none">{o.productName}</h4>
                            <p className="text-[9px] text-slate-400 font-bold mt-1 uppercase tracking-widest">{o.date}</p>
                          </div>
                          <button onClick={() => deleteOrder(o.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">✕</button>
                        </div>
                        <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-50">
                          <div><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Settled</p><p className={`text-lg font-black ${o.status === 'Settled' ? 'text-indigo-600' : 'text-slate-400'}`}>₹{o.settledAmount}</p></div>
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                            <select value={o.status} onChange={(e) => updateOrderStatus(o.id, e.target.value)} className="w-full p-2 text-[11px] font-black uppercase rounded-xl border bg-white cursor-pointer">
                              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                        </div>
                        {o.status === 'Returned' && <div className="mt-4"><button onClick={() => setReturnModalOrder(o)} className="w-full py-2.5 bg-indigo-50 text-indigo-600 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] hover:bg-indigo-100 transition-all">Edit Return Data</button></div>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {view === 'inventory' && (
              <div className="space-y-6 animate-in slide-in-from-bottom-10">
                <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                  <div><h2 className="text-xl font-black text-slate-800 tracking-tight">Stock Inventory</h2></div>
                  <button onClick={() => { setEditingItem(null); setIsInvFormOpen(true); }} className="bg-indigo-600 text-white px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest">Add Product</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inventory.map(item => (
                    <div key={item.id} className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm flex flex-col">
                      <div className="flex justify-between items-start mb-4">
                        <div><span className="text-[9px] font-black text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full uppercase">{item.sku}</span><h4 className="mt-2 text-base font-black text-slate-800 tracking-tight">{item.name}</h4></div>
                        <div className="flex gap-1"><button onClick={() => { setEditingItem(item); setIsInvFormOpen(true); }} className="p-2 text-indigo-400 hover:text-indigo-600">✎</button><button onClick={() => deleteInvItem(item.id)} className="p-2 text-rose-300 hover:text-rose-500">✕</button></div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mt-auto">
                        <div className="p-3 bg-slate-50 rounded-2xl"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">Stock</p><p className={`text-base font-black ${item.stockLevel <= item.minStockLevel ? 'text-rose-600' : 'text-slate-800'}`}>{item.stockLevel}</p></div>
                        <div className="p-3 bg-indigo-50 rounded-2xl"><p className="text-[8px] font-black text-indigo-400 uppercase mb-1">Est. Profit</p><p className="text-base font-black text-indigo-600">₹{(item.bankSettledAmount - item.unitCost).toFixed(0)}</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === 'reports' && (
              <div className="space-y-6 animate-in slide-in-from-bottom-10">
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm"><h2 className="text-xl font-black text-slate-800 tracking-tight">Performance Reports</h2></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 h-[400px]">
                     <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-8">Revenue vs Profit</h3>
                     <div className="h-full pb-10">
                       <ResponsiveContainer width="100%" height="100%">
                         <BarChart data={monthlyData}>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                           <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 9, fontWeight: 900}} />
                           <Tooltip cursor={{fill: '#f8fafc'}} />
                           <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={20} />
                           <Bar dataKey="profit" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                         </BarChart>
                       </ResponsiveContainer>
                     </div>
                   </div>
                   <div className="bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-sm">
                      <div className="p-6 bg-slate-50 border-b border-slate-100"><h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Niche Performance</h4></div>
                      <table className="w-full text-left text-[11px]">
                         <thead className="bg-white border-b border-slate-100"><tr className="text-slate-400 font-black uppercase"><th className="px-6 py-4">Category</th><th className="px-6 py-4 text-right">Profit</th></tr></thead>
                         <tbody className="divide-y divide-slate-50 font-bold">
                           {categories.map(cat => {
                             const catProfit = orders.filter(o => o.category === cat).reduce((sum, o) => {
                               if (o.status === 'Settled') return sum + Number(o.profit);
                               if (o.status === 'Returned' && o.claimStatus !== 'Approved') return sum - Number(o.lossAmount);
                               return sum;
                             }, 0);
                             return (<tr key={cat}><td className="px-6 py-4 text-slate-800">{cat}</td><td className={`px-6 py-4 text-right ${catProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>₹{catProfit.toLocaleString()}</td></tr>);
                           })}
                         </tbody>
                      </table>
                   </div>
                </div>
              </div>
            )}

            {view === 'settings' && (
              <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-bottom-10 pb-20">
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-8">System Configuration</h2>
                  
                  {/* Account Info */}
                  <div className="mb-12 p-6 bg-slate-50 border border-slate-100 rounded-3xl">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">My Account Information</h4>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                         <div>
                           <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em] mb-1">Unique User ID (UID)</p>
                           <code className="text-[11px] font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{user?.id}</code>
                         </div>
                         <button 
                          onClick={() => { navigator.clipboard.writeText(user?.id || ''); alert("UID Copied!"); }}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100"
                        >
                          Copy ID
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Migration Tool */}
                  <div className="mb-12 p-6 bg-indigo-50 border border-indigo-100 rounded-3xl">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-2xl shadow-sm">🔄</div>
                      <div className="flex-1">
                        <h4 className="text-sm font-black text-indigo-900 uppercase tracking-wider mb-1">Data Migration & Recovery</h4>
                        <p className="text-xs text-indigo-700 font-medium mb-4 leading-relaxed">If you ran the SQL command earlier and data is still missing, it is because <code className="bg-indigo-100 px-1 rounded">auth.uid()</code> doesn't work in the SQL Editor. You must use your manual ID below.</p>
                        
                        <div className="space-y-4">
                          <div className="bg-slate-900 p-5 rounded-2xl shadow-xl border border-slate-800">
                             <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">Run this NEW command in Supabase SQL Editor:</p>
                             <pre className="text-[10px] font-mono text-emerald-400 whitespace-pre-wrap leading-relaxed select-all cursor-pointer" onClick={(e) => { navigator.clipboard.writeText((e.currentTarget as HTMLPreElement).innerText); alert("SQL Copied!"); }}>
{`UPDATE osot_inventory SET user_id = '${user?.id}' WHERE user_id IS NULL;
UPDATE osot_orders SET user_id = '${user?.id}' WHERE user_id IS NULL;`}
                             </pre>
                             <p className="text-[8px] text-slate-600 mt-4 italic">Click the code above to copy it automatically.</p>
                          </div>

                          <div className="flex gap-3">
                            <button 
                              onClick={handleClaimLegacyData}
                              disabled={isMigrating}
                              className="px-6 py-4 bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50"
                            >
                              {isMigrating ? 'Syncing...' : 'Try Syncing via App'}
                            </button>
                            <button 
                              onClick={loadData}
                              className="px-6 py-4 bg-white border border-indigo-200 text-indigo-600 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-indigo-50"
                            >
                              Refresh Dashboard
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-6">
                      <div className="flex items-center justify-between mb-2"><h4 className="text-[11px] font-black text-indigo-500 uppercase tracking-[0.2em]">Product Categories</h4><span className="text-[10px] font-black text-slate-300">{categories.length} total</span></div>
                      <div className="space-y-3">
                        {categories.map((c, i) => (
                          <div key={i} className="group flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl transition-all hover:border-indigo-200 hover:bg-white shadow-sm hover:shadow-md">
                            {editingIndex?.type === 'cat' && editingIndex.index === i ? <input className="bg-white border border-indigo-500 px-3 py-1 rounded-lg text-sm font-bold text-slate-800 outline-none w-full" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => { if(editingIndex) { const newList = [...categories]; newList[editingIndex.index] = editValue.trim(); setCategories(newList); setEditingIndex(null); } }} autoFocus /> : <span className="text-sm font-bold text-slate-700">{c}</span>}
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => { setEditingIndex({type: 'cat', index: i}); setEditValue(c); }} className="p-2 text-indigo-400 hover:text-indigo-600">✎</button></div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-6">
                      <div className="flex items-center justify-between mb-2"><h4 className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.2em]">Workflow Statuses</h4><span className="text-[10px] font-black text-slate-300">{statuses.length} total</span></div>
                      <div className="space-y-3">
                        {statuses.map((s, i) => (
                          <div key={i} className="group flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl transition-all hover:border-emerald-200 hover:bg-white shadow-sm hover:shadow-md">
                            {editingIndex?.type === 'status' && editingIndex.index === i ? <input className="bg-white border border-emerald-500 px-3 py-1 rounded-lg text-sm font-bold text-slate-800 outline-none w-full" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => { if(editingIndex) { const newList = [...statuses]; newList[editingIndex.index] = editValue.trim(); setStatuses(newList); setEditingIndex(null); } }} autoFocus /> : <span className="text-sm font-bold text-slate-700">{s}</span>}
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => { setEditingIndex({type: 'status', index: i}); setEditValue(s); }} className="p-2 text-emerald-400 hover:text-emerald-600">✎</button></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {returnModalOrder && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white rounded-t-[3rem] md:rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in slide-in-from-bottom-20 duration-500">
            <div className="p-8 border-b border-slate-100 bg-indigo-600 text-white flex justify-between items-center">
              <div><h3 className="text-xl font-black tracking-tight">Return Management</h3><p className="text-[9px] font-black tracking-widest mt-1 opacity-80 uppercase">Order: {returnModalOrder.id}</p></div>
              <button onClick={() => setReturnModalOrder(null)} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-full font-bold">✕</button>
            </div>
            <div className="p-8 space-y-8 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setReturnModalOrder({...returnModalOrder, returnType: 'Courier', lossAmount: 0, claimStatus: 'None'})} className={`p-6 rounded-[2.5rem] border-4 transition-all ${returnModalOrder.returnType === 'Courier' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-50 text-slate-400 grayscale'}`}><div className="text-3xl mb-2">🚚</div><div className="text-[11px] font-black uppercase">Courier</div></button>
                <button onClick={() => setReturnModalOrder({...returnModalOrder, returnType: 'Customer', claimStatus: 'Pending'})} className={`p-6 rounded-[2.5rem] border-4 transition-all ${returnModalOrder.returnType === 'Customer' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-50 text-slate-400 grayscale'}`}><div className="text-3xl mb-2">🏠</div><div className="text-[11px] font-black uppercase">Customer</div></button>
              </div>
              <div className="pt-4 flex flex-col md:flex-row gap-4">
                <button onClick={() => setReturnModalOrder(null)} className="flex-1 py-5 text-slate-400 font-black text-[11px] uppercase tracking-widest order-2 md:order-1">Discard</button>
                <button onClick={() => handleReturnDetailSubmit(returnModalOrder)} className="flex-1 py-5 bg-indigo-600 text-white font-black text-[11px] uppercase tracking-widest rounded-2xl order-1 md:order-2 shadow-xl shadow-indigo-100">Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isInvFormOpen && (
        <InventoryForm onAdd={addInvItem} onUpdate={updateInvItem} onClose={() => setIsInvFormOpen(false)} inventory={inventory} categories={categories} initialData={editingItem} />
      )}
    </div>
  );
};

export default App;
