"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Swal from "sweetalert2";
import "./DetalleVotacion.css";
import type { RealtimeChannel } from "@supabase/supabase-js";

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
  fecha_activacion: string | null;
  token_qr: string;
  imagen_votacion_tesis: ImagenTesis[];
  finalizada_definitivamente: number;
}
interface JuradoAsignado {
  participantes: {
    id: number;
    nombre_completo: string;
    url_imagen_participante: string | null;
    codigo_acceso: string;
  } | null;
}

// --- Componente Principal ---
export default function DetalleVotacionPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [votacion, setVotacion] = useState<VotacionDetalle | null>(null);
  const [totalVotos, setTotalVotos] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [tiempoRestante, setTiempoRestante] = useState(0);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrCodeContent, setQrCodeContent] = useState({ url: "", title: "" });
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const resultModalRef = useRef<HTMLDivElement>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [juradosAsignados, setJuradosAsignados] = useState<JuradoAsignado[]>(
    []
  );
  
  // Estado para evitar problemas de hidratación
  const [mounted, setMounted] = useState(false);

  // Ref para almacenar el canal de suscripción
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Ref para el timeout de verificación de expiración
  const expirationCheckRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;

    try {
      // Verificar votaciones expiradas antes de cargar
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
        .select(
          `participantes(id, nombre_completo, url_imagen_participante, codigo_acceso)`
        )
        .eq("votacion_tesis_id", id)
        .order("nombre_completo", {
          foreignTable: "participantes",
          ascending: true,
        });
      if (juradosError) throw juradosError;
      const transformedJurados = juradosData.map((j: any) => ({
        ...j,
        participantes: Array.isArray(j.participantes)
          ? j.participantes[0]
          : j.participantes,
      })) as JuradoAsignado[];
      setJuradosAsignados(transformedJurados);

      const { count, error: countError } = await supabase
        .from("voto_tesis")
        .select("*", { count: "exact", head: true })
        .eq("votacion_tesis_id", id);

      if (countError) throw countError;
      setTotalVotos(count || 0);

      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Función para verificar y cerrar votación si expiró
  const checkAndFinalizeIfExpired = useCallback(async () => {
    if (!votacion || votacion.estado !== "activa" || !votacion.fecha_activacion) {
      return;
    }

    const fechaFin =
      new Date(votacion.fecha_activacion).getTime() +
      votacion.duracion_segundos * 1000;
    const ahora = Date.now();

    // Si ya expiró, finalizar inmediatamente
    if (ahora >= fechaFin) {
      console.log("⏰ Votación expirada, finalizando...");
      
      try {
        // Actualizar directamente en la base de datos
        const { error: updateError } = await supabase
          .from("votacion_tesis")
          .update({ estado: "finalizada" })
          .eq("id", id)
          .eq("estado", "activa"); // Solo si aún está activa (evita actualizaciones duplicadas)

        if (updateError) {
          console.error("Error al finalizar:", updateError);
          // Si falla, intentar con RPC como fallback
          await supabase.rpc("finalizar_votaciones_expiradas");
        } else {
          console.log("✅ Votación finalizada exitosamente");
        }

        // Recargar datos
        await fetchData();
      } catch (err) {
        console.error("Error en checkAndFinalizeIfExpired:", err);
      }
    }
  }, [votacion, id, fetchData]);

  // Efecto para montar el componente (evita problemas de hidratación)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Configurar suscripciones de Realtime
  useEffect(() => {
    if (!id || !mounted) return;

    // Carga inicial
    fetchData();

    // Crear canal de suscripción
    const channel = supabase
      .channel(`votacion-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "votacion_tesis",
          filter: `id=eq.${id}`,
        },
        async (payload) => {
          console.log("🔄 Cambio en votacion_tesis:", payload);
          if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
            // Recargar datos completos con imágenes
            const { data: votacionActualizada, error } = await supabase
              .from("votacion_tesis")
              .select(`*, imagen_votacion_tesis(*)`)
              .eq("id", id)
              .single();
            
            if (!error && votacionActualizada) {
              console.log("✅ Votación actualizada con imágenes");
              setVotacion(votacionActualizada);
            }
          } else if (payload.eventType === "DELETE") {
            router.push("/dashboard-votacion-tesis");
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "voto_tesis",
          filter: `votacion_tesis_id=eq.${id}`,
        },
        async (payload) => {
          console.log("🗳️ Cambio en voto_tesis:", payload);
          const { count } = await supabase
            .from("voto_tesis")
            .select("*", { count: "exact", head: true })
            .eq("votacion_tesis_id", id);
          setTotalVotos(count || 0);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "jurado_por_votacion",
          filter: `votacion_tesis_id=eq.${id}`,
        },
        async (payload) => {
          console.log("👥 Cambio en jurado_por_votacion:", payload);
          const { data: juradosData } = await supabase
            .from("jurado_por_votacion")
            .select(
              `participantes(id, nombre_completo, url_imagen_participante, codigo_acceso)`
            )
            .eq("votacion_tesis_id", id)
            .order("nombre_completo", {
              foreignTable: "participantes",
              ascending: true,
            });
          if (juradosData) {
            const transformedJurados = juradosData.map((j: any) => ({
              ...j,
              participantes: Array.isArray(j.participantes)
                ? j.participantes[0]
                : j.participantes,
            })) as JuradoAsignado[];
            setJuradosAsignados(transformedJurados);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "imagen_votacion_tesis",
          filter: `votacion_tesis_id=eq.${id}`,
        },
        (payload) => {
          console.log("🖼️ Cambio en imagen_votacion_tesis:", payload);
          fetchData();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [id, mounted, fetchData, router]);

  // Temporizador para votaciones activas con verificación agresiva
  useEffect(() => {
    if (!mounted || !votacion?.estado || votacion.estado !== "activa" || !votacion.fecha_activacion) {
      return;
    }

    const fechaActivacion = new Date(votacion.fecha_activacion).getTime();
    const fechaFin = fechaActivacion + votacion.duracion_segundos * 1000;
    
    let tickTimeoutId: NodeJS.Timeout;
    
    const tick = () => {
      const ahora = Date.now();
      const restanteMilisegundos = fechaFin - ahora;
      const restanteSegundos = Math.max(0, Math.floor(restanteMilisegundos / 1000));
      
      setTiempoRestante(restanteSegundos);
      
      // Si quedan 2 segundos o menos, verificar cada 500ms (más agresivo)
      if (restanteMilisegundos <= 2000 && restanteMilisegundos > 0) {
        tickTimeoutId = setTimeout(tick, 500);
      } else if (restanteSegundos > 0) {
        // Calcular próximo tick al segundo exacto
        const delay = 1000 - (ahora % 1000);
        tickTimeoutId = setTimeout(tick, delay);
      }
      
      // Si el tiempo expiró, finalizar inmediatamente
      if (restanteMilisegundos <= 0) {
        checkAndFinalizeIfExpired();
      }
    };
    
    // Primera ejecución
    tick();
    
    // Verificación adicional cada segundo como backup
    expirationCheckRef.current = setInterval(() => {
      const ahora = Date.now();
      if (ahora >= fechaFin) {
        checkAndFinalizeIfExpired();
      }
    }, 1000);
    
    return () => {
      clearTimeout(tickTimeoutId);
      if (expirationCheckRef.current) {
        clearInterval(expirationCheckRef.current);
        expirationCheckRef.current = null;
      }
    };
  }, [mounted, votacion, checkAndFinalizeIfExpired]);

  useEffect(() => {
    if (countdown === null || countdown < 0) return;
    if (countdown === 0) {
      const activate = async () => {
        const { data, error } = await supabase
          .from("votacion_tesis")
          .update({
            estado: "activa",
            fecha_activacion: new Date().toISOString(),
          })
          .eq("id", id)
          .select()
          .single();
        if (error) {
          Swal.fire("Error", "No se pudo activar la votación.", "error");
          setCountdown(null);
        } else {
          setTimeout(() => {
            setCountdown(null);
            fetchData();
            setIsResultModalOpen(true);
          }, 2000);
        }
      };
      activate();
      return;
    }
    const timerId = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timerId);
  }, [countdown, id, fetchData]);

  const handleActivateVotacion = async () => {
    const isReactivating = votacion?.estado === "finalizada";
    const title = isReactivating
      ? "¿Reactivar esta votación?"
      : "¿Activar esta votación?";
    const confirmButtonText = isReactivating ? "Sí, reactivar" : "Sí, activar";

    Swal.fire({
      title: title,
      text: "Comenzará una cuenta regresiva de 5 segundos.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: confirmButtonText,
      cancelButtonText: "Cancelar",
    }).then(async (result) => {
      if (result.isConfirmed) {
        setCountdown(5);
      }
    });
  };

  const handleForceFinalize = async () => {
    Swal.fire({
      title: "¿Cerrar esta votación?",
      text: "La votación pasará a estado 'Cerrada' y podrá reactivarse.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, cerrar",
    }).then(async (result) => {
      if (result.isConfirmed) {
        const { error } = await supabase
          .from("votacion_tesis")
          .update({ estado: "finalizada" })
          .eq("id", id);
        if (error) {
          Swal.fire("Error", "No se pudo cerrar la votación.", "error");
        } else {
          Swal.fire(
            "¡Votación Cerrada!",
            "La votación ha sido cerrada.",
            "success"
          );
          await fetchData();
        }
      }
    });
  };

  const handleFinalizeDefinitively = async () => {
    Swal.fire({
      title: "¿Finalizar Definitivamente?",
      text: "Esta votación se cerrará permanentemente y NO podrá ser reactivada. ¿Estás seguro?",
      icon: "error",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Sí, finalizar permanentemente",
      cancelButtonText: "Cancelar",
    }).then(async (result) => {
      if (result.isConfirmed) {
        const { error } = await supabase
          .from("votacion_tesis")
          .update({
            estado: "finalizada",
            finalizada_definitivamente: 1,
          })
          .eq("id", id);

        if (error) {
          Swal.fire(
            "Error",
            "No se pudo finalizar la votación permanentemente.",
            "error"
          );
        } else {
          Swal.fire(
            "¡Finalizada Permanentemente!",
            "La votación ha sido cerrada de forma definitiva.",
            "success"
          );
          await fetchData();
        }
      }
    });
  };

  const handleOpenFullScreenModal = () => setIsResultModalOpen(true);
  const handleCloseFullScreenModal = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    setIsResultModalOpen(false);
  };

  useEffect(() => {
    if (!mounted) return;
    
    if (isResultModalOpen && resultModalRef.current) {
      resultModalRef.current.requestFullscreen().catch(console.error);
    }
    const handleFullScreenChange = () => {
      if (!document.fullscreenElement) setIsResultModalOpen(false);
    };
    document.addEventListener("fullscreenchange", handleFullScreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullScreenChange);
  }, [mounted, isResultModalOpen]);

  const handleDeleteVotacion = async () => {
    if (!votacion) return;
    const confirm = await Swal.fire({
      title: "¿Estás seguro?",
      text: "Esta acción no se puede deshacer.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
    });
    if (!confirm.isConfirmed) return;
    setDeleting(true);
    Swal.fire({
      title: "Eliminando...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });
    try {
      await supabase
        .from("voto_tesis")
        .delete()
        .eq("votacion_tesis_id", votacion.id);
      await supabase
        .from("jurado_por_votacion")
        .delete()
        .eq("votacion_tesis_id", votacion.id);
      if (votacion.imagen_votacion_tesis?.length > 0) {
        const filePaths = votacion.imagen_votacion_tesis.map(
          (img) => img.url_imagen.split("/").pop()!
        );
        await supabase.storage.from("imgs").remove(filePaths);
        await supabase
          .from("imagen_votacion_tesis")
          .delete()
          .eq("votacion_tesis_id", votacion.id);
      }
      await supabase.from("votacion_tesis").delete().eq("id", votacion.id);
      Swal.fire("¡Eliminada!", "La votación ha sido eliminada.", "success");
      router.push("/dashboard-votacion-tesis");
    } catch (error: any) {
      Swal.fire("Error", `No se pudo eliminar: ${error.message}`, "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleEdit = () => router.push(`/editar-votacion-tesis/${id}`);
  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (
      votacion &&
      votacion.imagen_votacion_tesis &&
      votacion.imagen_votacion_tesis.length > 1
    ) {
      setCurrentImageIndex(
        (p) => (p + 1) % votacion.imagen_votacion_tesis.length
      );
    }
  };
  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (
      votacion &&
      votacion.imagen_votacion_tesis &&
      votacion.imagen_votacion_tesis.length > 1
    ) {
      setCurrentImageIndex(
        (p) =>
          (p - 1 + votacion.imagen_votacion_tesis.length) %
          votacion.imagen_votacion_tesis.length
      );
    }
  };
  const handleOpenQrModal = (
    type: "publico" | "jurado",
    accessCode?: string,
    juradoName?: string
  ) => {
    const baseUrl = window.location.origin;
    let url = `${baseUrl}/tesis-votaciones-autenticacion`;
    let title = "QR para el Público";
    if (type === "jurado" && accessCode) {
      url = `${baseUrl}/tesis-votaciones-autenticacion?access_code=${accessCode}`;
      title = `QR para Jurado: ${juradoName}`;
    }
    setQrCodeContent({ url, title });
    setIsQrModalOpen(true);
  };

  // Evitar renderizado hasta que el componente esté montado
  if (!mounted) {
    return <div className="loading">Inicializando...</div>;
  }

  if (loading) return <div className="loading">Cargando detalles...</div>;
  if (error) return <div className="error-message">{error}</div>;
  if (!votacion)
    return <div className="error-message">Votación no encontrada.</div>;

  const duracionMinutos = Math.floor(votacion.duracion_segundos / 60);
  const duracionSegundos = votacion.duracion_segundos % 60;

  const getDisplayEstadoTexto = () => {
    if (votacion.estado === "finalizada") {
      return votacion.finalizada_definitivamente === 1
        ? "Finalizada"
        : "Cerrada";
    }
    return votacion.estado;
  };
  const displayEstado = getDisplayEstadoTexto();

  const MainContent = () => (
    <div
      className="detalle-card-ampliada clickable-card"
      onClick={handleOpenFullScreenModal}
    >
      <div className="header-info-container">
        <div className="header-status-timer">
          <p className={`estado-tag estado-${votacion.estado}`}>
            {displayEstado}
          </p>
          {votacion.estado === "activa" && (
            <div className="temporizador-activo modal-temporizador">
              <span>Tiempo Restante</span>
              <p>
                {Math.floor(tiempoRestante / 60)}:
                {String(tiempoRestante % 60).padStart(2, "0")}
              </p>
            </div>
          )}
        </div>
        <div className="header-text-content">
          <h1>{votacion.titulo}</h1>
          <p>
            {votacion.nombre_tesista} - {votacion.titulo_tesis}
          </p>
        </div>
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
      <div className="total-votos-container">
        <h3 className="total-votos-titulo">
          Total de Votos Recibidos <span className="expand-indicator">↗</span>
        </h3>
        <p className="total-votos-numero">{totalVotos}</p>
      </div>
    </div>
  );

  return (
    <div className="detalle-votacion-container">
      {countdown !== null && countdown > 0 && (
        <div className="countdown-backdrop">
          <div className="countdown-number">{countdown}</div>
        </div>
      )}
      {countdown === 0 && (
        <div className="countdown-backdrop">
          <div className="countdown-number" style={{ fontSize: "10vw" }}>
            ¡A VOTAR!
          </div>
        </div>
      )}

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
            <h3>{qrCodeContent.title}</h3>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
                qrCodeContent.url
              )}&bgcolor=FFFFFF&color=2c2c3e&qzone=1`}
              alt="Código QR"
            />
            <p>{qrCodeContent.url}</p>
          </div>
        </div>
      )}

      {isResultModalOpen && (
        <div className="result-modal-backdrop" ref={resultModalRef}>
          <div
            className="result-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="result-modal-close"
              onClick={handleCloseFullScreenModal}
            >
              ×
            </button>
            <MainContent />
          </div>
        </div>
      )}

      <div className="detalle-main-grid-final">
        <div className="detalle-columna">
          <MainContent />
        </div>
        <div className="detalle-columna">
          <div className="detalle-card info">
            <h3>Información General</h3>
            <div className="info-grid">
              <div>
                <span>Estado</span>
                <p className={`estado-tag estado-${votacion.estado}`}>
                  {displayEstado}
                </p>
              </div>
              <div>
                <span>Duración</span>
                <p>
                  {duracionMinutos}:{String(duracionSegundos).padStart(2, "0")}{" "}
                  min
                </p>
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
              {(votacion.estado === "inactiva" ||
                (votacion.estado === "finalizada" &&
                  votacion.finalizada_definitivamente === 0)) && (
                <button
                  className="action-button activate"
                  onClick={handleActivateVotacion}
                >
                  {votacion.estado === "inactiva"
                    ? "Activar Votación"
                    : "Reactivar Votación"}
                </button>
              )}

              {votacion.estado === "activa" && (
                <button
                  className="action-button finalize"
                  onClick={handleForceFinalize}
                >
                  Cerrar Votación
                </button>
              )}

              {votacion.estado === "finalizada" &&
                votacion.finalizada_definitivamente === 0 && (
                  <button
                    className="action-button finalize-definitive"
                    onClick={handleFinalizeDefinitively}
                  >
                    Finalizar Definitivamente
                  </button>
                )}

              {votacion.finalizada_definitivamente === 0 && (
                <button className="action-button edit" onClick={handleEdit}>
                  Editar
                </button>
              )}

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
            <div className="recursos-actions">
              <button
                className="action-button"
                onClick={() => handleOpenQrModal("publico")}
              >
                Ver QR del Público
              </button>
              <div className="jurado-qr-buttons">
                <h4>QR para Jurados</h4>
                {juradosAsignados.map(
                  (j) =>
                    j.participantes && (
                      <button
                        key={j.participantes.id}
                        className="action-button jurado-btn"
                        onClick={() =>
                          handleOpenQrModal(
                            "jurado",
                            j.participantes?.codigo_acceso,
                            j.participantes?.nombre_completo
                          )
                        }
                      >
                        QR de {j.participantes.nombre_completo}
                      </button>
                    )
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}