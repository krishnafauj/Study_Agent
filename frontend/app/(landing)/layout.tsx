import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "StudyAgent — AI Study Assistant",
  description: "Your personalized AI tutor powered by your own documents.",
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
