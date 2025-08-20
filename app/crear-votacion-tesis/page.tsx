// pages/dashboard/tesis/crear/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { v4 as uuidv4 } from "uuid";
import "./CrearVotacionTesis.css";

// --- INICIO DE LÓGICA DE IMÁGENES ADAPTADA ---

/**
 * Función para reducir el tamaño de una imagen antes de subirla.
 * @param file - El archivo de imagen original.
 * @param maxSize - El tamaño máximo (ancho o alto) en píxeles.
 * @returns Una promesa que se resuelve con el nuevo archivo de imagen comprimido.
 */
const reduceImageSize = (file: File, maxSize: number = 800): Promise<File> => {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    const canvas = document.createElement("canvas");
    const reader = new FileReader();

    reader.onload = (e) => {
      if (!e.target?.result) {
        return reject(new Error("No se pudo leer el archivo."));
      }
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
      if (!ctx) {
        return reject(new Error("No se pudo obtener el contexto del canvas."));
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            return reject(new Error("No se pudo crear el blob."));
          }
          const newFile = new File([blob], file.name, {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
          resolve(newFile);
        },
        "image/jpeg",
        0.85
      ); // Calidad de compresión del 85%
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// --- FIN DE LÓGICA DE IMÁGENES ---

// Tipos para manejar los datos del formulario
interface JuradoDisponible {
  id: number;
  nombre_completo: string;
}

interface ImagenConPreview {
  file: File; // El archivo ya redimensionado
  preview: string;
  fileName: string; // El nombre único que tendrá en el bucket
}

export default function CrearVotacionTesisPage() {
  const router = useRouter();
  const [titulo, setTitulo] = useState("");
  const [nombreTesista, setNombreTesista] = useState("");
  const [tituloTesis, setTituloTesis] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [duracionMinutos, setDuracionMinutos] = useState(5);
  const [imagenes, setImagenes] = useState<ImagenConPreview[]>([]);
  const [juradosDisponibles, setJuradosDisponibles] = useState<
    JuradoDisponible[]
  >([]);
  const [juradosSeleccionados, setJuradosSeleccionados] = useState<Set<number>>(
    new Set()
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchJurados = async () => {
      const { data, error } = await supabase
        .from("participantes")
        .select("id, nombre_completo")
        .eq("rol_general", "jurado");

      if (error) {
        console.error("Error fetching jurados:", error);
        Swal.fire("Error", "No se pudo cargar la lista de jurados.", "error");
      } else {
        setJuradosDisponibles(data);
      }
    };
    fetchJurados();
  }, []);

  // MODIFICADO: handleImageChange ahora redimensiona y nombra los archivos
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);

      // Muestra un loader mientras se procesan las imágenes
      Swal.fire({
        title: "Procesando imágenes...",
        text: "Esto puede tardar un momento.",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const processedImages = await Promise.all(
        files.map(async (file) => {
          try {
            const resizedFile = await reduceImageSize(file);
            const fileName = `tesis-${uuidv4()}.jpg`;
            return {
              file: resizedFile,
              preview: URL.createObjectURL(resizedFile),
              fileName: fileName,
            };
          } catch (error) {
            console.error("Error al procesar imagen:", error);
            return null; // Ignorar archivos que fallen
          }
        })
      );

      Swal.close();
      setImagenes((prev) => [
        ...prev,
        ...(processedImages.filter(Boolean) as ImagenConPreview[]),
      ]);
    }
  };

  const handleRemoveImage = (fileNameToRemove: string) => {
    setImagenes((prev) =>
      prev.filter((img) => img.fileName !== fileNameToRemove)
    );
  };

  const handleJuradoSelection = (juradoId: number) => {
    setJuradosSeleccionados((prev) => {
      const newSelection = new Set(prev);
      newSelection.has(juradoId)
        ? newSelection.delete(juradoId)
        : newSelection.add(juradoId);
      return newSelection;
    });
  };

  // MODIFICADO: handleSubmit ahora usa el bucket 'imgs' y los nombres de archivo pre-generados
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || juradosSeleccionados.size === 0) {
      Swal.fire(
        "Faltan Datos",
        "El título y al menos un jurado son obligatorios.",
        "error"
      );
      return;
    }
    setIsSubmitting(true);
    Swal.fire({
      title: "Creando Votación",
      text: "Por favor, espera...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const user = JSON.parse(localStorage.getItem("admin") || "{}");

      const { data: votacionData, error: votacionError } = await supabase
        .from("votacion_tesis")
        .insert({
          titulo,
          nombre_tesista: nombreTesista,
          titulo_tesis: tituloTesis,
          descripcion,
          duracion_segundos: duracionMinutos * 60,
          creado_por: user.id,
        })
        .select()
        .single();
      if (votacionError) throw votacionError;
      const votacionId = votacionData.id;

      if (imagenes.length > 0) {
        const uploadPromises = imagenes.map(
          (img) =>
            supabase.storage
              .from("imgs") // <--- USANDO TU BUCKET 'imgs'
              .upload(img.fileName, img.file) // <--- USANDO EL NOMBRE Y ARCHIVO PRE-PROCESADO
        );
        const uploadResults = await Promise.all(uploadPromises);

        const failedUploads = uploadResults.filter((result) => result.error);
        if (failedUploads.length > 0) {
          throw new Error(`Error al subir ${failedUploads.length} imágenes.`);
        }

        const imageUrlsData = uploadResults.map(
          (result) =>
            supabase.storage.from("imgs").getPublicUrl(result.data!.path).data
              .publicUrl
        );

        const imagenesInsertData = imageUrlsData.map((url, index) => ({
          votacion_tesis_id: votacionId,
          url_imagen: url,
          orden: index,
        }));

        const { error: imageInsertError } = await supabase
          .from("imagen_votacion_tesis")
          .insert(imagenesInsertData);
        if (imageInsertError) throw imageInsertError;
      }

      const juradosAInsertar = Array.from(juradosSeleccionados).map((id) => ({
        votacion_tesis_id: votacionId,
        participante_id: id,
      }));
      const { error: juradoInsertError } = await supabase
        .from("jurado_por_votacion")
        .insert(juradosAInsertar);
      if (juradoInsertError) throw juradoInsertError;

      Swal.fire(
        "¡Éxito!",
        "La votación de tesis ha sido creada correctamente.",
        "success"
      );
      router.push("/dashboard-votacion-tesis");
    } catch (error: any) {
      console.error("Error al crear la votación:", error);
      Swal.fire(
        "Error",
        `No se pudo crear la votación: ${error.message}`,
        "error"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="form-container-tesis">
      <h1 className="form-title-tesis">Crear Nueva Votación de Tesis</h1>
      <form onSubmit={handleSubmit} className="form-grid-tesis">
        <div className="form-column">
          {/* ... (resto de los inputs para título, tesista, etc. sin cambios) ... */}
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
          <div className="form-group">
            <label htmlFor="duracion">Duración (minutos)</label>
            <input
              id="duracion"
              type="number"
              value={duracionMinutos}
              onChange={(e) => setDuracionMinutos(Number(e.target.value))}
              min="1"
              required
            />
          </div>
          <div className="form-group">
            <label>Imágenes del Proyecto</label>
            <input
              id="imagenes"
              type="file"
              multiple
              onChange={handleImageChange}
              accept="image/*"
              className="file-input"
            />
            <div className="image-preview-container">
              {imagenes.map((img) => (
                <div key={img.fileName} className="image-preview-wrapper">
                  <img
                    src={img.preview}
                    alt={`preview ${img.fileName}`}
                    className="image-preview"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(img.fileName)}
                    className="remove-image-btn"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="form-column">
          <div className="participantes-section">
            <h2>Asignar Jurados*</h2>
            <p className="subtitle">
              Selecciona los jurados que evaluarán esta tesis.
            </p>
            <div className="jurados-list">
              {juradosDisponibles.length > 0 ? (
                juradosDisponibles.map((jurado) => (
                  <label key={jurado.id} className="jurado-item">
                    <input
                      type="checkbox"
                      checked={juradosSeleccionados.has(jurado.id)}
                      onChange={() => handleJuradoSelection(jurado.id)}
                    />
                    {jurado.nombre_completo}
                  </label>
                ))
              ) : (
                <p>No hay jurados disponibles para asignar.</p>
              )}
            </div>
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
            {isSubmitting ? "Creando..." : "Crear Votación"}
          </button>
        </div>
      </form>
    </div>
  );
}
