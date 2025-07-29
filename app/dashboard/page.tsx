"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import "./Dashboard.css";

export default function DashboardPage() {
  const router = useRouter();
  const [votaciones, setVotaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newVotacion, setNewVotacion] = useState({
    titulo: "",
    descripcion: "",
    fecha_fin: "",
    opciones: [""],
  });

  // Obtener votaciones del usuario
  useEffect(() => {
    const fetchVotaciones = async () => {
      const user = JSON.parse(localStorage.getItem("admin") || "{}");

      const { data, error } = await supabase
        .from("votacion")
        .select(
          `
          *,
          opcion_votacion(*)
        `
        )
        .eq("creado_por", user.id)
        .order("fecha_fin", { ascending: true });

      if (error) {
        console.error("Error fetching votaciones:", error);
      } else {
        setVotaciones(data || []);
      }
      setLoading(false);
    };

    fetchVotaciones();
  }, []);

  // Crear nueva votación
  const handleCreateVotacion = async () => {
    const user = JSON.parse(localStorage.getItem("admin") || "{}");
    const token_link = generateToken();

    const { data, error } = await supabase
      .from("votacion")
      .insert([
        {
          titulo: newVotacion.titulo,
          descripcion: newVotacion.descripcion,
          fecha_inicio: new Date().toISOString(),
          fecha_fin: newVotacion.fecha_fin,
          estado: "en_progreso",
          token_link,
          creado_por: user.id,
        },
      ])
      .select();

    if (error) {
      console.error("Error creating votacion:", error);
      return;
    }

    // Crear opciones de votación
    const votacionId = data[0].id;
    await supabase.from("opcion_votacion").insert(
      newVotacion.opciones
        .filter((o) => o)
        .map((opcion) => ({
          votacion_id: votacionId,
          nombre: opcion,
          creado_en: new Date().toISOString(),
        }))
    );

    // Actualizar lista
    setVotaciones([...votaciones, data[0]]);
    setShowCreateModal(false);
    setNewVotacion({
      titulo: "",
      descripcion: "",
      fecha_fin: "",
      opciones: [""],
    });
  };

  const generateToken = () => {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  };

  // Eliminar votación
  const handleDeleteVotacion = async (id: number) => {
    if (!confirm("¿Estás seguro de eliminar esta votación?")) return;

    const { error } = await supabase.from("votacion").delete().eq("id", id);

    if (error) {
      console.error("Error deleting votacion:", error);
    } else {
      setVotaciones(votaciones.filter((v) => v.id !== id));
    }
  };

  // Separar votaciones activas y expiradas
  const votacionesActivas = votaciones.filter(
    (v) => new Date(v.fecha_fin) > new Date() && v.estado !== "cancelada"
  );
  const votacionesExpiradas = votaciones.filter(
    (v) => new Date(v.fecha_fin) <= new Date() || v.estado === "cancelada"
  );

  if (loading) return <div className="loading">Cargando...</div>;
  return (
    <div className="dashboard-container">
      <div className="auth-container">
        <div className="auth-decoration">
          <div className="shape1"></div>
          <div className="shape2"></div>
          <div className="shape3"></div>
        </div>
      </div>
      <div className="dashboard-header">
        <h1>Mis Votaciones</h1>
        <button
          className="create-button"
          onClick={() => setShowCreateModal(true)}
        >
          + Crear Nueva Votación
        </button>
      </div>

      {/* Modal para crear votación */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Crear Nueva Votación</h2>
            <div className="form-group">
              <label>Título</label>
              <input
                type="text"
                value={newVotacion.titulo}
                onChange={(e) =>
                  setNewVotacion({ ...newVotacion, titulo: e.target.value })
                }
              />
            </div>
            <div className="form-group">
              <label>Descripción</label>
              <textarea
                value={newVotacion.descripcion}
                onChange={(e) =>
                  setNewVotacion({
                    ...newVotacion,
                    descripcion: e.target.value,
                  })
                }
              />
            </div>
            <div className="form-group">
              <label>Fecha de Finalización</label>
              <input
                type="datetime-local"
                value={newVotacion.fecha_fin}
                onChange={(e) =>
                  setNewVotacion({ ...newVotacion, fecha_fin: e.target.value })
                }
              />
            </div>
            <div className="form-group">
              <label>Opciones de Votación</label>
              {newVotacion.opciones.map((opcion, index) => (
                <div key={index} className="opcion-input">
                  <input
                    type="text"
                    value={opcion}
                    onChange={(e) => {
                      const newOpciones = [...newVotacion.opciones];
                      newOpciones[index] = e.target.value;
                      setNewVotacion({ ...newVotacion, opciones: newOpciones });
                    }}
                    placeholder={`Opción ${index + 1}`}
                  />
                  {index > 0 && (
                    <button
                      onClick={() => {
                        const newOpciones = [...newVotacion.opciones];
                        newOpciones.splice(index, 1);
                        setNewVotacion({
                          ...newVotacion,
                          opciones: newOpciones,
                        });
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
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

      {/* Votaciones Activas */}
      <section className="votaciones-section">
        <h2>Votaciones Activas</h2>
        {votacionesActivas.length === 0 ? (
          <p className="no-votaciones">No hay votaciones activas</p>
        ) : (
          <div className="votaciones-grid">
            {votacionesActivas.map((votacion) => (
              <VotacionCard
                key={votacion.id}
                votacion={votacion}
                onDelete={handleDeleteVotacion}
              />
            ))}
          </div>
        )}
      </section>

      {/* Votaciones Expiradas */}
      <section className="votaciones-section">
        <h2>Votaciones Expiradas</h2>
        {votacionesExpiradas.length === 0 ? (
          <p className="no-votaciones">No hay votaciones expiradas</p>
        ) : (
          <div className="votaciones-grid">
            {votacionesExpiradas.map((votacion) => (
              <VotacionCard
                key={votacion.id}
                votacion={votacion}
                onDelete={handleDeleteVotacion}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// Componente de Tarjeta de Votación
function VotacionCard({
  votacion,
  onDelete,
}: {
  votacion: any;
  onDelete: (id: number) => void;
}) {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const votacionUrl = `${baseUrl}/votacion/${votacion.token_link}`;

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
          <strong>Creada:</strong>{" "}
          {new Date(votacion.creado_en).toLocaleString()}
        </div>
        <div>
          <strong>Expira:</strong>{" "}
          {new Date(votacion.fecha_fin).toLocaleString()}
        </div>
      </div>

      <div className="opciones">
        <strong>Opciones:</strong>
        <ul>
          {votacion.opcion_votacion?.map((opcion: any) => (
            <li key={opcion.id}>{opcion.nombre}</li>
          ))}
        </ul>
      </div>

      <div className="card-actions">
        <button className="edit-button">✏️ Editar</button>
        <button className="delete-button" onClick={() => onDelete(votacion.id)}>
          🗑️ Eliminar
        </button>
      </div>

      <a
        href={`/dashboard/estadisticas/${votacion.id}`}
        className="stats-button"
      >
        Ver Estadísticas
      </a>
    </div>
  );
}
