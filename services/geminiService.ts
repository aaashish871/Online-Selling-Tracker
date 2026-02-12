
import { GoogleGenAI } from "@google/genai";
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
