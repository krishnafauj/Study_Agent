"use client";

import { useEffect } from "react";
import api from "@/lib/axios/axios";

export default function GoogleLoginButton() {

  useEffect(() => {

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    if (!clientId) {
      console.error("Google Client ID missing");
      return;
    }

    const interval = setInterval(() => {

      if (window.google) {

        window.google.accounts.id.initialize({
          client_id: clientId,

          callback: async (response: any) => {

            try {

              const googleToken = response.credential;

              console.log("Google ID Token:", googleToken);

              // ✅ Send to backend
              const res = await api.post("/api/auth", {
                token: googleToken,
              });

              const data = res.data;

              console.log("Backend response:", data);

              // ✅ STORE IMPORTANT DATA
              if (data.success) {

                localStorage.setItem("authToken", data.token);

                localStorage.setItem(
                  "user",
                  JSON.stringify(data.user)
                );

                localStorage.setItem(
                  "isNewUser",
                  String(data.isNewUser)
                );
              }

              // optional redirect
              // router.push("/dashboard");

            } catch (error) {
              console.error("Login error:", error);
            }
          },
        });

        window.google.accounts.id.renderButton(
          document.getElementById("googleBtn"),
          { theme: "outline", size: "large" }
        );

        clearInterval(interval);
      }

    }, 100);

  }, []);

  return <div id="googleBtn"></div>;
}
