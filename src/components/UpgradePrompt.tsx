import { useSubscriptionStore } from "../stores/subscriptionStore";
import { useAuthStore } from "../stores/authStore";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useNavigate } from "react-router-dom";
import "./UpgradePrompt.css";

interface UpgradePromptProps {
  onClose: () => void;
}

export function UpgradePrompt({ onClose }: UpgradePromptProps) {
  const { startCheckout, checkoutLoading, subscription } = useSubscriptionStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const navigate = useNavigate();

  const handleUpgrade = async () => {
    if (!isAuthenticated) {
      onClose();
      navigate("/login");
      return;
    }
    const url = await startCheckout();
    if (url) {
      await openUrl(url);
    }
  };

  return (
    <div className="upgrade-overlay" onClick={onClose}>
      <div className="upgrade-modal" onClick={(e) => e.stopPropagation()}>
        <span className="upgrade-badge">FlowVid+</span>
        <h2 className="upgrade-title">Upgrade to unlock all features</h2>
        <p className="upgrade-desc">
          {!isAuthenticated
            ? "Create an account to start your free trial and unlock all features."
            : <>Install addons, save to your library, sync across devices, and more.{subscription?.trialEligible === false
              ? " Subscribe now to get started."
              : " Try it free for 1 month — cancel anytime."}</>}
        </p>
        <div className="upgrade-features">
          <div className="upgrade-feature">Install addons</div>
          <div className="upgrade-feature">Save to your library</div>
          <div className="upgrade-feature">Cross-device sync</div>
          <div className="upgrade-feature">Multiple profiles</div>
          <div className="upgrade-feature">Priority support</div>
          <div className="upgrade-feature">Early access to new features</div>
        </div>
        <button
          className="btn btn-upgrade upgrade-cta"
          onClick={handleUpgrade}
          disabled={checkoutLoading}
        >
          {!isAuthenticated
            ? "Create Account to Upgrade"
            : checkoutLoading ? "Opening…" : "Upgrade to FlowVid+"}
        </button>
        <button className="upgrade-dismiss" onClick={onClose}>
          Maybe later
        </button>
      </div>
    </div>
  );
}
