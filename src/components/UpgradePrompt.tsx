import { useSubscriptionStore } from "../stores/subscriptionStore";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./UpgradePrompt.css";

interface UpgradePromptProps {
  onClose: () => void;
}

export function UpgradePrompt({ onClose }: UpgradePromptProps) {
  const { startCheckout, checkoutLoading } = useSubscriptionStore();

  const handleUpgrade = async () => {
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
          Install addons, save to your library, sync across devices, and more. Try it free for 1 month — cancel anytime.
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
          {checkoutLoading ? "Opening…" : "Upgrade to FlowVid+"}
        </button>
        <button className="upgrade-dismiss" onClick={onClose}>
          Maybe later
        </button>
      </div>
    </div>
  );
}
