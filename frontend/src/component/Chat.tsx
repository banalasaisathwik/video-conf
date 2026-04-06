import { useEffect, useRef, useState } from "react";

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  isOwnMessage: boolean;
}

interface ChatProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => Promise<void> | void;
}

const Chat = ({ messages, onSendMessage }: ChatProps) => {
  const [input, setInput] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [messages]);

  async function handleSend() {
    const trimmedInput = input.trim();
    if (!trimmedInput) return;

    await onSendMessage(trimmedInput);
    setInput("");
  }

  return (
    <div className="flex h-full flex-col rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">chat here</h3>
         
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {messages.length} messages
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="flex-1 space-y-3 overflow-y-auto rounded-3xl bg-slate-50 p-3"
      >
        {messages.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
            No messages yet.
          </div>
        )}

        <div className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.isOwnMessage ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                  message.isOwnMessage
                    ? "bg-slate-950 text-white"
                    : "border border-slate-200 bg-white text-slate-800"
                }`}
              >
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">
                  {message.isOwnMessage ? "You" : message.sender}
                </p>
                <p className="break-words leading-6">{message.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <input
          className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void handleSend();
            }
          }}
          placeholder="Type a message"
        />
        <button
          onClick={() => void handleSend()}
          className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export { Chat };
