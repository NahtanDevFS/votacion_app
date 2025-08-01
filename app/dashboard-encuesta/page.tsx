// dashboard-encuesta/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import "./Dashboard_encuesta.css";

type Estado = "en_progreso" | "expirada";

interface Opcion {
  id?: number;
  texto: string;
}

interface Inciso {
  id?: number;
  texto: string;
  tipo_inciso: "opcion_unica" | "opcion_multiple";
  opciones: Opcion[];
}

interface Encuesta {
  id: number;
  titulo: string;
  descripcion: string;
  fecha_inicio: string;
  estado: Estado;
  token_link: string;
  inciso_encuesta: Array<{
    id: number;
    texto: string;
    tipo_inciso: "opcion_unica" | "opcion_multiple";
    opcion_encuesta: Array<{ id: number; texto: string }>;
  }>;
}

export default function DashboardEncuestaPage() {
  const router = useRouter();
  const [encuestas, setEncuestas] = useState<Encuesta[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentEncuesta, setCurrentEncuesta] = useState<Encuesta | null>(null);

  const emptyInciso = (): Inciso => ({
    texto: "",
    tipo_inciso: "opcion_unica",
    opciones: [{ texto: "" }],
  });

  const [newEncuesta, setNewEncuesta] = useState<{
    titulo: string;
    descripcion: string;
    estado: Estado;
    incisos: Inciso[];
  }>({
    titulo: "",
    descripcion: "",
    estado: "en_progreso",
    incisos: [emptyInciso()],
  });

  const fetchEncuestas = useCallback(async () => {
    setLoading(true);
    const user = JSON.parse(localStorage.getItem("admin") || "{}");
    const { data, error } = await supabase
      .from("encuesta")
      .select(
        `
        *,
        inciso_encuesta (
          *,
          opcion_encuesta (*)
        )
      `
      )
      .eq("creado_por", user.id)
      .order("id", { ascending: false });

    if (error) console.error("Error fetching encuestas:", error);
    else setEncuestas((data ?? []) as Encuesta[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEncuestas();
  }, [fetchEncuestas]);

  const generateToken = () =>
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);

  async function handleCreate() {
    if (!newEncuesta.titulo.trim() || !newEncuesta.descripcion.trim()) {
      alert("Completa título y descripción");
      return;
    }
    for (const inc of newEncuesta.incisos) {
      if (!inc.texto.trim()) {
        alert("Cada inciso debe tener texto");
        return;
      }
      if (!inc.opciones.some((o) => o.texto.trim())) {
        alert("Cada inciso necesita al menos una opción");
        return;
      }
    }

    const nowUTC = new Date(
      Date.now() - new Date().getTimezoneOffset() * 60000
    ).toISOString();
    const user = JSON.parse(localStorage.getItem("admin") || "{}");
    const token_link = generateToken();

    const { data: encuestaCreated, error: errEnc } = await supabase
      .from("encuesta")
      .insert([
        {
          titulo: newEncuesta.titulo,
          descripcion: newEncuesta.descripcion,
          fecha_inicio: nowUTC,
          estado: newEncuesta.estado,
          token_link,
          creado_por: user.id,
        },
      ])
      .select()
      .single();
    if (errEnc || !encuestaCreated) {
      console.error(errEnc);
      alert("Error al crear encuesta");
      return;
    }

    for (const inc of newEncuesta.incisos) {
      const { data: incCreated, error: errInc } = await supabase
        .from("inciso_encuesta")
        .insert([
          {
            encuesta_id: encuestaCreated.id,
            texto: inc.texto,
            tipo_inciso: inc.tipo_inciso,
          },
        ])
        .select()
        .single();
      if (errInc || !incCreated) {
        console.error(errInc);
        alert("Error al crear incisos");
        return;
      }
      const opcionesPayload = inc.opciones
        .filter((o) => o.texto.trim())
        .map((o) => ({
          inciso_id: incCreated.id,
          texto: o.texto,
        }));
      const { error: errOpc } = await supabase
        .from("opcion_encuesta")
        .insert(opcionesPayload);
      if (errOpc) {
        console.error(errOpc);
        alert("Error al crear opciones");
        return;
      }
    }

    await fetchEncuestas();
    setShowCreateModal(false);
    setNewEncuesta({
      titulo: "",
      descripcion: "",
      estado: "en_progreso",
      incisos: [emptyInciso()],
    });
  }

  function handleEditClick(enc: Encuesta) {
    setCurrentEncuesta(enc);
    setNewEncuesta({
      titulo: enc.titulo,
      descripcion: enc.descripcion,
      estado: enc.estado,
      incisos: enc.inciso_encuesta.map((inc) => ({
        id: inc.id,
        texto: inc.texto,
        tipo_inciso: inc.tipo_inciso,
        opciones: inc.opcion_encuesta.map((op) => ({
          id: op.id,
          texto: op.texto,
        })),
      })),
    });
    setShowEditModal(true);
  }

  async function handleUpdate() {
    if (!currentEncuesta) return;
    if (!newEncuesta.titulo.trim() || !newEncuesta.descripcion.trim()) {
      alert("Completa título y descripción");
      return;
    }
    for (const inc of newEncuesta.incisos) {
      if (!inc.texto.trim()) {
        alert("Cada inciso debe tener texto");
        return;
      }
      if (!inc.opciones.some((o) => o.texto.trim())) {
        alert("Cada inciso necesita al menos una opción");
        return;
      }
    }

    const { error: errEnc } = await supabase
      .from("encuesta")
      .update({
        titulo: newEncuesta.titulo,
        descripcion: newEncuesta.descripcion,
        estado: newEncuesta.estado,
      })
      .eq("id", currentEncuesta.id);
    if (errEnc) {
      console.error(errEnc);
      alert("Error al actualizar encuesta");
      return;
    }

    await supabase
      .from("inciso_encuesta")
      .delete()
      .eq("encuesta_id", currentEncuesta.id);
    for (const inc of newEncuesta.incisos) {
      const { data: incCreated, error: errInc } = await supabase
        .from("inciso_encuesta")
        .insert([
          {
            encuesta_id: currentEncuesta.id,
            texto: inc.texto,
            tipo_inciso: inc.tipo_inciso,
          },
        ])
        .select()
        .single();
      if (errInc || !incCreated) {
        console.error(errInc);
        alert("Error al re-crear incisos");
        return;
      }
      const opcionesPayload = inc.opciones
        .filter((o) => o.texto.trim())
        .map((o) => ({ inciso_id: incCreated.id, texto: o.texto }));
      const { error: errOpc } = await supabase
        .from("opcion_encuesta")
        .insert(opcionesPayload);
      if (errOpc) {
        console.error(errOpc);
        alert("Error al re-crear opciones");
        return;
      }
    }

    await fetchEncuestas();
    setShowEditModal(false);
    setCurrentEncuesta(null);
  }

  async function handleDelete(id: number) {
    if (!confirm("¿Eliminar esta encuesta?")) return;
    const { error } = await supabase.from("encuesta").delete().eq("id", id);
    if (error) {
      console.error(error);
      alert("Error al eliminar");
    } else {
      setEncuestas((es) => es.filter((e) => e.id !== id));
    }
  }

  async function handleToggle(enc: Encuesta) {
    const next = enc.estado === "en_progreso" ? "expirada" : "en_progreso";
    const { error } = await supabase
      .from("encuesta")
      .update({ estado: next })
      .eq("id", enc.id);
    if (error) {
      console.error(error);
      alert("Error al cambiar estado");
    } else {
      fetchEncuestas();
    }
  }

  const active = encuestas.filter((e) => e.estado === "en_progreso");
  const expired = encuestas.filter((e) => e.estado === "expirada");

  if (loading) return <div className="loading">Cargando...</div>;

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Mis Encuestas</h1>
        <button
          className="create-button"
          onClick={() => setShowCreateModal(true)}
        >
          + Crear Nueva Encuesta
        </button>
      </div>

      <div className="tipo-info">
        <p>
          <strong>Opción única:</strong> Selección de una opción por inciso.
        </p>
        <p>
          <strong>Opción múltiple:</strong> Selección de varias opciones por
          inciso.
        </p>
      </div>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Crear Nueva Encuesta</h2>

            <div className="form-group">
              <label>Título *</label>
              <input
                type="text"
                value={newEncuesta.titulo}
                onChange={(e) =>
                  setNewEncuesta({ ...newEncuesta, titulo: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label>Descripción *</label>
              <textarea
                value={newEncuesta.descripcion}
                onChange={(e) =>
                  setNewEncuesta({
                    ...newEncuesta,
                    descripcion: e.target.value,
                  })
                }
              />
            </div>

            <div className="form-group">
              <label>Estado *</label>
              <select
                value={newEncuesta.estado}
                onChange={(e) =>
                  setNewEncuesta({
                    ...newEncuesta,
                    estado: e.target.value as Estado,
                  })
                }
              >
                <option value="en_progreso">En progreso</option>
                <option value="expirada">Expirada</option>
              </select>
            </div>

            {newEncuesta.incisos.map((inc, i) => (
              <div key={i} className="inciso-block">
                <div className="inciso-header">
                  <h3>Inciso #{i + 1}</h3>
                  {newEncuesta.incisos.length > 1 && (
                    <button
                      onClick={() => {
                        const copy = [...newEncuesta.incisos];
                        copy.splice(i, 1);
                        setNewEncuesta({ ...newEncuesta, incisos: copy });
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                <label>Texto del inciso *</label>
                <input
                  type="text"
                  value={inc.texto}
                  onChange={(e) => {
                    const copy = [...newEncuesta.incisos];
                    copy[i].texto = e.target.value;
                    setNewEncuesta({ ...newEncuesta, incisos: copy });
                  }}
                />

                <label>Tipo de inciso *</label>
                <select
                  value={inc.tipo_inciso}
                  onChange={(e) => {
                    const copy = [...newEncuesta.incisos];
                    copy[i].tipo_inciso = e.target.value as any;
                    setNewEncuesta({ ...newEncuesta, incisos: copy });
                  }}
                >
                  <option value="opcion_unica">Opción única</option>
                  <option value="opcion_multiple">Opción múltiple</option>
                </select>

                <div>
                  <strong>Opciones:</strong>
                  {inc.opciones.map((op, j) => (
                    <div key={j} className="opcion-input">
                      <input
                        type="text"
                        value={op.texto}
                        onChange={(e) => {
                          const copy = [...newEncuesta.incisos];
                          copy[i].opciones[j].texto = e.target.value;
                          setNewEncuesta({ ...newEncuesta, incisos: copy });
                        }}
                        placeholder={`Opción ${j + 1}`}
                      />
                      {j > 0 && (
                        <button
                          onClick={() => {
                            const copy = [...newEncuesta.incisos];
                            copy[i].opciones.splice(j, 1);
                            setNewEncuesta({ ...newEncuesta, incisos: copy });
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    className="add-opcion"
                    onClick={() => {
                      const copy = [...newEncuesta.incisos];
                      copy[i].opciones.push({ texto: "" });
                      setNewEncuesta({ ...newEncuesta, incisos: copy });
                    }}
                  >
                    + Añadir Opción
                  </button>
                </div>
              </div>
            ))}

            <button
              className="add-inciso"
              onClick={() =>
                setNewEncuesta({
                  ...newEncuesta,
                  incisos: [...newEncuesta.incisos, emptyInciso()],
                })
              }
            >
              + Añadir Inciso
            </button>

            <div className="modal-actions">
              <button onClick={() => setShowCreateModal(false)}>
                Cancelar
              </button>
              <button onClick={handleCreate}>Crear Encuesta</button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && currentEncuesta && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Editar Encuesta</h2>

            <div className="form-group">
              <label>Título *</label>
              <input
                type="text"
                value={newEncuesta.titulo}
                onChange={(e) =>
                  setNewEncuesta({ ...newEncuesta, titulo: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label>Descripción *</label>
              <textarea
                value={newEncuesta.descripcion}
                onChange={(e) =>
                  setNewEncuesta({
                    ...newEncuesta,
                    descripcion: e.target.value,
                  })
                }
              />
            </div>

            <div className="form-group">
              <label>Estado *</label>
              <select
                value={newEncuesta.estado}
                onChange={(e) =>
                  setNewEncuesta({
                    ...newEncuesta,
                    estado: e.target.value as Estado,
                  })
                }
              >
                <option value="en_progreso">En progreso</option>
                <option value="expirada">Expirada</option>
              </select>
            </div>

            {newEncuesta.incisos.map((inc, i) => (
              <div key={i} className="inciso-block">
                <div className="inciso-header">
                  <h3>Inciso #{i + 1}</h3>
                  {newEncuesta.incisos.length > 1 && (
                    <button
                      onClick={() => {
                        const copy = [...newEncuesta.incisos];
                        copy.splice(i, 1);
                        setNewEncuesta({ ...newEncuesta, incisos: copy });
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                <label>Texto del inciso *</label>
                <input
                  type="text"
                  value={inc.texto}
                  onChange={(e) => {
                    const copy = [...newEncuesta.incisos];
                    copy[i].texto = e.target.value;
                    setNewEncuesta({ ...newEncuesta, incisos: copy });
                  }}
                />

                <label>Tipo de inciso *</label>
                <select
                  value={inc.tipo_inciso}
                  onChange={(e) => {
                    const copy = [...newEncuesta.incisos];
                    copy[i].tipo_inciso = e.target.value as any;
                    setNewEncuesta({ ...newEncuesta, incisos: copy });
                  }}
                >
                  <option value="opcion_unica">Opción única</option>
                  <option value="opcion_multiple">Opción múltiple</option>
                </select>

                <div>
                  <strong>Opciones:</strong>
                  {inc.opciones.map((op, j) => (
                    <div key={j} className="opcion-input">
                      <input
                        type="text"
                        value={op.texto}
                        onChange={(e) => {
                          const copy = [...newEncuesta.incisos];
                          copy[i].opciones[j].texto = e.target.value;
                          setNewEncuesta({ ...newEncuesta, incisos: copy });
                        }}
                        placeholder={`Opción ${j + 1}`}
                      />
                      {j > 0 && (
                        <button
                          onClick={() => {
                            const copy = [...newEncuesta.incisos];
                            copy[i].opciones.splice(j, 1);
                            setNewEncuesta({ ...newEncuesta, incisos: copy });
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    className="add-opcion"
                    onClick={() => {
                      const copy = [...newEncuesta.incisos];
                      copy[i].opciones.push({ texto: "" });
                      setNewEncuesta({ ...newEncuesta, incisos: copy });
                    }}
                  >
                    + Añadir Opción
                  </button>
                </div>
              </div>
            ))}

            <button
              className="add-inciso"
              onClick={() =>
                setNewEncuesta({
                  ...newEncuesta,
                  incisos: [...newEncuesta.incisos, emptyInciso()],
                })
              }
            >
              + Añadir Inciso
            </button>

            <div className="modal-actions">
              <button onClick={() => setShowEditModal(false)}>Cancelar</button>
              <button onClick={handleUpdate}>Guardar Cambios</button>
            </div>
          </div>
        </div>
      )}

      <section className="votaciones-section">
        <h2 className="votaciones-section-activas">Encuestas Activas</h2>
        {active.length === 0 ? (
          <p className="no-votaciones">No hay encuestas activas</p>
        ) : (
          <div className="votaciones-grid">
            {active.map((e) => (
              <EncuestaCard
                key={e.id}
                encuesta={e}
                onEdit={() => handleEditClick(e)}
                onDelete={() => handleDelete(e.id)}
                onToggle={() => handleToggle(e)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="votaciones-section">
        <h2 className="votaciones-section-expiradas">Encuestas Expiradas</h2>
        {expired.length === 0 ? (
          <p className="no-votaciones">No hay encuestas expiradas</p>
        ) : (
          <div className="votaciones-grid">
            {expired.map((e) => (
              <EncuestaCard
                key={e.id}
                encuesta={e}
                onEdit={() => handleEditClick(e)}
                onDelete={() => handleDelete(e.id)}
                onToggle={() => handleToggle(e)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EncuestaCard({
  encuesta,
  onEdit,
  onDelete,
  onToggle,
}: {
  encuesta: Encuesta;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${baseUrl}/encuesta/${encuesta.token_link}`;

  const formatDate = (d: string) =>
    new Date(d).toLocaleString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="votacion-card">
      <div className="qr-container">
        <QRCode value={url} size={128} level="H" />
      </div>
      <div className="votacion-link">
        <a href={url} target="_blank" rel="noopener noreferrer">
          {url}
        </a>
      </div>
      <h3>{encuesta.titulo}</h3>
      <p className="descripcion">{encuesta.descripcion}</p>
      <div className="tipo-label">
        <strong>N.º incisos:</strong> {encuesta.inciso_encuesta.length}
      </div>
      <div className="fechas">
        <div>
          <strong>Creada:</strong> {formatDate(encuesta.fecha_inicio)}
        </div>
      </div>
      <div className={`state-label ${encuesta.estado}`}>
        <em>
          {encuesta.estado === "en_progreso" ? "En progreso" : "Expirada"}
        </em>
      </div>
      <div className="card-actions">
        <button className="edit-button" onClick={onEdit}>
          ✏️ Editar
        </button>
        <button className="toggle-button" onClick={onToggle}>
          {encuesta.estado === "en_progreso" ? "❌ Expirar" : "✅ Reactivar"}
        </button>
        <button className="delete-button" onClick={onDelete}>
          🗑️ Eliminar
        </button>
      </div>
      <a
        href={`/conteo-encuesta?encuesta=${encuesta.id}`}
        className="stats-button"
      >
        📊 Ver Estadísticas
      </a>
    </div>
  );
}
