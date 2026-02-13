
import React, { useState, useMemo, useEffect } from 'react';
import { Order, InventoryItem, MonthlyReport } from './types.ts';
import { INITIAL_STATUSES, CATEGORIES } from './constants.tsx';
import StatsCard from './components/StatsCard.tsx';
import OrderForm from './components/OrderForm.tsx';
import InventoryForm from './components/InventoryForm.tsx';
import { getAIAnalysis } from './services/geminiService.ts';
import { dbService } from './services/dbService.ts';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';

type ViewMode = 'dashboard' | 'orders' | 'inventory' | 'reports' | 'settings';

const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>('dashboard');
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [statuses, setStatuses] = useState<string[]>(INITIAL_STATUSES);
  const [categories, setCategories] = useState<string[]>(CATEGORIES);
  
  const [isInvFormOpen, setIsInvFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [aiInsights, setAiInsights] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTableMissing, setIsTableMissing] = useState(false);

  const isDbConfigured = dbService.isConfigured();

  // Initial Data Load
  useEffect(() => {
    const loadData = async () => {
      if (!isDbConfigured) {
        setIsLoading(false);
        return;
      }
      try {
        const [fetchedOrders, fetchedInventory] = await Promise.all([
          dbService.getOrders(),
          dbService.getInventory()
        ]);
        setOrders(fetchedOrders || []);
        setInventory(fetchedInventory || []);
        setIsTableMissing(false);
      } catch (error: any) {
        console.error("Database connection failed", error);
        if (error.message?.includes('Could not find the table') || error.message?.includes('relation') || error.message?.includes('404')) {
          setIsTableMissing(true);
        }
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [isDbConfigured]);

  // Status Management
  const [newStatusName, setNewStatusName] = useState('');
  const addStatus = () => {
    if (newStatusName && !statuses.includes(newStatusName)) {
      setStatuses([...statuses, newStatusName]);
      setNewStatusName('');
    }
  };
  const removeStatus = (status: string) => setStatuses(statuses.filter(s => s !== status));

  // Category Management
  const [newCategoryName, setNewCategoryName] = useState('');
  const addCategory = () => {
    if (newCategoryName && !categories.includes(newCategoryName)) {
      setCategories([...categories, newCategoryName]);
      setNewCategoryName('');
    }
  };
  const removeCategory = (category: string) => setCategories(categories.filter(c => c !== category));

  const stats = useMemo(() => {
    const revenue = orders.reduce((sum, o) => sum + (Number(o.settledAmount) || 0), 0);
    const profit = orders.reduce((sum, o) => sum + (Number(o.profit) || 0), 0);
    const count = orders.length;
    const margin = count > 0 ? (profit / (revenue || 1)) * 100 : 0;
    
    return {
      totalRevenue: revenue,
      totalProfit: profit,
      avgMargin: margin,
      orderCount: count
    };
  }, [orders]);

  const monthlyReports = useMemo((): MonthlyReport[] => {
    const reportsMap: Record<string, MonthlyReport> = {};
    orders.forEach(o => {
      const monthYear = o.date.substring(0, 7);
      if (!reportsMap[monthYear]) {
        reportsMap[monthYear] = { 
          month: monthYear, 
          sales: 0, 
          profit: 0, 
          orderCount: 0, 
          topProduct: '' 
        };
      }
      reportsMap[monthYear].sales += (Number(o.settledAmount) || 0);
      reportsMap[monthYear].profit += (Number(o.profit) || 0);
      reportsMap[monthYear].orderCount += 1;
    });

    Object.keys(reportsMap).forEach(month => {
      const monthOrders = orders.filter(o => o.date.startsWith(month));
      const counts: Record<string, number> = {};
      monthOrders.forEach(o => counts[o.productName] = (counts[o.productName] || 0) + 1);
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      reportsMap[month].topProduct = top ? top[0] : 'N/A';
    });

    return Object.values(reportsMap).sort((a, b) => b.month.localeCompare(a.month));
  }, [orders]);

  const chartData = useMemo(() => {
    const categoryMap: Record<string, { name: string; profit: number; revenue: number }> = {};
    orders.forEach(o => {
      if (!categoryMap[o.category]) {
        categoryMap[o.category] = { name: o.category, profit: 0, revenue: 0 };
      }
      categoryMap[o.category].profit += (Number(o.profit) || 0);
      categoryMap[o.category].revenue += (Number(o.settledAmount) || 0);
    });
    return Object.values(categoryMap);
  }, [orders]);

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    const result = await getAIAnalysis(orders);
    setAiInsights(result);
    setIsAnalyzing(false);
  };

  const addOrder = async (order: Order) => {
    if (!isDbConfigured) return;
    setIsSyncing(true);
    try {
      await dbService.saveOrder(order);
      setOrders([order, ...orders]);
      const updatedInv = await dbService.getInventory();
      setInventory(updatedInv || []);
    } catch (err) {
      console.error(err);
      alert("Failed to record order.");
    } finally {
      setIsSyncing(false);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    if (!isDbConfigured) return;
    const orderToUpdate = orders.find(o => o.id === orderId);
    if (!orderToUpdate) return;

    const updatedOrder = { ...orderToUpdate, status: newStatus };
    setIsSyncing(true);
    try {
      await dbService.updateOrder(updatedOrder);
      setOrders(orders.map(o => o.id === orderId ? updatedOrder : o));
    } catch (err) {
      console.error(err);
      alert("Failed to update status.");
    } finally {
      setIsSyncing(false);
    }
  };

  const deleteOrder = async (id: string) => {
    if (!isDbConfigured) return;
    if (!confirm("Are you sure you want to delete this order record?")) return;
    setIsSyncing(true);
    try {
      await dbService.deleteOrder(id);
      setOrders(orders.filter(o => o.id !== id));
    } finally {
      setIsSyncing(false);
    }
  };
  
  const addInventoryItem = async (item: InventoryItem) => {
    if (!isDbConfigured) return;
    setIsSyncing(true);
    try {
      await dbService.saveInventoryItem(item);
      const updatedInv = await dbService.getInventory();
      setInventory(updatedInv || []);
    } catch (err) {
      console.error(err);
      alert("Failed to save product.");
    } finally {
      setIsSyncing(false);
    }
  };

  const updateInventoryItem = async (item: InventoryItem) => {
    if (!isDbConfigured) return;
    setIsSyncing(true);
    try {
      await dbService.updateInventoryItem(item);
      const updatedInv = await dbService.getInventory();
      setInventory(updatedInv || []);
    } catch (err) {
      console.error(err);
      alert("Failed to update product.");
    } finally {
      setIsSyncing(false);
    }
  };

  const deleteInventoryItem = async (id: string) => {
    if (!isDbConfigured) return;
    if (!confirm('Are you sure you want to delete this product? This may affect order history if referenced.')) return;
    setIsSyncing(true);
    try {
      await dbService.deleteInventoryItem(id);
      setInventory(inventory.filter(i => i.id !== id));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleEditInventory = (item: InventoryItem) => {
    setEditingItem({...item});
    setIsInvFormOpen(true);
  };

  const handleCloseInvForm = () => {
    setIsInvFormOpen(false);
    setEditingItem(null);
  };

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 font-medium animate-pulse">Initializing Dashboard...</p>
      </div>
    );
  }

  const showSetup = !isDbConfigured || isTableMissing;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-40 px-4 md:px-8 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-indigo-200 shadow-lg">O</div>
            <div className="flex flex-col">
              <h1 className="text-sm font-bold text-slate-800 leading-tight hidden sm:block">Online Selling Tracker</h1>
              <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest hidden sm:block">Idea Developed by Ashish Ahuja</span>
            </div>
          </div>
          {!showSetup && (
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto max-w-[50vw]">
              {(['dashboard', 'orders', 'inventory', 'reports', 'settings'] as ViewMode[]).map(m => (
                <button 
                  key={m}
                  onClick={() => setView(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all whitespace-nowrap ${view === m ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {m === 'dashboard' ? 'Dashboard' : m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all ${showSetup ? 'bg-rose-100 text-rose-700' : isSyncing ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${showSetup ? 'bg-rose-500' : isSyncing ? 'bg-amber-500 animate-bounce' : 'bg-emerald-500'}`}></span>
            {showSetup ? 'Setup Required' : isSyncing ? 'Syncing...' : 'Live Connected'}
          </div>
        </div>
      </nav>

      <main className="flex-grow max-w-7xl mx-auto w-full px-4 md:px-8 py-8 animate-in fade-in duration-500">
        
        {showSetup ? (
          <div className="max-w-3xl mx-auto space-y-8 py-10">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-3xl flex items-center justify-center mx-auto text-3xl shadow-inner">⚠️</div>
              <h2 className="text-3xl font-black text-slate-800 tracking-tight">Database Tables Missing</h2>
              <p className="text-slate-500 max-w-lg mx-auto leading-relaxed">
                {isTableMissing 
                  ? "We connected to your Supabase, but the 'osot_inventory' and 'osot_orders' tables were not found."
                  : "To start tracking, connect your Supabase database by setting environment variables."}
              </p>
            </div>

            <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-2xl space-y-6">
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-widest">Setup Instructions</h3>
                <p className="text-xs text-slate-400">Run this SQL in your Supabase SQL Editor to create the required tables and logic:</p>
                <div className="bg-black/50 p-4 rounded-xl border border-white/5 font-mono text-[10px] text-emerald-500 overflow-x-auto whitespace-pre h-64">
{`CREATE TABLE osot_inventory (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  sku TEXT NOT NULL,
  "stockLevel" INTEGER DEFAULT 0,
  "unitCost" NUMERIC(12, 2) DEFAULT 0,
  "retailPrice" NUMERIC(12, 2) DEFAULT 0,
  "bankSettledAmount" NUMERIC(12, 2) DEFAULT 0,
  "minStockLevel" INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE osot_orders (
  id TEXT PRIMARY KEY,
  date DATE DEFAULT CURRENT_DATE,
  "productId" TEXT REFERENCES osot_inventory(id),
  "productName" TEXT NOT NULL,
  category TEXT NOT NULL,
  "listingPrice" NUMERIC(12, 2) DEFAULT 0,
  "settledAmount" NUMERIC(12, 2) DEFAULT 0,
  profit NUMERIC(12, 2) DEFAULT 0,
  status TEXT DEFAULT 'Pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION osot_handle_new_order_stock()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE osot_inventory
  SET "stockLevel" = "stockLevel" - 1
  WHERE id = NEW."productId";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_osot_order_created
AFTER INSERT ON osot_orders
FOR EACH ROW
EXECUTE FUNCTION osot_handle_new_order_stock();`}
                </div>
              </div>
              
              <button 
                onClick={() => window.location.reload()}
                className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
              >
                I have run the script, Refresh Now
              </button>
            </div>
          </div>
        ) : (
          <>
            {view === 'dashboard' && (
              <div className="space-y-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatsCard label="Total Bank Settled" value={`₹${stats.totalRevenue.toLocaleString()}`} color="bg-indigo-500" icon={<span className="text-lg">₹</span>} />
                  <StatsCard label="Total Profit" value={`₹${stats.totalProfit.toLocaleString()}`} color="bg-emerald-500" icon={<span className="text-lg">📈</span>} />
                  <StatsCard label="Net Margin (%)" value={`${stats.avgMargin.toFixed(1)}%`} color="bg-amber-500" icon={<span className="text-lg">%</span>} />
                  <StatsCard label="Order Volume" value={stats.orderCount} color="bg-violet-500" icon={<span className="text-lg">📦</span>} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-4 h-full">
                    <OrderForm 
                      onAdd={addOrder} 
                      inventory={inventory}
                      statuses={statuses}
                    />
                  </div>

                  <div className="lg:col-span-8 space-y-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                      <h3 className="text-sm font-bold text-slate-800 mb-6 flex items-center gap-2 uppercase tracking-widest">
                        Profit Analysis (Bank Settled Basis)
                      </h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                            <Tooltip 
                               formatter={(value: any) => [`₹${value.toLocaleString()}`, 'Profit']}
                               contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} 
                            />
                            <Bar dataKey="profit" radius={[4, 4, 0, 0]} barSize={40}>
                              {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="bg-slate-900 text-white p-6 rounded-2xl flex flex-col shadow-xl">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-400">AI Intelligence</h3>
                        <button onClick={runAnalysis} disabled={isAnalyzing} className="text-[10px] font-bold bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full transition-colors">
                          {isAnalyzing ? "Checking..." : "Analyze Performance"}
                        </button>
                      </div>
                      <div className="min-h-[100px] text-xs text-slate-300 leading-relaxed overflow-y-auto italic">
                        {aiInsights || "Bank settlement trends are being analyzed. Click refresh to audit performance."}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <h3 className="font-bold text-slate-800">Recent Transactions</h3>
                    <button onClick={() => setView('orders')} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors uppercase tracking-widest">Manage All Orders →</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[9px] tracking-widest">
                        <tr>
                          <th className="px-6 py-4">Order ID</th>
                          <th className="px-6 py-4">Product Name</th>
                          <th className="px-6 py-4">Bank Settled</th>
                          <th className="px-6 py-4">Profit</th>
                          <th className="px-6 py-4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {orders.length === 0 ? (
                          <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic">No orders recorded yet.</td></tr>
                        ) : (
                          orders.slice(0, 5).map(o => (
                            <tr key={o.id} className="hover:bg-slate-50 group transition-colors">
                              <td className="px-6 py-4 font-mono text-[11px] text-slate-500">{o.id}</td>
                              <td className="px-6 py-4">
                                <div className="font-medium text-slate-700">{o.productName}</div>
                                <div className="text-[10px] text-slate-400">{o.date}</div>
                              </td>
                              <td className="px-6 py-4 text-slate-600 font-medium">₹{(Number(o.settledAmount) || 0).toFixed(2)}</td>
                              <td className="px-6 py-4 font-bold text-emerald-600">+₹{(Number(o.profit) || 0).toFixed(2)}</td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ring-1 ${o.status === 'Settled' ? 'bg-emerald-100 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
                                  {o.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {view === 'orders' && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50/30 flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Order Management & Tracking</h3>
                    <p className="text-xs text-slate-400 mt-1">Track orders through your lifecycle stages until final bank settlement.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Active: {orders.length}</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-widest">
                      <tr>
                        <th className="px-6 py-4">Order ID & Date</th>
                        <th className="px-6 py-4">Product Info</th>
                        <th className="px-6 py-4 text-center">Settlement Value (₹)</th>
                        <th className="px-6 py-4">Current Status (Progressive)</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {orders.length === 0 ? (
                        <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic">No orders to track. Add your first order from the dashboard.</td></tr>
                      ) : (
                        orders.map(o => (
                          <tr key={o.id} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="font-mono text-xs font-bold text-slate-700">{o.id}</div>
                              <div className="text-[10px] text-slate-400">{o.date}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-semibold text-slate-700">{o.productName}</div>
                              <div className="text-[10px] text-indigo-500 font-bold uppercase tracking-tight">{o.category}</div>
                            </td>
                            <td className="px-6 py-4 text-center">
                               <div className="text-indigo-600 font-bold">₹{(Number(o.settledAmount) || 0).toFixed(2)}</div>
                               <div className="text-[9px] text-emerald-500 font-black uppercase">Profit: ₹{(Number(o.profit) || 0).toFixed(2)}</div>
                            </td>
                            <td className="px-6 py-4">
                              <select 
                                value={o.status}
                                onChange={(e) => updateOrderStatus(o.id, e.target.value)}
                                className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                                  o.status === 'Settled' 
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                                    : o.status === 'Cancelled' || o.status === 'Returned'
                                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                                    : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300'
                                }`}
                              >
                                {statuses.map(s => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-6 py-4 text-right">
                               <button 
                                 onClick={() => deleteOrder(o.id)}
                                 className="p-2 text-slate-300 hover:text-rose-600 transition-colors"
                                 title="Delete Order Record"
                               >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                               </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {view === 'inventory' && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50/30 flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Inventory Catalog</h3>
                    <p className="text-xs text-slate-400 mt-1">Configure your product purchasing and bank settlement values here.</p>
                  </div>
                  <button 
                    onClick={() => { setEditingItem(null); setIsInvFormOpen(true); }}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md hover:bg-indigo-700 transition-all"
                  >
                    Add New Product
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-widest">
                      <tr>
                        <th className="px-6 py-4">Product Details</th>
                        <th className="px-6 py-4">Unit Cost (₹)</th>
                        <th className="px-6 py-4">Bank Settled (₹)</th>
                        <th className="px-6 py-4">Unit Profit</th>
                        <th className="px-6 py-4">Stock Status</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {inventory.length === 0 ? (
                        <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-400 italic">No products in inventory yet.</td></tr>
                      ) : (
                        inventory.map(item => (
                          <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-6 py-4">
                              <strong className="text-slate-700 font-semibold">{item.name}</strong><br/>
                              <span className="text-[10px] text-slate-400 font-mono tracking-tighter">SKU: {item.sku} | Website: ₹{item.retailPrice}</span>
                            </td>
                            <td className="px-6 py-4 text-rose-500 font-medium">₹{(Number(item.unitCost) || 0).toFixed(2)}</td>
                            <td className="px-6 py-4 text-indigo-600 font-bold">₹{(Number(item.bankSettledAmount) || 0).toFixed(2)}</td>
                            <td className="px-6 py-4">
                              <div className="font-bold text-emerald-600">₹{((Number(item.bankSettledAmount) || 0) - (Number(item.unitCost) || 0)).toFixed(2)}</div>
                              <div className="text-[9px] text-slate-400 uppercase font-black">Margin: {((((Number(item.bankSettledAmount) || 0) - (Number(item.unitCost) || 0)) / (Number(item.bankSettledAmount) || 1)) * 100).toFixed(1)}%</div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${item.stockLevel < item.minStockLevel ? 'bg-rose-100 text-rose-700 animate-pulse' : 'bg-slate-100 text-slate-600'}`}>
                                {item.stockLevel} units
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => handleEditInventory(item)} 
                                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                  title="Edit Product"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                </button>
                                <button 
                                  onClick={() => deleteInventoryItem(item.id)} 
                                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                  title="Delete Product"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {view === 'reports' && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <span className="w-2 h-2 bg-indigo-600 rounded-full"></span>
                    Monthly Performance Summary
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {monthlyReports.map(report => (
                      <div key={report.month} className="p-6 border border-slate-100 rounded-2xl bg-white shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-center mb-5">
                          <span className="text-xs font-black text-indigo-600 uppercase tracking-widest">{new Date(report.month + '-01').toLocaleDateString(undefined, {month: 'long', year: 'numeric'})}</span>
                          <span className="text-[9px] font-bold bg-slate-100 px-2 py-0.5 rounded uppercase text-slate-500">{report.orderCount} Orders</span>
                        </div>
                        <div className="space-y-4">
                          <div className="flex justify-between items-end">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Net Settlement</span>
                            <span className="text-lg font-bold text-slate-800">₹{report.sales.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between items-end">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Net Profit</span>
                            <span className={`text-lg font-bold ${report.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              ₹{report.profit.toLocaleString()}
                            </span>
                          </div>
                          <div className="pt-4 border-t border-slate-50 flex flex-col gap-1">
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Top Selling Item</span>
                            <span className="text-xs font-semibold text-slate-600 truncate">{report.topProduct}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {view === 'settings' && (
              <div className="max-w-xl mx-auto space-y-8">
                {/* Workflow Labels */}
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                  <h3 className="text-xl font-bold mb-2">Workflow Management</h3>
                  <p className="text-xs text-slate-400 mb-6">Manage your business order stages and status labels.</p>
                  
                  <div className="flex gap-2 mb-8">
                    <input 
                      type="text" 
                      className="flex-grow px-4 py-3 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none bg-white text-slate-900" 
                      placeholder="e.g. Dispatched, Pending Verification..."
                      value={newStatusName}
                      onChange={e => setNewStatusName(e.target.value)}
                      onKeyPress={e => e.key === 'Enter' && addStatus()}
                    />
                    <button 
                      onClick={addStatus}
                      className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                    >
                      Add Label
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-2">
                    {statuses.map(s => (
                      <div key={s} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl hover:bg-white hover:border-indigo-100 transition-all">
                        <span className="text-sm font-semibold text-slate-600">{s}</span>
                        <button 
                          onClick={() => removeStatus(s)}
                          className="text-slate-300 hover:text-rose-500 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Category Customization */}
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                  <h3 className="text-xl font-bold mb-2">Category Customization</h3>
                  <p className="text-xs text-slate-400 mb-6">Create and manage product categories for your inventory.</p>
                  
                  <div className="flex gap-2 mb-8">
                    <input 
                      type="text" 
                      className="flex-grow px-4 py-3 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none bg-white text-slate-900" 
                      placeholder="e.g. Footwear, Accessories, Groceries..."
                      value={newCategoryName}
                      onChange={e => setNewCategoryName(e.target.value)}
                      onKeyPress={e => e.key === 'Enter' && addCategory()}
                    />
                    <button 
                      onClick={addCategory}
                      className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                    >
                      Add Category
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-2">
                    {categories.map(c => (
                      <div key={c} className="flex items-center justify-between p-4 bg-emerald-50/30 border border-emerald-100 rounded-xl hover:bg-white hover:border-emerald-200 transition-all">
                        <span className="text-sm font-semibold text-slate-700">{c}</span>
                        <button 
                          onClick={() => removeCategory(c)}
                          className="text-slate-300 hover:text-rose-500 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer Signature */}
      <footer className="w-full py-8 mt-auto border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="inline-block p-1 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-full mb-3">
             <div className="px-4 py-1.5 bg-white rounded-full">
               <span className="text-[11px] font-black tracking-[0.2em] text-indigo-600 uppercase">
                 Idea Developed by Ashish Ahuja
               </span>
             </div>
          </div>
          <p className="text-[10px] text-slate-400 font-medium">© {new Date().getFullYear()} Online Selling Order Tracker. All rights reserved.</p>
        </div>
      </footer>

      {isInvFormOpen && (
        <InventoryForm 
          onAdd={addInventoryItem} 
          onUpdate={updateInventoryItem}
          onClose={handleCloseInvForm} 
          initialData={editingItem}
          inventory={inventory}
          categories={categories}
        />
      )}
    </div>
  );
};

export default App;
