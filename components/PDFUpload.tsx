
import React, { useState, useRef } from 'react';
import { Order, InventoryItem } from '../types.ts';
import { convertPdfToImages } from '../services/pdfService.ts';
import { extractOrdersFromImages } from '../services/geminiService.ts';
import { FileUp, Loader2, CheckCircle2, AlertCircle, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PDFUploadProps {
  onOrdersExtracted: (orders: Order[]) => Promise<void>;
  inventory: InventoryItem[];
  statuses: string[];
  existingOrders: Order[];
}

const PDFUpload: React.FC<PDFUploadProps> = ({ onOrdersExtracted, inventory, statuses, existingOrders }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<'idle' | 'converting' | 'extracting' | 'saving' | 'success' | 'error' | 'duplicate-check'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [duplicateOrders, setDuplicateOrders] = useState<{ new: Order, existing: Order }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('Please upload a valid PDF file.');
      setStatus('error');
      return;
    }

    processFile(file);
  };

  const processFile = async (file: File) => {
    setIsProcessing(true);
    setError(null);
    setProgress(0);
    
    try {
      // 1. Convert PDF to Images
      setStatus('converting');
      setProgress(20);
      const images = await convertPdfToImages(file);
      
      // 2. Extract Data using Gemini
      setStatus('extracting');
      setProgress(50);
      const extractedData = await extractOrdersFromImages(images);
      
      if (extractedData.length === 0) {
        throw new Error("No orders found in the PDF. Please ensure it's a valid invoice.");
      }

      // 3. Map to Order objects
      setStatus('saving');
      setProgress(80);
      
      const newOrders: Order[] = extractedData.map((data: any) => {
        // Try to find matching product in inventory by SKU or Name
        const matchedProduct = inventory.find(i => 
          (data.sku && i.sku.toLowerCase() === data.sku.toLowerCase()) ||
          (data.productName && i.name.toLowerCase().includes(data.productName.toLowerCase()))
        );

        const listingPrice = data.listingPrice || 0;
        const settledAmount = data.settledAmount || (matchedProduct?.bankSettledAmount || listingPrice * 0.85);
        const cost = matchedProduct?.unitCost || 0;
        const profit = settledAmount - cost;

        return {
          id: data.id || `AUTO-${Math.random().toString(36).substr(2, 9)}`,
          date: data.date || new Date().toISOString().split('T')[0],
          productId: matchedProduct?.id || 'manual-entry',
          productName: data.productName || 'Unknown Product',
          category: matchedProduct?.category || data.category || 'Other',
          listingPrice: listingPrice,
          settledAmount: settledAmount,
          profit: profit,
          status: statuses[0] || 'Ready For Payment',
          receivedStatus: 'Pending'
        };
      });

      // 4. Check for duplicates
      const duplicates: { new: Order, existing: Order }[] = [];
      const nonDuplicates: Order[] = [];

      newOrders.forEach(order => {
        const existing = existingOrders.find(o => o.id === order.id);
        if (existing) {
          duplicates.push({ new: order, existing });
        } else {
          nonDuplicates.push(order);
        }
      });

      if (duplicates.length > 0) {
        setPendingOrders(nonDuplicates);
        setDuplicateOrders(duplicates);
        setStatus('duplicate-check');
        setIsProcessing(false);
        return;
      }

      // 5. Save if no duplicates
      setStatus('saving');
      setProgress(80);
      await onOrdersExtracted(newOrders);
      
      setStatus('success');
      setProgress(100);
      setTimeout(() => {
        setStatus('idle');
        setIsProcessing(false);
      }, 3000);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during processing.');
      setStatus('error');
      setIsProcessing(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDuplicateDecision = async (uploadDuplicates: boolean) => {
    setIsProcessing(true);
    setStatus('saving');
    setProgress(80);
    
    try {
      const ordersToUpload = uploadDuplicates 
        ? [...pendingOrders, ...duplicateOrders.map(d => d.new)]
        : pendingOrders;

      if (ordersToUpload.length > 0) {
        await onOrdersExtracted(ordersToUpload);
      }
      
      setStatus('success');
      setProgress(100);
      setTimeout(() => {
        setStatus('idle');
        setIsProcessing(false);
        setPendingOrders([]);
        setDuplicateOrders([]);
      }, 3000);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during processing.');
      setStatus('error');
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-600" />
          Bulk PDF Import
        </h3>
        {status !== 'idle' && (
          <div className="flex items-center gap-2">
            {status === 'error' && error && (
              <span className="text-[9px] font-bold text-rose-500 truncate max-w-[150px] md:max-w-[300px]">
                {error}
              </span>
            )}
            <span className={`text-[10px] font-black uppercase tracking-tighter px-2 py-1 rounded-md ${
              status === 'success' ? 'bg-emerald-50 text-emerald-600' : 
              status === 'error' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'
            }`}>
              {status}
            </span>
          </div>
        )}
      </div>

      <div 
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 transition-all cursor-pointer flex flex-col items-center justify-center gap-3
          ${isProcessing ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50'}
        `}
      >
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="application/pdf"
          className="hidden"
        />

        <AnimatePresence mode="wait">
          {isProcessing ? (
            <motion.div 
              key="processing"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center gap-3"
            >
              <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
              <div className="text-center">
                <p className="text-xs font-bold text-slate-700">
                  {status === 'converting' && 'Converting PDF to images...'}
                  {status === 'extracting' && 'Gemini is reading your invoice...'}
                  {status === 'saving' && 'Saving extracted orders...'}
                </p>
                <div className="w-48 h-1.5 bg-slate-200 rounded-full mt-3 overflow-hidden">
                  <motion.div 
                    className="h-full bg-indigo-600"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </motion.div>
          ) : status === 'success' ? (
            <motion.div 
              key="success"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-2 text-emerald-600"
            >
              <CheckCircle2 className="w-10 h-10" />
              <p className="text-xs font-black uppercase tracking-widest">Import Successful</p>
            </motion.div>
          ) : status === 'error' ? (
            <motion.div 
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-2 text-rose-600"
            >
              <AlertCircle className="w-10 h-10" />
              <p className="text-xs font-bold text-center px-4">{error}</p>
              <button 
                onClick={(e) => { e.stopPropagation(); setStatus('idle'); setIsProcessing(false); }}
                className="mt-2 text-[10px] font-black uppercase underline"
              >
                Try Again
              </button>
            </motion.div>
          ) : status === 'duplicate-check' ? (
            <motion.div 
              key="duplicate-check"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-4 w-full"
            >
              <div className="text-center">
                <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-2" />
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Duplicate Orders Found</h4>
                <p className="text-[10px] font-bold text-slate-500 mt-1">
                  {duplicateOrders.length} order(s) already exist in your records.
                </p>
              </div>

              <div className="w-full max-h-48 overflow-y-auto space-y-2 px-2 custom-scrollbar">
                {duplicateOrders.map((dup, idx) => (
                  <div key={idx} className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black text-amber-700 uppercase tracking-widest">Order ID: {dup.new.id}</span>
                      <span className="text-[8px] font-bold text-amber-600 bg-white px-1.5 py-0.5 rounded border border-amber-100">DUPLICATE</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">New Data</p>
                        <p className="text-[10px] font-bold text-slate-700 truncate">{dup.new.productName}</p>
                        <p className="text-[10px] font-bold text-indigo-600">₹{dup.new.listingPrice}</p>
                      </div>
                      <div>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Existing Data</p>
                        <p className="text-[10px] font-bold text-slate-700 truncate">{dup.existing.productName}</p>
                        <p className="text-[10px] font-bold text-indigo-600">₹{dup.existing.listingPrice}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 w-full mt-2">
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDuplicateDecision(false); }}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 font-black uppercase text-[10px] tracking-widest rounded-xl hover:bg-slate-200 transition-all"
                >
                  Skip Duplicates
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDuplicateDecision(true); }}
                  className="flex-1 py-3 bg-amber-500 text-white font-black uppercase text-[10px] tracking-widest rounded-xl hover:bg-amber-600 shadow-lg shadow-amber-200 transition-all"
                >
                  Upload All
                </button>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); setStatus('idle'); setIsProcessing(false); }}
                className="text-[9px] font-black text-slate-400 uppercase underline"
              >
                Cancel Import
              </button>
            </motion.div>
          ) : (
            <motion.div 
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-2"
            >
              <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mb-1">
                <FileUp className="w-6 h-6 text-indigo-600" />
              </div>
              <p className="text-xs font-bold text-slate-600">Click to upload invoice PDF</p>
              <p className="text-[10px] text-slate-400 font-medium">Supports multiple orders per file</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default PDFUpload;
