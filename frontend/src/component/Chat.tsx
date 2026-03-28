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
    <div className="h-full flex flex-col border rounded p-3 bg-gray-50">
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto mb-3 pr-1">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400">No messages yet</p>
        )}

        <div className="space-y-2">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.isOwnMessage ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded px-3 py-2 text-sm ${
                  message.isOwnMessage
                    ? "bg-blue-500 text-white"
                    : "bg-white border text-gray-800"
                }`}
              >
                <p className="text-[11px] font-semibold mb-1 opacity-80">
                  {message.isOwnMessage ? "You" : message.sender}
                </p>
                <p className="break-words">{message.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2 text-sm"
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
          className="px-4 border rounded text-sm bg-white"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export { Chat };
