// app/dashboard/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import "./Dashboard.css";

export default function DashboardPage() {
  const router = useRouter();
  const [votaciones, setVotaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentVotacion, setCurrentVotacion] = useState<any>(null);
  const [newVotacion, setNewVotacion] = useState({
    titulo: "",
    descripcion: "",
    fecha_fin: "",
    opciones: [""],
  });

  // 1) Función reutilizable para cargar TODAS las votaciones con sus opciones
  const fetchVotaciones = useCallback(async () => {
    setLoading(true);
    const user = JSON.parse(localStorage.getItem("admin") || "{}");
    const { data, error } = await supabase
      .from("votacion")
      .select("*, opcion_votacion(*)")
      .eq("creado_por", user.id)
      .order("fecha_fin", { ascending: true });
    if (error) {
      console.error("Error fetching votaciones:", error);
    } else {
      setVotaciones(data || []);
    }
    setLoading(false);
  }, []);

  // 2) Carga inicial
  useEffect(() => {
    fetchVotaciones();
  }, [fetchVotaciones]);

  // 3) Crear nueva votación y luego recargar lista
  const handleCreateVotacion = async () => {
    if (
      !newVotacion.titulo ||
      !newVotacion.descripcion ||
      !newVotacion.fecha_fin
    ) {
      alert("Por favor complete todos los campos requeridos");
      return;
    }
    if (newVotacion.opciones.filter((o) => o.trim()).length === 0) {
      alert("Debe agregar al menos una opción de votación");
      return;
    }

    const now = new Date();
    const nowUTC = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const selectedDateLocal = new Date(newVotacion.fecha_fin);
    if (selectedDateLocal <= now) {
      alert("La fecha de finalización debe ser futura");
      return;
    }
    const fechaFinUTC = new Date(
      selectedDateLocal.getTime() -
        selectedDateLocal.getTimezoneOffset() * 60000
    ).toISOString();

    const user = JSON.parse(localStorage.getItem("admin") || "{}");
    const token_link = generateToken();

    const { data, error } = await supabase
      .from("votacion")
      .insert([
        {
          titulo: newVotacion.titulo,
          descripcion: newVotacion.descripcion,
          fecha_inicio: nowUTC,
          fecha_fin: fechaFinUTC,
          estado: "en_progreso",
          token_link,
          creado_por: user.id,
        },
      ])
      .select();
    if (error || !data) {
      console.error("Error creating votacion:", error);
      alert("Error al crear la votación");
      return;
    }

    const votacionId = data[0].id;
    const { error: opcionesError } = await supabase
      .from("opcion_votacion")
      .insert(
        newVotacion.opciones
          .filter((o) => o.trim())
          .map((opcion) => ({
            votacion_id: votacionId,
            nombre: opcion.trim(),
            creado_en: new Date().toISOString(),
          }))
      );
    if (opcionesError) {
      console.error("Error creating opciones:", opcionesError);
      alert("Error al crear las opciones de votación");
      return;
    }

    await fetchVotaciones();
    setShowCreateModal(false);
    setNewVotacion({
      titulo: "",
      descripcion: "",
      fecha_fin: "",
      opciones: [""],
    });
  };

  // 4) Abrir modal de edición cargando datos existentes
  const handleEditClick = (votacion: any) => {
    setCurrentVotacion(votacion);
    setNewVotacion({
      titulo: votacion.titulo,
      descripcion: votacion.descripcion,
      fecha_fin: formatDateTimeLocal(new Date(votacion.fecha_fin)),
      opciones: votacion.opcion_votacion.map((op: any) => op.nombre),
    });
    setShowEditModal(true);
  };

  // 5) Actualizar votación y luego recargar lista
  const handleUpdateVotacion = async () => {
    if (
      !newVotacion.titulo ||
      !newVotacion.descripcion ||
      !newVotacion.fecha_fin
    ) {
      alert("Por favor complete todos los campos requeridos");
      return;
    }
    if (newVotacion.opciones.filter((o) => o.trim()).length === 0) {
      alert("Debe agregar al menos una opción de votación");
      return;
    }

    const selectedDateLocal = new Date(newVotacion.fecha_fin);
    const now = new Date();
    if (selectedDateLocal <= now) {
      alert("La fecha de finalización debe ser futura");
      return;
    }
    const fechaFinUTC = new Date(
      selectedDateLocal.getTime() -
        selectedDateLocal.getTimezoneOffset() * 60000
    ).toISOString();

    const { data, error } = await supabase
      .from("votacion")
      .update({
        titulo: newVotacion.titulo,
        descripcion: newVotacion.descripcion,
        fecha_fin: fechaFinUTC,
      })
      .eq("id", currentVotacion.id)
      .select();
    if (error || !data) {
      console.error("Error updating votacion:", error);
      alert("Error al actualizar la votación");
      return;
    }

    // Reemplazar opciones
    await supabase
      .from("opcion_votacion")
      .delete()
      .eq("votacion_id", currentVotacion.id);
    const { error: opcionesError } = await supabase
      .from("opcion_votacion")
      .insert(
        newVotacion.opciones
          .filter((o) => o.trim())
          .map((opcion) => ({
            votacion_id: currentVotacion.id,
            nombre: opcion.trim(),
            creado_en: new Date().toISOString(),
          }))
      );
    if (opcionesError) {
      console.error("Error updating opciones:", opcionesError);
      alert("Error al actualizar las opciones de votación");
      return;
    }

    await fetchVotaciones();
    setShowEditModal(false);
    setCurrentVotacion(null);
  };

  // 6) Eliminar votación localmente
  const handleDeleteVotacion = async (id: number) => {
    if (!confirm("¿Estás seguro de eliminar esta votación?")) return;
    const { error } = await supabase.from("votacion").delete().eq("id", id);
    if (error) {
      console.error("Error deleting votacion:", error);
      alert("Error al eliminar la votación");
    } else {
      setVotaciones(votaciones.filter((v) => v.id !== id));
    }
  };

  // 7) Filtrar activas y expiradas
  const nowUTC = new Date(
    new Date().getTime() - new Date().getTimezoneOffset() * 60000
  ).getTime();
  const getTimestamp = (dbDate: string) =>
    new Date(dbDate.replace(" ", "T").replace(/\+.*$/, "Z")).getTime();

  const votacionesActivas = votaciones.filter(
    (v) => getTimestamp(v.fecha_fin) > nowUTC && v.estado !== "cancelada"
  );
  const votacionesExpiradas = votaciones.filter(
    (v) => getTimestamp(v.fecha_fin) <= nowUTC
  );

  if (loading) return <div className="loading">Cargando...</div>;

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Mis Votaciones</h1>
        <button
          className="create-button"
          onClick={() => setShowCreateModal(true)}
        >
          + Crear Nueva Votación
        </button>
      </div>

      {/* --- Modal Crear --- */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Crear Nueva Votación</h2>
            <div className="form-group">
              <label>Título *</label>
              <input
                type="text"
                value={newVotacion.titulo}
                onChange={(e) =>
                  setNewVotacion({ ...newVotacion, titulo: e.target.value })
                }
                required
              />
            </div>
            <div className="form-group">
              <label>Descripción *</label>
              <textarea
                value={newVotacion.descripcion}
                onChange={(e) =>
                  setNewVotacion({
                    ...newVotacion,
                    descripcion: e.target.value,
                  })
                }
                required
              />
            </div>
            <div className="form-group">
              <label>Fecha de Finalización *</label>
              <input
                type="datetime-local"
                value={newVotacion.fecha_fin}
                onChange={(e) =>
                  setNewVotacion({ ...newVotacion, fecha_fin: e.target.value })
                }
                min={formatDateTimeLocal(new Date())}
                required
              />
            </div>
            <div className="form-group">
              <label>Opciones de Votación *</label>
              {newVotacion.opciones.map((opcion, index) => (
                <div key={index} className="opcion-input">
                  <input
                    type="text"
                    value={opcion}
                    onChange={(e) => {
                      const newOps = [...newVotacion.opciones];
                      newOps[index] = e.target.value;
                      setNewVotacion({ ...newVotacion, opciones: newOps });
                    }}
                    placeholder={`Opción ${index + 1}`}
                  />
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const newOps = [...newVotacion.opciones];
                        newOps.splice(index, 1);
                        setNewVotacion({ ...newVotacion, opciones: newOps });
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="add-opcion"
                onClick={() =>
                  setNewVotacion({
                    ...newVotacion,
                    opciones: [...newVotacion.opciones, ""],
                  })
                }
              >
                + Añadir Opción
              </button>
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowCreateModal(false)}>
                Cancelar
              </button>
              <button onClick={handleCreateVotacion}>Crear Votación</button>
            </div>
          </div>
        </div>
      )}

      {/* --- Modal Editar --- */}
      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Editar Votación</h2>
            <div className="form-group">
              <label>Título *</label>
              <input
                type="text"
                value={newVotacion.titulo}
                onChange={(e) =>
                  setNewVotacion({ ...newVotacion, titulo: e.target.value })
                }
                required
              />
            </div>
            <div className="form-group">
              <label>Descripción *</label>
              <textarea
                value={newVotacion.descripcion}
                onChange={(e) =>
                  setNewVotacion({
                    ...newVotacion,
                    descripcion: e.target.value,
                  })
                }
                required
              />
            </div>
            <div className="form-group">
              <label>Fecha de Finalización *</label>
              <input
                type="datetime-local"
                value={newVotacion.fecha_fin}
                onChange={(e) =>
                  setNewVotacion({ ...newVotacion, fecha_fin: e.target.value })
                }
                min={formatDateTimeLocal(new Date())}
                required
              />
            </div>
            <div className="form-group">
              <label>Opciones de Votación *</label>
              {newVotacion.opciones.map((opcion, index) => (
                <div key={index} className="opcion-input">
                  <input
                    type="text"
                    value={opcion}
                    onChange={(e) => {
                      const newOps = [...newVotacion.opciones];
                      newOps[index] = e.target.value;
                      setNewVotacion({ ...newVotacion, opciones: newOps });
                    }}
                    placeholder={`Opción ${index + 1}`}
                  />
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const newOps = [...newVotacion.opciones];
                        newOps.splice(index, 1);
                        setNewVotacion({ ...newVotacion, opciones: newOps });
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="add-opcion"
                onClick={() =>
                  setNewVotacion({
                    ...newVotacion,
                    opciones: [...newVotacion.opciones, ""],
                  })
                }
              >
                + Añadir Opción
              </button>
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowEditModal(false)}>Cancelar</button>
              <button onClick={handleUpdateVotacion}>Guardar Cambios</button>
            </div>
          </div>
        </div>
      )}

      {/* --- Votaciones Activas --- */}
      <section className="votaciones-section">
        <h2 className="votaciones-section-activas">Votaciones Activas</h2>
        {votacionesActivas.length === 0 ? (
          <p className="no-votaciones">No hay votaciones activas</p>
        ) : (
          <div className="votaciones-grid">
            {votacionesActivas.map((v) => (
              <VotacionCard
                key={v.id}
                votacion={v}
                onDelete={handleDeleteVotacion}
                onEdit={handleEditClick}
              />
            ))}
          </div>
        )}
      </section>

      {/* --- Votaciones Expiradas --- */}
      <section className="votaciones-section">
        <h2 className="votaciones-section-expiradas">Votaciones Expiradas</h2>
        {votacionesExpiradas.length === 0 ? (
          <p className="no-votaciones">No hay votaciones expiradas</p>
        ) : (
          <div className="votaciones-grid">
            {votacionesExpiradas.map((v) => (
              <VotacionCard
                key={v.id}
                votacion={v}
                onDelete={handleDeleteVotacion}
                onEdit={handleEditClick}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// --- Helpers y componentes auxiliares ---

function generateToken() {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

function formatDateTimeLocal(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}

function VotacionCard({
  votacion,
  onDelete,
  onEdit,
}: {
  votacion: any;
  onDelete: (id: number) => void;
  onEdit: (votacion: any) => void;
}) {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const votacionUrl = `${baseUrl}/votacion/${votacion.token_link}`;

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString("es-ES", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      });
    } catch {
      return "Fecha inválida";
    }
  };

  return (
    <div className="votacion-card">
      <div className="qr-container">
        <QRCode value={votacionUrl} size={128} level="H" />
      </div>
      <div className="votacion-link">
        <a href={votacionUrl} target="_blank" rel="noopener noreferrer">
          {votacionUrl}
        </a>
      </div>
      <h3>{votacion.titulo}</h3>
      <p className="descripcion">{votacion.descripcion}</p>
      <div className="fechas">
        <div>
          <strong>Creada:</strong> {formatDate(votacion.fecha_inicio)}
        </div>
        <div>
          <strong>Expira:</strong> {formatDate(votacion.fecha_fin)}
        </div>
      </div>
      <div className="opciones">
        <strong>Opciones:</strong>
        <ul>
          {votacion.opcion_votacion?.map((op: any) => (
            <li key={op.id}>{op.nombre}</li>
          ))}
        </ul>
      </div>
      <div className="card-actions">
        <button className="edit-button" onClick={() => onEdit(votacion)}>
          ✏️ Editar
        </button>
        <button className="delete-button" onClick={() => onDelete(votacion.id)}>
          🗑️ Eliminar
        </button>
      </div>
      <a href={`/conteo?votacion=${votacion.id}`} className="stats-button">
        Ver Estadísticas
      </a>
    </div>
  );
}
