"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Bot, X, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { randomUUID } from "@/lib/uuid";

// ── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface AIChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: number;
    firstname: string | null;
    lastname: string | null;
    department?: string | null;
  };
  onUnreadChange: (hasUnread: boolean) => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const WEBHOOK_URL =
  "http://192.168.10.244:5678/webhook/a0219879-c882-495f-891e-bfb4aa09ef58";

const GREETINGS = [
  (name: string) =>
    `Hey ${name}! 👋 I'm RAI, your virtual assistant at REPCO. What can I help you with today?`,
  (name: string) =>
    `Hi there, ${name}! 😊 I'm RAI — ask me anything and I'll do my best to help!`,
  (name: string) =>
    `Hello ${name}! Great to see you. I'm RAI, here whenever you need a hand.`,
  (name: string) =>
    `Hey ${name} 👋 — RAI here! Got a question? I'm all yours.`,
  (name: string) =>
    `Hi ${name}! I'm RAI, your REPCO assistant. What's on your mind today? 😊`,
];

const SESSION_ID_KEY = "rai-session-id";
const HISTORY_KEY = "rai-chat-history";

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = randomUUID();
    sessionStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}

function loadHistory(): Message[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as Message[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(messages: Message[]) {
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(messages));
  } catch {/* storage full — silently ignore */}
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ── Simple Markdown Renderer ─────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Bullet list block
    if (/^[-*]\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        listItems.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`} className="list-disc pl-4 my-1 space-y-0.5">
          {listItems.map((item, j) => (
            <li key={j}>{inlineMarkdown(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list block
    if (/^\d+\.\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      nodes.push(
        <ol key={`ol-${i}`} className="list-decimal pl-4 my-1 space-y-0.5">
          {listItems.map((item, j) => (
            <li key={j}>{inlineMarkdown(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Normal paragraph line
    nodes.push(
      <p key={`p-${i}`} className="my-0.5">
        {inlineMarkdown(line)}
      </p>
    );
    i++;
  }

  return nodes;
}

function inlineMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

// ── Typing Indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)]">
        <Bot size={13} className="text-white" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-none bg-[var(--color-bg-card)] px-3 py-2.5 border border-[var(--color-border)]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)] animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex items-end gap-2", isUser && "flex-row-reverse")}>
      {!isUser && (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)]">
          <Bot size={13} className="text-white" />
        </div>
      )}
      <div className="flex flex-col gap-0.5" style={{ maxWidth: "78%" }}>
        <div
          className={cn(
            "rounded-2xl px-3 py-2 leading-relaxed",
            isUser
              ? "rounded-br-none bg-[var(--color-accent)] text-white text-[12px]"
              : "rounded-bl-none bg-[var(--color-bg-card)] text-[var(--color-text-primary)] border border-[var(--color-border)]"
          )}
        >
          {isUser ? (
            msg.content
          ) : (
            <div className="space-y-0.5 text-[12px]">{renderMarkdown(msg.content)}</div>
          )}
        </div>
        <span
          className={cn(
            "text-[10px] text-[var(--color-text-muted)]",
            isUser ? "text-right" : "text-left"
          )}
        >
          {fmtTime(msg.timestamp)}
        </span>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function AIChatPanel({
  open,
  onOpenChange,
  user,
  onUnreadChange,
}: AIChatPanelProps) {
  const firstName = user.firstname ?? "there";
  const fullName =
    `${user.firstname ?? ""} ${user.lastname ?? ""}`.trim() || "User";

  const [messages, setMessages] = useState<Message[]>(() => loadHistory());
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [greetingShown, setGreetingShown] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionId = useRef<string>("");

  // Init session ID on mount (client-only)
  useEffect(() => {
    sessionId.current = getSessionId();
  }, []);

  // Persist history whenever messages change
  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  // Auto-scroll to bottom on new messages / typing indicator
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showTyping]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  // Greeting: show once per session when no history
  useEffect(() => {
    if (!open || greetingShown || messages.length > 0) return;
    setGreetingShown(true);
    setShowTyping(true);
    const t = setTimeout(() => {
      setShowTyping(false);
      const variant = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
      const msg: Message = {
        id: randomUUID(),
        role: "assistant",
        content: variant(firstName),
        timestamp: Date.now(),
      };
      setMessages([msg]);
    }, 1500);
    return () => clearTimeout(t);
  }, [open, greetingShown, messages.length, firstName]);

  // Clear unread badge when panel opens
  useEffect(() => {
    if (open) onUnreadChange(false);
  }, [open, onUnreadChange]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: randomUUID(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setShowTyping(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId: sessionId.current,
          userId: user.id,
          name: fullName,
          department: user.department ?? "",
        }),
        signal: controller.signal,
      });

      let replyText: string;
      if (res.ok) {
        const data = await res.json().catch(() => null);
        replyText =
          (typeof data === "string" ? data : null) ??
          data?.output ??
          data?.message ??
          data?.reply ??
          data?.text ??
          (typeof data === "object" && data !== null
            ? JSON.stringify(data)
            : "I received your message!");
      } else {
        replyText =
          "Oops! I'm having a little trouble connecting right now. Give me a moment and try again 😅";
      }

      setShowTyping(false);
      const aiMsg: Message = {
        id: randomUUID(),
        role: "assistant",
        content: replyText,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);

      // Mark unread if panel is closed (checked via ref below)
      if (!open) onUnreadChange(true);
    } catch {
      setShowTyping(false);
      const errMsg: Message = {
        id: randomUUID(),
        role: "assistant",
        content:
          "Oops! I'm having a little trouble connecting right now. Give me a moment and try again 😅",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errMsg]);
      if (!open) onUnreadChange(true);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading, open, user, fullName, onUnreadChange]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    // Accept only text content; silently ignore files/images
    const text = e.clipboardData.getData("text/plain");
    if (!text) {
      e.preventDefault();
    }
    // If text is available, default paste behaviour is fine (browser handles it)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="rai-chat-panel"
          initial={{ opacity: 0, y: -12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 340, damping: 30 }}
          data-rai-panel
          className={cn(
            "fixed z-40 flex flex-col overflow-hidden",
            "rounded-2xl border border-[var(--color-border)] shadow-2xl",
            "bg-[var(--color-bg-elevated)]",
            "w-86 max-[480px]:w-[calc(100%-16px)]",
            "max-h-[calc(100vh-72px)]",
          )}
          style={{
            top: "75px",
            right: "8px",
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3 shrink-0">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)]">
              <Bot size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[var(--color-text-primary)] leading-tight">
                RAI
              </p>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  Always here to help
                </p>
              </div>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full
                text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)]
                transition-colors duration-150"
              aria-label="Close chat"
            >
              <X size={15} />
            </button>
          </div>

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0 max-h-[calc(70vh-210px)]"
            style={{ maxHeight: "calc(70vh - 210px)" }}
          >
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            {showTyping && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-[var(--color-border)] px-3 py-3">
            <div className="relative flex items-center">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                disabled={loading}
                placeholder="Type a message…"
                className={cn(
                  "w-full rounded-xl border border-[var(--color-border)]",
                  "bg-[var(--color-bg-card)] pl-4 pr-10 py-2.5 text-xs",
                  "text-[var(--color-text-primary)]",
                  "placeholder:text-[var(--color-text-muted)]",
                  "focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]",
                  "transition-all duration-150",
                  "disabled:opacity-60 disabled:cursor-not-allowed"
                )}
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className={cn(
                  "absolute right-2 flex h-6 w-6 items-center justify-center rounded-lg",
                  "bg-[var(--color-accent)] text-white",
                  "transition-opacity duration-150",
                  "disabled:opacity-40 disabled:cursor-not-allowed"
                )}
                aria-label="Send message"
              >
                {loading ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Send size={12} />
                )}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Navbar Robot Button ──────────────────────────────────────────────────────

interface RobotNavButtonProps {
  onClick: () => void;
  hasUnread: boolean;
}

export function RobotNavButton({ onClick, hasUnread }: RobotNavButtonProps) {
  return null;
}
