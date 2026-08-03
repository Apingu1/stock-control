export const PWA_UPDATE_AVAILABLE_EVENT = "stock-control:pwa-update-available";

let waitingWorker: ServiceWorker | null = null;
let refreshInProgress = false;

function announceUpdate(worker: ServiceWorker): void {
  waitingWorker = worker;
  window.dispatchEvent(new CustomEvent(PWA_UPDATE_AVAILABLE_EVENT));
}

export function registerPwa(): void {
  if (!("serviceWorker" in navigator)) return;

  // Avoid service-worker caching surprises during normal Vite development.
  // Production preview/builds remain fully testable as an installable PWA.
  if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_PWA_DEV !== "true") return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          announceUpdate(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener("statechange", () => {
            if (
              installingWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              announceUpdate(registration.waiting ?? installingWorker);
            }
          });
        });
      })
      .catch((error: unknown) => {
        console.error("Stock Control PWA registration failed", error);
      });
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshInProgress) return;
    refreshInProgress = true;
    window.location.reload();
  });
}

export function activatePwaUpdate(): void {
  waitingWorker?.postMessage({ type: "SKIP_WAITING" });
}
