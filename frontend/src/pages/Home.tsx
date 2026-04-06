import {useState } from "react";
import { useNavigate } from "react-router-dom";

const Home = () => {
  const [roomId, setRoomId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const isJoinDisabled = !roomId.trim() || !name.trim();

  function handleJoin() {
    if (isJoinDisabled) {
      setError("Enter your name and meeting ID before joining.");
      return;
    }
    setError("");
    navigate(`/room/${roomId.trim()}`, { state: { name: name.trim() } });
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-8 flex items-center justify-between rounded-full border border-white/10 bg-white/5 px-4 py-3 backdrop-blur sm:px-6">
          <div>
            <p className="text-xs justify-items-center font-semibold uppercase tracking-[0.3em] text-cyan-300">
              Zoom Clone
            </p>
          </div>
        </header>

        <section className="flex flex-1 items-center justify-center">
          <section className="w-full max-w-2xl rounded-[2rem] border border-slate-200 bg-white p-6 text-left shadow-2xl shadow-slate-950/10 sm:p-8">
            <div className="mb-8">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">
                Join a room
              </p>

              <p className="mt-3 text-sm leading-6 text-slate-600">
                Use the same meeting ID as your friend.
              </p>
            </div>

            <div className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">
                  Meeting ID
                </span>
                <input
                  value={roomId}
                  onChange={(e) => {
                    setRoomId(e.target.value);
                    if (error) {
                      setError("");
                    }
                  }}
                  placeholder="Example: 204(anything-random string)"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">
                  Your name
                </span>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (error) {
                      setError("");
                    }
                  }}
                  placeholder="how others see you"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
                />
              </label>
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <button
              onClick={handleJoin}
              className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={isJoinDisabled}
            >
              Join meeting
            </button>
          </section>
        </section>
      </div>
    </main>
  );
};

export { Home };
