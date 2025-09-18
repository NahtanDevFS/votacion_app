// app/conteo-votacion-tesis/[id]/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Swal from "sweetalert2";
import "./DetalleVotacion.css";

// --- Interfaces de Tipos de Datos ---
interface ImagenTesis {
  id: number;
  url_imagen: string;
}
interface VotacionDetalle {
  id: number;
  titulo: string;
  nombre_tesista: string | null;
  titulo_tesis: string | null;
  descripcion: string | null;
  estado: "inactiva" | "activa" | "finalizada";
  duracion_segundos: number;
  fecha_creacion: string;
  fecha_activacion: string | null;
  token_qr: string;
  imagen_votacion_tesis: ImagenTesis[];
}
interface JuradoAsignado {
  participantes: {
    id: number;
    nombre_completo: string;
    url_imagen_participante: string | null;
  } | null;
}
interface Resultados {
  puntajeJurados: number;
  puntajePublico: number;
  puntajeTotal: number;
  color: string;
  votosJuradoDetallado: { nombre: string; nota: number }[];
  conteoVotosJurado: number;
  conteoVotosPublico: number;
}

// --- Componente Principal ---
export default function DetalleVotacionPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [votacion, setVotacion] = useState<VotacionDetalle | null>(null);
  const [resultados, setResultados] = useState<Resultados | null>(null);
  const [juradosAsignados, setJuradosAsignados] = useState<JuradoAsignado[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [tiempoRestante, setTiempoRestante] = useState(0);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(
    async (isInitialLoad = false) => {
      if (!id) return;
      if (isInitialLoad) setLoading(true);

      try {
        await supabase.rpc("finalizar_votaciones_expiradas");

        const { data: votacionData, error: votacionError } = await supabase
          .from("votacion_tesis")
          .select(`*, imagen_votacion_tesis(*)`)
          .eq("id", id)
          .single();
        if (votacionError) throw new Error("No se encontró la votación.");
        setVotacion(votacionData);

        const { data: juradosData, error: juradosError } = await supabase
          .from("jurado_por_votacion")
          .select(`participantes(id, nombre_completo, url_imagen_participante)`)
          .eq("votacion_tesis_id", id);
        if (juradosError) throw juradosError;

        const transformedJurados = juradosData.map((j: any) => ({
          ...j,
          participantes: Array.isArray(j.participantes)
            ? j.participantes[0]
            : j.participantes,
        })) as JuradoAsignado[];
        setJuradosAsignados(transformedJurados);

        const { data: votosData, error: votosError } = await supabase
          .from("voto_tesis")
          .select(`nota, rol_al_votar, participantes(nombre_completo)`)
          .eq("votacion_tesis_id", id);
        if (votosError) throw votosError;

        const juradoVotos = votosData.filter(
          (v) => v.rol_al_votar === "jurado"
        );
        const publicoVotos = votosData.filter(
          (v) => v.rol_al_votar === "publico"
        );
        const puntajeJurados = juradoVotos.reduce((acc, v) => acc + v.nota, 0);
        const puntajePublico =
          publicoVotos.length > 0
            ? publicoVotos.reduce((acc, v) => acc + v.nota, 0) /
              publicoVotos.length
            : 0;
        const puntajeTotal = puntajeJurados + puntajePublico;
        let color = "rojo";
        if (puntajeTotal >= 30) color = "verde";
        else if (puntajeTotal >= 15) color = "amarillo";

        setResultados({
          puntajeJurados,
          puntajePublico,
          puntajeTotal,
          color,
          votosJuradoDetallado: juradoVotos.map((v: any) => {
            const participanteInfo = Array.isArray(v.participantes)
              ? v.participantes[0]
              : v.participantes;
            return {
              nombre: participanteInfo?.nombre_completo || "N/A",
              nota: v.nota,
            };
          }),
          conteoVotosJurado: juradoVotos.length,
          conteoVotosPublico: publicoVotos.length,
        });
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        if (isInitialLoad) setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    fetchData(true);
    const intervalId = setInterval(() => fetchData(false), 5000); // Actualizado a 5 segundos
    return () => clearInterval(intervalId);
  }, [fetchData]);

  useEffect(() => {
    if (votacion?.estado === "activa" && votacion.fecha_activacion) {
      const fechaFin =
        new Date(votacion.fecha_activacion).getTime() +
        votacion.duracion_segundos * 1000;
      const interval = setInterval(() => {
        const restante = Math.max(
          0,
          Math.floor((fechaFin - Date.now()) / 1000)
        );
        setTiempoRestante(restante);
        if (restante === 0) clearInterval(interval);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [votacion]);

  const handleActivateVotacion = async () => {
    Swal.fire({
      title: "¿Activar esta votación?",
      text: "La cuenta regresiva comenzará de inmediato.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Sí, activar",
      cancelButtonText: "Cancelar",
    }).then(async (result) => {
      if (result.isConfirmed) {
        const { data, error } = await supabase
          .from("votacion_tesis")
          .update({
            estado: "activa",
            fecha_activacion: new Date().toISOString(),
          })
          .eq("id", id)
          .select()
          .single();
        if (error)
          Swal.fire("Error", "No se pudo activar la votación.", "error");
        else {
          Swal.fire("¡Activada!", "La votación está en curso.", "success");
          setVotacion(data);
        }
      }
    });
  };

  const handleDeleteVotacion = async () => {
    if (!votacion) return;

    const confirm = await Swal.fire({
      title: "¿Estás seguro?",
      text: "Esta acción no se puede deshacer y eliminará la votación, sus imágenes y todos los votos asociados.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#e74c3c",
      cancelButtonColor: "#3498db",
    });

    if (!confirm.isConfirmed) return;

    setDeleting(true);
    Swal.fire({
      title: "Eliminando...",
      text: "Por favor, espera.",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    try {
      // 1. Eliminar votos
      await supabase
        .from("voto_tesis")
        .delete()
        .eq("votacion_tesis_id", votacion.id);

      // 2. Eliminar jurados asignados
      await supabase
        .from("jurado_por_votacion")
        .delete()
        .eq("votacion_tesis_id", votacion.id);

      // 3. Eliminar imágenes del storage y de la tabla
      if (
        votacion.imagen_votacion_tesis &&
        votacion.imagen_votacion_tesis.length > 0
      ) {
        const filePaths = votacion.imagen_votacion_tesis.map((img) => {
          const urlParts = img.url_imagen.split("/");
          return urlParts[urlParts.length - 1];
        });
        await supabase.storage.from("imgs").remove(filePaths);
        await supabase
          .from("imagen_votacion_tesis")
          .delete()
          .eq("votacion_tesis_id", votacion.id);
      }

      // 4. Eliminar la votación
      await supabase.from("votacion_tesis").delete().eq("id", votacion.id);

      Swal.fire("¡Eliminada!", "La votación ha sido eliminada.", "success");
      router.push("/dashboard-votacion-tesis");
    } catch (error: any) {
      Swal.fire(
        "Error",
        `No se pudo eliminar la votación: ${error.message}`,
        "error"
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleEdit = () => router.push(`/editar-votacion-tesis/${id}`);
  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (votacion && votacion.imagen_votacion_tesis.length > 1)
      setCurrentImageIndex(
        (p) => (p + 1) % votacion.imagen_votacion_tesis.length
      );
  };
  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (votacion && votacion.imagen_votacion_tesis.length > 1)
      setCurrentImageIndex(
        (p) =>
          (p - 1 + votacion.imagen_votacion_tesis.length) %
          votacion.imagen_votacion_tesis.length
      );
  };

  if (loading) return <div className="loading">Cargando detalles...</div>;
  if (error) return <div className="error-message">{error}</div>;
  if (!votacion)
    return <div className="error-message">Votación no encontrada.</div>;

  const linkVotacion =
    typeof window !== "undefined"
      ? `${window.location.origin}/tesis-votaciones/${votacion.token_qr}`
      : "";
  const qrCodeUrl = (size: number) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
      linkVotacion
    )}&bgcolor=FFFFFF&color=2c2c3e&qzone=1`;

  return (
    <div className="detalle-votacion-container">
      {isQrModalOpen && (
        <div
          className="qr-modal-backdrop"
          onClick={() => setIsQrModalOpen(false)}
        >
          <div
            className="qr-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="qr-modal-close"
              onClick={() => setIsQrModalOpen(false)}
            >
              ×
            </button>
            <h3>Escanea para Votar</h3>
            <img src={qrCodeUrl(300)} alt="Código QR Grande" />
            <p>{linkVotacion}</p>
          </div>
        </div>
      )}

      {isResultModalOpen && (
        <div
          className="result-modal-backdrop"
          onClick={() => setIsResultModalOpen(false)}
        >
          <div
            className="result-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="result-modal-close"
              onClick={() => setIsResultModalOpen(false)}
            >
              ×
            </button>
            <div className="modal-info-header">
              <div>
                <span>Duración</span>
                <p>{votacion.duracion_segundos / 60} min</p>
              </div>
              {votacion.estado === "activa" && (
                <div className="temporizador-activo">
                  <span>Tiempo Restante</span>
                  <p>
                    {Math.floor(tiempoRestante / 60)}:
                    {String(tiempoRestante % 60).padStart(2, "0")}
                  </p>
                </div>
              )}
              <div>
                <span>Estado</span>
                <p className={`estado-tag estado-${votacion.estado}`}>
                  {votacion.estado}
                </p>
              </div>
            </div>
            <div className="detalle-card resultados-central fullscreen">
              <div className="fullscreen-grid">
                <div className="score-column">
                  <h3>Resultados Finales</h3>
                  <div className="score-card-central">
                    <p>Puntaje Total</p>
                    <div className={`score-circle ${resultados?.color}`}>
                      <span>{resultados?.puntajeTotal.toFixed(2)}</span> / 40
                    </div>
                  </div>
                </div>
                <div className="jurados-column">
                  <div className="score-breakdown-central">
                    <div className="score-item">
                      <h4>
                        Promedio Público ({resultados?.conteoVotosPublico || 0}{" "}
                        votos)
                      </h4>
                      <span className="score-value">
                        {resultados?.puntajePublico.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <h3>Calificación de Jurados</h3>
                  <div className="jurados-score-grid">
                    {juradosAsignados.map((j) => {
                      if (!j.participantes) return null;
                      const votoJurado = resultados?.votosJuradoDetallado.find(
                        (v) => v.nombre === j.participantes?.nombre_completo
                      );
                      return (
                        <div
                          key={j.participantes.id}
                          className="jurado-score-card"
                        >
                          <img
                            src={
                              j.participantes.url_imagen_participante ||
                              "/img/default-avatar.png"
                            }
                            alt={j.participantes.nombre_completo}
                            className="jurado-avatar"
                          />
                          <h4>{j.participantes.nombre_completo}</h4>
                          <span
                            className={`voto-valor ${
                              votoJurado ? "votado" : "pendiente"
                            }`}
                          >
                            {votoJurado ? votoJurado.nota.toFixed(2) : "---"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="detalle-header-rich">
        <div className="header-text-content">
          <h1>{votacion.titulo}</h1>
          <p>
            {votacion.nombre_tesista} - {votacion.titulo_tesis}
          </p>
        </div>
        <div className="header-media-grid">
          <div className="detalle-carousel">
            {votacion.imagen_votacion_tesis?.length > 0 ? (
              <>
                <img
                  src={
                    votacion.imagen_votacion_tesis[currentImageIndex].url_imagen
                  }
                  alt={`Imagen ${currentImageIndex + 1}`}
                />
                {votacion.imagen_votacion_tesis.length > 1 && (
                  <>
                    <button onClick={prevImage} className="carousel-arrow prev">
                      ‹
                    </button>
                    <button onClick={nextImage} className="carousel-arrow next">
                      ›
                    </button>
                  </>
                )}
              </>
            ) : (
              <div className="image-placeholder">Sin Imágenes</div>
            )}
          </div>
          {votacion.descripcion && (
            <div className="header-descripcion">
              <h3>Descripción del Proyecto</h3>
              <p>{votacion.descripcion}</p>
            </div>
          )}
        </div>
      </div>

      <div className="detalle-main-grid-final">
        <div className="detalle-columna">
          <div
            className="detalle-card resultados-central clickable-card"
            onClick={() => setIsResultModalOpen(true)}
          >
            <h3>
              Resultados Finales <span className="expand-indicator">↗</span>
            </h3>
            <div className="score-card-central">
              <p>Puntaje Total</p>
              <div className={`score-circle ${resultados?.color}`}>
                <span>{resultados?.puntajeTotal.toFixed(2)}</span> / 40
              </div>
            </div>
            <div className="score-breakdown-central">
              <div className="score-item">
                <h4>
                  Promedio Público ({resultados?.conteoVotosPublico || 0} votos)
                </h4>
                <span className="score-value">
                  {resultados?.puntajePublico.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="jurados-score-grid">
              {juradosAsignados.map((j) => {
                if (!j.participantes) return null;
                const votoJurado = resultados?.votosJuradoDetallado.find(
                  (v) => v.nombre === j.participantes?.nombre_completo
                );
                return (
                  <div key={j.participantes.id} className="jurado-score-card">
                    <img
                      src={
                        j.participantes.url_imagen_participante ||
                        "/img/default-avatar.png"
                      }
                      alt={j.participantes.nombre_completo}
                      className="jurado-avatar"
                    />
                    <h4>{j.participantes.nombre_completo}</h4>
                    <span
                      className={`voto-valor ${
                        votoJurado ? "votado" : "pendiente"
                      }`}
                    >
                      {votoJurado ? votoJurado.nota.toFixed(2) : "---"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="detalle-columna">
          <div className="detalle-card info">
            <h3>Información General</h3>
            <div className="info-grid">
              <div>
                <span>Estado</span>
                <p className={`estado-tag estado-${votacion.estado}`}>
                  {votacion.estado}
                </p>
              </div>
              <div>
                <span>Duración</span>
                <p>{votacion.duracion_segundos / 60} min</p>
              </div>
            </div>
            {votacion.estado === "activa" && (
              <div className="temporizador-activo">
                <span>Tiempo Restante</span>
                <p>
                  {Math.floor(tiempoRestante / 60)}:
                  {String(tiempoRestante % 60).padStart(2, "0")}
                </p>
              </div>
            )}
            <div className="info-actions">
              {votacion.estado === "inactiva" && (
                <button
                  className="action-button activate"
                  onClick={handleActivateVotacion}
                >
                  Activar Votación
                </button>
              )}
              <button className="action-button edit" onClick={handleEdit}>
                Editar
              </button>
              <button
                className="action-button delete"
                onClick={handleDeleteVotacion}
                disabled={deleting}
              >
                {deleting ? "Eliminando..." : "Eliminar Votación"}
              </button>
            </div>
          </div>
          <div className="detalle-card recursos">
            <h3>Recursos de Votación</h3>
            <div
              className="qr-code-container-small"
              onClick={() => setIsQrModalOpen(true)}
            >
              <img src={qrCodeUrl(100)} alt="Código QR para la votación" />
              <span>Click para ampliar</span>
            </div>
            <div className="recursos-info">
              <label>Enlace para Votar</label>
              <input
                type="text"
                readOnly
                value={linkVotacion}
                onClick={(e) => e.currentTarget.select()}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
