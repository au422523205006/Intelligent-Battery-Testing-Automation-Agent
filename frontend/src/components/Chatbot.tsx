import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../types';
import { sendChatMessage } from '../api';
import {
  Send,
  Bot,
  User,
  Sparkles,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

interface Props {
  onRefreshData?: () => void;
}

export const Chatbot: React.FC<Props> = ({ onRefreshData }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'agent',
      content:
        '👋 Welcome! I am your **AI-Powered EV Battery Monitoring and Analysis Assistant**.\n\n' +
        'I can query battery pack status, analyze uPowerful BST test runs, evaluate test boundary limits, and compare laboratory records.\n\n' +
        '*Safety Notice: Physical BMS hardware is disconnected. All telemetry is simulated or retrieved from verified lab files.*',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      active_provider: 'SYSTEM',
      active_model: 'ready',
    },
  ]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const suggestions = [
    'Show battery status',
    'Analyze latest test',
    'Compare uPowerful tests',
    'uPowerful BST status',
    'Generate battery report',
  ];

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const historyPayload = messages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.content,
        }));

      const res = await sendChatMessage(text, historyPayload);

      const agentMsg: ChatMessage = {
        id: `agent-${Date.now()}`,
        sender: 'agent',
        content: res.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        active_provider: res.active_provider,
        active_model: res.active_model,
        fallback_occurred: res.fallback_occurred,
        fallback_reason: res.fallback_reason,
        diagnostics: res.diagnostics,
      };

      setMessages((prev) => [...prev, agentMsg]);
      onRefreshData?.();
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'agent',
        content: `⚠️ Error contacting agent service: ${err.message || 'Network error'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        active_provider: 'ERROR',
        active_model: 'none',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: 'welcome',
        sender: 'agent',
        content: 'Conversation reset. How can I assist you with battery monitoring or uPowerful BST data?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        active_provider: 'SYSTEM',
        active_model: 'ready',
      },
    ]);
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/80 shadow-sm flex flex-col h-[750px] overflow-hidden">
      {/* Chat Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              Multi-LLM Battery Agent
            </h3>
            <span className="text-[11px] text-slate-400">
              Automatic failover: Groq → OpenRouter → Gemini → Ollama → Safe Fallback
            </span>
          </div>
        </div>

        <button
          onClick={clearChat}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all text-xs flex items-center gap-1"
          title="Reset conversation"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Clear</span>
        </button>
      </div>

      {/* Suggested Prompts */}
      <div className="p-2.5 border-b border-slate-800/80 bg-slate-950/40 flex items-center gap-2 overflow-x-auto shrink-0">
        <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0 ml-1" />
        <span className="text-[11px] text-slate-400 shrink-0">Suggestions:</span>
        {suggestions.map((s, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(s)}
            disabled={loading}
            className="px-2.5 py-1 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] whitespace-nowrap transition-all border border-slate-700/60 disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Message List */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map((m) => {
          const isUser = m.sender === 'user';
          return (
            <div
              key={m.id}
              className={`flex gap-3 max-w-[85%] ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
            >
              {/* Avatar */}
              <div
                className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-xs font-bold ${
                  isUser
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-cyan-400 border border-slate-700'
                }`}
              >
                {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>

              {/* Message Bubble */}
              <div className="space-y-1">
                <div
                  className={`p-3.5 rounded-xl text-xs leading-relaxed whitespace-pre-wrap break-words ${
                    isUser
                      ? 'bg-blue-600 text-white rounded-tr-none'
                      : 'bg-slate-950/80 text-slate-200 border border-slate-800 rounded-tl-none shadow-sm'
                  }`}
                >
                  {m.content}
                </div>

                {/* Attribution and Diagnostics Footer */}
                {!isUser && m.active_provider && m.active_provider !== 'SYSTEM' && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400 px-1">
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-cyan-400 font-semibold">
                      {m.active_provider}
                    </span>
                    {m.active_model && (
                      <span className="text-slate-500 font-mono">({m.active_model})</span>
                    )}

                    {m.fallback_occurred && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40 flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
                        <span>Failover active</span>
                      </span>
                    )}

                    <span className="text-slate-500 ml-auto">{m.timestamp}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex gap-3 max-w-[80%] mr-auto">
            <div className="w-7 h-7 rounded-lg bg-slate-800 text-cyan-400 border border-slate-700 flex items-center justify-center">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse delay-100" />
              <span className="inline-block w-2 h-2 rounded-full bg-purple-400 animate-pulse delay-200" />
              <span className="text-[11px] ml-1">Analyzing battery telemetry and records...</span>
            </div>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Input Box */}
      <div className="p-3 border-t border-slate-800 bg-slate-900 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about pack status, analyze a test, or ask about uPowerful BST..."
            disabled={loading}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-40 disabled:hover:bg-blue-600 shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
