import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuthStore } from "../stores/authStore";
import { useProfileStore, STOCK_AVATARS } from "../stores/profileStore";
import { Settings } from "./Icons";
import "./Layout.css";

/**
 * Freezes the outlet element at mount time so AnimatePresence
 * can keep showing the OLD page content during the exit animation
 * even after the route has already changed.
 */
function FrozenOutlet() {
  const outlet = Outlet({});
  const [frozen] = useState(outlet);
  return frozen;
}

export function Layout() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const avatarPickerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuthStore();
  const activeProfile = useProfileStore(
    (s) => s.profiles.find((p) => p.id === s.activeProfileId) || null,
  );

  // Close avatar picker on outside click
  useEffect(() => {
    if (!showAvatarPicker) return;
    const handler = (e: MouseEvent) => {
      if (avatarPickerRef.current && !avatarPickerRef.current.contains(e.target as Node)) {
        setShowAvatarPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAvatarPicker]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const isPlayer = location.pathname.startsWith("/player");

  return (
    <div className={`layout${isPlayer ? " layout--player" : ""}`}>
      <header className={`header${isPlayer ? " header--hidden" : ""}`}>
        <nav className="nav">
          <NavLink to="/" className="logo">
            <svg
              className="logo-mark"
              width="28"
              height="28"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <polygon points="4,2 28,16 4,30" fill="url(#logo-grad)" />
              <defs>
                <linearGradient id="logo-grad" x1="0" y1="0" x2="32" y2="32">
                  <stop offset="0%" stopColor="#00e5ff" />
                  <stop offset="100%" stopColor="#0066ff" />
                </linearGradient>
              </defs>
            </svg>
            <span className="logo-text"><span className="logo-text-flow">Flow</span>Vid</span>
          </NavLink>

          <div className="nav-links">
            <NavLink
              to="/"
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              Home
            </NavLink>
            <NavLink
              to="/discover"
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              Discover
            </NavLink>
            <NavLink
              to="/library"
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              Library
            </NavLink>
            <NavLink
              to="/calendar"
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              Calendar
            </NavLink>
          </div>

          <form className="search-form" onSubmit={handleSearch}>
            <input
              type="text"
              className="search-input"
              placeholder="Search movies & TV shows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </form>

          <div className="nav-right">
            <NavLink to="/settings" className="settings-btn">
              <Settings size={18} />
            </NavLink>

            {isAuthenticated ? (
              <div className="user-avatar-area" ref={avatarPickerRef}>
                <button
                  className="user-avatar-btn"
                  onClick={() => setShowAvatarPicker((v) => !v)}
                  title={activeProfile?.name || user?.username || "Account"}
                >
                  {activeProfile?.avatarImage ? (
                    <img
                      className="user-avatar-img"
                      src={STOCK_AVATARS.find((a) => a.id === activeProfile.avatarImage)?.url || activeProfile.avatarImage}
                      alt=""
                    />
                  ) : activeProfile ? (
                    <span
                      className="user-avatar-emoji"
                      style={{ background: activeProfile.avatarColor }}
                    >
                      {activeProfile.avatarIcon}
                    </span>
                  ) : (
                    <span className="user-avatar-emoji user-avatar-default">
                      {(user?.username || user?.email || "?")[0].toUpperCase()}
                    </span>
                  )}
                </button>

                {showAvatarPicker && (
                  <div className="avatar-picker-dropdown">
                    <div className="avatar-picker-header">
                      <span className="avatar-picker-label">
                        {activeProfile?.name || user?.username || "Account"}
                      </span>
                    </div>
                    <div className="avatar-picker-actions">
                      <button
                        className="avatar-picker-action"
                        onClick={() => { setShowAvatarPicker(false); navigate("/profiles"); }}
                      >
                        Switch Profile
                      </button>
                      <button
                        className="avatar-picker-action"
                        onClick={() => { setShowAvatarPicker(false); navigate("/settings"); }}
                      >
                        Settings
                      </button>
                      <button
                        className="avatar-picker-action avatar-picker-logout"
                        onClick={() => { setShowAvatarPicker(false); handleLogout(); }}
                      >
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <NavLink to="/login" className="header-login-btn">
                Sign In
              </NavLink>
            )}
          </div>
        </nav>
      </header>

      <main className="main-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            className="route-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeInOut" }}
          >
            <FrozenOutlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
