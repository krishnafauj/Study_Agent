'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 1. Retrieve data from localStorage
    const token = localStorage.getItem('authToken');
    const user = localStorage.getItem('user');

    // 2. Define Authentication State
    const isAuthenticated = !!(token && user);

    // 3. Define Route Logic
    const isLoginPage = pathname === '/login';

    if (isLoading) {
        // Optional: Add artificial delay or logic here if needed
    }

    // LOGIC:
    // If Authenticated AND on /login -> Kick to Dashboard/Home
    if (isAuthenticated && isLoginPage) {
      router.push('/'); // or '/dashboard'
    } 
    // If NOT Authenticated AND on a protected route (anything not /login) -> Kick to /login
    else if (!isAuthenticated && !isLoginPage) {
      router.push('/login');
    }

    // Finish loading after checks
    setIsLoading(false);
    
  }, [router, pathname]);

  // Prevent "Flash of Unauthenticated Content" (FOUC)
  // While checking auth status, render nothing or a loading spinner
  if (isLoading) {
    return null; // Or <LoadingSpinner />
  }

  return <>{children}</>;
}