import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ethers } from 'ethers';

const CONTRACT_ADDRESS = '0x70AEd9e189368d7ecc9390A153cf9A0Aea0d3F23';
const TARGET_CHAIN_ID = 11155111;
const TARGET_CHAIN_HEX = '0xaa36a7';

const ABI = [
  {
    "inputs": [{ "internalType": "string", "name": "_content", "type": "string" }],
    "name": "createTask",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "_id", "type": "uint256" }],
    "name": "deleteTask",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "_id", "type": "uint256" }],
    "name": "toggleTask",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "_id", "type": "uint256" }],
    "name": "getTask",
    "outputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" },
      { "internalType": "string", "name": "", "type": "string" },
      { "internalType": "bool", "name": "", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "taskCount",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "name": "tasks",
    "outputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" },
      { "internalType": "string", "name": "", "type": "string" },
      { "internalType": "bool", "name": "", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

const config = window.__QUICK_DAPP_CONFIG__ || {};
const APP_TITLE = config.title || 'TodoList';

// ── Spinner ──────────────────────────────────────────────────────────────────
function Spinner({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className="animate-spin inline-block"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

// ── CheckIcon ────────────────────────────────────────────────────────────────
function CheckIcon({ checked }) {
  return (
    <span
      className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200
        ${checked
          ? 'bg-done border-done text-white'
          : 'border-gray-400 bg-white hover:border-accent'
        }`}
    >
      {checked && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="2,6 5,9 10,3" />
        </svg>
      )}
    </span>
  );
}

// ── Toast ────────────────────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 items-end">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-lg text-sm font-medium shadow-lg text-white max-w-xs transition-all duration-300
            ${t.type === 'error' ? 'bg-red-600' : t.type === 'success' ? 'bg-done' : 'bg-ink'}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [pendingIds, setPendingIds] = useState(new Set());
  const [filter, setFilter] = useState('all'); // all | active | done
  const [toasts, setToasts] = useState([]);
  const providerRef = useRef(null);
  const inputRef = useRef(null);

  // ── Toast helpers ──────────────────────────────────────────────────────────
  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  // ── Contract (read-only, no signer) ───────────────────────────────────────
  const getReadContract = useCallback(() => {
    if (!providerRef.current) return null;
    const provider = new ethers.BrowserProvider(providerRef.current);
    return new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
  }, []);

  const getWriteContract = useCallback(async () => {
    if (!providerRef.current) return null;
    const provider = new ethers.BrowserProvider(providerRef.current);
    const signer = await provider.getSigner();
    return new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
  }, []);

  // ── Fetch tasks ────────────────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    const contract = getReadContract();
    if (!contract) return;
    setLoadingTasks(true);
    try {
      const count = await contract.taskCount();
      const total = Number(count);
      const fetched = [];
      for (let i = 1; i <= total; i++) {
        try {
          const [id, content, completed] = await contract.getTask(i);
          if (content !== '') {
            fetched.push({ id: Number(id), content, completed });
          }
        } catch {
          // task may have been deleted
        }
      }
      setTasks(fetched);
    } catch (err) {
      addToast('Failed to load tasks', 'error');
    } finally {
      setLoadingTasks(false);
    }
  }, [getReadContract, addToast]);

  // ── Wallet connect ─────────────────────────────────────────────────────────
  const connectWallet = useCallback(async () => {
    setLoading(true);
    try {
      const rawProvider = window.__qdapp_getProvider
        ? await window.__qdapp_getProvider()
        : window.ethereum;

      if (!rawProvider) {
        addToast('No wallet detected. Please install MetaMask.', 'error');
        return;
      }

      providerRef.current = rawProvider;
      const provider = new ethers.BrowserProvider(rawProvider);
      const accounts = await provider.send('eth_requestAccounts', []);
      if (!accounts.length) return;

      const network = await provider.getNetwork();
      const cId = Number(network.chainId);
      setChainId(cId);
      setAccount(accounts[0]);

      rawProvider.on('accountsChanged', (accs) => {
        setAccount(accs[0] || null);
        if (!accs[0]) setTasks([]);
      });
      rawProvider.on('chainChanged', () => window.location.reload());
    } catch (err) {
      addToast('Wallet connection failed', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  const disconnectWallet = useCallback(() => {
    setAccount(null);
    setChainId(null);
    setTasks([]);
    providerRef.current = null;
  }, []);

  const switchNetwork = useCallback(async () => {
    if (!providerRef.current) return;
    try {
      await providerRef.current.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: TARGET_CHAIN_HEX }],
      });
    } catch (err) {
      addToast('Failed to switch network', 'error');
    }
  }, [addToast]);

  // ── Fetch on connect ───────────────────────────────────────────────────────
  useEffect(() => {
    if (account && chainId === TARGET_CHAIN_ID) {
      fetchTasks();
    }
  }, [account, chainId, fetchTasks]);

  // ── Create task ────────────────────────────────────────────────────────────
  const createTask = useCallback(async () => {
    const content = newTask.trim();
    if (!content) return;
    const contract = await getWriteContract();
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.createTask(content);
      addToast('Transaction sent…', 'info');
      await tx.wait();
      setNewTask('');
      addToast('Task added!', 'success');
      await fetchTasks();
    } catch (err) {
      addToast(err?.reason || 'Failed to create task', 'error');
    } finally {
      setLoading(false);
    }
  }, [newTask, getWriteContract, addToast, fetchTasks]);

  // ── Toggle task ────────────────────────────────────────────────────────────
  const toggleTask = useCallback(async (id) => {
    const contract = await getWriteContract();
    if (!contract) return;
    setPendingIds((prev) => new Set(prev).add(id));
    try {
      const tx = await contract.toggleTask(id);
      await tx.wait();
      addToast('Task updated!', 'success');
      await fetchTasks();
    } catch (err) {
      addToast(err?.reason || 'Failed to toggle task', 'error');
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [getWriteContract, addToast, fetchTasks]);

  // ── Delete task ────────────────────────────────────────────────────────────
  const deleteTask = useCallback(async (id) => {
    const contract = await getWriteContract();
    if (!contract) return;
    setPendingIds((prev) => new Set(prev).add(id));
    try {
      const tx = await contract.deleteTask(id);
      await tx.wait();
      addToast('Task removed', 'info');
      await fetchTasks();
    } catch (err) {
      addToast(err?.reason || 'Failed to delete task', 'error');
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [getWriteContract, addToast, fetchTasks]);

  // ── Filtered tasks ─────────────────────────────────────────────────────────
  const filteredTasks = tasks.filter((t) => {
    if (filter === 'active') return !t.completed;
    if (filter === 'done') return t.completed;
    return true;
  });

  const doneCount = tasks.filter((t) => t.completed).length;
  const activeCount = tasks.filter((t) => !t.completed).length;

  const isWrongNetwork = account && chainId !== TARGET_CHAIN_ID;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-paper font-sans">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <h1 className="text-xl font-bold tracking-tight text-ink">{APP_TITLE}</h1>
          </div>

          <div className="flex items-center gap-2">
            {!account ? (
              <button
                onClick={connectWallet}
                disabled={loading}
                className="btn-primary flex items-center gap-2"
              >
                {loading ? <Spinner /> : null}
                Connect Wallet
              </button>
            ) : isWrongNetwork ? (
              <button onClick={switchNetwork} className="btn-warn flex items-center gap-2">
                ⚠ Switch to Sepolia
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full border border-gray-200">
                  {account.slice(0, 6)}…{account.slice(-4)}
                </span>
                <button
                  onClick={disconnectWallet}
                  className="text-xs text-gray-500 hover:text-red-500 transition-colors px-2 py-1.5"
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-2xl mx-auto px-4 py-8">
        {!account ? (
          /* ── Not connected ── */
          <div className="text-center py-24 space-y-4">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-2xl font-bold text-ink">Your on-chain to-do list</h2>
            <p className="text-gray-500 max-w-sm mx-auto">
              Connect your wallet to create, complete, and manage tasks stored permanently on the Sepolia blockchain.
            </p>
            <button
              onClick={connectWallet}
              disabled={loading}
              className="btn-primary mt-4 inline-flex items-center gap-2"
            >
              {loading ? <Spinner /> : null}
              Connect Wallet
            </button>
          </div>
        ) : isWrongNetwork ? (
          /* ── Wrong network ── */
          <div className="text-center py-24 space-y-4">
            <div className="text-5xl">🔗</div>
            <h2 className="text-xl font-bold">Wrong Network</h2>
            <p className="text-gray-500">Please switch to Sepolia testnet to use this app.</p>
            <button onClick={switchNetwork} className="btn-warn mt-2">
              Switch to Sepolia
            </button>
          </div>
        ) : (
          /* ── Connected & correct network ── */
          <div className="space-y-6">
            {/* Stats bar */}
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span><strong className="text-ink">{tasks.length}</strong> total</span>
              <span>·</span>
              <span><strong className="text-accent">{activeCount}</strong> active</span>
              <span>·</span>
              <span><strong className="text-done">{doneCount}</strong> done</span>
            </div>

            {/* Input row */}
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createTask()}
                placeholder="What needs to be done?"
                className="task-input flex-1"
                disabled={loading}
                maxLength={280}
              />
              <button
                onClick={createTask}
                disabled={loading || !newTask.trim()}
                className="btn-primary flex items-center gap-2 whitespace-nowrap"
              >
                {loading ? <Spinner /> : <span>+</span>}
                Add Task
              </button>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
              {['all', 'active', 'done'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-all duration-150
                    ${filter === f ? 'bg-white text-ink shadow-sm' : 'text-gray-500 hover:text-ink'}`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Task list */}
            {loadingTasks ? (
              <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
                <Spinner size={20} />
                <span>Loading tasks from chain…</span>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <div className="text-4xl mb-3">
                  {filter === 'done' ? '🎉' : filter === 'active' ? '🌟' : '📭'}
                </div>
                <p className="font-medium">
                  {filter === 'done'
                    ? 'No completed tasks yet'
                    : filter === 'active'
                    ? 'All caught up!'
                    : 'No tasks yet — add one above'}
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {filteredTasks.map((task) => {
                  const isPending = pendingIds.has(task.id);
                  return (
                    <li
                      key={task.id}
                      className={`task-card group flex items-center gap-3 ${task.completed ? 'opacity-60' : ''}`}
                    >
                      {/* Toggle button */}
                      <button
                        onClick={() => toggleTask(task.id)}
                        disabled={isPending}
                        className="flex-shrink-0 focus:outline-none"
                        title={task.completed ? 'Mark active' : 'Mark done'}
                      >
                        {isPending ? (
                          <span className="w-6 h-6 flex items-center justify-center text-gray-400">
                            <Spinner size={14} />
                          </span>
                        ) : (
                          <CheckIcon checked={task.completed} />
                        )}
                      </button>

                      {/* Content */}
                      <span
                        className={`flex-1 text-sm leading-relaxed break-words ${
                          task.completed ? 'line-through text-gray-400' : 'text-ink'
                        }`}
                      >
                        {task.content}
                      </span>

                      {/* Task ID badge */}
                      <span className="text-xs font-mono text-gray-300 group-hover:text-gray-400 transition-colors flex-shrink-0">
                        #{task.id}
                      </span>

                      {/* Delete button */}
                      <button
                        onClick={() => deleteTask(task.id)}
                        disabled={isPending}
                        className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 focus:opacity-100 focus:outline-none p-1"
                        title="Delete task"
                      >
                        {isPending ? (
                          <Spinner size={14} />
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M1 3h12M5 3V2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M12 3l-1 9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1L2 3" />
                          </svg>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Footer note */}
            {tasks.length > 0 && (
              <p className="text-center text-xs text-gray-400 pt-2">
                Tasks are stored on-chain · Sepolia testnet
              </p>
            )}
          </div>
        )}
      </main>

      <Toast toasts={toasts} />
    </div>
  );
}
