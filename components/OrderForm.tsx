
import React, { useState } from 'react';
import { Order, InventoryItem } from '../types.ts';

interface OrderFormProps {
  onAdd: (order: Order) => void;
  inventory: InventoryItem[];
  statuses: string[];
}

const OrderForm: React.FC<OrderFormProps> = ({ onAdd, inventory, statuses }) => {
  const [formData, setFormData] = useState({
    id: `ORD-${Math.floor(Math.random() * 100000)}`,
    date: new Date().toISOString().split('T')[0],
    productId: '',
    status: statuses[0] || ''
  });

  const selectedProduct = inventory.find(i => i.id === formData.productId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) {
      alert("Please select a product from inventory.");
      return;
    }

    const settled = selectedProduct.bankSettledAmount;
    const cost = selectedProduct.unitCost;
    const profit = settled - cost;

    const newOrder: Order = {
      id: formData.id,
      date: formData.date,
      productId: formData.productId,
      productName: selectedProduct.name,
      category: selectedProduct.category,
      listingPrice: selectedProduct.retailPrice,
      settledAmount: settled,
      profit: profit,
      status: formData.status
    };

    onAdd(newOrder);
    
    setFormData({
      id: `ORD-${Math.floor(Math.random() * 100000)}`,
      date: new Date().toISOString().split('T')[0],
      productId: '',
      status: statuses[0] || ''
    });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full">
      <div className="p-5 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <span className="p-1.5 bg-indigo-600 rounded-lg text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
          </span>
          Log New Order
        </h2>
      </div>
      <form onSubmit={handleSubmit} className="p-5 space-y-5 flex-grow">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Order ID</label>
            <input
              required
              type="text"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 font-mono text-xs focus:ring-2 focus:ring-indigo-500/20 outline-none"
              value={formData.id}
              onChange={e => setFormData({...formData, id: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Order Date</label>
            <input
              required
              type="date"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500/20 outline-none"
              value={formData.date}
              onChange={e => setFormData({...formData, date: e.target.value})}
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Select Product</label>
          <select
            required
            className="w-full px-3 py-3 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none appearance-none bg-white font-medium"
            value={formData.productId}
            onChange={e => setFormData({...formData, productId: e.target.value})}
          >
            <option value="" disabled>Select from inventory...</option>
            {inventory.map(item => (
              <option key={item.id} value={item.id}>
                {item.name} (Settled: ₹{item.bankSettledAmount})
              </option>
            ))}
          </select>
          {selectedProduct && (
            <div className="mt-2 p-3 bg-emerald-50 rounded-lg border border-emerald-100 flex justify-between items-center">
              <span className="text-[10px] font-bold text-emerald-700 uppercase">Est. Unit Profit:</span>
              <span className="text-sm font-bold text-emerald-600">₹{(selectedProduct.bankSettledAmount - selectedProduct.unitCost).toFixed(2)}</span>
            </div>
          )}
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Current Status</label>
          <select
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none bg-white"
            value={formData.status}
            onChange={e => setFormData({...formData, status: e.target.value})}
          >
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <button
          type="submit"
          className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2 group active:scale-[0.98]"
        >
          Record Order
        </button>
      </form>
    </div>
  );
};

export default OrderForm;
