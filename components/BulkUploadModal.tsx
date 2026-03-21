
import React, { useState } from 'react';
import { convertPdfToImages } from '../services/pdfService.ts';
import { extractOrdersFromImages } from '../services/geminiService.ts';
import { Order } from '../types.ts';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrdersAdded: (orders: Partial<Order>[]) => Promise<void>;
}

const BulkUploadModal: React.FC<BulkUploadModalProps> = ({ isOpen, onClose, onOrdersAdded }) => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'extracting' | 'review' | 'saving' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [extractedOrders, setExtractedOrders] = useState<Partial<Order>[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus('idle');
      setError(null);
    }
  };

  const processFile = async () => {
    if (!file) return;

    try {
      setStatus('processing');
      const images = await convertPdfToImages(file);
      
      setStatus('extracting');
      const orders = await extractOrdersFromImages(images);
      
      setExtractedOrders(orders);
      setStatus('review');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to process PDF');
      setStatus('error');
    }
  };

  const handleSave = async () => {
    try {
      setStatus('saving');
      await onOrdersAdded(extractedOrders);
      setStatus('success');
      setTimeout(() => {
        onClose();
        setStatus('idle');
        setFile(null);
        setExtractedOrders([]);
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to save orders');
      setStatus('error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-8 border-b border-slate-50 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Bulk PDF Upload</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Extract orders from invoice PDFs</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-xl transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-8 overflow-y-auto">
          {status === 'idle' && (
            <div className="space-y-6">
              <div className="border-4 border-dashed border-slate-100 rounded-[2rem] p-12 text-center hover:border-indigo-100 transition-colors relative">
                <input 
                  type="file" 
                  accept=".pdf" 
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center">
                    <Upload className="w-8 h-8 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900 uppercase tracking-tight">
                      {file ? file.name : 'Click or Drag PDF here'}
                    </p>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Supports multi-page invoices</p>
                  </div>
                </div>
              </div>
              <button 
                disabled={!file}
                onClick={processFile}
                className="w-full py-5 bg-indigo-600 text-white font-black uppercase text-xs tracking-[0.2em] rounded-2xl shadow-xl hover:bg-indigo-700 transition-all disabled:opacity-50"
              >
                Start Extraction
              </button>
            </div>
          )}

          {(status === 'processing' || status === 'extracting' || status === 'saving') && (
            <div className="py-20 flex flex-col items-center gap-6">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-indigo-100 rounded-full"></div>
                <Loader2 className="w-20 h-20 text-indigo-600 animate-spin absolute inset-0" />
              </div>
              <div className="text-center">
                <p className="text-sm font-black text-slate-900 uppercase tracking-tight">
                  {status === 'processing' ? 'Converting PDF to Images...' : 
                   status === 'extracting' ? 'AI Extracting Order Data...' : 
                   'Saving Orders to Database...'}
                </p>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">This may take a few moments</p>
              </div>
            </div>
          )}

          {status === 'review' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Extracted Orders ({extractedOrders.length})</h3>
                <button 
                  onClick={() => setStatus('idle')}
                  className="text-[10px] font-black text-indigo-600 uppercase hover:underline"
                >
                  Change File
                </button>
              </div>
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {extractedOrders.map((order, idx) => (
                  <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                        <FileText className="w-5 h-5 text-slate-400" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-900 truncate max-w-[200px]">{order.productName}</p>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">ID: {order.id} • SKU: {order.sku}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-indigo-600">₹{order.listingPrice}</p>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{order.date}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button 
                onClick={handleSave}
                className="w-full py-5 bg-emerald-500 text-white font-black uppercase text-xs tracking-[0.2em] rounded-2xl shadow-xl hover:bg-emerald-600 transition-all"
              >
                Confirm & Save All
              </button>
            </div>
          )}

          {status === 'success' && (
            <div className="py-20 flex flex-col items-center gap-6">
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-black text-slate-900 uppercase tracking-tight">Orders Saved Successfully!</p>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Your dashboard is being updated</p>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="py-20 flex flex-col items-center gap-6">
              <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center">
                <AlertCircle className="w-12 h-12 text-rose-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-black text-slate-900 uppercase tracking-tight">Extraction Failed</p>
                <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mt-1">{error}</p>
              </div>
              <button 
                onClick={() => setStatus('idle')}
                className="px-8 py-3 bg-slate-100 text-slate-600 font-black uppercase text-[10px] tracking-widest rounded-xl hover:bg-slate-200 transition-all"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default BulkUploadModal;
