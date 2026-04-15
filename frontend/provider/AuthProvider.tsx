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
    const isLandingPage = pathname === '/';

    // LOGIC:
    // If Authenticated AND on /login → go to /home
    if (isAuthenticated && isLoginPage) {
      router.push('/home');
    }
    // If NOT Authenticated AND on a protected route (not /login, not /) → go to /login
    else if (!isAuthenticated && !isLoginPage && !isLandingPage) {
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