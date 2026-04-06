/**
 * ChatContext — shared AI chat for Labs pages.
 * Resets when `widgetType` changes, when user clears lab selection, or when switching
 * Lab Catalog ↔ Drafts in the sidebar (`clearLabChatBinding`).
 */
import React from 'react';
import {
  createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode,
} from 'react';
import type { ChatMessage, LabCommand, LabComponentDefinition } from './types';
import { labsApi } from '../../api/labs';
import { parseLabDefinitionJson } from './parseLabDefinition';

export type ChatMode = 'drive_lab' | 'generate_lab';

/** True if Generate 模式下已有需保留的对话进度（切换实验前应提示）。 */
export function hasGenerateLabProgress(
  mode: ChatMode,
  messages: ChatMessage[],
  loading: boolean,
): boolean {
  if (mode !== 'generate_lab') return false;
  if (loading) return true;
  if (messages.some(m => m.role === 'user')) return true;
  if (messages.some(m => m.pendingDefinition)) return true;
  return false;
}
export type LabGeneratedOptions = { status: 'draft' | 'published' };

let _msgId = 0;
export function mkMsgId() { return `msg_${++_msgId}`; }

export interface ChatContextValue {
  messages: ChatMessage[];
  mode: ChatMode;
  loading: boolean;
  /** 是否存在进行中的生成/驱动流（用于阻止路由切换误中断） */
  isGenerating: boolean;
  /** 终止当前生成/流式请求（若存在） */
  cancelGeneration: (reason?: string) => void;
  /**
   * 注册当前活跃的 SSE（由 `AIChatPanel` 创建），以便全局导航拦截可以取消它。
   * - `asstMsgId`：当前流对应的 assistant 消息 id（用于取消时写入提示并停止 streaming）
   */
  registerActiveStream: (es: EventSource, asstMsgId: string) => void;
  /** 取消注册（done/error/组件卸载时调用） */
  unregisterActiveStream: (es?: EventSource) => void;
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
   * 与 widgetType 不同，不会在 Drive 模式下被清除；用户切换回 Generate 时依然持有基准实验。
   */
  generateBaseRegistryKey: string | undefined;
  /** 选中实验的展示标题（用于 Generate 欢迎语与底部提示） */
  generateBaseTitle: string | undefined;
  /** 第二参数为选中实验标题；清空 key 时会同时清空 title */
  setGenerateBaseRegistryKey: (key: string | undefined, displayTitle?: string | undefined) => void;
  /** Apply incoming commands (drive mode: tells the lab to update) */
  applyCommands: (cmds: LabCommand[]) => void;
  /** Set mode and optionally reset the session */
  setMode: (mode: ChatMode) => void;
  /** After user picks draft/publish from pending definition */
  onLabGenerated: (def: LabComponentDefinition, options?: LabGeneratedOptions) => void;
  widgetType: string | undefined;
  /**
   * 解除与当前实验的绑定：清空 Drive/Generate 基准、会话 id、待下发命令，
   * 聊天重置为 Generate 欢迎语（用于侧栏 Lab Catalog ↔ Drafts 切换等）。
   */
  clearLabChatBinding: () => void;
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

function buildGenerateAnchoredWelcome(title: string, registryKey: string): string {
  return (
    `**已选中实验：**「${title}」  \`registry_key\`: \`${registryKey}\`\n\n` +
    '当前 **Generate** 会围绕该实验迭代：可说明希望调整的可视化、交互参数、说明文字或 `render_code`；' +
    '在不大改实验主题时，请保持同一 `registry_key` 以便覆盖草稿。\n\n' +
    '• **Drive** — 用自然语言直接调节中间预览区状态\n' +
    '• **Generate** — 基于上述实验生成改进版；完成后在对话中选择 **Save as draft** 或 **Publish**'
  );
}

/** 仅一条助手欢迎语（或空）时可替换，避免合并多条助手回复 */
function isReplaceableGenerateWelcome(messages: ChatMessage[]): boolean {
  if (messages.some(m => m.role === 'user')) return false;
  if (messages.some(m => m.pendingDefinition)) return false;
  if (messages.some(m => m.streaming)) return false;
  return messages.length <= 1;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>(buildInitialMessages());
  const [mode, setModeState] = useState<ChatMode>('generate_lab');
  const [loading, setLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [widgetType, setWidgetTypeState] = useState<string | undefined>(undefined);
  const [generateBaseRegistryKey, setGenerateBaseRegistryKeyState] = useState<string | undefined>(undefined);
  const [generateBaseTitle, setGenerateBaseTitleState] = useState<string | undefined>(undefined);
  const [pendingCommands, setPendingCommands] = useState<LabCommand[]>([]);
  const sessionIdRef = useRef<number | null>(null);
  // Pending definition for generate mode (waiting for user to pick draft/publish)
  const pendingMsgIdRef = useRef<string | undefined>(undefined);
  const activeEventSourceRef = useRef<EventSource | null>(null);

  const resetChat = useCallback((wt?: string) => {
    sessionIdRef.current = null;
    pendingMsgIdRef.current = undefined;
    setMessages(buildInitialMessages(wt));
    setLoading(false);
    setIsGenerating(false);
    if (activeEventSourceRef.current) {
      try { activeEventSourceRef.current.close(); } catch { /* ignore */ }
      activeEventSourceRef.current = null;
    }
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

  const setGenerateBaseRegistryKey = useCallback((key: string | undefined, displayTitle?: string | undefined) => {
    setGenerateBaseRegistryKeyState(key);
    if (!key) {
      setGenerateBaseTitleState(undefined);
      return;
    }
    setGenerateBaseTitleState(displayTitle?.trim() || undefined);
  }, []);

  const clearLabChatBinding = useCallback(() => {
    sessionIdRef.current = null;
    pendingMsgIdRef.current = undefined;
    if (activeEventSourceRef.current) {
      try { activeEventSourceRef.current.close(); } catch { /* ignore */ }
      activeEventSourceRef.current = null;
    }
    setPendingCommands([]);
    setWidgetTypeState(undefined);
    setGenerateBaseRegistryKeyState(undefined);
    setGenerateBaseTitleState(undefined);
    setModeState('generate_lab');
    setMessages(buildInitialMessages(undefined));
    setLoading(false);
    setIsGenerating(false);
  }, []);

  const registerActiveStream = useCallback((es: EventSource, asstMsgId: string) => {
    if (activeEventSourceRef.current && activeEventSourceRef.current !== es) {
      try { activeEventSourceRef.current.close(); } catch { /* ignore */ }
    }
    activeEventSourceRef.current = es;
    pendingMsgIdRef.current = asstMsgId;
    setIsGenerating(true);
  }, []);

  const unregisterActiveStream = useCallback((es?: EventSource) => {
    if (!activeEventSourceRef.current) {
      setIsGenerating(false);
      return;
    }
    if (!es || activeEventSourceRef.current === es) {
      activeEventSourceRef.current = null;
      pendingMsgIdRef.current = undefined;
      setIsGenerating(false);
    }
  }, []);

  const cancelGeneration = useCallback((reason?: string) => {
    const es = activeEventSourceRef.current;
    if (!es) {
      setIsGenerating(false);
      return;
    }
    try { es.close(); } catch { /* ignore */ }
    activeEventSourceRef.current = null;
    setIsGenerating(false);
    const msgId = pendingMsgIdRef.current;
    pendingMsgIdRef.current = undefined;
    if (msgId) {
      const note = reason?.trim() ? reason.trim() : '已中断生成';
      setMessages(prev =>
        prev.map(m => {
          if (m.id !== msgId) return m;
          const base = (m.content || '').trim();
          const next = base ? `${base}\n[${note}]` : `[${note}]`;
          return { ...m, content: next, streaming: false };
        })
      );
    }
  }, []);

  /** Generate + 已选实验：用「围绕该实验」的欢迎语替换仅含助手首条时的占位文案 */
  useEffect(() => {
    if (mode !== 'generate_lab' || loading) return;
    if (!generateBaseRegistryKey) return;
    setMessages(prev => {
      if (!isReplaceableGenerateWelcome(prev)) return prev;
      const title = (generateBaseTitle && generateBaseTitle.trim()) || generateBaseRegistryKey;
      const content = buildGenerateAnchoredWelcome(title, generateBaseRegistryKey);
      if (prev.length === 0) {
        return [{ id: mkMsgId(), role: 'assistant', content, timestamp: Date.now() }];
      }
      return [{ ...prev[0], content, timestamp: Date.now() }];
    });
  }, [mode, generateBaseRegistryKey, generateBaseTitle, loading]);

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
    setIsGenerating(true);

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
      activeEventSourceRef.current = es;

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
        if (activeEventSourceRef.current === es) activeEventSourceRef.current = null;
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
        setIsGenerating(false);
        pendingMsgIdRef.current = undefined;
      });

      es.addEventListener('lab_error', (e: MessageEvent) => {
        es.close();
        if (activeEventSourceRef.current === es) activeEventSourceRef.current = null;
        const detail = typeof e.data === 'string' && e.data.trim() ? e.data : 'Unknown error';
        setMessages(prev =>
          prev.map(m =>
            m.id === asstId
              ? { ...m, content: (m.content || '') + `\n[AI 服务错误] ${detail}`, streaming: false }
              : m
          )
        );
        setLoading(false);
        setIsGenerating(false);
      });

      es.addEventListener('error', () => {
        es.close();
        if (activeEventSourceRef.current === es) activeEventSourceRef.current = null;
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
        setIsGenerating(false);
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
      setIsGenerating(false);
    }
  }, [loading, mode, widgetType, generateBaseRegistryKey]);

  return (
    <ChatContext.Provider
      value={{
        messages,
        mode,
        loading,
        isGenerating,
        cancelGeneration,
        registerActiveStream,
        unregisterActiveStream,
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
        generateBaseTitle,
        setGenerateBaseRegistryKey,
        clearLabChatBinding,
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
