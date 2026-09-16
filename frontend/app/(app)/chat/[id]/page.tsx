"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Loader2, Bot, ChevronUp } from "lucide-react";
import { useChat } from "@/src/chat/[id]/hooks";
import {
  ScrollbarStyle, ScoreToastCard, ChatHeader, MessageBubble, StreamingBubble, ChatInput,
} from "@/src/chat/[id]/components";

export default function ChatPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;

  const {
    section,
    messages,
    input,
    setInput,
    isLoading,
    isStreaming,
    streamingText,
    hasMore,
    isLoadingHistory,
    handleLoadMore,
    chatTitle,
    isRenamingTitle,
    setIsRenamingTitle,
    renameValue,
    setRenameValue,
    titleInputRef,
    startTitleRename,
    submitTitleRename,
    copiedIndex,
    editingIndex,
    setEditingIndex,
    editValue,
    setEditValue,
    startEdit,
    submitEdit,
    handleCopy,
    handleSend,
    handleShare,
    scoreToast,
    setScoreToast,
    messagesEndRef,
    messagesTopRef,
  } = useChat(id, {
    fileId: searchParams?.get("fileId") || null,
    folderId: searchParams?.get("folderId") || null,
    fileName: searchParams?.get("fileName") ? decodeURIComponent(searchParams.get("fileName")!) : null,
    sectionId: searchParams?.get("sectionId") || null,
    sectionTitle: searchParams?.get("sectionTitle") ? decodeURIComponent(searchParams.get("sectionTitle")!) : null,
    pageStart: searchParams?.get("pageStart") || null,
    pageEnd: searchParams?.get("pageEnd") || null,
  });

  const busy = isLoading || isStreaming;

  return (
    <div className="h-[100dvh] bg-neutral-950 p-2 md:p-4 font-sans flex flex-col w-full">
      {scoreToast && <ScoreToastCard toast={scoreToast} onClose={() => setScoreToast(null)} />}
      <ScrollbarStyle />

      <div className="flex-1 w-full bg-neutral-900 border border-neutral-800 rounded-2xl flex flex-col overflow-hidden">
        <ChatHeader
          id={id}
          chatTitle={chatTitle}
          section={section}
          isRenamingTitle={isRenamingTitle}
          setIsRenamingTitle={setIsRenamingTitle}
          renameValue={renameValue}
          setRenameValue={setRenameValue}
          titleInputRef={titleInputRef}
          onSubmitRename={submitTitleRename}
          onStartRename={startTitleRename}
          onShare={handleShare}
        />

        <main className="flex-1 overflow-y-auto w-full p-4 md:p-6 custom-scrollbar scroll-smooth">
          <div className="max-w-5xl mx-auto w-full space-y-6">
            {hasMore && !isLoadingHistory && (
              <div className="flex justify-center">
                <button
                  onClick={handleLoadMore}
                  className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition-colors text-sm"
                >
                  <ChevronUp size={15} /> Load earlier messages
                </button>
              </div>
            )}

            {isLoadingHistory && (
              <div className="flex justify-center py-4">
                <Loader2 size={20} className="animate-spin text-purple-500 opacity-60" />
              </div>
            )}

            <div ref={messagesTopRef} />

            {messages.length === 0 && !busy && !isLoadingHistory && (
              <div className="mt-32 flex flex-col items-center justify-center text-neutral-500 space-y-4">
                <Bot size={48} className="opacity-20" />
                <p>Start a conversation...</p>
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                msg={msg}
                index={i}
                isLoading={isLoading}
                editingIndex={editingIndex}
                editValue={editValue}
                setEditValue={setEditValue}
                onStartEdit={startEdit}
                onSubmitEdit={submitEdit}
                onCancelEdit={() => setEditingIndex(null)}
                copiedIndex={copiedIndex}
                onCopy={handleCopy}
                onResend={handleSend}
              />
            ))}

            {isStreaming && <StreamingBubble streamingText={streamingText} />}

            <div ref={messagesEndRef} className="h-1" />
          </div>
        </main>

        <ChatInput
          input={input}
          setInput={setInput}
          disabled={busy || isLoadingHistory}
          isLoadingHistory={isLoadingHistory}
          isBusy={busy}
          onSend={() => handleSend(input)}
        />
      </div>
    </div>
  );
}
