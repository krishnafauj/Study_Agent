"use client";
import GoogleLoginButton from "@/components/auth/GoogleLoginButton";
import Image from "next/image";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  useEffect(() => {

    const token = localStorage.getItem("authToken");

    // ✅ if already logged in → redirect away
    if (token) {
      router.replace("/"); // change to your main page
    }

  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-6">

      {/* Main Auth Container */}
      <div className="flex w-full max-w-6xl rounded-3xl overflow-hidden shadow-2xl bg-white">

        {/* LEFT SIDE — Branding */}
        <div className="hidden md:flex w-1/2 relative bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-12 flex-col justify-between">

          <div>
            <Image
              src="/logo.png"
              alt="Logo"
              width={120}
              height={120}
            />
          </div>

          <div className="space-y-6">
            <h2 className="text-4xl font-semibold leading-tight">
              Welcome to Study Agent
            </h2>

            <p className="text-white/80">
              Smart learning powered by AI. Organize, study, and grow faster with your intelligent assistant.
            </p>
          </div>

          <p className="text-sm text-white/60">
            © 2026 Study Agent
          </p>

        </div>

        {/* RIGHT SIDE — Login */}
        <div className="flex w-full md:w-1/2 items-center justify-center p-10">

          <div className="w-full max-w-sm space-y-8">

            <div className="space-y-2 text-center">
              <h1 className="text-3xl text-black font-semibold tracking-tight">
                Sign in
              </h1>
              <p className="text-gray-500 text-sm">
                Continue with your Google account
              </p>
            </div>

            <div className="flex justify-center">
              <GoogleLoginButton />
            </div>

            <p className="text-xs text-gray-400 text-center">
              By continuing you agree to our Terms and Privacy Policy.
            </p>

          </div>

        </div>

      </div>

    </div>
  );
}
