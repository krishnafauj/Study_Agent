import Sidebar from "@/components/sidebar/Sidebar";
import QueryProvider from "@/provider/query";
import AuthProvider from "@/provider/AuthProvider";
import ReduxProvider from "@/provider/provider";
import { UIProvider } from "@/context/UiContext";

// Note: globals.css and Fonts are inherited from the Root Layout above

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryProvider>
      <AuthProvider>
        <ReduxProvider>
          <UIProvider>
            <div className="flex flex-col h-[100dvh] w-full overflow-hidden">
              <div className="flex flex-1 overflow-hidden relative">
                
                <Sidebar />

                <main className="flex-1 h-full overflow-hidden border-l border-zinc-200">
                  {children}
                </main>

              </div>
            </div>
          </UIProvider>
        </ReduxProvider>
      </AuthProvider>
    </QueryProvider>
  );
}