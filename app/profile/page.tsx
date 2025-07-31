"use client";

import { useEffect, useState } from "react";
import "./Profile.css";

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    nombre: "",
    apellido: "",
    correo: "",
  });
  const [successMessage, setSuccessMessage] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Verificar el tamaño de pantalla
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);

    // Obtener datos del usuario
    const userData = JSON.parse(localStorage.getItem("admin") || "null");
    if (userData) {
      setUser(userData);
      setFormData({
        nombre: userData.nombre,
        apellido: userData.apellido || "",
        correo: userData.correo,
      });
    }

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Simular actualización (en un caso real harías una petición a Supabase)
    const updatedUser = { ...user, ...formData };
    localStorage.setItem("admin", JSON.stringify(updatedUser));
    setUser(updatedUser);

    setSuccessMessage("Perfil actualizado correctamente!");
    setEditMode(false);

    setTimeout(() => setSuccessMessage(""), 3000);
  };

  if (!user) {
    return <div className="profile-loading">Cargando perfil...</div>;
  }

  return (
    <div className="profile-outer-container">
      <div className="profile-container">
        {/* Decoración de fondo */}
        <div className="profile-bg-deco">
          <div className="deco-circle"></div>
          <div className="deco-wave"></div>
        </div>

        <div className="profile-header">
          <div className="avatar-container">
            <div className="avatar-circle">
              {user.nombre.charAt(0).toUpperCase()}
              {user.apellido?.charAt(0).toUpperCase()}
            </div>
            <div className="avatar-status"></div>
          </div>

          {!editMode ? (
            <div className="profile-info">
              <h1>
                {user.nombre} {user.apellido}
              </h1>
              <p>{user.correo}</p>
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
                  <span className="detail-value">{user.nombre}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Apellido:</span>
                  <span className="detail-value">{user.apellido || "-"}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Correo:</span>
                  <span className="detail-value">{user.correo}</span>
                </div>
              </div>

              <div className="stats-container">
                <div className="stat-card">
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
                </div>
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

              <div className="form-group">
                <label htmlFor="correo">Correo electrónico</label>
                <input
                  type="email"
                  id="correo"
                  name="correo"
                  value={formData.correo}
                  onChange={handleInputChange}
                  required
                />
                <div className="input-decoration"></div>
              </div>

              <div className="form-group">
                <label htmlFor="password">Cambiar contraseña (opcional)</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  placeholder="Nueva contraseña"
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
