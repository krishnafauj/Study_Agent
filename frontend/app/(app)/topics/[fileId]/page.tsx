"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Search, Loader2, BookOpen, AlertCircle,
  Play, Map, CreditCard, X, RotateCcw, ZoomIn, ZoomOut, EyeOff
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Topic = {
  _id: string;
  title: string;
  level: number;
  summary: string;
  content: string;
  order: number;
  children?: Topic[];
};

type Progress = {
  status: string;
  progress: number;
  totalTopics: number;
  topicsCreated: number;
  fileName: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function authHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// ─── Flatten topics ────────────────────────────────────────────────────────────
function flattenTopics(topics: Topic[]): Topic[] {
  const result: Topic[] = [];
  function walk(list: Topic[]) {
    for (const t of list) {
      result.push(t);
      if (t.children?.length) walk(t.children);
    }
  }
  walk(topics);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// MIND MAP COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const NODE_W = 160;
const NODE_H = 48;
const H_GAP = 220;
const V_GAP = 64;

type NodePos = {
  topic: Topic;
  x: number;
  y: number;
  depth: number;
};

function layoutTree(topics: Topic[]): NodePos[] {
  const positions: NodePos[] = [];
  let yCounter = 0;

  function placeNode(topic: Topic, depth: number): number {
    const childCount = topic.children?.length ?? 0;

    if (childCount === 0) {
      const cy = yCounter * (NODE_H + V_GAP);
      yCounter++;
      positions.push({ topic, x: depth * H_GAP, y: cy, depth });
      return cy;
    }

    const childYs: number[] = [];
    topic.children!.forEach((child) => {
      childYs.push(placeNode(child, depth + 1));
    });

    const cy = (childYs[0] + childYs[childYs.length - 1]) / 2;
    positions.push({ topic, x: depth * H_GAP, y: cy, depth });
    return cy;
  }

  topics.forEach((t) => placeNode(t, 0));
  return positions;
}

const DEPTH_COLORS = [
  "from-purple-600 to-purple-800 border-purple-500",
  "from-blue-600 to-blue-800 border-blue-500",
  "from-cyan-600 to-cyan-800 border-cyan-500",
  "from-emerald-600 to-emerald-800 border-emerald-500",
  "from-orange-600 to-orange-800 border-orange-500",
];

// ─── Topic Side Panel ─────────────────────────────────────────────────────────
function TopicPanel({
  topic,
  onClose,
  onChild,
}: {
  topic: Topic;
  onClose: () => void;
  onChild: (t: Topic) => void;
}) {
  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-neutral-900 border-l border-neutral-700 z-30 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <span className="text-xs font-semibold text-purple-400 uppercase tracking-wide">
          Level {topic.level}
        </span>
        <button
          onClick={onClose}
          className="p-1 text-neutral-500 hover:text-white transition-colors rounded"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <h2 className="text-xl font-bold text-white leading-tight">{topic.title}</h2>

        {topic.summary && (
          <div>
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">
              Summary
            </p>
            <p className="text-sm text-neutral-300 leading-relaxed">{topic.summary}</p>
          </div>
        )}

        {topic.content && (
          <div>
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">
              Content
            </p>
            <p className="text-sm text-neutral-400 leading-relaxed">{topic.content}</p>
          </div>
        )}

        {topic.children && topic.children.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
              Subtopics ({topic.children.length})
            </p>
            <div className="space-y-1.5">
              {topic.children.map((child) => (
                <button
                  key={child._id}
                  onClick={() => onChild(child)}
                  className="w-full text-left px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-purple-500/50 rounded-lg text-sm text-neutral-300 hover:text-white transition-all"
                >
                  → {child.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Mind Map ─────────────────────────────────────────────────────────────────
function MindMap({
  topics,
  searchQuery,
  onSelectTopic,
  selectedId,
}: {
  topics: Topic[];
  searchQuery: string;
  onSelectTopic: (t: Topic) => void;
  selectedId: string | null;
}) {
  const positions = layoutTree(topics);
  const [scale, setScale] = useState(0.85);
  const [pan, setPan] = useState({ x: 40, y: 40 });

  // Pointer-capture based panning — works all the way to canvas edges
  const isPanning = useRef(false);
  const startMouse = useRef({ x: 0, y: 0 });
  const startPan = useRef({ x: 0, y: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const maxX = Math.max(...positions.map((p) => p.x), 0) + NODE_W + H_GAP;
  const maxY = Math.max(...positions.map((p) => p.y), 0) + NODE_H + V_GAP;

  // Build SVG edges
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];
  positions.forEach(({ topic, x, y }) => {
    topic.children?.forEach((child) => {
      const childPos = positions.find((p) => p.topic._id === child._id);
      if (childPos) {
        edges.push({
          x1: x + NODE_W,
          y1: y + NODE_H / 2,
          x2: childPos.x,
          y2: childPos.y + NODE_H / 2,
        });
      }
    });
  });

  const matches = searchQuery.trim().toLowerCase();

  // ── Pointer capture handlers ────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Ignore clicks that originate from nodes or controls
    if ((e.target as HTMLElement).closest(".mindmap-node")) return;
    if ((e.target as HTMLElement).closest(".mindmap-controls")) return;

    isPanning.current = true;
    startMouse.current = { x: e.clientX, y: e.clientY };
    startPan.current = { x: pan.x, y: pan.y };

    // Capture pointer so we keep receiving events even outside the element
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning.current) return;
    const dx = e.clientX - startMouse.current.x;
    const dy = e.clientY - startMouse.current.y;
    setPan({ x: startPan.current.x + dx, y: startPan.current.y + dy });
  };

  const onPointerUp = () => {
    isPanning.current = false;
  };

  // Wheel to zoom
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;
    setScale((s) => Math.min(Math.max(s + delta * 0.08, 0.25), 2.5));
  };

  return (
    <div
      ref={wrapRef}
      className="relative w-full h-full overflow-hidden bg-neutral-950 rounded-xl border border-neutral-800 cursor-grab active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      {/* Zoom controls */}
      <div className="mindmap-controls absolute top-3 right-3 z-20 flex flex-col gap-1">
        <button
          onClick={() => setScale((s) => Math.min(s + 0.15, 2.5))}
          className="p-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-neutral-300 hover:text-white transition-colors"
          title="Zoom in"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={() => setScale((s) => Math.max(s - 0.15, 0.25))}
          className="p-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-neutral-300 hover:text-white transition-colors"
          title="Zoom out"
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={() => { setScale(0.85); setPan({ x: 40, y: 40 }); }}
          className="p-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-neutral-300 hover:text-white transition-colors"
          title="Reset view"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* Dot grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Panning canvas */}
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: "0 0",
          width: maxX,
          height: maxY,
          position: "absolute",
          top: 0,
          left: 0,
        }}
      >
        {/* SVG edges */}
        <svg
          ref={svgRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: maxX,
            height: maxY,
            overflow: "visible",
            pointerEvents: "none",
          }}
        >
          <defs>
            <marker
              id="arrow"
              markerWidth="6"
              markerHeight="6"
              refX="3"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L6,3 L0,6 Z" fill="rgba(139,92,246,0.5)" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const mx = (e.x1 + e.x2) / 2;
            return (
              <path
                key={i}
                d={`M${e.x1},${e.y1} C${mx},${e.y1} ${mx},${e.y2} ${e.x2},${e.y2}`}
                fill="none"
                stroke="rgba(139,92,246,0.35)"
                strokeWidth="1.5"
                markerEnd="url(#arrow)"
              />
            );
          })}
        </svg>

        {/* Nodes */}
        {positions.map(({ topic, x, y, depth }) => {
          const isSelected = selectedId === topic._id;
          const isMatch = matches && topic.title.toLowerCase().includes(matches);
          const colorClass = DEPTH_COLORS[depth % DEPTH_COLORS.length];

          return (
            <button
              key={topic._id}
              className={`mindmap-node absolute flex items-center justify-center text-center px-3 py-2 rounded-xl border text-xs font-semibold transition-all duration-200 leading-tight
                bg-gradient-to-br ${colorClass}
                ${isSelected
                  ? "ring-2 ring-white ring-offset-2 ring-offset-neutral-950 scale-110 shadow-xl shadow-purple-500/40 z-10"
                  : "hover:scale-105 hover:shadow-lg hover:ring-1 hover:ring-white/30"
                }
                ${isMatch ? "ring-2 ring-yellow-400 shadow-yellow-400/30 shadow-lg" : ""}
              `}
              style={{
                left: x,
                top: y,
                width: NODE_W,
                minHeight: NODE_H,
                zIndex: isSelected ? 10 : 1,
              }}
              onClick={() => onSelectTopic(topic)}
            >
              <span className="text-white drop-shadow line-clamp-2 leading-tight">
                {topic.title}
              </span>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex items-center gap-3 text-xs text-neutral-500 pointer-events-none">
        <span>Drag to pan · Scroll to zoom · Click node to expand</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FLASH CARDS COMPONENT  (4-per-row grid, individual flip, unreveal all)
// ─────────────────────────────────────────────────────────────────────────────
function FlashCards({ topics }: { topics: Topic[] }) {
  const flat = flattenTopics(topics);
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = searchQuery.trim()
    ? flat.filter(
        (t) =>
          t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.summary?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : flat;

  const toggleCard = (id: string) => {
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const unreveallAll = () => setFlipped(new Set());

  if (flat.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-neutral-500">
        <CreditCard size={40} className="mb-3 opacity-30" />
        <p>No topics to show flash cards for.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-800 shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-3 text-neutral-500" />
          <input
            type="text"
            placeholder="Search cards..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-neutral-900 border border-neutral-700 rounded-xl text-white text-sm placeholder-neutral-600 focus:border-purple-500 outline-none"
          />
        </div>

        <span className="text-sm text-neutral-500 shrink-0">
          {filtered.length} card{filtered.length !== 1 ? "s" : ""}
        </span>

        <button
          onClick={unreveallAll}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm text-neutral-300 hover:text-white transition-all shrink-0"
        >
          <EyeOff size={14} />
          Unreveal all
        </button>
      </div>

      {/* Grid — 4 columns */}
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-neutral-500 text-sm">
            No cards match your search.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((topic) => {
              const isFlipped = flipped.has(topic._id);
              return (
                <div
                  key={topic._id}
                  className="cursor-pointer"
                  style={{ perspective: "1000px", height: 200 }}
                  onClick={() => toggleCard(topic._id)}
                >
                  <div
                    className="relative w-full h-full transition-transform duration-500"
                    style={{
                      transformStyle: "preserve-3d",
                      transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                    }}
                  >
                    {/* Front */}
                    <div
                      className="absolute inset-0 rounded-2xl border border-neutral-700 bg-gradient-to-br from-neutral-900 to-neutral-800 flex flex-col items-center justify-center p-4 text-center"
                      style={{ backfaceVisibility: "hidden" }}
                    >
                      <span className="text-xs text-purple-400 font-semibold uppercase tracking-widest mb-3">
                        Lvl {topic.level}
                      </span>
                      <h3 className="text-sm font-bold text-white leading-snug line-clamp-3">
                        {topic.title}
                      </h3>
                      <p className="text-xs text-neutral-600 mt-auto">Tap to reveal</p>
                    </div>

                    {/* Back */}
                    <div
                      className="absolute inset-0 rounded-2xl border border-purple-700/50 bg-gradient-to-br from-purple-950 to-neutral-900 flex flex-col p-4 overflow-hidden"
                      style={{
                        backfaceVisibility: "hidden",
                        transform: "rotateY(180deg)",
                      }}
                    >
                      <h3 className="text-xs font-bold text-white mb-2 line-clamp-1">
                        {topic.title}
                      </h3>
                      {topic.summary && (
                        <p className="text-xs text-neutral-300 leading-relaxed line-clamp-5">
                          {topic.summary}
                        </p>
                      )}
                      {!topic.summary && topic.content && (
                        <p className="text-xs text-neutral-400 leading-relaxed line-clamp-5">
                          {topic.content.slice(0, 300)}
                          {topic.content.length > 300 ? "…" : ""}
                        </p>
                      )}
                      {topic.children && topic.children.length > 0 && (
                        <div className="mt-auto pt-2 border-t border-neutral-700/50">
                          <div className="flex flex-wrap gap-1">
                            {topic.children.slice(0, 3).map((c) => (
                              <span
                                key={c._id}
                                className="text-[10px] px-1.5 py-0.5 bg-purple-600/20 border border-purple-700/40 text-purple-300 rounded-full"
                              >
                                {c.title}
                              </span>
                            ))}
                            {topic.children.length > 3 && (
                              <span className="text-[10px] text-neutral-500">
                                +{topic.children.length - 3} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function TopicBrowserPage() {
  const params = useParams();
  const router = useRouter();
  const fileId = params?.fileId as string;

  const [topics, setTopics] = useState<Topic[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<"mindmap" | "flashcards">("mindmap");
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);

  const fetchProgress = useCallback(async () => {
    if (!fileId) return;
    try {
      const res = await fetch(`${API_URL}/api/topics/progress/${fileId}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success && data.progress) {
        setProgress(data.progress);
        setIsProcessing(
          data.progress.status !== "completed" && data.progress.status !== "failed"
        );
      }
    } catch { /* silent */ }
  }, [fileId]);

  const fetchTopics = useCallback(async () => {
    if (!fileId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/topics/${fileId}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) setTopics(data.topics);
    } catch { /* silent */ } finally {
      setIsLoading(false);
    }
  }, [fileId]);

  const handleStartProcessing = async () => {
    try {
      const res = await fetch(`${API_URL}/api/topics/process/${fileId}`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (res.ok) {
        setIsProcessing(true);
        fetchProgress();
      }
    } catch { /* silent */ }
  };

  useEffect(() => {
    fetchProgress();
    fetchTopics();
  }, [fileId, fetchProgress, fetchTopics]);

  useEffect(() => {
    if (!isProcessing) return;
    const interval = setInterval(fetchProgress, 2000);
    return () => clearInterval(interval);
  }, [isProcessing, fetchProgress]);

  const fileName = progress?.fileName || "Document";

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-neutral-950 to-neutral-900 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur-md px-4 py-3">
        <div className="max-w-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors shrink-0"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <h1 className="font-bold text-white truncate text-lg">{fileName}</h1>
              <p className="text-xs text-neutral-500">
                {progress?.totalTopics
                  ? `${progress.totalTopics} topics extracted`
                  : "Topic Explorer"}
              </p>
            </div>
          </div>

          {/* Search — only on mind map */}
          {activeTab === "mindmap" && topics.length > 0 && (
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-3 text-neutral-500" />
              <input
                type="text"
                placeholder="Search topics in map..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-neutral-900 border border-neutral-700 rounded-xl text-white text-sm placeholder-neutral-600 focus:border-purple-500 outline-none"
              />
            </div>
          )}

          {/* Tab switcher */}
          <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 rounded-xl p-1 shrink-0">
            <button
              onClick={() => setActiveTab("mindmap")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "mindmap"
                  ? "bg-purple-600 text-white shadow"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <Map size={15} /> Mind Map
            </button>
            <button
              onClick={() => setActiveTab("flashcards")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "flashcards"
                  ? "bg-purple-600 text-white shadow"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <CreditCard size={15} /> Flash Cards
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {progress && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-neutral-500 capitalize">{progress.status}</span>
              <span className="text-xs text-neutral-400">{progress.progress}/10</span>
            </div>
            <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
                style={{ width: `${(progress.progress / 10) * 100}%` }}
              />
            </div>
          </div>
        )}
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3 text-neutral-500">
              <Loader2 size={32} className="animate-spin text-purple-400" />
              <p className="text-sm">Loading topics...</p>
            </div>
          </div>
        ) : topics.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-4">
            <div className="p-6 rounded-2xl bg-neutral-900 border border-neutral-800">
              <AlertCircle size={40} className="mx-auto text-neutral-600 mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">No topics yet</h2>
              <p className="text-neutral-500 text-sm mb-6 max-w-sm">
                Process this document to extract topic hierarchy and generate the mind map.
              </p>
              {(!progress || progress.status === "failed") && (
                <button
                  onClick={handleStartProcessing}
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold transition-all hover:scale-105 disabled:opacity-50 mx-auto"
                >
                  <Play size={17} />
                  {isProcessing ? "Processing..." : "Process Document"}
                </button>
              )}
            </div>
          </div>
        ) : activeTab === "mindmap" ? (
          /* ── MIND MAP TAB ─────────────────────────────────────────────── */
          <div className="relative h-full">
            <MindMap
              topics={topics}
              searchQuery={searchQuery}
              onSelectTopic={setSelectedTopic}
              selectedId={selectedTopic?._id ?? null}
            />
            {selectedTopic && (
              <TopicPanel
                topic={selectedTopic}
                onClose={() => setSelectedTopic(null)}
                onChild={setSelectedTopic}
              />
            )}
          </div>
        ) : (
          /* ── FLASH CARDS TAB ──────────────────────────────────────────── */
          <div className="h-full overflow-hidden">
            <FlashCards topics={topics} />
          </div>
        )}
      </div>
    </div>
  );
}