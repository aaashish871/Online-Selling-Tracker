
import React, { useState } from 'react';
import { InventoryItem } from '../types.ts';
import { CATEGORIES } from '../constants.tsx';

interface InventoryFormProps {
  onAdd: (item: InventoryItem) => void;
  onClose: () => void;
}

const InventoryForm: React.FC<InventoryFormProps> = ({ onAdd, onClose }) => {
  const [formData, setFormData] = useState({
    name: '',
    category: CATEGORIES[0],
    sku: '',
    stockLevel: '',
    unitCost: '',
    retailPrice: '',
    bankSettledAmount: '',
    minStockLevel: '5'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newItem: InventoryItem = {
      id: `INV-${Math.floor(Math.random() * 10000)}`,
      name: formData.name,
      category: formData.category,
      sku: formData.sku,
      stockLevel: parseInt(formData.stockLevel) || 0,
      unitCost: parseFloat(formData.unitCost) || 0,
      retailPrice: parseFloat(formData.retailPrice) || 0,
      bankSettledAmount: parseFloat(formData.bankSettledAmount) || 0,
      minStockLevel: parseInt(formData.minStockLevel) || 0,
    };
    onAdd(newItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800">Add New Product</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Product Name</label>
            <input
              required
              type="text"
              className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">SKU / ID</label>
              <input
                required
                type="text"
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                value={formData.sku}
                onChange={e => setFormData({...formData, sku: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Category</label>
              <select
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value})}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1 text-rose-600">Purchasing Price (₹)</label>
              <input
                required
                type="number"
                step="0.01"
                placeholder="Purchase cost"
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                value={formData.unitCost}
                onChange={e => setFormData({...formData, unitCost: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Listing Price (₹)</label>
              <input
                required
                type="number"
                step="0.01"
                placeholder="Price on website"
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                value={formData.retailPrice}
                onChange={e => setFormData({...formData, retailPrice: e.target.value})}
              />
            </div>
          </div>

          <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
            <label className="block text-sm font-bold text-indigo-700 mb-1">Bank Settled Amount (₹)</label>
            <input
              required
              type="number"
              step="0.01"
              placeholder="Bank settlement amount"
              className="w-full px-4 py-2 rounded-lg border border-indigo-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-bold"
              value={formData.bankSettledAmount}
              onChange={e => setFormData({...formData, bankSettledAmount: e.target.value})}
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all"
            >
              Add to Inventory
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InventoryForm;
