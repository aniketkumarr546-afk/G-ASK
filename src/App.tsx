import React, { useState, useRef, useEffect } from 'react';
import { Search, Image as ImageIcon, Send, X, Command, Sparkles, Briefcase, Zap, Bot } from 'lucide-react';
import Markdown from 'react-markdown';

type Tone = 'professional' | 'casual' | 'creative';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image?: string;
  sources?: { uri: string; title: string }[];
}

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [tone, setTone] = useState<Tone>('professional');
  const [provider, setProvider] = useState<'gemini' | 'openai' | 'imagen2'>('openai');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!prompt.trim() && !selectedImage) || isLoading) return;

    const currentPrompt = prompt;
    const currentImgUrl = imagePreview;
    
    setPrompt('');
    setIsLoading(true);

    const newUserMsgId = Date.now().toString();
    const newMessages: Message[] = [
      ...messages,
      {
        id: newUserMsgId,
        role: 'user',
        content: currentPrompt,
        image: currentImgUrl || undefined
      }
    ];
    setMessages(newMessages);

    clearImage();

    const formData = new FormData();
    formData.append('prompt', currentPrompt);
    formData.append('tone', tone);
    formData.append('provider', provider);
    if (selectedImage) {
      formData.append('image', selectedImage);
    }

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        // Don't set Content-Type header when sending FormData; browser sets it with boundary
        body: formData,
      });

      if (!response.ok) {
        let errorMsg = 'API Request failed';
        try {
           const errorData = await response.json();
           if (errorData.error) errorMsg = errorData.error;
        } catch (e) {}
        throw new Error(errorMsg);
      }

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMsgText = '';
      let sources: {uri: string, title: string}[] | undefined = undefined;

      const assistantMsgId = (Date.now() + 1).toString();
      
      setMessages(prev => [
         ...prev,
         { id: assistantMsgId, role: 'assistant', content: '' }
      ]);


      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunkStr = decoder.decode(value, { stream: true });
        const lines = chunkStr.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') break;
            
            try {
              const data = JSON.parse(dataStr);
              if (data.text) {
                assistantMsgText += data.text;
                setMessages(prev => prev.map(m => 
                  m.id === assistantMsgId ? { ...m, content: assistantMsgText } : m
                ));
              }
              if (data.sources) {
                sources = data.sources;
                setMessages(prev => prev.map(m => 
                  m.id === assistantMsgId ? { ...m, sources: sources } : m
                ));
              }
              if (data.imageUrl) {
                 setMessages(prev => prev.map(m => 
                   m.id === assistantMsgId ? { ...m, image: data.imageUrl } : m
                 ));
              }
            } catch (e) {
               console.error("Error parsing chunks", e);
            }
          }
        }
      }

    } catch (error: any) {
       console.error(error);
       setMessages(prev => [
         ...prev,
         { id: Date.now().toString(), role: 'assistant', content: `**Error:** ${error.message || 'Sorry, I encountered an error. Please try again.'}` }
       ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#1a1a1a] font-sans flex flex-col">
      {/* Header */}
      <header className="rainbow-header fixed top-0 left-0 right-0 h-16 z-10 flex items-center justify-between px-4 md:px-6 overflow-x-auto text-white shadow-md">
        <div className="flex items-center gap-2 text-xl font-medium tracking-tight mr-4 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white shadow-inner">
            <Command size={18} />
          </div>
          <span className="font-semibold text-xl hidden md:inline-block">G-ASK</span>
        </div>
        
        <div className="flex items-center justify-center flex-1 min-w-max mr-4">
            <div className="flex bg-black/20 border border-white/10 backdrop-blur-md p-1 rounded-full shadow-inner text-sm">
               <button 
                 onClick={() => setTone('professional')}
                 className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${tone === 'professional' ? 'bg-white shadow-sm font-medium text-black' : 'text-white/80 hover:text-white hover:bg-white/10'}`}
               >
                 <Briefcase size={14} /> Professional
               </button>
               <button 
                 onClick={() => setTone('casual')}
                 className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${tone === 'casual' ? 'bg-white shadow-sm font-medium text-black' : 'text-white/80 hover:text-white hover:bg-white/10'}`}
               >
                 <Zap size={14} /> Casual
               </button>
               <button 
                 onClick={() => setTone('creative')}
                 className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${tone === 'creative' ? 'bg-white shadow-sm font-medium text-black' : 'text-white/80 hover:text-white hover:bg-white/10'}`}
               >
                 <Sparkles size={14} /> Creative
               </button>
            </div>
        </div>

        <div className="flex bg-black/20 border border-white/10 backdrop-blur-md p-1 rounded-full shadow-inner text-sm min-w-max">
           <button 
             onClick={() => setProvider('openai')}
             className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${provider === 'openai' ? 'bg-white shadow-sm font-medium text-black' : 'text-white/80 hover:text-white hover:bg-white/10'}`}
           >
             <Bot size={14} /> ChatGPT
           </button>
           <button 
             onClick={() => setProvider('gemini')}
             className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${provider === 'gemini' ? 'bg-white shadow-sm font-medium text-black' : 'text-white/80 hover:text-white hover:bg-white/10'}`}
           >
             <Sparkles size={14} /> Gemini
           </button>
           <button 
             onClick={() => setProvider('imagen2')}
             className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${provider === 'imagen2' ? 'bg-white shadow-sm font-medium text-black' : 'text-white/80 hover:text-white hover:bg-white/10'}`}
           >
             <ImageIcon size={14} /> Imagen 2
           </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pt-24 pb-32 px-4 md:px-0">
        <div className="max-w-3xl mx-auto w-full">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
              <h1 className="text-4xl md:text-5xl font-light tracking-tight text-gray-900 mb-6">
                What do you want to know?
              </h1>
              <p className="text-gray-500 max-w-lg mb-8">
                G-ASK is your AI-powered companion for instant answers, code generation, data synthesis, and creative writing.
              </p>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full text-left text-sm text-gray-600">
                <div onClick={() => setPrompt("Explain quantum computing in 5 simple bullet points.")} className="p-4 bg-white rounded-2xl border border-gray-200 hover:border-gray-300 hover:shadow-sm cursor-pointer transition-all">
                  <span className="block font-medium text-gray-900 mb-1">Synthesize</span>
                  Explain quantum computing simply
                </div>
                <div onClick={() => setPrompt("Write a clean React component for a toggle button.")} className="p-4 bg-white rounded-2xl border border-gray-200 hover:border-gray-300 hover:shadow-sm cursor-pointer transition-all">
                  <span className="block font-medium text-gray-900 mb-1">Code</span>
                  Write a React toggle button
                </div>
                <div onClick={() => setPrompt("Brainstorm 5 names for a new tech startup focused on AI search.")} className="p-4 bg-white rounded-2xl border border-gray-200 hover:border-gray-300 hover:shadow-sm cursor-pointer transition-all">
                  <span className="block font-medium text-gray-900 mb-1">Create</span>
                  Brainstorm startup names
                </div>
                <div onClick={() => setPrompt("What's the weather in Tokyo right now?")} className="p-4 bg-white rounded-2xl border border-gray-200 hover:border-gray-300 hover:shadow-sm cursor-pointer transition-all">
                  <span className="block font-medium text-gray-900 mb-1">Search</span>
                  Latest weather in Tokyo
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-8 pb-10">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  {msg.role === 'user' ? (
                     <div className="max-w-[85%] bg-black text-white rounded-3xl rounded-tr-sm px-5 py-3.5 shadow-sm">
                       {msg.image && (
                         <div className="mb-3 rounded-xl overflow-hidden max-w-[250px]">
                           <img src={msg.image} alt="User upload" className="w-full h-auto object-cover" />
                         </div>
                       )}
                       <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                     </div>
                  ) : (
                    <div className="max-w-[95%] w-full">
                       <div className="flex items-start gap-4">
                         <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex-shrink-0 flex items-center justify-center mt-1">
                           <Command size={14} className="text-gray-700" />
                         </div>
                         <div className="flex-1 space-y-4">
                            <div className="bg-white rounded-3xl rounded-tl-sm px-6 py-5 shadow-sm border border-gray-100 prose prose-slate max-w-none text-gray-800 leading-relaxed">
                               {msg.image && (
                                 <div className="mb-4 rounded-xl overflow-hidden max-w-[500px]">
                                   <img src={msg.image} alt="Generated" className="w-full h-auto object-cover border border-gray-200" />
                                 </div>
                               )}
                               {msg.content === '' && !msg.image ? (
                                  <div className="flex space-x-1 items-center h-6">
                                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                                  </div>
                               ) : (
                                  <div className="markdown-body">
                                      <Markdown>{msg.content}</Markdown>
                                  </div>
                               )}
                            </div>
                            
                            {/* Source Citations */}
                            {msg.sources && msg.sources.length > 0 && (
                              <div className="pl-2">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Sources</p>
                                <div className="flex flex-wrap gap-2">
                                  {msg.sources.map((src, i) => (
                                    <a 
                                      key={i} 
                                      href={src.uri} 
                                      target="_blank" 
                                      rel="noreferrer"
                                      className="inline-flex items-center max-w-[200px] bg-white border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-600 transition-colors shadow-sm overflow-hidden"
                                    >
                                      <span className="truncate">{src.title}</span>
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                         </div>
                       </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      {/* Input Area */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[#f5f5f5] via-[#f5f5f5] to-transparent pt-10 pb-6 px-4 md:px-0 z-10">
        <div className="max-w-3xl mx-auto">
          <div className="relative rounded-3xl rainbow-shadow-hover">
            <form 
              onSubmit={handleSearch}
              className="bg-white rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-gray-200 overflow-hidden focus-within:ring-2 ring-black/5 focus-within:border-gray-300 transition-all flex flex-col relative z-20"
            >
              {imagePreview && (
              <div className="px-4 pt-4 pb-2 border-b border-gray-100 flex items-start">
                <div className="relative inline-block">
                  <div className="w-16 h-16 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                  <button 
                    type="button" 
                    onClick={clearImage}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-gray-800 text-white rounded-full flex items-center justify-center hover:bg-black shadow-sm"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            )}
            
            <div className="flex items-end p-2 relative">
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleImageSelect}
              />
              
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-3 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
                title="Upload image"
              >
                <ImageIcon size={20} />
              </button>
              
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything..."
                className="w-full max-h-40 min-h-[44px] bg-transparent resize-none outline-none px-3 py-3 text-gray-800 placeholder-gray-400"
                rows={1}
                style={{ height: 'auto' }}
              />
              
              <div className="pr-2 pb-1.5 flex flex-col justify-end flex-shrink-0">
                <button 
                  type="submit"
                  disabled={(!prompt.trim() && !selectedImage) || isLoading}
                  className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-black transition-all flex-shrink-0 shadow-sm"
                >
                  <Send size={16} className="ml-1" />
                </button>
              </div>
            </div>
            
            <div className="px-5 py-2.5 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between">
               <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                  {provider === 'gemini' ? <><Search size={12} /> Google Search integration active</> : provider === 'imagen2' ? <><ImageIcon size={12} /> Imagen 2 active</> : <><Bot size={12} /> ChatGPT active</>}
               </div>
               <div className="text-xs text-gray-400">
                  <kbd className="font-sans px-1.5 py-0.5 rounded-md bg-gray-200/60 border border-gray-300/50">Enter</kbd> to send
               </div>
            </div>
          </form>
          </div>
          <div className="text-center mt-3 text-xs text-gray-400">
             G-ASK powered by {provider === 'gemini' ? 'Google Gemini' : provider === 'imagen2' ? 'Google Imagen 2' : 'OpenAI ChatGPT'} API. Answers may be imprecise.
          </div>
        </div>
      </div>
    </div>
  );
}
