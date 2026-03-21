
import * as pdfjsLib from 'pdfjs-dist';

// Set worker source for pdfjs-dist
// In a Vite environment, we can use the CDN or import it
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export const convertPdfToImages = async (file: File): Promise<string[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const images: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // High scale for better OCR
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) continue;

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport }).promise;
    
    // Convert canvas to base64
    const base64 = canvas.toDataURL('image/jpeg', 0.8);
    // Remove the prefix "data:image/jpeg;base64," for Gemini API
    images.push(base64.split(',')[1]);
  }

  return images;
};
