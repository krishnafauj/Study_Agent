"use client";

import { useParams } from "next/navigation";
import { VivaResults } from "@/src/viva";

export default function VivaResultsPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  return <VivaResults assignmentId={assignmentId} />;
}
