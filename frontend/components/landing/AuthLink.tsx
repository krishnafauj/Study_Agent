"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface AuthLinkProps {
  className?: string;
  children: React.ReactNode;
  id?: string;
}

export default function AuthLink({ className, children, id }: AuthLinkProps) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  const handleClick = () => {
    if (!ready) return;
    const token = localStorage.getItem("authToken");
    const user = localStorage.getItem("user");
    if (token && user) {
      // Already logged in → go straight to the app
      router.push("/home");
    } else {
      router.push("/login");
    }
  };

  return (
    <button id={id} onClick={handleClick} className={className}>
      {children}
    </button>
  );
}
