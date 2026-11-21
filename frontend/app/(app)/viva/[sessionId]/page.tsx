"use client";

import { useParams } from "next/navigation";
import { LiveVivaScreen } from "@/src/viva";

export default function VivaPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  return <LiveVivaScreen sessionId={sessionId} />;
}
