"use client";

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import "./Dashboard_encuesta.css";

type Estado = "en_progreso" | "expirada";

interface Opcion {
  id?: number;
  texto: string;
  imagen?: File | null;
  imagen_url?: string | null;
  preview?: string;
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
    opcion_encuesta: Array<{
      id: number;
      texto: string;
      imagen_url: string | null;
    }>;
  }>;
}

export default function DashboardEncuestaPage() {
  const router = useRouter();
  const [encuestas, setEncuestas] = useState<Encuesta[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentEncuesta, setCurrentEncuesta] = useState<Encuesta | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

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

  // Función para subir imágenes al bucket
  const uploadImage = async (
    file: File,
    encuestaId: number,
    opcionTexto: string
  ) => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${encuestaId}_${Math.random()}.${fileExt}`.replace(
      /\s+/g,
      "_"
    );
    const filePath = `${fileName}`;

    const { data, error } = await supabase.storage
      .from("imgs")
      .upload(filePath, file);

    if (error) {
      console.error("Error uploading image:", error);
      return null;
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("imgs").getPublicUrl(filePath);

    return publicUrl;
  };

  // Función para eliminar imágenes
  const deleteImage = async (imageUrl: string) => {
    const fileName = imageUrl.split("/").pop();
    if (!fileName) return false;

    const { error } = await supabase.storage.from("imgs").remove([fileName]);

    if (error) {
      console.error("Error deleting image:", error);
      return false;
    }

    return true;
  };

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

  // Manejar cambio de imagen para una opción
  const handleImageChange = (
    incisoIndex: number,
    opcionIndex: number,
    file: File | null
  ) => {
    const newIncisos = [...newEncuesta.incisos];

    if (file) {
      newIncisos[incisoIndex].opciones[opcionIndex] = {
        ...newIncisos[incisoIndex].opciones[opcionIndex],
        imagen: file,
        preview: URL.createObjectURL(file),
      };
    } else {
      // Si file es null (removido), mantener la imagen_url existente si existe
      newIncisos[incisoIndex].opciones[opcionIndex] = {
        ...newIncisos[incisoIndex].opciones[opcionIndex],
        imagen: null,
        preview:
          newIncisos[incisoIndex].opciones[opcionIndex].imagen_url || undefined,
      };
    }

    setNewEncuesta({
      ...newEncuesta,
      incisos: newIncisos,
    });
  };

  // Remover imagen de una opción
  const handleRemoveImage = (incisoIndex: number, opcionIndex: number) => {
    const newIncisos = [...newEncuesta.incisos];
    newIncisos[incisoIndex].opciones[opcionIndex] = {
      ...newIncisos[incisoIndex].opciones[opcionIndex],
      imagen: null,
      imagen_url: null,
      preview: undefined,
    };

    setNewEncuesta({
      ...newEncuesta,
      incisos: newIncisos,
    });
  };

  async function handleCreate() {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      if (!newEncuesta.titulo.trim() || !newEncuesta.descripcion.trim()) {
        Swal.fire({
          icon: "warning",
          title: "Campos incompletos",
          text: "Completa título y descripción",
          confirmButtonColor: "#6200ff",
        });
        return;
      }
      for (const inc of newEncuesta.incisos) {
        if (!inc.texto.trim()) {
          Swal.fire({
            icon: "warning",
            title: "Inciso vacío",
            text: "Cada inciso debe tener texto",
            confirmButtonColor: "#6200ff",
          });
          return;
        }
        if (!inc.opciones.some((o) => o.texto.trim())) {
          Swal.fire({
            icon: "warning",
            title: "Opciones faltantes",
            text: "Cada inciso necesita al menos una opción",
            confirmButtonColor: "#6200ff",
          });
          return;
        }
      }

      const nowUTC = new Date(Date.now()).toISOString();
      const user = JSON.parse(localStorage.getItem("admin") || "{}");
      const token_link = generateToken();

      // Insert encuesta
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
        Swal.fire({
          icon: "error",
          title: "Error",
          text: "Error al crear encuesta",
        });
        return;
      }

      // Insert incisos + opciones
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
          Swal.fire({
            icon: "error",
            title: "Error",
            text: "Error al crear incisos",
          });
          return;
        }

        // Subir imágenes y crear opciones
        const opcionesPayload = await Promise.all(
          inc.opciones
            .filter((o) => o.texto.trim())
            .map(async (op) => {
              let imagen_url = null;
              if (op.imagen) {
                imagen_url = await uploadImage(
                  op.imagen,
                  encuestaCreated.id,
                  op.texto
                );
              }
              return {
                inciso_id: incCreated.id,
                texto: op.texto,
                imagen_url,
              };
            })
        );

        const { error: errOpc } = await supabase
          .from("opcion_encuesta")
          .insert(opcionesPayload);
        if (errOpc) {
          console.error(errOpc);
          Swal.fire({
            icon: "error",
            title: "Error",
            text: "Error al crear opciones",
          });
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
      Swal.fire({
        icon: "success",
        title: "Encuesta creada",
        text: "Tu encuesta se ha creado correctamente.",
        confirmButtonColor: "#6200ff",
      });
    } catch (error) {
      console.error("Error en handleCreate:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text:
          error instanceof Error ? error.message : "Error al crear la encuesta",
        confirmButtonColor: "#6200ff",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // Update
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
          imagen_url: op.imagen_url,
          preview: op.imagen_url || undefined,
        })),
      })),
    });
    setShowEditModal(true);
  }

  async function handleUpdate() {
    if (isSubmitting || !currentEncuesta) return;
    setIsSubmitting(true);
    try {
      if (!currentEncuesta) return;
      if (!newEncuesta.titulo.trim() || !newEncuesta.descripcion.trim()) {
        Swal.fire({
          icon: "warning",
          title: "Campos incompletos",
          text: "Completa título y descripción",
          confirmButtonColor: "#6200ff",
        });
        return;
      }
      for (const inc of newEncuesta.incisos) {
        if (!inc.texto.trim()) {
          Swal.fire({
            icon: "warning",
            title: "Inciso vacío",
            text: "Cada inciso debe tener texto",
            confirmButtonColor: "#6200ff",
          });
          return;
        }
        if (!inc.opciones.some((o) => o.texto.trim())) {
          Swal.fire({
            icon: "warning",
            title: "Opciones faltantes",
            text: "Cada inciso necesita al menos una opción",
            confirmButtonColor: "#6200ff",
          });
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
        Swal.fire({
          icon: "error",
          title: "Error",
          text: "Error al actualizar encuesta",
        });
        return;
      }

      // Obtener opciones actuales para limpiar imágenes si es necesario
      const { data: currentOptions } = await supabase
        .from("opcion_encuesta")
        .select("*")
        .eq("inciso_id", currentEncuesta.inciso_encuesta[0].id);

      // Eliminar incisos y opciones existentes
      await supabase
        .from("inciso_encuesta")
        .delete()
        .eq("encuesta_id", currentEncuesta.id);

      // Crear nuevos incisos y opciones
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
          Swal.fire({
            icon: "error",
            title: "Error",
            text: "Error al re-crear incisos",
          });
          return;
        }

        // Subir imágenes y crear opciones
        const opcionesPayload = await Promise.all(
          inc.opciones
            .filter((o) => o.texto.trim())
            .map(async (op) => {
              let imagen_url = op.imagen_url || null;

              // Si hay una nueva imagen, subirla
              if (op.imagen) {
                // Eliminar imagen anterior si existe
                if (op.imagen_url) {
                  await deleteImage(op.imagen_url);
                }
                imagen_url = await uploadImage(
                  op.imagen,
                  currentEncuesta.id,
                  op.texto
                );
              }

              return {
                inciso_id: incCreated.id,
                texto: op.texto,
                imagen_url,
              };
            })
        );

        const { error: errOpc } = await supabase
          .from("opcion_encuesta")
          .insert(opcionesPayload);
        if (errOpc) {
          console.error(errOpc);
          Swal.fire({
            icon: "error",
            title: "Error",
            text: "Error al re-crear opciones",
          });
          return;
        }
      }

      // Limpiar imágenes de opciones eliminadas
      if (currentOptions) {
        const deletedOptions = currentOptions.filter(
          (op: any) =>
            !newEncuesta.incisos
              .flatMap((inc) => inc.opciones)
              .some((newOp) => newOp.id === op.id)
        );

        await Promise.all(
          deletedOptions
            .filter((op: any) => op.imagen_url)
            .map((op: any) => deleteImage(op.imagen_url))
        );
      }

      await fetchEncuestas();
      setShowEditModal(false);
      setCurrentEncuesta(null);

      Swal.fire({
        icon: "success",
        title: "Encuesta actualizada",
        text: "Los cambios se guardaron correctamente.",
        confirmButtonColor: "#6200ff",
      });
    } catch (error) {
      console.error("Error en handleUpdate:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text:
          error instanceof Error
            ? error.message
            : "Error al actualizar la encuesta",
        confirmButtonColor: "#6200ff",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (deletingId !== null) return; // Evitar múltiples eliminaciones simultáneas
    const result = await Swal.fire({
      title: "¿Estás seguro?",
      text: "Esta acción eliminará la encuesta.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#d63031",
      cancelButtonColor: "#6200ff",
    });
    if (!result.isConfirmed) return;

    setDeletingId(id); // Bloquear la encuesta que se está eliminando

    try {
      // Primero obtener opciones para eliminar sus imágenes
      const { data: options } = await supabase
        .from("opcion_encuesta")
        .select("imagen_url")
        .eq("inciso_id", id);

      if (options) {
        await Promise.all(
          options
            .filter((op: any) => op.imagen_url)
            .map((op: any) => deleteImage(op.imagen_url))
        );
      }

      const { error } = await supabase.from("encuesta").delete().eq("id", id);
      if (error) {
        console.error(error);
        Swal.fire({
          icon: "error",
          title: "Error",
          text: "No se pudo eliminar la encuesta.",
        });
      } else {
        setEncuestas((es) => es.filter((e) => e.id !== id));
        Swal.fire({
          icon: "success",
          title: "Eliminada",
          text: "La encuesta fue eliminada.",
          confirmButtonColor: "#6200ff",
        });
      }
    } catch (error) {
      console.error(error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo eliminar la encuesta.",
      });
    } finally {
      setDeletingId(null); // Liberar el bloqueo
    }
  }

  async function handleToggle(enc: Encuesta) {
    if (deletingId !== null) return; // No permitir cambiar estado durante eliminación
    const next = enc.estado === "en_progreso" ? "expirada" : "en_progreso";

    try {
      const { error } = await supabase
        .from("encuesta")
        .update({ estado: next })
        .eq("id", enc.id);
      if (error) {
        console.error(error);
        Swal.fire({
          icon: "error",
          title: "Error",
          text: "No se pudo cambiar el estado.",
        });
      } else {
        fetchEncuestas();
        Swal.fire({
          icon: "success",
          title: "Cambiada",
          text: "La encuesta fue cambiada de estado",
          confirmButtonColor: "#6200ff",
        });
      }
    } catch (error) {
      console.error(error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo cambiar el estado.",
      });
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
                    <div key={j} className="opcion-input-container">
                      <div className="opcion-input">
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
                      <div className="image-upload-container">
                        <label className="image-upload-label">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) =>
                              handleImageChange(
                                i,
                                j,
                                e.target.files ? e.target.files[0] : null
                              )
                            }
                            style={{ display: "none" }}
                          />
                          <span className="upload-button">
                            {op.preview ? "Cambiar imagen" : "Agregar imagen"}
                          </span>
                        </label>
                        {op.preview && (
                          <>
                            <div className="image-preview-container">
                              <img
                                src={op.preview}
                                alt="Preview"
                                className="image-preview"
                                style={{ width: "30px", height: "30px" }}
                              />
                            </div>
                            <button
                              type="button"
                              className="remove-image-button"
                              onClick={() => handleRemoveImage(i, j)}
                            >
                              ✕
                            </button>
                          </>
                        )}
                      </div>
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
              <button
                onClick={() => setShowCreateModal(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button onClick={handleCreate} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <span className="spinner"></span> Creando...
                  </>
                ) : (
                  "Crear Encuesta"
                )}
              </button>
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
                    <div key={j} className="opcion-input-container">
                      <div className="opcion-input">
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
                      <div className="image-upload-container">
                        <label className="image-upload-label">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) =>
                              handleImageChange(
                                i,
                                j,
                                e.target.files ? e.target.files[0] : null
                              )
                            }
                            style={{ display: "none" }}
                          />
                          <span className="upload-button">
                            {op.preview ? "Cambiar imagen" : "Agregar imagen"}
                          </span>
                        </label>
                        {op.preview && (
                          <>
                            <div className="image-preview-container">
                              <img
                                src={op.preview}
                                alt="Preview"
                                className="image-preview"
                                style={{ width: "30px", height: "30px" }}
                              />
                            </div>
                            <button
                              type="button"
                              className="remove-image-button"
                              onClick={() => handleRemoveImage(i, j)}
                            >
                              ✕
                            </button>
                          </>
                        )}
                      </div>
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
              <button
                onClick={() => setShowEditModal(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button onClick={handleUpdate} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <span className="spinner"></span> Guardando...
                  </>
                ) : (
                  "Guardar Cambios"
                )}
              </button>
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
                deletingId={deletingId} // Añade esta línea
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
                deletingId={deletingId} // Añade esta línea
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
  deletingId, // Añade esta línea
}: {
  encuesta: Encuesta;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  deletingId: number | null; // Añade esta línea
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

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(encuesta.token_link);
      Swal.fire({
        icon: "success",
        title: "Código copiado",
        text: `Códido "${encuesta.token_link}" copiado al portapapeles.`,
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
        <QRCode value={url} size={128} level="H" />
      </div>
      <div className="votacion-link">
        <a href={url} target="_blank" rel="noopener noreferrer">
          {url}
        </a>
      </div>
      <div className="votacion-code">
        <div className="votacion-code-title">Código de encuesta: </div>
        <div className="votacion-code-container">
          <code className="code-text">{encuesta.token_link}</code>
          <button className="copy-button" onClick={copyCode}>
            Copiar
          </button>
        </div>
      </div>
      <h3>{encuesta.titulo}</h3>
      <p className="descripcion">{encuesta.descripcion}</p>
      <div className="tipo-label">
        <strong>N. incisos:</strong> {encuesta.inciso_encuesta.length}
      </div>
      <div className="fechas">
        <div>
          <strong>Creada:</strong> {formatDate(encuesta.fecha_inicio)}
        </div>
      </div>
      <div className="opciones-preview">
        <strong>Opciones:</strong>
        <ul>
          {encuesta.inciso_encuesta[0]?.opcion_encuesta
            ?.slice(0, 3)
            .map((op) => (
              <li key={op.id}>
                {op.imagen_url && (
                  <img
                    src={op.imagen_url}
                    alt={op.texto}
                    style={{
                      width: "30px",
                      height: "30px",
                      marginRight: "8px",
                    }}
                  />
                )}
                {op.texto}
              </li>
            ))}
          {encuesta.inciso_encuesta[0]?.opcion_encuesta?.length > 3 && (
            <li>
              +{encuesta.inciso_encuesta[0].opcion_encuesta.length - 3} más...
            </li>
          )}
        </ul>
      </div>
      <div className={`state-label ${encuesta.estado}`}>
        <em>
          {encuesta.estado === "en_progreso" ? "En progreso" : "Expirada"}
        </em>
      </div>
      <div className="card-actions">
        <button
          className="edit-button"
          onClick={onEdit}
          disabled={deletingId === encuesta.id}
        >
          ✏️ Editar
        </button>
        <button
          className="toggle-button"
          onClick={onToggle}
          disabled={deletingId === encuesta.id || deletingId !== null}
        >
          {encuesta.estado === "en_progreso" ? "❌ Expirar" : "✅ Reactivar"}
        </button>
        <button
          className="delete-button"
          onClick={onDelete}
          disabled={deletingId !== null} // Deshabilitar todos los botones de eliminar durante cualquier eliminación
        >
          {deletingId === encuesta.id ? (
            <span className="spinner small"></span>
          ) : (
            "🗑️ Eliminar"
          )}
        </button>
      </div>
      <a
        href={`/conteo-encuesta?encuesta=${encuesta.id}`}
        className={`stats-button ${deletingId !== null ? "disabled" : ""}`}
        onClick={(e) => {
          if (deletingId !== null) {
            e.preventDefault();
          }
        }}
      >
        Ver Estadísticas
      </a>
    </div>
  );
}
