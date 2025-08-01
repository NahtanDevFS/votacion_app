"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import "./Profile.css";

interface Profile {
  id: number;
  nombre: string;
  apellido: string | null;
  correo: string;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    nombre: "",
    apellido: "",
  });
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  // 1️⃣ Detectar móvil
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // 2️⃣ Cargar perfil desde Supabase
  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErrorMessage("No hay usuario autenticado");
        setLoading(false);
        return;
      }

      // Buscamos su fila en admin_votacion
      const { data, error } = await supabase
        .from("admin_votacion")
        .select("*")
        .eq("correo", user.email)
        .single();
      if (error) {
        setErrorMessage("Error al cargar perfil: " + error.message);
      } else if (data) {
        setProfile(data);
        setFormData({
          nombre: data.nombre,
          apellido: data.apellido || "",
        });
      }
      setLoading(false);
    };

    loadProfile();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // 3️⃣ Submit: actualizar en Supabase
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setLoading(true);
    const { error } = await supabase
      .from("admin_votacion")
      .update({
        nombre: formData.nombre,
        apellido: formData.apellido || null,
      })
      .eq("id", profile.id);

    if (error) {
      setErrorMessage("Error al actualizar: " + error.message);
    } else {
      setSuccessMessage("Perfil actualizado correctamente!");
      setProfile({ ...profile, ...formData });
      setEditMode(false);
      setTimeout(() => setSuccessMessage(""), 3000);
    }
    setLoading(false);
  };

  if (loading) {
    return <div className="profile-loading">Cargando perfil...</div>;
  }

  if (errorMessage) {
    return <div className="profile-error">{errorMessage}</div>;
  }

  if (!profile) {
    return <div className="profile-loading">No se encontró tu perfil.</div>;
  }

  return (
    <div className="profile-outer-container">
      <div className="profile-container">
        <div className="profile-bg-deco">
          <div className="deco-circle"></div>
          <div className="deco-wave"></div>
        </div>

        <div className="profile-header">
          <div className="avatar-container">
            <div className="avatar-circle">
              {profile.nombre.charAt(0).toUpperCase()}
              {profile.apellido?.charAt(0).toUpperCase()}
            </div>
            <div className="avatar-status"></div>
          </div>

          {!editMode ? (
            <div className="profile-info">
              <h1>
                {profile.nombre} {profile.apellido}
              </h1>
              <p>{profile.correo}</p>
            </div>
          ) : (
            <div className="profile-edit-title">
              <h1>Editar Perfil</h1>
            </div>
          )}

          <button
            className={`edit-button ${editMode ? "cancel" : ""}`}
            onClick={() => {
              setEditMode(!editMode);
              setSuccessMessage("");
            }}
          >
            {editMode ? "Cancelar" : "Editar Perfil"}
          </button>
        </div>

        <div className="profile-content">
          {successMessage && (
            <div className="success-message">
              <span>✓</span> {successMessage}
            </div>
          )}

          {!editMode ? (
            <div className="profile-details">
              <div className="detail-card">
                <h3>Información Personal</h3>
                <div className="detail-item">
                  <span className="detail-label">Nombre:</span>
                  <span className="detail-value">{profile.nombre}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Apellido:</span>
                  <span className="detail-value">
                    {profile.apellido || "-"}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Correo:</span>
                  <span className="detail-value">{profile.correo}</span>
                </div>
              </div>

              <div className="stats-container">
                {/*<div className="stat-card">
                  <div className="stat-icon">📅</div>
                  <div className="stat-value">0</div>
                  <div className="stat-label">Votaciones creadas</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">👥</div>
                  <div className="stat-value">0</div>
                  <div className="stat-label">Participantes</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">🏆</div>
                  <div className="stat-value">0</div>
                  <div className="stat-label">Votaciones activas</div>
                </div>*/}
              </div>
            </div>
          ) : (
            <form className="profile-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="nombre">Nombre</label>
                <input
                  type="text"
                  id="nombre"
                  name="nombre"
                  value={formData.nombre}
                  onChange={handleInputChange}
                  required
                />
                <div className="input-decoration"></div>
              </div>

              <div className="form-group">
                <label htmlFor="apellido">Apellido</label>
                <input
                  type="text"
                  id="apellido"
                  name="apellido"
                  value={formData.apellido}
                  onChange={handleInputChange}
                />
                <div className="input-decoration"></div>
              </div>

              <div className="form-actions">
                <button type="submit" className="save-button">
                  Guardar Cambios
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
