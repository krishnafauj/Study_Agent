export {};

declare global {
  interface CredentialResponse {
    credential?: string;
  }
  interface Window {
    google: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: CredentialResponse) => void }) => void;
          renderButton: (element: HTMLElement | null, config: { theme: string; size: string }) => void;
        };
      };
    };
  }
}
declare module "*.css";
