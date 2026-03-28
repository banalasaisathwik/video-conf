// Chat.tsx
import { useState } from "react";

const Chat = () => {
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState("");

  function handleSend() {
    if (!input.trim()) return;

    setMessages((prev) => [...prev, input]);
    setInput("");
  }

  return (
    <div className="h-full flex flex-col border rounded p-2">

      {/* Messages */}
      <div className="flex-1 overflow-y-auto mb-2">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400">No messages</p>
        )}

        {messages.map((msg, i) => (
          <div key={i} className="mb-1 text-sm">
            {msg}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex">
        <input
          className="flex-1 border rounded p-1 text-sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          onClick={handleSend}
          className="ml-2 px-3 border rounded text-sm"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export { Chat };