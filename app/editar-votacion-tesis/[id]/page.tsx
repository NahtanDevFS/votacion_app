// app/editar-votacion-tesis/[id]/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Swal from "sweetalert2";
import { v4 as uuidv4 } from "uuid";
import "./EditarVotacionTesis.css";

// --- Interfaces de Tipos de Datos ---
interface JuradoDisponible {
  id: number;
  nombre_completo: string;
}
interface ImagenExistente {
  id: number;
  url_imagen: string;
}
interface ImagenNueva {
  file: File;
  preview: string;
  fileName: string;
}

const reduceImageSize = (file: File, maxSize: number = 800): Promise<File> => {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    const canvas = document.createElement("canvas");
    const reader = new FileReader();
    reader.onload = (e) => {
      if (!e.target?.result)
        return reject(new Error("No se pudo leer el archivo."));
      img.src = e.target.result as string;
    };
    img.onload = () => {
      let { width, height } = img;
      if (width > height) {
        if (width > maxSize) {
          height *= maxSize / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width *= maxSize / height;
          height = maxSize;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx)
        return reject(new Error("No se pudo obtener el contexto del canvas."));
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("No se pudo crear el blob."));
          resolve(
            new File([blob], file.name, {
              type: "image/jpeg",
              lastModified: Date.now(),
            })
          );
        },
        "image/jpeg",
        0.85
      );
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export default function EditarVotacionTesisPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [nombreTesista, setNombreTesista] = useState("");
  const [tituloTesis, setTituloTesis] = useState("");
  const [descripcion, setDescripcion] = useState("");

  // --- MODIFICADO: Estados para la duración ---
  const [duracionValor, setDuracionValor] = useState(0);
  const [duracionUnidad, setDuracionUnidad] = useState<"minutos" | "segundos">(
    "minutos"
  );

  const [juradosDisponibles, setJuradosDisponibles] = useState<
    JuradoDisponible[]
  >([]);
  const [juradosSeleccionados, setJuradosSeleccionados] = useState<Set<number>>(
    new Set()
  );
  const [initialJurados, setInitialJurados] = useState<Set<number>>(new Set());
  const [imagenesExistentes, setImagenesExistentes] = useState<
    ImagenExistente[]
  >([]);
  const [imagenesNuevas, setImagenesNuevas] = useState<ImagenNueva[]>([]);
  const [imagenesAEliminar, setImagenesAEliminar] = useState<Set<number>>(
    new Set()
  );
  const [reiniciarVotacion, setReiniciarVotacion] = useState(false);

  const loadVotacionData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: votacionData, error: votacionError } = await supabase
        .from("votacion_tesis")
        .select("*, imagen_votacion_tesis(*)")
        .eq("id", id)
        .single();
      if (votacionError) throw new Error("No se pudo cargar la votación.");

      setTitulo(votacionData.titulo);
      setNombreTesista(votacionData.nombre_tesista || "");
      setTituloTesis(votacionData.titulo_tesis || "");
      setDescripcion(votacionData.descripcion || "");

      // --- MODIFICADO: Lógica para establecer la duración y unidad ---
      const totalSegundos = votacionData.duracion_segundos;
      if (totalSegundos > 0 && totalSegundos % 60 === 0) {
        setDuracionValor(totalSegundos / 60);
        setDuracionUnidad("minutos");
      } else {
        setDuracionValor(totalSegundos);
        setDuracionUnidad("segundos");
      }

      setImagenesExistentes(votacionData.imagen_votacion_tesis || []);

      const { data: juradosAsignadosData, error: juradosError } = await supabase
        .from("jurado_por_votacion")
        .select("participante_id")
        .eq("votacion_tesis_id", id);
      if (juradosError) throw juradosError;

      const selectedIds = new Set(
        juradosAsignadosData.map((j) => j.participante_id)
      );
      setJuradosSeleccionados(selectedIds);
      setInitialJurados(selectedIds);

      const { data: juradosDisponiblesData, error: juradosDispError } =
        await supabase
          .from("participantes")
          .select("id, nombre_completo")
          .eq("rol_general", "jurado");
      if (juradosDispError) throw juradosDispError;
      setJuradosDisponibles(juradosDisponiblesData);
    } catch (error: any) {
      Swal.fire(
        "Error",
        `No se pudieron cargar los datos para editar: ${error.message}`,
        "error"
      );
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    loadVotacionData();
  }, [loadVotacionData]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Swal.fire({
        title: "Procesando imágenes...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });
      const processedImages = await Promise.all(
        Array.from(e.target.files).map(async (file) => {
          try {
            const resizedFile = await reduceImageSize(file);
            return {
              file: resizedFile,
              preview: URL.createObjectURL(resizedFile),
              fileName: `tesis-${uuidv4()}.jpg`,
            };
          } catch (error) {
            console.error("Error procesando imagen:", error);
            return null;
          }
        })
      );
      Swal.close();
      setImagenesNuevas((prev) => [
        ...prev,
        ...(processedImages.filter(Boolean) as ImagenNueva[]),
      ]);
    }
  };

  const handleRemoveNuevaImagen = (fileNameToRemove: string) => {
    setImagenesNuevas((prev) =>
      prev.filter((img) => img.fileName !== fileNameToRemove)
    );
  };

  const handleMarcarParaEliminar = (imagenId: number) => {
    setImagenesAEliminar((prev) => new Set(prev).add(imagenId));
    setImagenesExistentes((prev) => prev.filter((img) => img.id !== imagenId));
  };

  const handleJuradoSelection = (juradoId: number) => {
    setJuradosSeleccionados((prev) => {
      const newSelection = new Set(prev);
      if (newSelection.has(juradoId)) {
        newSelection.delete(juradoId);
      } else {
        newSelection.add(juradoId);
      }
      return newSelection;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    Swal.fire({
      title: "Actualizando Votación...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      if (reiniciarVotacion) {
        const { error } = await supabase
          .from("voto_tesis")
          .delete()
          .eq("votacion_tesis_id", id);
        if (error)
          throw new Error(`Error al reiniciar los votos: ${error.message}`);
      }

      // --- MODIFICADO: Cálculo de la duración en segundos ---
      const duracionEnSegundos =
        duracionUnidad === "minutos" ? duracionValor * 60 : duracionValor;

      const updatePayload: any = {
        titulo,
        nombre_tesista: nombreTesista,
        titulo_tesis: tituloTesis,
        descripcion,
        duracion_segundos: duracionEnSegundos,
      };
      if (reiniciarVotacion) {
        updatePayload.estado = "inactiva";
        updatePayload.fecha_activacion = null;
      }
      const { error: updateError } = await supabase
        .from("votacion_tesis")
        .update(updatePayload)
        .eq("id", id);
      if (updateError)
        throw new Error(`Error al actualizar detalles: ${updateError.message}`);

      const juradosAAgregar = [...juradosSeleccionados].filter(
        (jId) => !initialJurados.has(jId)
      );
      const juradosAEliminar = [...initialJurados].filter(
        (jId) => !juradosSeleccionados.has(jId)
      );
      if (juradosAAgregar.length > 0) {
        const { error } = await supabase.from("jurado_por_votacion").insert(
          juradosAAgregar.map((pId) => ({
            votacion_tesis_id: id,
            participante_id: pId,
          }))
        );
        if (error)
          throw new Error(`Error al agregar jurados: ${error.message}`);
      }
      if (juradosAEliminar.length > 0) {
        const { error } = await supabase
          .from("jurado_por_votacion")
          .delete()
          .eq("votacion_tesis_id", id)
          .in("participante_id", juradosAEliminar);
        if (error)
          throw new Error(`Error al eliminar jurados: ${error.message}`);
      }

      if (imagenesAEliminar.size > 0) {
        /* Lógica para eliminar imágenes... */
      }
      if (imagenesNuevas.length > 0) {
        /* Lógica para añadir imágenes... */
      }

      Swal.fire("¡Éxito!", "La votación ha sido actualizada.", "success");
      router.push(`/conteo-votacion-tesis/${id}`);
    } catch (error: any) {
      Swal.fire("Error", error.message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading)
    return <div className="loading">Cargando datos de la votación...</div>;

  return (
    <div className="form-container-tesis">
      <h1 className="form-title-tesis">Editar Votación de Tesis</h1>
      <form onSubmit={handleSubmit} className="form-grid-tesis">
        <div className="form-column">
          <div className="form-group">
            <label htmlFor="titulo">Título de la Votación*</label>
            <input
              id="titulo"
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="nombreTesista">Nombre del Tesista</label>
            <input
              id="nombreTesista"
              type="text"
              value={nombreTesista}
              onChange={(e) => setNombreTesista(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="tituloTesis">Título de la Tesis</label>
            <input
              id="tituloTesis"
              type="text"
              value={tituloTesis}
              onChange={(e) => setTituloTesis(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="descripcion">Descripción</label>
            <textarea
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={4}
            ></textarea>
          </div>

          {/* --- MODIFICADO: Grupo de input para la duración --- */}
          <div className="form-group">
            <label htmlFor="duracion">Duración*</label>
            <div className="input-group">
              <input
                id="duracion"
                type="number"
                value={duracionValor}
                onChange={(e) => setDuracionValor(Number(e.target.value))}
                min="1"
                required
              />
              <select
                value={duracionUnidad}
                onChange={(e) =>
                  setDuracionUnidad(e.target.value as "minutos" | "segundos")
                }
                aria-label="Unidad de duración"
              >
                <option value="minutos">Minutos</option>
                <option value="segundos">Segundos</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Imágenes del Proyecto</label>
            <div className="image-preview-container">
              {imagenesExistentes.map((img) => (
                <div key={img.id} className="image-preview-wrapper">
                  <img
                    src={img.url_imagen}
                    alt="preview existente"
                    className="image-preview"
                  />
                  <button
                    type="button"
                    onClick={() => handleMarcarParaEliminar(img.id)}
                    className="remove-image-btn"
                  >
                    ×
                  </button>
                </div>
              ))}
              {imagenesNuevas.map((img) => (
                <div key={img.fileName} className="image-preview-wrapper">
                  <img
                    src={img.preview}
                    alt="preview nueva"
                    className="image-preview"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveNuevaImagen(img.fileName)}
                    className="remove-image-btn"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <input
              id="imagenes"
              type="file"
              multiple
              onChange={handleImageChange}
              accept="image/*"
              className="file-input"
            />
          </div>
        </div>

        <div className="form-column">
          <div className="participantes-section">
            <h2>Asignar Jurados*</h2>
            <div className="jurados-list">
              {juradosDisponibles.map((jurado) => (
                <label key={jurado.id} className="jurado-item">
                  <input
                    type="checkbox"
                    checked={juradosSeleccionados.has(jurado.id)}
                    onChange={() => handleJuradoSelection(jurado.id)}
                  />
                  {jurado.nombre_completo}
                </label>
              ))}
            </div>
          </div>
          <div className="detalle-card danger-zone">
            <h3>Zona de Peligro</h3>
            <label className="checkbox-label-reiniciar">
              <input
                type="checkbox"
                checked={reiniciarVotacion}
                onChange={(e) => setReiniciarVotacion(e.target.checked)}
              />
              <span>
                Reiniciar Votación (Borrar todos los votos y poner como
                inactiva)
              </span>
            </label>
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            onClick={() => router.back()}
            className="cancel-button"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="submit-button-tesis"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Guardando..." : "Guardar Cambios"}
          </button>
        </div>
      </form>
    </div>
  );
}
