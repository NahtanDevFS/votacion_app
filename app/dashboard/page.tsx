"use client";

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import "./Dashboard.css";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import { showLoadingAlert } from "@/lib/loadingAlerts";

type VotacionType = "opcion_unica" | "opcion_multiple";

interface Opcion {
  nombre: string;
  imagen?: File | null;
  imagen_url?: string | null;
  preview?: string;
}

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (!reader.result) return reject(new Error("Error reading file"));
      const img = new Image();
      img.src = reader.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        const width = img.width > MAX_WIDTH ? MAX_WIDTH : img.width;
        const scaleSize = width / img.width;
        const height = img.height * scaleSize;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("Canvas is empty"));
            const compressedFile = new File(
              [blob],
              file.name.replace(/\.[^.]+$/, ".jpg"),
              {
                type: "image/jpeg",
                lastModified: Date.now(),
              }
            );
            resolve(compressedFile);
          },
          "image/jpeg",
          0.6 // 60% quality
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

export default function DashboardPage() {
  const router = useRouter();
  const [votaciones, setVotaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentVotacion, setCurrentVotacion] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [newVotacion, setNewVotacion] = useState({
    titulo: "",
    descripcion: "",
    opciones: [""] as string[],
    opcionesConImagen: [] as Opcion[],
    estado: "en_progreso",
    tipo_votacion: "opcion_unica" as VotacionType,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const uploadImage = async (
    file: File,
    votacionId: number,
    opcionNombre: string
  ) => {
    // compress before upload
    const compressed = await compressImage(file);
    // ensure .jpg extension
    const fileName = `${votacionId}_${Math.random()
      .toString(36)
      .substring(2)}.jpg`;
    const filePath = fileName;

    const { data, error } = await supabase.storage
      .from("imgs")
      .upload(filePath, compressed);

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

  const handleCreateVotacion = async () => {
    if (isSubmitting) return; // Evitar múltiples envíos

    const loadingAlert = showLoadingAlert("Creando votación");

    setIsSubmitting(true);
    try {
      if (!newVotacion.titulo || !newVotacion.descripcion) {
        loadingAlert.close();
        Swal.fire({
          icon: "warning",
          title: "Campos incompletos",
          text: "Por favor complete todos los campos requeridos.",
          confirmButtonColor: "#6200ff",
        });
        return;
      }

      const opcionesValidas = newVotacion.opcionesConImagen.filter((o) =>
        o.nombre.trim()
      );
      if (opcionesValidas.length === 0) {
        loadingAlert.close();
        Swal.fire({
          icon: "warning",
          title: "Sin opciones",
          text: "Debe agregar al menos una opción de votación.",
          confirmButtonColor: "#6200ff",
        });
        return;
      }

      const now = new Date();
      const nowUTC = new Date(now.getTime()).toISOString();

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
        loadingAlert.close();
        alert("Error al crear la votación");
        return;
      }

      const votacionId = data[0].id;

      // Upload images and create options
      const opcionesConImagenes = await Promise.all(
        opcionesValidas.map(async (opcion) => {
          let imagen_url = null;
          if (opcion.imagen) {
            imagen_url = await uploadImage(
              opcion.imagen,
              votacionId,
              opcion.nombre
            );
          }
          return {
            votacion_id: votacionId,
            nombre: opcion.nombre.trim(),
            imagen_url,
            creado_en: new Date().toISOString(),
          };
        })
      );

      const { error: opcionesError } = await supabase
        .from("opcion_votacion")
        .insert(opcionesConImagenes);

      if (opcionesError) {
        console.error("Error creating opciones:", opcionesError);
        loadingAlert.close();
        alert("Error al crear las opciones de votación");
        return;
      }

      await fetchVotaciones();
      setShowCreateModal(false);
      setNewVotacion({
        titulo: "",
        descripcion: "",
        opciones: [""],
        opcionesConImagen: [],
        estado: "en_progreso",
        tipo_votacion: "opcion_unica",
      });

      loadingAlert.close();
      Swal.fire({
        icon: "success",
        title: "Votación creada",
        text: "Tu votación ha sido creada correctamente.",
        confirmButtonColor: "#6200ff",
      });
    } catch (error) {
      console.error("Error en handleCreateVotacion:", error);
      loadingAlert.close();
      Swal.fire({
        icon: "error",
        title: "Error",
        text:
          error instanceof Error
            ? error.message
            : "Ocurrió un error al crear la votación",
        confirmButtonColor: "#6200ff",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (votacion: any) => {
    setCurrentVotacion(votacion);
    setNewVotacion({
      titulo: votacion.titulo,
      descripcion: votacion.descripcion,
      opciones: votacion.opcion_votacion.map((op: any) => op.nombre),
      opcionesConImagen: votacion.opcion_votacion.map((op: any) => ({
        nombre: op.nombre,
        imagen_url: op.imagen_url,
        preview: op.imagen_url || undefined,
      })),
      estado: votacion.estado,
      tipo_votacion: votacion.tipo_votacion,
    });
    setShowEditModal(true);
  };

  const handleUpdateVotacion = async () => {
    if (isSubmitting) return;

    const loadingAlert = showLoadingAlert("Actualizando votación");

    setIsSubmitting(true);
    try {
      if (!newVotacion.titulo || !newVotacion.descripcion) {
        loadingAlert.close();
        Swal.fire({
          icon: "warning",
          title: "Campos incompletos",
          text: "Por favor complete todos los campos requeridos.",
          confirmButtonColor: "#6200ff",
        });
        return;
      }

      const opcionesValidas = newVotacion.opcionesConImagen.filter((o) =>
        o.nombre.trim()
      );
      if (opcionesValidas.length === 0) {
        loadingAlert.close();
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
        loadingAlert.close();
        Swal.fire({
          icon: "error",
          title: "Error",
          text: "No se pudo actualizar la votación.",
        });
        return;
      }

      // Get current options to compare and delete old images if needed
      const { data: currentOptions } = await supabase
        .from("opcion_votacion")
        .select("*")
        .eq("votacion_id", currentVotacion.id);

      // Delete old options
      await supabase
        .from("opcion_votacion")
        .delete()
        .eq("votacion_id", currentVotacion.id);

      // Upload new images and create options
      const opcionesConImagenes = await Promise.all(
        opcionesValidas.map(async (opcion) => {
          let imagen_url = opcion.imagen_url || null;

          // If there's a new image, upload it
          if (opcion.imagen) {
            // Delete old image if it exists
            if (opcion.imagen_url) {
              await deleteImage(opcion.imagen_url);
            }
            imagen_url = await uploadImage(
              opcion.imagen,
              currentVotacion.id,
              opcion.nombre
            );
          }

          return {
            votacion_id: currentVotacion.id,
            nombre: opcion.nombre.trim(),
            imagen_url,
            creado_en: new Date().toISOString(),
          };
        })
      );

      const { error: opcionesError } = await supabase
        .from("opcion_votacion")
        .insert(opcionesConImagenes);

      if (opcionesError) {
        console.error("Error updating opciones:", opcionesError);
        loadingAlert.close();
        Swal.fire({
          icon: "error",
          title: "Error",
          text: "No se pudo actualizar las opciones de votación.",
        });
        return;
      }

      // Clean up any images from deleted options
      if (currentOptions) {
        const deletedOptions = currentOptions.filter(
          (op: any) =>
            !opcionesValidas.some((newOp: any) => newOp.nombre === op.nombre)
        );

        await Promise.all(
          deletedOptions
            .filter((op: any) => op.imagen_url)
            .map((op: any) => deleteImage(op.imagen_url))
        );
      }

      await fetchVotaciones();
      setShowEditModal(false);
      setCurrentVotacion(null);
      loadingAlert.close();
      Swal.fire({
        icon: "success",
        title: "Votación actualizada",
        text: "Los cambios se han guardado correctamente.",
        confirmButtonColor: "#6200ff",
      });
    } catch (error) {
      console.error("Error inesperado:", error);
      loadingAlert.close();
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Ocurrió un error inesperado al actualizar la votación.",
      });
    } finally {
      setIsSubmitting(false); //Esto se ejecutará siempre, haya éxito o error
    }
  };

  const handleDeleteVotacion = async (id: number) => {
    if (deletingId !== null) return; //Evitar múltiples eliminaciones simultáneas
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

    setDeletingId(id); // Bloquear la encuesta que se está eliminando

    try {
      //primero obtiene las opciones para obtener las imágenes
      const { data: options } = await supabase
        .from("opcion_votacion")
        .select("imagen_url")
        .eq("votacion_id", id);

      if (options) {
        await Promise.all(
          options
            .filter((op: any) => op.imagen_url)
            .map((op: any) => deleteImage(op.imagen_url))
        );
      }

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
    } catch (error) {
      console.error(error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo eliminar la encuesta.",
      });
    } finally {
      setDeletingId(null); //Liberar el bloqueo
    }
  };

  const handleToggleState = async (v: any) => {
    if (deletingId !== null) return; //No permitir cambiar estado durante eliminación
    const newState = v.estado === "en_progreso" ? "expirada" : "en_progreso";
    try {
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
    } catch (error) {
      console.error("Error toggling estado:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo cambiar el estado.",
      });
    }
  };

  const handleImageChange = (index: number, file: File | null) => {
    const newOpciones = [...newVotacion.opcionesConImagen];

    if (!newOpciones[index]) {
      newOpciones[index] = { nombre: newVotacion.opciones[index] || "" };
    }

    if (file) {
      newOpciones[index] = {
        ...newOpciones[index],
        imagen: file,
        preview: URL.createObjectURL(file),
      };
    } else {
      //si el archivo es null, mantiene la imagen_existente si existe
      newOpciones[index] = {
        ...newOpciones[index],
        imagen: null,
        preview: newOpciones[index].imagen_url || undefined,
      };
    }

    setNewVotacion({
      ...newVotacion,
      opcionesConImagen: newOpciones,
    });
  };

  const handleRemoveImage = (index: number) => {
    const newOpciones = [...newVotacion.opcionesConImagen];

    if (newOpciones[index]) {
      newOpciones[index] = {
        ...newOpciones[index],
        imagen: null,
        imagen_url: null,
        preview: undefined,
      };
    }

    setNewVotacion({
      ...newVotacion,
      opcionesConImagen: newOpciones,
    });
  };

  const handleOpcionChange = (index: number, value: string) => {
    const newOpciones = [...newVotacion.opciones];
    newOpciones[index] = value;

    const newOpcionesConImagen = [...newVotacion.opcionesConImagen];
    if (!newOpcionesConImagen[index]) {
      newOpcionesConImagen[index] = { nombre: value };
    } else {
      newOpcionesConImagen[index] = {
        ...newOpcionesConImagen[index],
        nombre: value,
      };
    }

    setNewVotacion({
      ...newVotacion,
      opciones: newOpciones,
      opcionesConImagen: newOpcionesConImagen,
    });
  };

  const handleAddOpcion = () => {
    setNewVotacion({
      ...newVotacion,
      opciones: [...newVotacion.opciones, ""],
      opcionesConImagen: [...newVotacion.opcionesConImagen, { nombre: "" }],
    });
  };

  const handleRemoveOpcion = (index: number) => {
    const newOpciones = [...newVotacion.opciones];
    newOpciones.splice(index, 1);

    const newOpcionesConImagen = [...newVotacion.opcionesConImagen];
    newOpcionesConImagen.splice(index, 1);

    setNewVotacion({
      ...newVotacion,
      opciones: newOpciones,
      opcionesConImagen: newOpcionesConImagen,
    });
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
                <div key={index} className="opcion-input-container">
                  <div className="opcion-input">
                    <input
                      type="text"
                      value={opcion}
                      onChange={(e) =>
                        handleOpcionChange(index, e.target.value)
                      }
                      placeholder={`Opción ${index + 1}`}
                    />
                    {index > 0 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOpcion(index)}
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
                            index,
                            e.target.files ? e.target.files[0] : null
                          )
                        }
                        style={{ display: "none" }}
                      />
                      <span className="upload-button">
                        {newVotacion.opcionesConImagen[index]?.preview
                          ? "Cambiar imagen"
                          : "Agregar imagen"}
                      </span>
                    </label>
                    {newVotacion.opcionesConImagen[index]?.preview && (
                      <>
                        <div className="image-preview-container">
                          <img
                            src={newVotacion.opcionesConImagen[index]?.preview}
                            alt="Preview"
                            className="image-preview"
                            style={{ width: "30px", height: "30px" }}
                          />
                        </div>
                        <button
                          type="button"
                          className="remove-image-button"
                          onClick={() => handleRemoveImage(index)}
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="add-opcion"
                onClick={handleAddOpcion}
              >
                + Añadir Opción
              </button>
            </div>
            <div className="modal-actions">
              <button
                onClick={() => setShowCreateModal(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button onClick={handleCreateVotacion} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <span className="spinner"></span> Creando...
                  </>
                ) : (
                  "Crear Votación"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editar Modal */}
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
                <div key={index} className="opcion-input-container">
                  <div className="opcion-input">
                    <input
                      type="text"
                      value={opcion}
                      onChange={(e) =>
                        handleOpcionChange(index, e.target.value)
                      }
                      placeholder={`Opción ${index + 1}`}
                    />
                    {index > 0 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOpcion(index)}
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
                            index,
                            e.target.files ? e.target.files[0] : null
                          )
                        }
                        style={{ display: "none" }}
                      />
                      <span className="upload-button">
                        {newVotacion.opcionesConImagen[index]?.preview
                          ? "Cambiar imagen"
                          : "Agregar imagen"}
                      </span>
                    </label>
                    {newVotacion.opcionesConImagen[index]?.preview && (
                      <>
                        <div className="image-preview-container">
                          <img
                            src={newVotacion.opcionesConImagen[index]?.preview}
                            alt="Preview"
                            className="image-preview"
                            style={{ width: "30px", height: "30px" }}
                          />
                        </div>
                        <button
                          type="button"
                          className="remove-image-button"
                          onClick={() => handleRemoveImage(index)}
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="add-opcion"
                onClick={handleAddOpcion}
              >
                + Añadir Opción
              </button>
            </div>
            <div className="modal-actions">
              <button
                onClick={() => setShowEditModal(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button onClick={handleUpdateVotacion} disabled={isSubmitting}>
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
        <h2 className="votaciones-section-activas">Votaciones Activas</h2>
        {votacionesActivas.length === 0 ? (
          <p className="no-votaciones">No hay votaciones en progreso</p>
        ) : (
          <div className="votaciones-grid">
            {votacionesActivas.map((v) => (
              <VotacionCard
                key={v.id}
                votacion={v}
                //onDelete={handleDeleteVotacion}
                //onEdit={handleEditClick}
                //onToggleState={handleToggleState}
                deletingId={deletingId} // Nueva prop
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
                //onDelete={handleDeleteVotacion}
                //onEdit={handleEditClick}
                //onToggleState={handleToggleState}
                deletingId={deletingId} // Nueva prop
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
  deletingId,
}: {
  votacion: any;
  deletingId: number | null;
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

  return (
    <div className="votacion-card">
      <div className="tipo-label">
        <strong>Tipo de votación:</strong>{" "}
        {votacion.tipo_votacion === "opcion_unica"
          ? "Opción única"
          : "Opción múltiple"}
      </div>

      <h3>{votacion.titulo}</h3>
      <p className="descripcion">{votacion.descripcion}</p>
      <div className={`state-label ${votacion.estado}`}>
        <em>
          {votacion.estado === "en_progreso" ? "En progreso" : "Expirada"}
        </em>
      </div>

      <div className="fechas">
        <div>
          <strong>Creada:</strong> {formatDate(votacion.fecha_inicio)}
        </div>
      </div>

      <div className="opciones">
        <strong>Opciones:</strong>
        <ul>
          {votacion.opcion_votacion?.map((op: any) => (
            <li key={op.id}>
              {op.imagen_url && (
                <img
                  src={op.imagen_url}
                  alt={op.nombre}
                  style={{
                    width: "30px",
                    height: "30px",
                    marginRight: "8px",
                  }}
                />
              )}
              {op.nombre}
            </li>
          ))}
        </ul>
      </div>

      <a
        href={`/conteo?votacion=${votacion.id}`}
        className={`stats-button ${deletingId !== null ? "disabled" : ""}`}
        onClick={(e) => {
          if (deletingId !== null) {
            e.preventDefault();
          }
        }}
      >
        Ver detalle de votación
      </a>
    </div>
  );
}
