"use client";

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import "./Dashboard.css";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";

type VotacionType = "opcion_unica" | "opcion_multiple";

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
    opciones: [""],
    estado: "en_progreso",
    tipo_votacion: "opcion_unica" as VotacionType,
  });

  const fetchVotaciones = useCallback(async () => {
    setLoading(true);
    const user = JSON.parse(localStorage.getItem("admin") || "{}");
    const { data, error } = await supabase
      .from("votacion")
      .select("*, opcion_votacion(*)")
      .eq("creado_por", user.id)
      .order("id", { ascending: false });
    if (error) console.error("Error fetching votaciones:", error);
    else setVotaciones(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchVotaciones();
  }, [fetchVotaciones]);

  const handleCreateVotacion = async () => {
    if (!newVotacion.titulo || !newVotacion.descripcion) {
      Swal.fire({
        icon: "warning",
        title: "Campos incompletos",
        text: "Por favor complete todos los campos requeridos.",
        confirmButtonColor: "#6200ff",
      });
      return;
    }
    if (newVotacion.opciones.filter((o) => o.trim()).length === 0) {
      Swal.fire({
        icon: "warning",
        title: "Sin opciones",
        text: "Debe agregar al menos una opción de votación.",
        confirmButtonColor: "#6200ff",
      });
      return;
    }

    const now = new Date();
    const nowUTC = new Date(
      now.getTime() - now.getTimezoneOffset() * 60000
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
          estado: newVotacion.estado,
          tipo_votacion: newVotacion.tipo_votacion,
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
      opciones: [""],
      estado: "en_progreso",
      tipo_votacion: "opcion_unica",
    });

    Swal.fire({
      icon: "success",
      title: "Votación creada",
      text: "Tu votación ha sido creada correctamente.",
      confirmButtonColor: "#6200ff",
    });
  };

  const handleEditClick = (votacion: any) => {
    setCurrentVotacion(votacion);
    setNewVotacion({
      titulo: votacion.titulo,
      descripcion: votacion.descripcion,
      opciones: votacion.opcion_votacion.map((op: any) => op.nombre),
      estado: votacion.estado,
      tipo_votacion: votacion.tipo_votacion,
    });
    setShowEditModal(true);
  };

  const handleUpdateVotacion = async () => {
    if (!newVotacion.titulo || !newVotacion.descripcion) {
      Swal.fire({
        icon: "warning",
        title: "Campos incompletos",
        text: "Por favor complete todos los campos requeridos.",
        confirmButtonColor: "#6200ff",
      });
      return;
    }
    if (newVotacion.opciones.filter((o) => o.trim()).length === 0) {
      Swal.fire({
        icon: "warning",
        title: "Sin opciones",
        text: "Debe agregar al menos una opción de votación.",
        confirmButtonColor: "#6200ff",
      });
      return;
    }

    const { data, error } = await supabase
      .from("votacion")
      .update({
        titulo: newVotacion.titulo,
        descripcion: newVotacion.descripcion,
        estado: newVotacion.estado,
        tipo_votacion: newVotacion.tipo_votacion,
      })
      .eq("id", currentVotacion.id)
      .select();
    if (error || !data) {
      console.error("Error updating votacion:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo actualizar la votación.",
      });
      return;
    }

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
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo actualizar las opciones de votación.",
      });
      return;
    }

    await fetchVotaciones();
    setShowEditModal(false);
    setCurrentVotacion(null);
    Swal.fire({
      icon: "success",
      title: "Votación actualizada",
      text: "Los cambios se han guardado correctamente.",
      confirmButtonColor: "#6200ff",
    });
  };

  const handleDeleteVotacion = async (id: number) => {
    const result = await Swal.fire({
      title: "¿Estás seguro?",
      text: "Esta acción no se puede deshacer.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#d63031",
      cancelButtonColor: "#6200ff",
    });
    if (!result.isConfirmed) return;
    const { error } = await supabase.from("votacion").delete().eq("id", id);
    if (error) {
      console.error("Error deleting votacion:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo eliminar la votación.",
      });
    } else {
      setVotaciones(votaciones.filter((v) => v.id !== id));
      Swal.fire({
        icon: "success",
        title: "Eliminado",
        text: "La votación ha sido eliminada.",
        confirmButtonColor: "#6200ff",
      });
    }
  };

  const handleToggleState = async (v: any) => {
    const newState = v.estado === "en_progreso" ? "expirada" : "en_progreso";
    const { error } = await supabase
      .from("votacion")
      .update({ estado: newState })
      .eq("id", v.id);
    if (error) {
      console.error("Error toggling estado:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo cambiar el estado.",
      });
    } else {
      await fetchVotaciones();
    }
  };

  const votacionesActivas = votaciones.filter(
    (v) => v.estado === "en_progreso"
  );
  const votacionesExpiradas = votaciones.filter((v) => v.estado === "expirada");

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

      <div className="tipo-info">
        <p>
          <strong>Opción única:</strong> El votante solo puede seleccionar{" "}
          <em>una</em> opción.
        </p>
        <p>
          <strong>Opción múltiple:</strong> El votante puede seleccionar{" "}
          <em>varias</em> opciones.
        </p>
      </div>

      {/* Crear Modal */}
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
              <label>Estado *</label>
              <select
                value={newVotacion.estado}
                onChange={(e) =>
                  setNewVotacion({ ...newVotacion, estado: e.target.value })
                }
              >
                <option value="en_progreso">En progreso</option>
                <option value="expirada">Expirada</option>
              </select>
            </div>
            <div className="form-group">
              <label>Tipo de Votación *</label>
              <select
                value={newVotacion.tipo_votacion}
                onChange={(e) =>
                  setNewVotacion({
                    ...newVotacion,
                    tipo_votacion: e.target.value as VotacionType,
                  })
                }
              >
                <option value="opcion_unica">Opción única</option>
                <option value="opcion_multiple">Opción múltiple</option>
              </select>
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

      {/* Editar Modal */}
      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Editar Votación</h2>
            {/* … misma estructura que Crear Modal, incluyendo select de tipo_votacion … */}
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
              <label>Estado *</label>
              <select
                value={newVotacion.estado}
                onChange={(e) =>
                  setNewVotacion({ ...newVotacion, estado: e.target.value })
                }
              >
                <option value="en_progreso">En progreso</option>
                <option value="expirada">Expirada</option>
              </select>
            </div>
            <div className="form-group">
              <label>Tipo de Votación *</label>
              <select
                value={newVotacion.tipo_votacion}
                onChange={(e) =>
                  setNewVotacion({
                    ...newVotacion,
                    tipo_votacion: e.target.value as VotacionType,
                  })
                }
              >
                <option value="opcion_unica">Opción única</option>
                <option value="opcion_multiple">Opción múltiple</option>
              </select>
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

      <section className="votaciones-section">
        <h2 className="votaciones-section-activas">Votaciones Activas</h2>
        {votacionesActivas.length === 0 ? (
          <p className="no-votaciones">No hay votaciones en progreso</p>
        ) : (
          <div className="votaciones-grid">
            {votacionesActivas.map((v) => (
              <VotacionCard
                key={v.id}
                votacion={v}
                onDelete={handleDeleteVotacion}
                onEdit={handleEditClick}
                onToggleState={handleToggleState}
              />
            ))}
          </div>
        )}
      </section>

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
                onToggleState={handleToggleState}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function generateToken() {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

function formatDateTimeLocal(dateInput: string | Date): string {
  const dt = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  const hour = String(dt.getUTCHours()).padStart(2, "0");
  const minute = String(dt.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function VotacionCard({
  votacion,
  onDelete,
  onEdit,
  onToggleState,
}: {
  votacion: any;
  onDelete: (id: number) => void;
  onEdit: (votacion: any) => void;
  onToggleState: (v: any) => void;
}) {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const votacionUrl = `${baseUrl}/votacion/${votacion.token_link}`;

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(votacion.token_link);
      Swal.fire({
        icon: "success",
        title: "Código copiado",
        text: `Códido "${votacion.token_link}" copiado al portapapeles.`,
        timer: 1500,
        showConfirmButton: false,
      });
    } catch {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo copiar el código.",
      });
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
      {/* New code + copy button */}
      <div className="votacion-code">
        <div className="votacion-code-title">Código de votación: </div>
        <div className="votacion-code-container">
          <code className="code-text">{votacion.token_link}</code>
          <button className="copy-button" onClick={copyCode}>
            Copiar
          </button>
        </div>
      </div>

      <div className="tipo-label">
        <strong>Tipo de votación:</strong>{" "}
        {votacion.tipo_votacion === "opcion_unica"
          ? "Opción única"
          : "Opción múltiple"}
      </div>
      <h3>{votacion.titulo}</h3>
      <p className="descripcion">{votacion.descripcion}</p>
      <div className="fechas">
        <div>
          <strong>Creada:</strong> {formatDate(votacion.fecha_inicio)}
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
      <div className={`state-label ${votacion.estado}`}>
        <em>
          Estado:{" "}
          {votacion.estado === "en_progreso" ? "En progreso" : "Expirada"}
        </em>
      </div>
      <div className="card-actions">
        <button className="edit-button" onClick={() => onEdit(votacion)}>
          ✏️ Editar
        </button>
        <button
          className="toggle-button"
          onClick={() => onToggleState(votacion)}
        >
          {votacion.estado === "en_progreso" ? "❌ Expirar" : "✅ Reactivar"}
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
