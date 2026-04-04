/**
 * ChatContext — persists AI chat state across LabsManagement ↔ LabsDrafts page switches.
 * The chat resets only when `widgetType` changes (i.e. user picks a different lab).
 */
import {
  createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode,
} from 'react';
import type { ChatMessage, LabCommand, LabComponentDefinition } from './types';
import { labsApi } from '@/api/labs';
import { parseLabDefinitionJson } from './parseLabDefinition';

export type ChatMode = 'drive_lab' | 'generate_lab';
export type LabGeneratedOptions = { status: 'draft' | 'published' };

let _msgId = 0;
export function mkMsgId() { return `msg_${++_msgId}`; }

export interface ChatContextValue {
  messages: ChatMessage[];
  mode: ChatMode;
  loading: boolean;
  /** Commands emitted by AI in drive mode — consumed by the page's LabHost */
  pendingCommands: LabCommand[];
  /** Consume pending commands (called by LabHost after applying them) */
  consumeCommands: () => void;
  /** Append messages (used by AIChatPanel for streaming updates) */
  appendMessages: (msgs: ChatMessage[]) => void;
  /** Full message setter for AIChatPanel to push streaming updates into shared state */
  setMessages: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  /** Reset all chat state — called when the user picks a different lab */
  resetChat: (widgetType?: string) => void;
  /** Set the lab widget type (triggers reset if different from current) */
  setWidgetType: (widgetType: string | undefined) => void;
  /**
   * Generate 模式：当前选中的实验 registry_key（用于后端「基于该实验迭代」）。
   * 不触发 resetChat；切换草稿时仅重建 SSE session。
   */
  generateBaseRegistryKey: string | undefined;
  setGenerateBaseRegistryKey: (key: string | undefined) => void;
  /** Apply incoming commands (drive mode: tells the lab to update) */
  applyCommands: (cmds: LabCommand[]) => void;
  /** Set mode and optionally reset the session */
  setMode: (mode: ChatMode) => void;
  /** After user picks draft/publish from pending definition */
  onLabGenerated: (def: LabComponentDefinition, options?: LabGeneratedOptions) => void;
  widgetType: string | undefined;
}

const ChatContext = createContext<ChatContextValue | null>(null);

function buildInitialMessages(widgetType?: string): ChatMessage[] {
  return [{
    id: mkMsgId(),
    role: 'assistant',
    content: widgetType
      ? `Lab connected: **${widgetType}**. Ask me to adjust parameters, explain concepts, or generate a new Lab component.`
      : `Hello! I can help you:\n• **Drive existing labs** — control parameters via natural language\n• **Generate new Labs** — create custom interactive components`,
    timestamp: Date.now(),
  }];
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>(buildInitialMessages());
  const [mode, setModeState] = useState<ChatMode>('generate_lab');
  const [loading, setLoading] = useState(false);
  const [widgetType, setWidgetTypeState] = useState<string | undefined>(undefined);
  const [generateBaseRegistryKey, setGenerateBaseRegistryKeyState] = useState<string | undefined>(undefined);
  const [pendingCommands, setPendingCommands] = useState<LabCommand[]>([]);
  const sessionIdRef = useRef<number | null>(null);
  // Pending definition for generate mode (waiting for user to pick draft/publish)
  const pendingMsgIdRef = useRef<string | undefined>(undefined);

  const resetChat = useCallback((wt?: string) => {
    sessionIdRef.current = null;
    pendingMsgIdRef.current = undefined;
    setMessages(buildInitialMessages(wt));
    setLoading(false);
  }, []);

  const setWidgetType = useCallback((wt: string | undefined) => {
    if (wt !== widgetType) {
      setWidgetTypeState(wt);
      resetChat(wt);
      setModeState(wt ? 'drive_lab' : 'generate_lab');
    }
  }, [widgetType, resetChat]);

  const setMode = useCallback((m: ChatMode) => {
    setModeState(m);
  }, []);

  const setGenerateBaseRegistryKey = useCallback((key: string | undefined) => {
    setGenerateBaseRegistryKeyState(key);
  }, []);

  const consumeCommands = useCallback(() => {
    setPendingCommands([]);
  }, []);

  const appendMessages = useCallback((msgs: ChatMessage[]) => {
    setMessages(prev => [...prev, ...msgs]);
  }, []);

  const setMessagesUpdater = useCallback((updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setMessages(prev => typeof updater === 'function' ? updater(prev) : updater);
  }, []);

  const applyCommands = useCallback((cmds: LabCommand[]) => {
    setPendingCommands(prev => [...prev, ...cmds]);
  }, []);

  const onLabGenerated = useCallback(
    (_def: LabComponentDefinition, _options?: LabGeneratedOptions) => {
      // Caller (LabsDrafts / LabsManagement) handles the save/publish logic
    },
    []
  );

  /** Core send: opens SSE, streams text/command/definition, updates messages */
  const sendMessage = useCallback(async (text: string, onApplyCommands: (cmds: LabCommand[]) => void) => {
    if (!text.trim() || loading) return;
    setLoading(true);

    const userMsg: ChatMessage = { id: mkMsgId(), role: 'user', content: text, timestamp: Date.now() };
    const asstId = mkMsgId();
    pendingMsgIdRef.current = asstId;
    const asstMsg: ChatMessage = { id: asstId, role: 'assistant', content: '', timestamp: Date.now(), streaming: true };

    setMessages(prev => [...prev, userMsg, asstMsg]);

    try {
      // Step 1: ensure session exists
      if (sessionIdRef.current === null) {
        const session = await labsApi.createSession(
          mode === 'generate_lab' ? 'generate' : 'drive',
          mode === 'drive_lab' ? widgetType : generateBaseRegistryKey,
        );
        sessionIdRef.current = session.id;
      }

      const sessionId = sessionIdRef.current;

      // Step 2: open SSE stream
      const es = labsApi.streamChat(sessionId, text);

      let accumulatedText = '';
      let pendingDefinition: LabComponentDefinition | undefined;
      let pendingCommands: LabCommand[] = [];

      es.addEventListener('text', (e: MessageEvent) => {
        accumulatedText += e.data;
        setMessages(prev =>
          prev.map(m => m.id === asstId ? { ...m, content: accumulatedText, streaming: true } : m)
        );
      });

      es.addEventListener('command', (e: MessageEvent) => {
        try {
          const cmds: LabCommand[] = JSON.parse(e.data);
          pendingCommands = cmds;
          setMessages(prev =>
            prev.map(m => m.id === asstId ? { ...m, commands: cmds } : m)
          );
        } catch { /* ignore malformed JSON */ }
      });

      es.addEventListener('definition', (e: MessageEvent) => {
        try {
          const raw = JSON.parse(e.data);
          const res = parseLabDefinitionJson(raw);
          if (res.ok) pendingDefinition = res.definition;
        } catch { /* ignore */ }
      });

      es.addEventListener('done', () => {
        es.close();
        setMessages(prev =>
          prev.map(m => m.id === asstId ? { ...m, streaming: false } : m)
        );

        // Apply commands in drive mode immediately
        if (pendingCommands.length > 0) {
          onApplyCommands(pendingCommands);
        }

        // Show pending definition UI in generate mode
        if (pendingDefinition && mode === 'generate_lab') {
          setMessages(prev =>
            prev.map(m =>
              m.id === asstId
                ? { ...m, pendingDefinition, streaming: false }
                : m
            )
          );
        } else if (pendingDefinition && mode === 'drive_lab') {
          // In drive mode, just mark it saved
          setMessages(prev =>
            prev.map(m =>
              m.id === asstId
                ? { ...m, definition: pendingDefinition, streaming: false }
                : m
            )
          );
        }

        setLoading(false);
        pendingMsgIdRef.current = undefined;
      });

      es.addEventListener('lab_error', (e: MessageEvent) => {
        es.close();
        const detail = typeof e.data === 'string' && e.data.trim() ? e.data : 'Unknown error';
        setMessages(prev =>
          prev.map(m =>
            m.id === asstId
              ? { ...m, content: (m.content || '') + `\n[AI 服务错误] ${detail}`, streaming: false }
              : m
          )
        );
        setLoading(false);
      });

      es.addEventListener('error', () => {
        es.close();
        setMessages(prev =>
          prev.map(m =>
            m.id === asstId
              ? {
                  ...m,
                  content:
                    (m.content || '') +
                    '\n[连接中断] 请确认后端已启动（:8000）、Vite 代理正常，或稍后重试。',
                  streaming: false,
                }
              : m
          )
        );
        setLoading(false);
      });

    } catch (err) {
      setMessages(prev =>
        prev.map(m =>
          m.id === asstId
            ? { ...m, content: `Error: ${err instanceof Error ? err.message : String(err)}`, streaming: false }
            : m
        )
      );
      setLoading(false);
    }
  }, [loading, mode, widgetType, generateBaseRegistryKey]);

  return (
    <ChatContext.Provider
      value={{
        messages,
        mode,
        loading,
        pendingCommands,
        consumeCommands,
        appendMessages,
        setMessages: setMessagesUpdater,
        resetChat,
        setWidgetType,
        applyCommands,
        setMode,
        onLabGenerated,
        widgetType,
        generateBaseRegistryKey,
        setGenerateBaseRegistryKey,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within <ChatProvider>');
  return ctx;
}
