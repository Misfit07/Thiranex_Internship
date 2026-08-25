import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Trash2, Pencil, LogOut, CheckCircle2, Circle, Clock, X, User, Lock } from "lucide-react";

// ---------------------------------------------------------------------------
// Task Manager — a small full-stack-style demo built entirely on the client.
//
// How the "full-stack" pieces are simulated in this artifact environment:
// - AUTH: accounts live in SHARED persistent storage (window.storage), so
//   they behave like rows in a real user table. Passwords are stored in
//   plain text here purely for demo simplicity — never do this in a real app,
//   real backends hash passwords (e.g. bcrypt) and never store them raw.
// - CRUD: tasks live in shared storage too, namespaced per username, which
//   mimics a database table scoped by a foreign key (user_id).
// - "REAL-TIME": there's no real server to push WebSocket events from here,
//   so we poll storage every few seconds and diff the results. This gives
//   the same user-facing effect (data updates without a manual refresh)
//   using a technique you could swap for actual WebSockets/SSE later.
// ---------------------------------------------------------------------------

const POLL_MS = 4000;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function safeGet(key, shared) {
  try {
    const res = await window.storage.get(key, shared);
    return res ? res.value : null;
  } catch {
    return null;
  }
}

export default function TaskManagerApp() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null); // { username }
  const [authMode, setAuthMode] = useState("login"); // login | signup
  const [authForm, setAuthForm] = useState({ username: "", password: "" });
  const [authError, setAuthError] = useState("");

  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [filter, setFilter] = useState("all"); // all | active | done
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", dueDate: "" });
  const [toast, setToast] = useState(null);

  const pollRef = useRef(null);
  const lastSnapshotRef = useRef("");

  // Restore a lightweight "session" (not persisted across reload, on purpose —
  // a real app would use a signed session cookie / JWT here instead).
  useEffect(() => {
    setBooting(false);
  }, []);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  // ---- AUTH ---------------------------------------------------------------

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError("");
    const username = authForm.username.trim().toLowerCase();
    const password = authForm.password;
    if (!username || !password) {
      setAuthError("Enter a username and password.");
      return;
    }

    if (authMode === "signup") {
      const existing = await safeGet(`users:${username}`, true);
      if (existing) {
        setAuthError("That username is taken. Try logging in instead.");
        return;
      }
      try {
        await window.storage.set(`users:${username}`, JSON.stringify({ password, createdAt: Date.now() }), true);
      } catch {
        setAuthError("Couldn't create the account. Try again.");
        return;
      }
      setUser({ username });
      showToast(`Welcome, ${username}!`);
    } else {
      const existing = await safeGet(`users:${username}`, true);
      if (!existing) {
        setAuthError("No account with that username. Sign up first.");
        return;
      }
      const record = JSON.parse(existing);
      if (record.password !== password) {
        setAuthError("Incorrect password.");
        return;
      }
      setUser({ username });
      showToast(`Welcome back, ${username}!`);
    }
    setAuthForm({ username: "", password: "" });
  }

  function handleLogout() {
    setUser(null);
    setTasks([]);
    clearInterval(pollRef.current);
  }

  // ---- TASKS (CRUD) ---------------------------------------------------------

  const fetchTasks = useCallback(async (username, { silent } = {}) => {
    if (!silent) setLoadingTasks(true);
    try {
      const list = await window.storage.list(`tasks:${username}:`, true);
      const keys = list && list.keys ? list.keys : [];
      const results = await Promise.all(
        keys.map(async (k) => {
          const v = await safeGet(k, true);
          return v ? JSON.parse(v) : null;
        })
      );
      const loaded = results.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
      const snapshot = JSON.stringify(loaded);
      if (snapshot !== lastSnapshotRef.current) {
        lastSnapshotRef.current = snapshot;
        setTasks(loaded);
      }
    } catch {
      if (!silent) showToast("Couldn't load tasks.");
    }
    if (!silent) setLoadingTasks(false);
  }, []);

  // initial load + polling loop to simulate real-time updates
  useEffect(() => {
    if (!user) return;
    fetchTasks(user.username);
    pollRef.current = setInterval(() => fetchTasks(user.username, { silent: true }), POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [user, fetchTasks]);

  function openNewForm() {
    setEditingId(null);
    setForm({ title: "", description: "", priority: "medium", dueDate: "" });
    setShowForm(true);
  }

  function openEditForm(task) {
    setEditingId(task.id);
    setForm({
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      dueDate: task.dueDate || "",
    });
    setShowForm(true);
  }

  async function handleSaveTask(e) {
    e.preventDefault();
    if (!form.title.trim()) {
      showToast("Give the task a title first.");
      return;
    }
    const now = Date.now();
    if (editingId) {
      const existing = tasks.find((t) => t.id === editingId);
      const updated = { ...existing, ...form, updatedAt: now };
      try {
        await window.storage.set(`tasks:${user.username}:${editingId}`, JSON.stringify(updated), true);
        setTasks((prev) => prev.map((t) => (t.id === editingId ? updated : t)));
        lastSnapshotRef.current = "";
        showToast("Task updated.");
      } catch {
        showToast("Couldn't save the change.");
      }
    } else {
      const id = uid();
      const newTask = {
        id,
        ...form,
        status: "active",
        createdAt: now,
        updatedAt: now,
        owner: user.username,
      };
      try {
        await window.storage.set(`tasks:${user.username}:${id}`, JSON.stringify(newTask), true);
        setTasks((prev) => [newTask, ...prev]);
        lastSnapshotRef.current = "";
        showToast("Task created.");
      } catch {
        showToast("Couldn't create the task.");
      }
    }
    setShowForm(false);
  }

  async function toggleStatus(task) {
    const updated = { ...task, status: task.status === "done" ? "active" : "done", updatedAt: Date.now() };
    try {
      await window.storage.set(`tasks:${user.username}:${task.id}`, JSON.stringify(updated), true);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      lastSnapshotRef.current = "";
    } catch {
      showToast("Couldn't update the task.");
    }
  }

  async function deleteTask(task) {
    try {
      await window.storage.delete(`tasks:${user.username}:${task.id}`, true);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      lastSnapshotRef.current = "";
      showToast("Task deleted.");
    } catch {
      showToast("Couldn't delete the task.");
    }
  }

  // ---- DERIVED --------------------------------------------------------------

  const visibleTasks = tasks
    .filter((t) => (filter === "all" ? true : filter === "active" ? t.status !== "done" : t.status === "done"))
    .filter((t) => t.title.toLowerCase().includes(query.toLowerCase()));

  const counts = {
    all: tasks.length,
    active: tasks.filter((t) => t.status !== "done").length,
    done: tasks.filter((t) => t.status === "done").length,
  };

  const priorityStyles = {
    high: "bg-red-50 text-red-700 border-red-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };

  if (booting) return null;

  // ---- LOGIN / SIGNUP SCREEN --------------------------------------------------

  if (!user) {
    return (
      <div className="min-h-[600px] w-full flex items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <div className="flex flex-col items-center mb-6">
            <div className="w-11 h-11 rounded-xl bg-indigo-600 flex items-center justify-center mb-3">
              <CheckCircle2 className="text-white" size={22} />
            </div>
            <h1 className="text-xl font-semibold text-slate-900">Task Manager</h1>
            <p className="text-sm text-slate-500 mt-1">
              {authMode === "login" ? "Log in to your account" : "Create a new account"}
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  autoComplete="username"
                  value={authForm.username}
                  onChange={(e) => setAuthForm((f) => ({ ...f, username: e.target.value }))}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="e.g. jordan"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="password"
                  autoComplete={authMode === "login" ? "current-password" : "new-password"}
                  value={authForm.password}
                  onChange={(e) => setAuthForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {authError && <p className="text-xs text-red-600">{authError}</p>}

            <button
              type="submit"
              className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] transition text-white text-sm font-medium"
            >
              {authMode === "login" ? "Log in" : "Sign up"}
            </button>
          </form>

          <p className="text-xs text-slate-500 text-center mt-4">
            {authMode === "login" ? "New here?" : "Already have an account?"}{" "}
            <button
              onClick={() => {
                setAuthMode(authMode === "login" ? "signup" : "login");
                setAuthError("");
              }}
              className="text-indigo-600 font-medium hover:underline"
            >
              {authMode === "login" ? "Create an account" : "Log in"}
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ---- MAIN APP ---------------------------------------------------------------

  return (
    <div className="min-h-[600px] w-full bg-slate-50 p-3 sm:p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <CheckCircle2 className="text-white" size={16} />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-slate-900 leading-tight">Task Manager</h1>
              <p className="text-xs text-slate-500 leading-tight">Signed in as {user.username}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-xs sm:text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-white transition"
          >
            <LogOut size={14} /> Log out
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5">
          <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
            <p className="text-lg sm:text-xl font-semibold text-slate-900">{counts.all}</p>
            <p className="text-[11px] sm:text-xs text-slate-500">Total</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
            <p className="text-lg sm:text-xl font-semibold text-indigo-600">{counts.active}</p>
            <p className="text-[11px] sm:text-xs text-slate-500">Active</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
            <p className="text-lg sm:text-xl font-semibold text-emerald-600">{counts.done}</p>
            <p className="text-[11px] sm:text-xs text-slate-500">Done</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between mb-4">
          <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1 w-fit">
            {["all", "active", "done"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs sm:text-sm rounded-md capitalize transition ${
                  filter === f ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks..."
              className="flex-1 sm:w-48 px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={openNewForm}
              className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-3 py-1.5 rounded-lg transition whitespace-nowrap"
            >
              <Plus size={16} /> New
            </button>
          </div>
        </div>

        {/* Task list */}
        <div className="space-y-2">
          {loadingTasks && tasks.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-10">Loading tasks…</p>
          )}
          {!loadingTasks && visibleTasks.length === 0 && (
            <div className="text-center py-14 bg-white rounded-xl border border-dashed border-slate-300">
              <p className="text-sm text-slate-500">No tasks here yet.</p>
              <button onClick={openNewForm} className="text-sm text-indigo-600 font-medium hover:underline mt-1">
                Create your first task
              </button>
            </div>
          )}
          {visibleTasks.map((task) => (
            <div
              key={task.id}
              className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 flex items-start gap-3"
            >
              <button onClick={() => toggleStatus(task)} className="mt-0.5 shrink-0 text-slate-400 hover:text-indigo-600">
                {task.status === "done" ? <CheckCircle2 className="text-emerald-500" size={20} /> : <Circle size={20} />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`text-sm font-medium ${task.status === "done" ? "line-through text-slate-400" : "text-slate-900"}`}>
                    {task.title}
                  </p>
                  <span className={`text-[10px] uppercase font-medium border rounded-full px-2 py-0.5 ${priorityStyles[task.priority]}`}>
                    {task.priority}
                  </span>
                </div>
                {task.description && (
                  <p className="text-xs sm:text-sm text-slate-500 mt-1 break-words">{task.description}</p>
                )}
                {task.dueDate && (
                  <p className="flex items-center gap-1 text-[11px] text-slate-400 mt-1.5">
                    <Clock size={12} /> Due {task.dueDate}
                  </p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openEditForm(task)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-md">
                  <Pencil size={15} />
                </button>
                <button onClick={() => deleteTask(task)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-50 rounded-md">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-6">
          Updates sync automatically every few seconds — try opening this task list in two tabs.
        </p>
      </div>

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">{editingId ? "Edit task" : "New task"}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveTask} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Finish project outline"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="Optional details"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Due date</label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
                >
                  {editingId ? "Save changes" : "Create task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
