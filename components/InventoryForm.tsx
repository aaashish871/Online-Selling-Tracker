
import React, { useState, useEffect } from 'react';
import { InventoryItem } from '../types.ts';

interface InventoryFormProps {
  onAdd: (item: InventoryItem) => void;
  onUpdate: (item: InventoryItem) => void;
  onClose: () => void;
  initialData?: InventoryItem | null;
  inventory: InventoryItem[];
  categories: string[];
}

const InventoryForm: React.FC<InventoryFormProps> = ({ onAdd, onUpdate, onClose, initialData, inventory, categories }) => {
  const [formData, setFormData] = useState({
    name: '',
    category: categories[0] || '',
    sku: '',
    stockLevel: '',
    unitCost: '',
    retailPrice: '',
    bankSettledAmount: '',
    minStockLevel: '5'
  });

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      const getVal = (obj: any, camelKey: string) => {
        if (obj[camelKey] !== undefined && obj[camelKey] !== null) return obj[camelKey];
        const snakeKey = camelKey.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        if (obj[snakeKey] !== undefined && obj[snakeKey] !== null) return obj[snakeKey];
        const keys = Object.keys(obj);
        const lowerKey = camelKey.toLowerCase();
        const foundKey = keys.find(k => k.toLowerCase() === lowerKey);
        if (foundKey) return obj[foundKey];
        return undefined;
      };

      setFormData({
        name: initialData.name || '',
        category: initialData.category || categories[0] || '',
        sku: initialData.sku || '',
        stockLevel: (getVal(initialData, 'stockLevel') ?? '').toString(),
        unitCost: (getVal(initialData, 'unitCost') ?? '').toString(),
        retailPrice: (getVal(initialData, 'retailPrice') ?? '').toString(),
        bankSettledAmount: (getVal(initialData, 'bankSettledAmount') ?? '').toString(),
        minStockLevel: (getVal(initialData, 'minStockLevel') ?? '5').toString()
      });
    } else {
      setFormData({
        name: '',
        category: categories[0] || '',
        sku: '',
        stockLevel: '',
        unitCost: '',
        retailPrice: '',
        bankSettledAmount: '',
        minStockLevel: '5'
      });
    }
    setError(null);
  }, [initialData, categories]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // SKU Uniqueness check
    const isDuplicate = inventory.some(item => 
      item.sku.trim().toLowerCase() === formData.sku.trim().toLowerCase() && 
      (!initialData || item.id !== initialData.id)
    );

    if (isDuplicate) {
      setError(`The SKU ID "${formData.sku}" is already in use by another product. Please enter a unique SKU ID.`);
      return;
    }
    
    const item: InventoryItem = {
      id: initialData?.id || `INV-${Math.floor(Math.random() * 10000)}`,
      name: formData.name,
      category: formData.category,
      sku: formData.sku.trim(),
      stockLevel: parseInt(formData.stockLevel) || 0,
      unitCost: parseFloat(formData.unitCost) || 0,
      retailPrice: parseFloat(formData.retailPrice) || 0,
      bankSettledAmount: parseFloat(formData.bankSettledAmount) || 0,
      minStockLevel: parseInt(formData.minStockLevel) || 0,
    };

    if (initialData) {
      onUpdate(item);
    } else {
      onAdd(item);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
          <h2 className="text-xl font-bold text-slate-800">
            {initialData ? 'Update Inventory Item' : 'Add New Product'}
          </h2>
          <button onClick={onClose} type="button" className="text-slate-400 hover:text-slate-600 p-1">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto bg-white">
          {error && (
            <div className="bg-rose-50 border-l-4 border-rose-500 p-4 mb-2 animate-in slide-in-from-top-2 duration-300">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-bold text-rose-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Product Name</label>
            <input
              required
              type="text"
              className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white text-slate-800"
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
                className={`w-full px-4 py-2 rounded-lg border ${error ? 'border-rose-300 ring-2 ring-rose-50' : 'border-slate-200'} focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-800`}
                value={formData.sku}
                onChange={e => {
                  setFormData({...formData, sku: e.target.value});
                  if (error) setError(null);
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Category</label>
              <select
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-800"
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value})}
              >
                {categories.length > 0 ? (
                  categories.map(c => <option key={c} value={c}>{c}</option>)
                ) : (
                  <option value="" disabled>No categories defined</option>
                )}
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
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-800"
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
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-800"
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
              className="w-full px-4 py-2 rounded-lg border border-indigo-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-bold text-slate-800"
              value={formData.bankSettledAmount}
              onChange={e => setFormData({...formData, bankSettledAmount: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Current Stock</label>
              <input
                required
                type="number"
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-800"
                value={formData.stockLevel}
                onChange={e => setFormData({...formData, stockLevel: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Min. Alert Level</label>
              <input
                required
                type="number"
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-800"
                value={formData.minStockLevel}
                onChange={e => setFormData({...formData, minStockLevel: e.target.value})}
              />
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors bg-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all"
            >
              {initialData ? 'Update Item' : 'Add to Inventory'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InventoryForm;
