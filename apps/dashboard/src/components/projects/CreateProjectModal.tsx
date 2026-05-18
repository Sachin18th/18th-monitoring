// "use client";
import React, { useState, useCallback } from "react";
import { X, AlertCircle, Loader2, CheckCircle } from "lucide-react";
import { createProject, Project } from "../../lib/api/projects";
import { useAuth } from "../../context/AuthContext";



interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (project: Project) => void;
}

type Step = "form" | "creating" | "success";

// Common timezone options
const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  "Australia/Sydney",
  "Australia/Melbourne",
];

/**
 * Auto-generates a slug from project name
 * Lowercase, replaces spaces with hyphens, removes special characters
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, "") // Trim hyphens from start/end
    .substring(0, 100); // Max 100 chars
}

export const CreateProjectModal = ({
  isOpen,
  onClose,
  onSuccess,
}: CreateProjectModalProps) => {
  const { token } = useAuth();
  const [step, setStep] = useState<Step>("form");
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    timezone: "UTC",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [createdProject, setCreatedProject] = useState<Project | null>(null);

  if (!isOpen) return null;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setFormData((prev) => ({
      ...prev,
      name: newName,
      // Auto-generate slug if user hasn't manually edited it
      slug:
        !prev.slug || prev.slug === generateSlug(prev.name)
          ? generateSlug(newName)
          : prev.slug,
    }));
    // Clear name error when user starts typing
    if (errors.name) {
      setErrors((prev) => ({ ...prev, name: "" }));
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSlug = generateSlug(e.target.value); // Enforce slug format
    setFormData((prev) => ({
      ...prev,
      slug: newSlug,
    }));
    if (errors.slug) {
      setErrors((prev) => ({ ...prev, slug: "" }));
    }
  };

  const handleDescriptionChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    setFormData((prev) => ({
      ...prev,
      description: e.target.value.substring(0, 500),
    }));
  };

  const handleTimezoneChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFormData((prev) => ({
      ...prev,
      timezone: e.target.value,
    }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Project name is required";
    } else if (formData.name.length < 3) {
      newErrors.name = "Project name must be at least 3 characters";
    } else if (formData.name.length > 100) {
      newErrors.name = "Project name must not exceed 100 characters";
    }

    if (!formData.slug.trim()) {
      newErrors.slug = "Slug is required";
    } else if (formData.slug.length > 100) {
      newErrors.slug = "Slug must not exceed 100 characters";
    }

    if (formData.description && formData.description.length > 500) {
      newErrors.description = "Description must not exceed 500 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (!validateForm()) {
      return;
    }

    if (!token) {
      setApiError("Authentication token missing");
      return;
    }

    setStep("creating");

    try {
      const project = await createProject(token, {
        name: formData.name,
        slug: formData.slug,
        description: formData.description || undefined,
        timezone: formData.timezone,
      });

      setCreatedProject(project);
      setStep("success");

      // Call success callback
      if (onSuccess) {
        onSuccess(project);
      }
    } catch (error: any) {
      const status = error.statusCode;
      const code = error.code;
      let message = error.message || "Failed to create project";

      if (status === 409 && code === "DUPLICATE_SLUG") {
        message = "This slug is already taken. Please choose a different one.";
      } else if (status === 403) {
        message = "You do not have permission to create projects.";
      }

      setApiError(message);
      setStep("form");
    }
  };

  const handleClose = () => {
    if (step === "creating") return; // Prevent closing while creating
    setFormData({ name: "", slug: "", description: "", timezone: "UTC" });
    setErrors({});
    setApiError(null);
    setCreatedProject(null);
    setStep("form");
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.8)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        zIndex: 1000,
        overflowY: "auto",
        padding: "24px",
      }}
    >
      <div
        style={{

          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "24px",
          width: "100%",
          maxWidth: "500px",
          padding: "32px",
          boxShadow: "var(--shadow-lg)",
          position: "relative",
          margin: "auto",
        }}
      >
        <button
          onClick={handleClose}
          disabled={step === "creating"}
          style={{
            position: "absolute",
            top: "24px",
            right: "24px",
            background: "none",
            border: "none",
            cursor: step === "creating" ? "not-allowed" : "pointer",
            color: "var(--text-muted)",
            opacity: step === "creating" ? 0.5 : 1,
          }}
        >
          <X size={24} />
        </button>

        {step === "form" && (
          <>
            <h3
              style={{
                fontSize: "20px",
                fontWeight: "800",
                marginBottom: "8px",
              }}
            >
              Create New Project
            </h3>
            <p
              style={{
                fontSize: "14px",
                color: "var(--text-secondary)",
                marginBottom: "28px",
              }}
            >
              Set up a new project to start monitoring your application.
            </p>

            {apiError && (
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgb(239, 68, 68)",
                  borderRadius: "12px",
                  padding: "12px 16px",
                  marginBottom: "20px",
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                }}
              >
                <AlertCircle
                  size={20}
                  style={{ color: "var(--error)", flexShrink: 0 }}
                />
                <p
                  style={{ fontSize: "14px", color: "var(--error)", margin: 0 }}
                >
                  {apiError}
                </p>
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: "20px" }}
            >
              {/* Project Name */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "800",
                    color: "var(--text-primary)",
                    marginBottom: "8px",
                  }}
                >
                  Project Name *
                </label>
                <input
                  type="text"
                  placeholder="My E-Commerce Store"
                  value={formData.name}
                  onChange={handleNameChange}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    border: errors.name
                      ? "1px solid var(--error)"
                      : "1px solid var(--border)",
                    borderRadius: "12px",
                    background: "var(--bg-app)",
                    color: "var(--text-primary)",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
                {errors.name && (
                  <p
                    style={{
                      fontSize: "12px",
                      color: "var(--error)",
                      marginTop: "6px",
                      margin: "6px 0 0 0",
                    }}
                  >
                    {errors.name}
                  </p>
                )}
              </div>

              {/* Slug */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "800",
                    color: "var(--text-primary)",
                    marginBottom: "8px",
                  }}
                >
                  Slug *
                </label>
                <input
                  type="text"
                  placeholder="my-ecommerce-store"
                  value={formData.slug}
                  onChange={handleSlugChange}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    border: errors.slug
                      ? "1px solid var(--error)"
                      : "1px solid var(--border)",
                    borderRadius: "12px",
                    background: "var(--bg-app)",
                    color: "var(--text-primary)",
                    fontSize: "14px",
                    fontFamily: "monospace",
                    boxSizing: "border-box",
                  }}
                />
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                    marginTop: "6px",
                    margin: "6px 0 0 0",
                  }}
                >
                  Lowercase, hyphens only. Auto-generated from name.
                </p>
                {errors.slug && (
                  <p
                    style={{
                      fontSize: "12px",
                      color: "var(--error)",
                      marginTop: "6px",
                      margin: "6px 0 0 0",
                    }}
                  >
                    {errors.slug}
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "800",
                    color: "var(--text-primary)",
                    marginBottom: "8px",
                  }}
                >
                  Description
                </label>
                <textarea
                  placeholder="Optional description of your project"
                  value={formData.description}
                  onChange={handleDescriptionChange}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    background: "var(--bg-app)",
                    color: "var(--text-primary)",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                    resize: "vertical",
                  }}
                />
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                    marginTop: "6px",
                    margin: "6px 0 0 0",
                  }}
                >
                  {formData.description.length}/500
                </p>
              </div>

              {/* Timezone */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "800",
                    color: "var(--text-primary)",
                    marginBottom: "8px",
                  }}
                >
                  Timezone
                </label>
                <select
                  value={formData.timezone}
                  onChange={handleTimezoneChange}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    background: "var(--bg-app)",
                    color: "var(--text-primary)",
                    fontSize: "14px",
                    boxSizing: "border-box",
                    cursor: "pointer",
                  }}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>

              {/* Buttons */}
              <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={handleClose}
                  style={{
                    flex: 1,
                    padding: "12px",
                    background: "transparent",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    fontWeight: "800",
                    cursor: "pointer",
                    color: "var(--text-primary)",
                    fontSize: "14px",
                    transition: "background-color 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.background =
                      "var(--bg-app)";
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.background = "transparent";
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: "12px",
                    background: "var(--accent-blue)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "12px",
                    fontWeight: "800",
                    cursor: "pointer",
                    fontSize: "14px",
                    transition: "opacity 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.opacity = "0.9";
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.opacity = "1";
                  }}
                >
                  Create Project
                </button>
              </div>
            </form>
          </>
        )}

        {step === "creating" && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <Loader2
              className="animate-spin"
              size={48}
              color="var(--accent-blue)"
              style={{ margin: "0 auto 24px" }}
            />
            <h4
              style={{
                fontSize: "18px",
                fontWeight: "800",
                marginBottom: "8px",
              }}
            >
              Creating Project...
            </h4>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              Please wait while we set up your project.
            </p>
          </div>
        )}

        {step === "success" && createdProject && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div
              style={{
                width: "64px",
                height: "64px",
                background: "rgba(34, 197, 94, 0.1)",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 24px",
              }}
            >
              <CheckCircle color="var(--accent-green)" size={32} />
            </div>
            <h4
              style={{
                fontSize: "18px",
                fontWeight: "800",
                marginBottom: "8px",
              }}
            >
              Project Created Successfully
            </h4>
            <p
              style={{
                fontSize: "13px",
                color: "var(--text-secondary)",
                marginBottom: "24px",
              }}
            >
              <strong>{createdProject.name}</strong> is ready to use.
            </p>
            <button
              onClick={handleClose}
              style={{
                padding: "12px 32px",
                background: "var(--accent-green)",
                color: "#fff",
                border: "none",
                borderRadius: "12px",
                fontWeight: "800",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
