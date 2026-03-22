import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useProfileStore,
  Profile,
  MAX_PROFILES,
  STOCK_AVATARS,
} from "../stores/profileStore";
import { Pencil } from "../components/Icons";
import "./ProfileSelectPage.css";

export function ProfileSelectPage() {
  const navigate = useNavigate();
  const {
    profiles,
    setActiveProfile,
    createProfile,
    deleteProfile,
    updateProfile,
  } = useProfileStore();

  const [mode, setMode] = useState<"select" | "create" | "edit" | "manage">(
    "select",
  );
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [newName, setNewName] = useState("");
  const [newAvatarImage, setNewAvatarImage] = useState<string | undefined>(STOCK_AVATARS[0].id);
  const [isKid, setIsKid] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleSelectProfile = (profile: Profile) => {
    if (mode === "manage") {
      setEditingProfile(profile);
      setNewName(profile.name);
      setNewAvatarImage(profile.avatarImage || STOCK_AVATARS[0].id);
      setIsKid(profile.isKid);
      setMode("edit");
      return;
    }

    setActiveProfile(profile.id);
    navigate("/");
  };

  const handleCreateProfile = () => {
    if (!newName.trim()) return;

    const profile = createProfile(newName, "#6366f1", "👤", isKid);
    if (profile && newAvatarImage) {
      updateProfile(profile.id, { avatarImage: newAvatarImage });
    }
    if (profile) {
      resetForm();
      setMode("select");
    }
  };

  const handleUpdateProfile = () => {
    if (!editingProfile || !newName.trim()) return;

    updateProfile(editingProfile.id, {
      name: newName,
      avatarImage: newAvatarImage,
      isKid,
    });

    resetForm();
    setMode("manage");
  };

  const handleDeleteProfile = (id: string) => {
    deleteProfile(id);
    setDeleteConfirmId(null);
    if (profiles.length <= 1) {
      setMode("select");
    }
  };

  const resetForm = () => {
    setNewName("");
    setNewAvatarImage(STOCK_AVATARS[0].id);
    setIsKid(false);
    setEditingProfile(null);
  };

  const openCreateMode = () => {
    resetForm();
    setMode("create");
  };

  // Create / Edit form
  if (mode === "create" || mode === "edit") {
    return (
      <div className="profile-page">
        <div className="profile-page-inner">
          <h1 className="profile-page-title">
            {mode === "create" ? "Add Profile" : "Edit Profile"}
          </h1>
          <p className="profile-page-subtitle">
            {mode === "create"
              ? `Add a profile for another person watching FlowVid. You can have up to ${MAX_PROFILES}.`
              : "Update this profile's settings."}
          </p>

          <div className="profile-form">
            {/* Avatar preview */}
            <div className="profile-form-avatar-preview">
              <img
                className="profile-avatar profile-avatar-xl profile-avatar-img"
                src={STOCK_AVATARS.find((a) => a.id === newAvatarImage)?.url || STOCK_AVATARS[0].url}
                alt=""
              />
            </div>

            {/* Name */}
            <div className="profile-form-field">
              <label>Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Profile name"
                maxLength={20}
                autoFocus
              />
            </div>

            {/* Stock avatar pictures */}
            <div className="profile-form-field">
              <label>Profile Picture</label>
              <div className="avatar-image-grid">
                {STOCK_AVATARS.map((avatar) => (
                  <button
                    key={avatar.id}
                    className={`avatar-image-option ${newAvatarImage === avatar.id ? "avatar-image-selected" : ""}`}
                    title={avatar.label}
                    onClick={() => setNewAvatarImage(avatar.id)}
                  >
                    <img src={avatar.url} alt={avatar.label} />
                  </button>
                ))}
              </div>
            </div>

            {/* Kid toggle */}
            <div className="profile-form-field profile-form-toggle">
              <label>Kid's Profile</label>
              <button
                className={`toggle-btn ${isKid ? "toggle-btn-on" : ""}`}
                onClick={() => setIsKid(!isKid)}
                type="button"
              >
                <span className="toggle-knob" />
              </button>
              <span className="toggle-label">
                {isKid ? "Content filters enabled" : "All content"}
              </span>
            </div>

            {/* Actions */}
            <div className="profile-form-actions">
              <button
                className="btn btn-primary"
                onClick={
                  mode === "create" ? handleCreateProfile : handleUpdateProfile
                }
                disabled={!newName.trim()}
              >
                {mode === "create" ? "Create Profile" : "Save Changes"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  resetForm();
                  setMode(mode === "edit" ? "manage" : "select");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="profile-page-inner">
        <h1 className="profile-page-title">Who's watching?</h1>

        <div className="profile-grid">
          {profiles.map((profile) => (
            <div key={profile.id} className="profile-card-wrapper">
              <button
                className={`profile-card ${mode === "manage" ? "profile-card-manage" : ""}`}
                onClick={() => handleSelectProfile(profile)}
              >
                <div
                  className="profile-avatar"
                >
                  <img
                    className="profile-avatar-stock-img"
                    src={STOCK_AVATARS.find((a) => a.id === profile.avatarImage)?.url || STOCK_AVATARS[0].url}
                    alt=""
                  />
                  {mode === "manage" && (
                    <div className="profile-edit-badge">
                      <Pencil size={14} />
                    </div>
                  )}
                </div>
                <span className="profile-name">{profile.name}</span>
                {profile.isKid && (
                  <span className="profile-kid-badge">KID</span>
                )}
              </button>

              {mode === "manage" && deleteConfirmId === profile.id && (
                <div className="profile-delete-confirm">
                  <p>Delete "{profile.name}"?</p>
                  <div className="profile-delete-actions">
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDeleteProfile(profile.id)}
                    >
                      Delete
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setDeleteConfirmId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {mode === "manage" && deleteConfirmId !== profile.id && (
                <button
                  className="profile-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirmId(profile.id);
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          ))}

          {/* Add profile button */}
          {profiles.length < MAX_PROFILES && mode !== "manage" && (
            <button
              className="profile-card profile-card-add"
              onClick={openCreateMode}
            >
              <div className="profile-avatar profile-avatar-add">
                <span>+</span>
              </div>
              <span className="profile-name">Add Profile</span>
            </button>
          )}
        </div>

        <div className="profile-page-actions">
          {profiles.length > 0 && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                setMode(mode === "manage" ? "select" : "manage");
                setDeleteConfirmId(null);
              }}
            >
              {mode === "manage" ? "Done" : "Manage Profiles"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
