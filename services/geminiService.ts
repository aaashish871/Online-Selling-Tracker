
import { GoogleGenAI, Type } from "@google/genai";
import { Order } from "../types.ts";

export const getAIAnalysis = async (orders: Order[]) => {
  // Safety check for environment variable access
  const apiKey = typeof process !== 'undefined' ? (process.env.API_KEY || '') : '';
  const ai = new GoogleGenAI({ apiKey: apiKey as string });
  
  const orderSummary = orders.map(o => ({
    name: o.productName,
    cat: o.category,
    list: o.listingPrice,
    sell: o.settledAmount,
    profit: o.profit
  }));

  const prompt = `
    Analyze the following shop orders data and provide 3 key business insights and 2 actionable recommendations to improve profit margins.
    Keep the response concise and professional.
    
    Data: ${JSON.stringify(orderSummary)}
    
    Format the response as:
    Insights:
    1. [Insight 1]
    2. [Insight 2]
    3. [Insight 3]
    
    Recommendations:
    1. [Recommendation 1]
    2. [Recommendation 2]
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.7,
        maxOutputTokens: 500,
        thinkingConfig: { thinkingBudget: 200 }
      }
    });

    return response.text || "No insights generated.";
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return "Failed to connect to AI engine. Please ensure your API key is valid.";
  }
};

export const extractOrdersFromImages = async (base64Images: string[]): Promise<Partial<Order>[]> => {
  const apiKey = typeof process !== 'undefined' ? (process.env.API_KEY || '') : '';
  const ai = new GoogleGenAI({ apiKey: apiKey as string });

  const prompt = `
    Extract order details from the provided invoice images. 
    Each image contains one or more orders. 
    For each order, extract:
    - Order ID (Order No / Purchase Order No)
    - Order Date (YYYY-MM-DD format)
    - Product Name (Description)
    - Listing Price (Total amount)
    - SKU (Product Details SKU)
    
    Return the data as a JSON array of objects.
  `;

  const parts = base64Images.map(img => ({
    inlineData: {
      data: img,
      mimeType: "image/jpeg"
    }
  }));

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: prompt }, ...parts] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING, description: "The Order Number" },
              date: { type: Type.STRING, description: "Order Date in YYYY-MM-DD format" },
              productName: { type: Type.STRING, description: "The name or description of the product" },
              listingPrice: { type: Type.NUMBER, description: "The total amount of the order" },
              sku: { type: Type.STRING, description: "The SKU of the product" }
            },
            required: ["id", "date", "productName", "listingPrice"]
          }
        }
      }
    });

    const text = response.text;
    if (!text) return [];
    
    return JSON.parse(text);
  } catch (error) {
    console.error("PDF Extraction Error:", error);
    throw new Error("Failed to extract data from PDF. Please check the file format.");
  }
};
