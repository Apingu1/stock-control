import { useEffect, useState } from "react";
import { activatePwaUpdate, PWA_UPDATE_AVAILABLE_EVENT } from "../../pwa";

export default function PwaUpdatePrompt() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const showUpdatePrompt = () => setUpdateAvailable(true);
    window.addEventListener(PWA_UPDATE_AVAILABLE_EVENT, showUpdatePrompt);

    return () => {
      window.removeEventListener(PWA_UPDATE_AVAILABLE_EVENT, showUpdatePrompt);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <aside className="pwa-update-prompt" role="status" aria-live="polite">
      <div>
        <strong>Stock Control update available</strong>
        <span>Please save any work before updating.</span>
      </div>
      <button type="button" onClick={activatePwaUpdate}>
        Update now
      </button>
      <button
        type="button"
        className="pwa-update-prompt__dismiss"
        aria-label="Dismiss update notification"
        onClick={() => setUpdateAvailable(false)}
      >
        ×
      </button>
    </aside>
  );
}
