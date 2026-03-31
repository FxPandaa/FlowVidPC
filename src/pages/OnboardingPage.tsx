import { useNavigate } from "react-router-dom";
import { useAddonStore } from "../stores/addonStore";
import "./OnboardingPage.css";

export function OnboardingPage() {
  const navigate = useNavigate();
  const addonCount = useAddonStore((s) => s.addons.length);

  return (
    <div className="onboarding-page">
      <div className="onboarding-card">
        <div className="onboarding-icon">
          <img src="/FlowVidLogo.png" alt="FlowVid" width={48} height={48} />
        </div>

        <h1 className="onboarding-title">Welcome to FlowVid</h1>
        <p className="onboarding-lead">FlowVid is a neutral media player — it doesn't bundle any content sources.</p>

        <div className="onboarding-steps">
          <div className="onboarding-step">
            <div className="step-num">1</div>
            <div className="step-body">
              <strong>Find an addon</strong>
              <p>Get a manifest URL from any Stremio-compatible addon provider of your choice.</p>
            </div>
          </div>
          <div className="onboarding-step">
            <div className="step-num">2</div>
            <div className="step-body">
              <strong>Paste the URL</strong>
              <p>Go to the Addons page and paste the manifest URL. FlowVid fetches the addon info automatically.</p>
            </div>
          </div>
          <div className="onboarding-step">
            <div className="step-num">3</div>
            <div className="step-body">
              <strong>Use your addons</strong>
              <p>Open media and FlowVid will query your installed addons for available sources.</p>
            </div>
          </div>
        </div>

        <div className="onboarding-actions">
          <button className="onboarding-primary-btn" onClick={() => navigate("/addons")}>
            {addonCount > 0 ? "Manage Addons" : "Install My First Addon"}
          </button>
          <button className="onboarding-secondary-btn" onClick={() => navigate("/")}>
            Skip for now
          </button>
        </div>

        <p className="onboarding-note">
          FlowVid supports the Stremio addon protocol. Addons are third-party and managed by you.
        </p>
      </div>
    </div>
  );
}
