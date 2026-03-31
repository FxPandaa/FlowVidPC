import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useAuthStore } from "../stores/authStore";
import { useProfileStore, STOCK_AVATARS } from "../stores/profileStore";
import { useWatchPartyStore } from "../stores/watchPartyStore";
import { Settings, Users } from "./Icons";
import { FriendsActivityPanel } from "./FriendsActivityPanel";
import "./Layout.css";

export function Layout() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showFriendsPanel, setShowFriendsPanel] = useState(false);
  const avatarPickerRef = useRef<HTMLDivElement>(null);
  const friendsPanelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const navLinksRef = useRef<HTMLDivElement>(null);
  const [indicatorX, setIndicatorX] = useState<number | null>(null);
  const { isAuthenticated, user, logout } = useAuthStore();
  const activeProfile = useProfileStore(
    (s) => s.profiles.find((p) => p.id === s.activeProfileId) || null,
  );
  const friendRequestCount = useWatchPartyStore((s) => s.friendRequests.length);
  const partyInviteCount = useWatchPartyStore((s) => s.partyInvites.length);
  const notificationCount = friendRequestCount + partyInviteCount;

  const NAV_ITEMS = [
    { to: "/", label: "Home", match: (p: string) => p === "/" },
    { to: "/discover", label: "Discover", match: (p: string) => p.startsWith("/discover") },
    { to: "/library", label: "Library", match: (p: string) => p.startsWith("/library") },
    { to: "/calendar", label: "Calendar", match: (p: string) => p.startsWith("/calendar") },
  ];

  // Measure active tab and update indicator position
  const updateIndicator = useCallback(() => {
    const container = navLinksRef.current;
    if (!container) return;
    const activeEl = container.querySelector(".nav-link.active") as HTMLElement;
    if (!activeEl) { setIndicatorX(null); return; }
    const containerRect = container.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();
    setIndicatorX(activeRect.left - containerRect.left + activeRect.width / 2 - 8);
  }, []);

  useLayoutEffect(() => {
    updateIndicator();
  }, [location.pathname, updateIndicator]);

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

  // Close friends panel on outside click
  useEffect(() => {
    if (!showFriendsPanel) return;
    const handler = (e: MouseEvent) => {
      if (friendsPanelRef.current && !friendsPanelRef.current.contains(e.target as Node)) {
        setShowFriendsPanel(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFriendsPanel]);

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
  const isHome = location.pathname === "/";

  return (
    <div className={`layout${isPlayer ? " layout--player" : ""}`}>
      <header className={`header${isPlayer ? " header--hidden" : ""}`}>
        <nav className="nav">
          <NavLink to="/" className="logo">
            <img
              className="logo-mark"
              src="/FlowVidLogo.png"
              alt="FlowVid"
              width={28}
              height={28}
            />
            <span className="logo-text"><span className="logo-text-flow">Flow</span>Vid</span>
          </NavLink>

          <div className="nav-links" ref={navLinksRef}>
            {NAV_ITEMS.map((item) => {
              const active = item.match(location.pathname);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`nav-link${active ? " active" : ""}`}
                >
                  {item.label}
                </NavLink>
              );
            })}
            {indicatorX !== null && (
              <motion.div
                className="nav-indicator"
                initial={false}
                animate={{ x: indicatorX }}
                transition={{ type: "tween", duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              />
            )}
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

            {isAuthenticated && (
              <div className="friends-btn-area" ref={friendsPanelRef}>
                <button
                  className={`friends-btn${showFriendsPanel ? " active" : ""}`}
                  onClick={() => setShowFriendsPanel((v) => !v)}
                  title="Friends"
                >
                  <Users size={18} />
                  {notificationCount > 0 && (
                    <span className="friends-notification-badge">{notificationCount}</span>
                  )}
                </button>

                {showFriendsPanel && (
                  <FriendsActivityPanel onClose={() => setShowFriendsPanel(false)} />
                )}
              </div>
            )}

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
                  {notificationCount > 0 && (
                    <span className="avatar-notification-badge">{notificationCount}</span>
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
                        onClick={() => { setShowAvatarPicker(false); navigate("/friends"); }}
                      >
                        Friends
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

      <main className={`main-content${isHome ? " main-content--home" : ""}`}>
        <div
          key={location.pathname}
          className={`route-content${isHome ? " route-content--home" : ""}`}
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}
