export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[100dvh] w-full overflow-hidden items-center justify-center">
      {/* I added items-center justify-center assuming you want 
         login/signup forms centered. Remove if not needed. 
      */}
      <main className="w-full">
        {children}
      </main>
    </div>
  );
}