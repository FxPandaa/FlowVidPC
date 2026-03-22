import { useState, FormEvent } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuthStore } from "../stores";
import "./LoginPage.css";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, verifyEmail, resendVerification, isLoading, error, clearError, user } = useAuthStore();
  const returnTo = (location.state as { from?: string } | null)?.from ?? "/";

  const [isSignUp, setIsSignUp] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (isSignUp) {
      if (password !== confirmPassword) {
        setLocalError("Passwords do not match");
        return;
      }
      if (password.length < 8) {
        setLocalError("Password must be at least 8 characters");
        return;
      }

      try {
        await register(email, username, password);
        setShowVerification(true);
      } catch (err) {
        // Error is handled by the store
      }
    } else {
      try {
        await login(email, password);
        const currentUser = useAuthStore.getState().user;
        if (currentUser && !currentUser.emailVerified) {
          setShowVerification(true);
        } else {
          navigate(returnTo, { replace: true });
        }
      } catch (err) {
        // Error is handled by the store
      }
    }
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    try {
      await verifyEmail(verificationCode);
      navigate(returnTo, { replace: true });
    } catch (err) {
      // Error is handled by the store
    }
  };

  const handleResend = async () => {
    if (resendCooldown) return;
    setLocalError(null);
    clearError();

    try {
      await resendVerification();
      setResendCooldown(true);
      setTimeout(() => setResendCooldown(false), 60000);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to resend code");
    }
  };

  const handleSkipVerification = () => {
    navigate(returnTo, { replace: true });
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setShowVerification(false);
    setLocalError(null);
    clearError();
  };

  return (
    <div className="login-page">
      <div className="login-background"></div>

      <div className="login-container">
        <Link to="/" className="login-logo">
          <svg
            className="login-logo-mark"
            width="32"
            height="32"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <polygon points="4,2 28,16 4,30" fill="url(#login-logo-grad)" />
            <defs>
              <linearGradient id="login-logo-grad" x1="0" y1="0" x2="32" y2="32">
                <stop offset="0%" stopColor="#00e5ff" />
                <stop offset="100%" stopColor="#0066ff" />
              </linearGradient>
            </defs>
          </svg>
          <span className="logo-text"><span className="logo-text-flow">Flow</span>Vid</span>
        </Link>

        <div className="login-form-container">
          {showVerification ? (
            <>
              <h1>Verify Your Email</h1>
              <p className="verification-subtitle">
                We sent a 6-digit code to <strong>{user?.email || email}</strong>
              </p>

              <form className="login-form" onSubmit={handleVerify}>
                <div className="form-group">
                  <input
                    type="text"
                    className="input verification-code-input"
                    placeholder="Enter 6-digit code"
                    value={verificationCode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                      setVerificationCode(val);
                    }}
                    required
                    maxLength={6}
                    autoFocus
                  />
                </div>

                {(error || localError) && (
                  <div className="form-error">{localError || error}</div>
                )}

                <button
                  type="submit"
                  className="btn btn-primary login-submit-btn"
                  disabled={isLoading || verificationCode.length !== 6}
                >
                  {isLoading ? "Verifying..." : "Verify Email"}
                </button>
              </form>

              <p className="login-toggle">
                Didn't get the code?{" "}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown}
                >
                  {resendCooldown ? "Code sent — wait 60s" : "Resend code"}
                </button>
              </p>

              <button
                type="button"
                className="btn btn-ghost continue-btn"
                onClick={handleSkipVerification}
              >
                Skip for now
              </button>

              <p className="login-note">
                You'll need to verify your email before subscribing to FlowVid Plus.
              </p>
            </>
          ) : (
            <>
          <h1>{isSignUp ? "Create Account" : "Sign In"}</h1>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <input
                type="email"
                className="input"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {isSignUp && (
              <div className="form-group">
                <input
                  type="text"
                  className="input"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={2}
                  maxLength={32}
                />
              </div>
            )}

            <div className="form-group">
              <input
                type="password"
                className="input"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {isSignUp && (
              <div className="form-group">
                <input
                  type="password"
                  className="input"
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            )}

            {(error || localError) && (
              <div className="form-error">{localError || error}</div>
            )}

            <button
              type="submit"
              className="btn btn-primary login-submit-btn"
              disabled={isLoading}
            >
              {isLoading
                ? "Please wait..."
                : isSignUp
                  ? "Create Account"
                  : "Sign In"}
            </button>
          </form>

          <p className="login-toggle">
            {isSignUp ? (
              <>
                Already have an account?{" "}
                <button type="button" onClick={toggleMode}>
                  Sign in
                </button>
              </>
            ) : (
              <>
                Don't have an account?{" "}
                <button type="button" onClick={toggleMode}>
                  Sign up
                </button>
              </>
            )}
          </p>

          <div className="login-divider">
            <span>or</span>
          </div>

          <Link to="/" className="btn btn-ghost continue-btn">
            Continue without account
          </Link>

          <p className="login-note">
            An account lets you sync your library and watch history across
            devices.
          </p>
        </>
          )}
        </div>
      </div>
    </div>
  );
}
