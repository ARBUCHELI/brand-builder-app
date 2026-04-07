/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, ReactNode } from "react";
import { GoogleGenAI } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { 
  Layout, 
  Newspaper, 
  Instagram, 
  Sparkles, 
  Loader2, 
  Download, 
  RefreshCw,
  Image as ImageIcon,
  ArrowRight
} from "lucide-react";

// Initialize Gemini API
const API_KEY = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: API_KEY || "MISSING_KEY" });

type Medium = {
  id: string;
  name: string;
  icon: ReactNode;
  promptSuffix: string;
  aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
};

const MEDIUMS: Medium[] = [
  { 
    id: "billboard", 
    name: "Billboard", 
    icon: <Layout className="w-5 h-5" />, 
    promptSuffix: "shown on a large outdoor highway billboard at night, cinematic lighting, urban environment, no people.",
    aspectRatio: "16:9"
  },
  { 
    id: "newspaper", 
    name: "Newspaper", 
    icon: <Newspaper className="w-5 h-5" />, 
    promptSuffix: "as a full-page high-quality print advertisement in a premium lifestyle newspaper, elegant typography nearby, no people.",
    aspectRatio: "3:4"
  },
  { 
    id: "social", 
    name: "Social Post", 
    icon: <Instagram className="w-5 h-5" />, 
    promptSuffix: "as a professional product photography shot for a social media post, clean minimalist background, studio lighting, no people.",
    aspectRatio: "1:1"
  },
];

export default function App() {
  const [description, setDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<{ [key: string]: string }>({});
  const [error, setError] = useState<string | null>(null);

  if (!API_KEY || API_KEY === "MISSING_KEY") {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-6 p-12 border border-white/10 rounded-[40px] bg-white/[0.02]">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
            <Sparkles className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-3xl font-bold uppercase tracking-tighter">Configuration Required</h2>
          <div className="space-y-4 text-white/60 leading-relaxed">
            <p>
              The <code className="text-orange-500 font-bold">GEMINI_API_KEY</code> is missing or not being picked up by the browser.
            </p>
            <div className="text-left bg-black/40 p-6 rounded-2xl border border-white/5 space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-white/40">How to fix:</p>
              <ol className="text-sm list-decimal list-inside space-y-2">
                <li>Create a <code className="bg-white/10 px-1 rounded">.env</code> file in your project root.</li>
                <li>Add <code className="text-orange-500">GEMINI_API_KEY=your_key</code> inside.</li>
                <li><span className="text-white font-bold underline">Restart</span> your terminal and run <code className="bg-white/10 px-1 rounded">npm run dev</code> again.</li>
              </ol>
            </div>
            <p className="text-xs italic">
              Note: If you are in the EU or UK, image generation may be restricted for personal API keys.
            </p>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-white text-black font-bold py-4 rounded-2xl hover:bg-orange-500 transition-colors uppercase tracking-tighter"
          >
            Refresh App
          </button>
        </div>
      </div>
    );
  }

  const generateImages = async () => {
    if (!description.trim()) return;

    setIsGenerating(true);
    setError(null);
    setResults({});

    try {
      // Step 1: Generate a "Master Visual Specification" to ensure consistency
      // We use a text model to expand the user's description into a highly detailed visual spec
      const specResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Create a highly detailed, technical visual specification for a product based on this description: "${description}". 
        Focus on: 
        - Exact materials and textures (e.g., brushed aluminum, matte polycarbonate)
        - Precise colors and finishes (e.g., Midnight Black with #C0C0C0 silver accents)
        - Specific geometric details and proportions
        - Branding/logo placement style (if any)
        - Lighting behavior on the surfaces
        
        Keep it concise but extremely descriptive. This spec will be used to generate consistent images of the product in different environments. Do not include any people in the description.`,
      });

      const masterSpec = specResponse.text || description;
      console.log("Generated Master Spec:", masterSpec);

      // Step 2: Generate for each medium SEQUENTIALLY to avoid Free Tier concurrency limits
      for (const medium of MEDIUMS) {
        let attempts = 0;
        const maxAttempts = 2;
        let success = false;

        while (attempts < maxAttempts && !success) {
          try {
            const fullPrompt = `PRODUCT SPECIFICATION: ${masterSpec}. 
            ENVIRONMENT: ${medium.promptSuffix}. 
            CRITICAL: The product in this image MUST be identical in every detail to the PRODUCT SPECIFICATION provided. 
            Strictly no people or humans in the image. High-end commercial photography style.`;
            
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash-image',
              contents: {
                parts: [{ text: fullPrompt }],
              },
              config: {
                imageConfig: {
                  aspectRatio: medium.aspectRatio,
                },
              },
            });

            for (const part of response.candidates?.[0]?.content?.parts || []) {
              if (part.inlineData) {
                const imageData = `data:image/png;base64,${part.inlineData.data}`;
                setResults(prev => ({
                  ...prev,
                  [medium.id]: imageData
                }));
                success = true;
                break;
              }
            }
            
            // Small delay between successful generations to respect RPM
            if (success) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }

          } catch (err: any) {
            attempts++;
            console.error(`Attempt ${attempts} failed for ${medium.name}:`, err);
            
            const errorMessage = err?.message || String(err);
            
            if (errorMessage.includes('429') || errorMessage.includes('quota')) {
              if (errorMessage.includes('limit: 0')) {
                setError("Regional Restriction: Image generation is not currently available for personal API keys in your region (e.g., EU/UK).");
                break;
              }
              // If it's a rate limit, wait longer before retrying
              await new Promise(resolve => setTimeout(resolve, 5000));
            } else {
              setError(`API Error: ${errorMessage}`);
              break;
            }
          }
        }
      }
      
      setResults(currentResults => {
        if (Object.keys(currentResults).length === 0) {
          setError("Failed to generate any images. Please try again.");
        }
        return currentResults;
      });

    } catch (err) {
      console.error("Critical generation error:", err);
      setError("A critical error occurred. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-orange-500 selection:text-white">
      {/* Header */}
      <header className="p-6 md:p-12 flex justify-between items-center border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-black" />
          </div>
          <span className="font-bold tracking-tighter text-xl uppercase">Brand Builder</span>
        </div>
        <div className="hidden md:flex gap-8 text-xs font-medium uppercase tracking-widest opacity-50">
          <span>Billboard</span>
          <span>Newspaper</span>
          <span>Social</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 md:px-12 py-12 md:py-24">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          {/* Left Column: Input */}
          <div className="space-y-12">
            <div className="space-y-4">
              <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-6xl md:text-8xl font-bold leading-[0.9] tracking-tighter uppercase"
              >
                Imagine <br />
                <span className="text-orange-500">Your Brand</span>
              </motion.h1>
              <p className="text-lg text-white/60 max-w-md">
                Describe your product and see it come to life across multiple mediums with consistent visual identity.
              </p>
            </div>

            <div className="space-y-6">
              <div className="relative">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. A sleek, matte black electric toothbrush with copper accents..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-6 h-48 focus:outline-none focus:border-orange-500 transition-colors text-lg resize-none placeholder:text-white/20"
                />
                <div className="absolute bottom-4 right-4 text-[10px] uppercase tracking-widest opacity-30">
                  Product Description
                </div>
              </div>

              <button
                onClick={generateImages}
                disabled={isGenerating || !description.trim()}
                className="group w-full bg-orange-500 hover:bg-orange-600 disabled:bg-white/10 disabled:text-white/30 text-black font-bold py-6 rounded-2xl transition-all flex items-center justify-center gap-3 text-lg uppercase tracking-tighter overflow-hidden relative"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span>Generating Brand Assets...</span>
                  </>
                ) : (
                  <>
                    <span>Generate Assets</span>
                    <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
              
              {error && (
                <p className="text-red-400 text-sm font-medium text-center">{error}</p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              {MEDIUMS.map((m) => (
                <div key={m.id} className="p-4 rounded-xl border border-white/5 bg-white/[0.02] flex flex-col items-center gap-2 opacity-50">
                  {m.icon}
                  <span className="text-[10px] uppercase tracking-widest">{m.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Results */}
          <div className="relative min-h-[600px]">
            <AnimatePresence mode="wait">
              {Object.keys(results).length > 0 ? (
                <motion.div 
                  key="results"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="grid gap-8"
                >
                  {MEDIUMS.map((medium) => (
                    results[medium.id] && (
                      <motion.div 
                        key={medium.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="group relative bg-white/5 rounded-3xl overflow-hidden border border-white/10"
                      >
                        <div className="absolute top-4 left-4 z-10 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full text-[10px] uppercase tracking-widest font-bold border border-white/10">
                          {medium.name}
                        </div>
                        <img 
                          src={results[medium.id]} 
                          alt={medium.name}
                          className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-105"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-8">
                          <button 
                            onClick={() => {
                              const link = document.createElement('a');
                              link.href = results[medium.id];
                              link.download = `${medium.id}-brand-asset.png`;
                              link.click();
                            }}
                            className="bg-white text-black p-3 rounded-full hover:bg-orange-500 transition-colors"
                          >
                            <Download className="w-5 h-5" />
                          </button>
                        </div>
                      </motion.div>
                    )
                  ))}
                  
                  <button 
                    onClick={() => {
                      setResults({});
                      generateImages();
                    }}
                    className="flex items-center justify-center gap-2 text-white/40 hover:text-orange-500 transition-colors uppercase text-xs tracking-widest font-bold py-8"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Regenerate All
                  </button>
                </motion.div>
              ) : (
                <motion.div 
                  key="placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-white/10 rounded-[40px] bg-white/[0.01]"
                >
                  <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
                    <ImageIcon className="w-10 h-10 text-white/20" />
                  </div>
                  <h3 className="text-2xl font-bold uppercase tracking-tighter mb-2">Awaiting Brand Vision</h3>
                  <p className="text-white/40 max-w-xs">
                    Enter your product details on the left to visualize your brand across different mediums.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {isGenerating && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-[40px]">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative w-16 h-16">
                    <div className="absolute inset-0 border-4 border-orange-500/20 rounded-full" />
                    <div className="absolute inset-0 border-4 border-orange-500 rounded-full border-t-transparent animate-spin" />
                  </div>
                  <span className="text-xs uppercase tracking-[0.3em] font-bold text-orange-500 animate-pulse">
                    Crafting Visuals
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-12 border-t border-white/10 mt-24">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8 opacity-30 text-[10px] uppercase tracking-[0.2em] font-bold">
          <div className="flex gap-8">
            <span>Privacy</span>
            <span>Terms</span>
            <span>Contact</span>
          </div>
          <span>© 2026 Brand Builder AI</span>
          <div className="flex gap-4">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <span>System Operational</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
