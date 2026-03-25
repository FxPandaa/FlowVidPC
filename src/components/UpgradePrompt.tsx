import { useSubscriptionStore } from "../stores/subscriptionStore";
import { useAuthStore } from "../stores/authStore";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useLocation, useNavigate } from "react-router-dom";
import "./UpgradePrompt.css";

type UpgradeContext = "general" | "watchparty" | "addon" | "library" | "sync";

interface UpgradePromptProps {
  onClose: () => void;
  context?: UpgradeContext;
}

const contextConfig: Record<UpgradeContext, { heading: string; subtext: string; icon: string }> = {
  general: {
    heading: "Unlock the full FlowVid experience",
    subtext: "Get the most out of FlowVid with all premium features.",
    icon: "✨",
  },
  watchparty: {
    heading: "Watch Party is a FlowVid+ feature",
    subtext: "Create and join watch parties to enjoy movies and shows together with friends in perfect sync.",
    icon: "🎬",
  },
  addon: {
    heading: "Addons require FlowVid+",
    subtext: "Install addons to unlock streaming sources and start watching your favorite content.",
    icon: "🧩",
  },
  library: {
    heading: "Save to your library with FlowVid+",
    subtext: "Keep track of everything you watch and build your personal collection.",
    icon: "📚",
  },
  sync: {
    heading: "Sync across devices with FlowVid+",
    subtext: "Pick up where you left off on any device with cloud sync.",
    icon: "🔄",
  },
};

export function UpgradePrompt({ onClose, context = "general" }: UpgradePromptProps) {
  const { startCheckout, checkoutLoading, subscription } = useSubscriptionStore();
  const hasSession = useAuthStore((s) => Boolean(s.token));
  const location = useLocation();
  const navigate = useNavigate();
  const config = contextConfig[context];

  const handleUpgrade = async () => {
    if (!hasSession) {
      navigate("/login", { replace: true, state: { from: location.pathname } });
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
        <div className="upgrade-header-icon">{config.icon}</div>
        <span className="upgrade-badge">FlowVid+</span>
        <h2 className="upgrade-title">{config.heading}</h2>
        <p className="upgrade-desc">
          {!hasSession
            ? "Create an account to start your free trial and unlock all features."
            : <>{config.subtext}{subscription?.trialEligible === false
              ? ""
              : " Try it free for 1 month — cancel anytime."}</>}
        </p>
        <div className="upgrade-features">
          <div className="upgrade-feature">Install addons & sources</div>
          <div className="upgrade-feature">Watch parties with friends</div>
          <div className="upgrade-feature">Cross-device sync</div>
          <div className="upgrade-feature">Multiple profiles</div>
          <div className="upgrade-feature">Save to library</div>
          <div className="upgrade-feature">Priority support</div>
        </div>
        <button
          className="btn btn-upgrade upgrade-cta"
          onClick={handleUpgrade}
          disabled={checkoutLoading}
        >
          {!hasSession
            ? "Create Account"
            : checkoutLoading
              ? "Opening…"
              : subscription?.trialEligible !== false
                ? "Start Free Trial"
                : "Upgrade to FlowVid+"}
        </button>
        <button className="upgrade-dismiss" onClick={onClose}>
          Maybe later
        </button>
      </div>
    </div>
  );
}
