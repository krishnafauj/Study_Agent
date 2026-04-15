import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import AuthLink from "@/components/landing/AuthLink";

export const metadata: Metadata = {
  title: "StudyAgent — AI Study Assistant Powered by Your Documents",
  description:
    "Upload your PDFs and let AI become your personalized tutor. StudyAgent extracts topics, tracks your performance, and chats with you exclusively about your study material.",
  keywords: [
    "AI study assistant",
    "PDF AI chat",
    "personalized learning",
    "topic extraction",
    "study performance tracker",
    "NCERT AI",
    "exam preparation AI",
  ],
  openGraph: {
    title: "StudyAgent — AI Tutor from Your Own Notes",
    description:
      "Upload PDFs → Extract topics → Chat with AI about exactly what you've studied. Track weak areas. Ace your exams.",
    type: "website",
    url: "https://study-agent-iota.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "StudyAgent — AI Tutor from Your Own Notes",
    description:
      "Upload PDFs → Extract topics → Chat with AI about exactly what you've studied.",
  },
};

// ─── Apple Browser Frame ───────────────────────────────────────────────────
function BrowserFrame({
  children,
  url = "study-agent.app",
  className = "",
}: {
  children: React.ReactNode;
  url?: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-[#1c1c1e] ${className}`}
      style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)" }}
    >
      {/* Title bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#2c2c2e] border-b border-white/5">
        {/* Traffic lights */}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57] shadow-[0_0_6px_rgba(255,95,87,0.5)]" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e] shadow-[0_0_6px_rgba(254,188,46,0.5)]" />
          <div className="w-3 h-3 rounded-full bg-[#28c840] shadow-[0_0_6px_rgba(40,200,64,0.5)]" />
        </div>
        {/* URL bar */}
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-[#3a3a3c] rounded-md px-4 py-1 text-xs text-neutral-400 font-mono max-w-[280px] w-full text-center truncate">
            🔒 {url}
          </div>
        </div>
        <div className="w-16" />
      </div>
      {/* Content */}
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

const FEATURES = [
  {
    icon: "📄",
    title: "Upload Any PDF",
    desc: "NCERT, textbooks, notes, research papers — StudyAgent processes them all and extracts a full topic hierarchy.",
  },
  {
    icon: "🧠",
    title: "AI Tutor, Scoped to YOUR Material",
    desc: "Unlike generic chatbots, the AI only discusses topics from your uploaded documents. No hallucinations about off-topic content.",
  },
  {
    icon: "📊",
    title: "Performance Tracking",
    desc: "Get a per-topic performance score. The AI automatically identifies your weak areas and proactively suggests what to study next.",
  },
  {
    icon: "⚡",
    title: "Instant RAG Answers",
    desc: "Every answer is grounded in your actual documents via Retrieval-Augmented Generation — not generic web knowledge.",
  },
  {
    icon: "🗂️",
    title: "Organized by File & Folder",
    desc: "Each PDF has its own chat history, topic explorer, and performance dashboard. Stay organized across all your subjects.",
  },
  {
    icon: "💬",
    title: "Streaming Chat Interface",
    desc: "Real-time streaming responses with conversation memory, so the AI remembers the context of your entire study session.",
  },
];

const SCREENSHOTS = [
  { src: "/ss5.png", label: "Home", url: "studyagent.app" },
  { src: "/ss1.png", label: "AI Chat", url: "studyagent.app/chat" },
  { src: "/ss2.png", label: "Topic Explorer", url: "studyagent.app/topics" },
  { src: "/ss3.png", label: "File Upload", url: "studyagent.app/files" },
  { src: "/ss4.png", label: "Performance", url: "studyagent.app/performance" },
];

export default function LandingPage() {
  return (
    <div
      className="min-h-screen bg-[#030303] text-white overflow-x-hidden"
      style={{ fontFamily: "'SF Pro Display', 'Inter', -apple-system, sans-serif" }}
    >
      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b border-white/5 backdrop-blur-xl bg-black/40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-sm font-bold">
            S
          </div>
          <span className="font-semibold text-white tracking-tight">StudyAgent</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-neutral-400">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#screenshots" className="hover:text-white transition-colors">Screenshots</a>
          <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
        </div>
        <div className="flex items-center gap-3">
          <AuthLink className="text-sm text-neutral-300 hover:text-white transition-colors px-4 py-2">
            Sign in
          </AuthLink>
          <AuthLink className="text-sm font-semibold px-5 py-2 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 transition-all hover:scale-105 shadow-lg shadow-purple-500/20">
            Get Started →
          </AuthLink>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-40 pb-24 px-6 text-center overflow-hidden">
        {/* Glow blobs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-32 left-1/4 w-[300px] h-[300px] bg-pink-600/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute top-24 right-1/4 w-[300px] h-[300px] bg-blue-600/10 rounded-full blur-[80px] pointer-events-none" />

        <div className="relative z-10 max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-sm font-medium mb-8">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            Powered by LLaMA 3 · RAG · MCP
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-tight">
            Your AI Tutor That{" "}
            <span
              className="text-transparent bg-clip-text"
              style={{ backgroundImage: "linear-gradient(135deg, #a855f7, #ec4899, #f97316)" }}
            >
              Knows Your Notes
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-neutral-400 max-w-3xl mx-auto mb-10 leading-relaxed">
            Upload your PDFs. Let AI extract every topic, track your performance,
            and answer questions{" "}
            <em className="text-neutral-200 not-italic font-medium">exclusively</em>{" "}
            from your study material — not the entire internet.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <AuthLink
              id="cta-primary"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-lg font-semibold bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 hover:from-purple-500 hover:via-pink-500 hover:to-orange-400 transition-all hover:scale-105 shadow-2xl shadow-purple-500/30"
            >
              Start Studying Free
              <span className="text-xl">→</span>
            </AuthLink>
            <a
              href="#screenshots"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-lg font-semibold border border-white/10 hover:bg-white/5 transition-all"
            >
              See it in action
            </a>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap items-center justify-center gap-12 text-center">
            {[
              { val: "100%", label: "Topic-scoped AI" },
              { val: "RAG", label: "Grounded answers" },
              { val: "∞", label: "PDFs supported" },
              { val: "0", label: "Hallucinations" },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                  {stat.val}
                </div>
                <div className="text-sm text-neutral-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Hero Screenshot (main, large) ─────────────────────────────────── */}
      <section className="px-6 pb-24 flex justify-center">
        <div className="w-full max-w-5xl">
          <BrowserFrame url="studyagent.app/chat/physics" className="hover:scale-[1.01] transition-transform duration-500">
            <Image
              src="/ss1.png"
              alt="StudyAgent AI Chat Interface showing Physics conversation"
              width={1200}
              height={800}
              className="w-full object-cover"
              priority
            />
          </BrowserFrame>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section id="features" className="px-6 py-24 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
            Everything you need to{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
              study smarter
            </span>
          </h2>
          <p className="text-neutral-400 text-lg max-w-2xl mx-auto">
            Not another generic chatbot. StudyAgent is built around your documents, your performance, and your goals.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-purple-500/30 transition-all duration-300"
            >
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="text-lg font-semibold mb-2 text-white">{f.title}</h3>
              <p className="text-neutral-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Screenshots (Apple browser frames grid) ──────────────────────── */}
      <section id="screenshots" className="py-24 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto mb-16 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
            Built for students.{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-orange-400">
              Designed to be beautiful.
            </span>
          </h2>
          <p className="text-neutral-400 text-lg">A clean, dark interface that gets out of your way.</p>
        </div>

        {/* Large center + two flanking */}
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
          {/* Left — slightly tilted */}
          <BrowserFrame url={SCREENSHOTS[2].url} className="-rotate-1 hover:rotate-0 transition-all duration-500 md:mt-8">
            <Image
              src={SCREENSHOTS[2].src}
              alt={SCREENSHOTS[2].label}
              width={800}
              height={600}
              className="w-full object-cover"
            />
          </BrowserFrame>

          {/* Center — hero */}
          <BrowserFrame url={SCREENSHOTS[0].url} className="z-10 hover:scale-105 transition-all duration-500 shadow-[0_40px_100px_rgba(168,85,247,0.3)]">
            <Image
              src={SCREENSHOTS[0].src}
              alt={SCREENSHOTS[0].label}
              width={800}
              height={600}
              className="w-full object-cover"
            />
          </BrowserFrame>

          {/* Right — slightly tilted */}
          <BrowserFrame url={SCREENSHOTS[3].url} className="rotate-1 hover:rotate-0 transition-all duration-500 md:mt-8">
            <Image
              src={SCREENSHOTS[3].src}
              alt={SCREENSHOTS[3].label}
              width={800}
              height={600}
              className="w-full object-cover"
            />
          </BrowserFrame>
        </div>

        {/* Bottom two */}
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-5">
          <BrowserFrame url={SCREENSHOTS[1].url} className="hover:scale-[1.02] transition-all duration-500">
            <Image
              src={SCREENSHOTS[1].src}
              alt={SCREENSHOTS[1].label}
              width={800}
              height={600}
              className="w-full object-cover"
            />
          </BrowserFrame>
          <BrowserFrame url={SCREENSHOTS[4].url} className="hover:scale-[1.02] transition-all duration-500">
            <Image
              src={SCREENSHOTS[4].src}
              alt={SCREENSHOTS[4].label}
              width={800}
              height={600}
              className="w-full object-cover"
            />
          </BrowserFrame>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 px-6 max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
            From PDF to{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
              personalized AI tutor
            </span>{" "}
            in minutes
          </h2>
        </div>

        <div className="relative">
          {/* Connector line */}
          <div className="absolute left-8 top-8 bottom-8 w-px bg-gradient-to-b from-purple-500 via-pink-500 to-orange-500 hidden md:block" />

          <div className="flex flex-col gap-10">
            {[
              {
                step: "01",
                color: "from-purple-500 to-purple-700",
                title: "Upload Your PDFs",
                desc: "Drag and drop any study material — NCERT books, lecture notes, textbooks. Multiple files, multiple subjects.",
                tag: "Supports any PDF",
              },
              {
                step: "02",
                color: "from-pink-500 to-pink-700",
                title: "AI Extracts Topics",
                desc: "Our pipeline reads your document, builds a hierarchical topic tree (chapter → subtopic → detail), and creates semantic embeddings for RAG.",
                tag: "Automatic processing",
              },
              {
                step: "03",
                color: "from-orange-500 to-orange-700",
                title: "Chat With Your Material",
                desc: "Open a chat tied to that file. The AI sees your topics, your performance scores, and relevant content. It will ONLY answer about what's in your document.",
                tag: "Topic-scoped AI",
              },
              {
                step: "04",
                color: "from-blue-500 to-blue-700",
                title: "Track Performance & Improve",
                desc: "As you study, log your marks. The AI identifies weak topics and proactively suggests what to revise next to maximize your exam score.",
                tag: "Smart suggestions",
              },
            ].map((item) => (
              <div key={item.step} className="md:ml-20 flex gap-6 items-start group">
                <div
                  className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center text-lg font-bold shrink-0 shadow-lg group-hover:scale-110 transition-transform`}
                >
                  {item.step}
                </div>
                <div className="flex-1 pt-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-semibold">{item.title}</h3>
                    <span className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-neutral-400">
                      {item.tag}
                    </span>
                  </div>
                  <p className="text-neutral-400 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto relative">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 via-pink-600/20 to-orange-600/20 rounded-3xl blur-xl" />
          <div className="relative rounded-3xl border border-white/10 bg-white/[0.03] p-12 md:p-16 text-center">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">
              Stop chatting with ChatGPT.
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400">
                Start studying with your AI.
              </span>
            </h2>
            <p className="text-neutral-400 text-lg mb-10 max-w-2xl mx-auto">
              The AI that knows exactly what's in your syllabus, tracks your weak spots,
              and helps you prepare smarter — not harder.
            </p>
            <AuthLink
              id="cta-bottom"
              className="inline-flex items-center gap-3 px-10 py-5 rounded-full text-xl font-semibold bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 hover:from-purple-500 hover:via-pink-500 hover:to-orange-400 transition-all hover:scale-105 shadow-2xl shadow-purple-500/30"
            >
              Start for Free
              <span>→</span>
            </AuthLink>
            <p className="mt-4 text-sm text-neutral-600">No credit card required · Google sign-in</p>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-neutral-500 text-sm">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xs font-bold text-white">
              S
            </div>
            StudyAgent — Your AI Study Companion
          </div>
          <div className="flex items-center gap-6 text-sm text-neutral-600">
            <a href="#features" className="hover:text-neutral-400 transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-neutral-400 transition-colors">How it works</a>
          <AuthLink className="hover:text-neutral-400 transition-colors">Sign in</AuthLink>
          </div>
          <div className="text-sm text-neutral-700">
            Built with ❤️ by Krishna Faujdar
          </div>
        </div>
      </footer>
    </div>
  );
}
