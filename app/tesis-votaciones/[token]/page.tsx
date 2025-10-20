// app/tesis-votaciones/[token]/page.tsx
"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  Suspense,
  useRef,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Swal from "sweetalert2";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import "./VotarTesis.css";

// --- Componente de Confeti
const Confetti = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/npm/canvas-confetti@1.5.1/dist/confetti.browser.min.js";
    script.async = true;
    document.body.appendChild(script);

    script.onload = () => {
      if (!canvasRef.current) return;

      const myConfetti = (window as any).confetti.create(canvasRef.current, {
        resize: true,
        useWorker: true,
      });

      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60 };

      function randomInRange(min: number, max: number) {
        return Math.random() * (max - min) + min;
      }

      const interval = setInterval(() => {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        myConfetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        });
        myConfetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        });
      }, 250);

      return () => clearInterval(interval);
    };

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  return <canvas ref={canvasRef} className="confetti-canvas" />;
};

// --- Interfaces ---
interface VotacionActiva {
  id: number;
  titulo: string;
  nombre_tesista: string | null;
  descripcion: string | null;
  estado: "inactiva" | "activa" | "finalizada";
  fecha_activacion: string;
  duracion_segundos: number;
  imagen_votacion_tesis: { url_imagen: string }[];
}
interface Participante {
  id: number;
  rol_general: "jurado" | "publico";
  nombre_completo: string;
}

// --- Componente de Votación ---
function VotarTesisContent() {
  const params = useParams();
  const router = useRouter();
  const token_qr = params.token as string;

  const [votacion, setVotacion] = useState<VotacionActiva | null>(null);
  const [participante, setParticipante] = useState<Participante | null>(null);
  const [rolParaVotar, setRolParaVotar] = useState<"jurado" | "publico" | null>(
    null
  );
  const [nota, setNota] = useState<number>(0.0);
  const [tiempoRestante, setTiempoRestante] = useState<number | null>(null);
  const [haVotado, setHaVotado] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [votoEmitido, setVotoEmitido] = useState<{
    nota: number;
    fecha: string;
    rol: "jurado" | "publico";
  } | null>(null);

  useEffect(() => {
    const getFingerprint = async () => {
      try {
        const fp = await FingerprintJS.load();
        const { visitorId } = await fp.get();
        setFingerprint(visitorId);
      } catch (e) {
        setError(
          "No se pudo identificar tu dispositivo. La votación no es posible."
        );
        console.error("Fingerprint error:", e);
      }
    };
    getFingerprint();
  }, []);

  const getSliderColor = (value: number) => {
    if (value >= 7.5) return "verde";
    if (value >= 5.0) return "amarillo";
    return "rojo";
  };

  const getTimerState = (segundos: number | null) => {
    if (segundos === null) return "normal";
    if (segundos < 15) return "critical";
    if (segundos < 25) return "warning";
    if (segundos < 40) return "caution";
    if (segundos < 50) return "alert";
    return "normal";
  };

  const fetchVotacionState = useCallback(
    async (isInitialLoad = false) => {
      if (isInitialLoad) setIsLoading(true);
      if (!fingerprint) return;

      const codigoAcceso = localStorage.getItem(
        "token_participante_tesis_vote_up"
      );

      try {
        const { data: vData, error: vError } = await supabase
          .from("votacion_tesis")
          .select("*, imagen_votacion_tesis(url_imagen)")
          .eq("token_qr", token_qr)
          .single();
        if (vError)
          throw new Error("La votación no existe o ya no está disponible.");
        if (vData.estado === "finalizada") {
          Swal.fire({
            title: "Votación Finalizada",
            text: "Esta votación ya ha terminado. Serás redirigido al listado de votaciones.",
            icon: "info",
            timer: 3000,
            timerProgressBar: true,
            showConfirmButton: false,
            allowOutsideClick: false,
          }).then(() => {
            router.push("/tesis-votaciones");
          });
          return;
        }
        if (vData.estado === "inactiva")
          throw new Error("Esta votación aún no ha sido activada.");

        setVotacion(vData);

        if (isInitialLoad) {
          if (codigoAcceso) {
            const { data: pData, error: pError } = await supabase
              .from("participantes")
              .select("id, rol_general, nombre_completo")
              .eq("codigo_acceso", codigoAcceso)
              .single();
            if (pError || !pData)
              throw new Error("Tu código de acceso de jurado no es válido.");

            setParticipante(pData);

            let rolFinal: "jurado" | "publico" = "publico";
            if (pData.rol_general === "jurado") {
              const { data: esJuradoAsignado } = await supabase
                .from("jurado_por_votacion")
                .select("id")
                .eq("votacion_tesis_id", vData.id)
                .eq("participante_id", pData.id)
                .maybeSingle();
              if (esJuradoAsignado) {
                rolFinal = "jurado";
              }
            }
            setRolParaVotar(rolFinal);

            const { data: votoExistente } = await supabase
              .from("voto_tesis")
              .select("id, nota, created_at, rol_al_votar")
              .eq("votacion_tesis_id", vData.id)
              .eq("participante_id", pData.id)
              .maybeSingle();

            if (votoExistente) {
              setHaVotado(true);
              setVotoEmitido({
                nota: votoExistente.nota,
                fecha: votoExistente.created_at,
                rol: votoExistente.rol_al_votar,
              });
            }
          } else {
            setParticipante(null);
            setRolParaVotar("publico");
            const { data: votoExistente } = await supabase
              .from("voto_tesis")
              .select("id, nota, created_at, rol_al_votar")
              .eq("votacion_tesis_id", vData.id)
              .eq("fingerprint", fingerprint)
              .maybeSingle();

            if (votoExistente) {
              setHaVotado(true);
              setVotoEmitido({
                nota: votoExistente.nota,
                fecha: votoExistente.created_at,
                rol: votoExistente.rol_al_votar,
              });
            }
          }
        }
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        if (isInitialLoad) setIsLoading(false);
      }
    },
    [token_qr, router, fingerprint]
  );

  useEffect(() => {
    if (fingerprint) {
      fetchVotacionState(true);
      const intervalId = setInterval(() => fetchVotacionState(false), 2000);
      return () => clearInterval(intervalId);
    }
  }, [fingerprint, fetchVotacionState]);

  useEffect(() => {
    if (votacion && votacion.estado === "activa") {
      const fechaFin =
        new Date(votacion.fecha_activacion).getTime() +
        votacion.duracion_segundos * 1000;
      let timeoutId: NodeJS.Timeout;

      const tick = () => {
        const restante = Math.max(
          0,
          Math.floor((fechaFin - Date.now()) / 1000)
        );
        setTiempoRestante(restante);

        if (restante > 0) {
          const delay = 1000 - (Date.now() % 1000);
          timeoutId = setTimeout(tick, delay);
        } else if (!haVotado) {
          Swal.fire({
            title: "Tiempo Finalizado",
            text: "El tiempo para votar ha terminado. Serás redirigido al listado de votaciones.",
            icon: "warning",
            timer: 3000,
            timerProgressBar: true,
            showConfirmButton: false,
            allowOutsideClick: false,
          }).then(() => {
            router.push("/tesis-votaciones");
          });
        }
      };
      tick();
      return () => clearTimeout(timeoutId);
    }
  }, [votacion, haVotado, router]);

  const handleNotaInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = parseFloat(e.target.value);
    if (isNaN(value)) value = 0;
    const clampedValue = Math.max(0, Math.min(10, value));
    setNota(clampedValue);
  };

  const handleIncrement = () => {
    setNota((prev) => parseFloat(Math.min(10, prev + 0.1).toFixed(1)));
  };

  const handleDecrement = () => {
    setNota((prev) => parseFloat(Math.max(0, prev - 0.1).toFixed(1)));
  };

  const handleSubmit = async () => {
    if (isSubmitting || haVotado || tiempoRestante === 0 || error) return;

    // CAMBIO PRINCIPAL: Solo mostrar confirmación si es jurado asignado
    if (rolParaVotar === "jurado") {
      const result = await Swal.fire({
        title: `¿Confirmas tu calificación de ${nota.toFixed(1)}?`,
        text: "Esta acción es final y no se podrá cambiar.",
        icon: "question",
        showCancelButton: true,
        confirmButtonColor: "#8724ff",
        cancelButtonColor: "#5a5a7a",
        confirmButtonText: "Sí, confirmar mi voto",
        cancelButtonText: "Cancelar",
      });

      if (!result.isConfirmed) return;
    }

    setIsSubmitting(true);
    try {
      if (!votacion || !rolParaVotar)
        throw new Error("Faltan datos para registrar el voto.");

      // Verificar el estado de la votación ANTES de insertar
      const { data: freshVotacion, error: freshError } = await supabase
        .from("votacion_tesis")
        .select("estado")
        .eq("id", votacion.id)
        .single();

      if (freshError || !freshVotacion || freshVotacion.estado !== "activa") {
        throw new Error("La votación ha finalizado mientras emitías tu voto.");
      }

      const votePayload: any = {
        votacion_tesis_id: votacion.id,
        nota: nota,
        rol_al_votar: rolParaVotar,
      };

      if (participante) {
        votePayload.participante_id = participante.id;
      } else if (fingerprint) {
        votePayload.fingerprint = fingerprint;
      } else {
        throw new Error("No se pudo identificar al votante.");
      }

      const { error: insertError } = await supabase
        .from("voto_tesis")
        .insert(votePayload);

      if (insertError) throw insertError;

      // CAMBIO: Comportamiento diferenciado según el rol
      if (rolParaVotar === "publico") {
        // Para público (incluye jurados no asignados): mensaje breve y redirección
        await Swal.fire({
          title: "¡Voto Registrado!",
          text: "Gracias por tu participación. Serás redirigido.",
          icon: "success",
          timer: 1500,
          showConfirmButton: false,
          timerProgressBar: true,
        });
        router.push("/tesis-votaciones");
      } else {
        // Para jurado asignado: pantalla de confirmación detallada
        setHaVotado(true);
        setVotoEmitido({
          nota: nota,
          fecha: new Date().toISOString(),
          rol: rolParaVotar,
        });

        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);

        Swal.fire(
          "¡Voto Registrado!",
          "Gracias por tu participación.",
          "success"
        );
      }
    } catch (err: any) {
      Swal.fire(
        "Error",
        "No se pudo registrar tu voto. Es posible que ya hayas votado o el tiempo haya terminado.",
        "error"
      );
      console.error(err);
      setError("No se pudo registrar tu voto.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || !fingerprint)
    return (
      <div className="loading-container">
        <h2>Identificando dispositivo y cargando votación...</h2>
      </div>
    );

  const minutos = tiempoRestante !== null ? Math.floor(tiempoRestante / 60) : 0;
  const segundos = tiempoRestante !== null ? tiempoRestante % 60 : 0;
  const isDisabled =
    haVotado || isSubmitting || tiempoRestante === 0 || error !== null;
  const timerState = getTimerState(tiempoRestante);

  return (
    <div className="votar-container">
      {showConfetti && <Confetti />}

      <button
        onClick={() => router.push("/tesis-votaciones")}
        className="back-button-votar"
      >
        ‹ Volver al listado
      </button>

      {error && (
        <div className="votar-card error-card">
          <div className="error-icon">⚠️</div>
          <h2>Acceso Denegado</h2>
          <p>{error}</p>
          <button
            onClick={() => router.push("/tesis-votaciones")}
            className="back-to-list-button"
          >
            Volver al Listado
          </button>
        </div>
      )}

      {!error && votacion && (
        <div className="votar-card">
          <div className={`timer timer-${timerState}`}>
            <span className="timer-label">Tiempo Restante</span>
            <span className="timer-value">
              {String(minutos).padStart(2, "0")}:
              {String(segundos).padStart(2, "0")}
            </span>
          </div>

          {haVotado && votoEmitido ? (
            // RESUMEN POST-VOTO (Solo se muestra para jurados asignados)
            <div className="voto-summary">
              <div className="success-icon">✅</div>
              <h2>¡Voto Registrado Exitosamente!</h2>
              <div className="voto-details">
                <div className="voto-nota-grande">
                  <span className="label">Tu Calificación</span>
                  <div
                    className={`nota-circle ${getSliderColor(
                      votoEmitido.nota
                    )}`}
                  >
                    {votoEmitido.nota.toFixed(1)}
                  </div>
                  <span className="de-diez">de 10.0</span>
                </div>
                <div className="voto-info">
                  <div className="info-row">
                    <span className="icon">📅</span>
                    <div>
                      <strong>Fecha y Hora</strong>
                      <p>
                        {new Date(votoEmitido.fecha).toLocaleString("es-GT")}
                      </p>
                    </div>
                  </div>
                  <div className="info-row">
                    <span className="icon">👤</span>
                    <div>
                      <strong>Votaste como</strong>
                      <p>
                        {participante
                          ? `${
                              votoEmitido.rol === "jurado"
                                ? "Jurado"
                                : "Público"
                            }: ${participante.nombre_completo}`
                          : "Público"}
                      </p>
                    </div>
                  </div>
                  <div className="info-row">
                    <span className="icon">📊</span>
                    <div>
                      <strong>Proyecto</strong>
                      <p>{votacion.titulo}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="voto-actions">
                <button
                  onClick={() => router.push("/tesis-votaciones")}
                  className="btn-primary"
                >
                  Ver Otras Votaciones
                </button>
              </div>
              <p className="gracias-message">
                ¡Gracias por tu participación! Tu opinión es muy valiosa.
              </p>
            </div>
          ) : (
            // FORMULARIO DE VOTACIÓN
            <>
              <div className="votar-header">
                <h1>{votacion.titulo}</h1>
                <p>{votacion.nombre_tesista}</p>
                <div className="role-display">
                  {participante ? (
                    <p>
                      Votando como{" "}
                      <strong>
                        {rolParaVotar === "jurado" ? "Jurado" : "Público"}
                      </strong>
                      : {participante.nombre_completo}
                    </p>
                  ) : (
                    <p>
                      Votando como <strong>Público</strong>
                    </p>
                  )}
                </div>
              </div>

              <div className="project-details">
                {votacion.imagen_votacion_tesis?.[0] && (
                  <div className="project-image-container">
                    <img
                      src={votacion.imagen_votacion_tesis[0].url_imagen}
                      alt="Proyecto de tesis"
                      className="project-image"
                    />
                  </div>
                )}
                {votacion.descripcion && (
                  <div className="project-description">
                    <h3>Descripción del Proyecto</h3>
                    <p>{votacion.descripcion}</p>
                  </div>
                )}
              </div>

              <div className="votar-body">
                <div className="votar-slider-container">
                  <label htmlFor="nota-slider">Tu Calificación</label>
                  <div className="nota-input-group">
                    <div className={`nota-display ${getSliderColor(nota)}`}>
                      {nota.toFixed(1)}
                    </div>
                    <div className="nota-input-wrapper">
                      <input
                        type="number"
                        className="nota-input-exacto"
                        value={nota.toString()}
                        onChange={handleNotaInputChange}
                        onBlur={(e) =>
                          setNota(
                            parseFloat(parseFloat(e.target.value).toFixed(1))
                          )
                        }
                        min="0"
                        max="10"
                        step="0.1"
                        disabled={isDisabled}
                      />
                      <div className="nota-input-controls">
                        <button
                          type="button"
                          onClick={handleIncrement}
                          className="control-btn"
                          disabled={isDisabled}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={handleDecrement}
                          className="control-btn"
                          disabled={isDisabled}
                        >
                          ▼
                        </button>
                      </div>
                    </div>
                  </div>
                  <input
                    type="range"
                    id="nota-slider"
                    min="0"
                    max="10"
                    step="0.1"
                    value={nota}
                    onChange={(e) => setNota(parseFloat(e.target.value))}
                    disabled={isDisabled}
                    className={`slider ${getSliderColor(nota)}`}
                  />
                  <div className="slider-labels">
                    <span>0.0</span>
                    <span>10.0</span>
                  </div>
                </div>
              </div>
              <div className="votar-footer">
                <button
                  onClick={handleSubmit}
                  disabled={isDisabled}
                  className="submit-voto-button"
                >
                  {isSubmitting ? "Enviando..." : "Emitir Voto"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function VotarTesisPage() {
  return (
    <Suspense
      fallback={
        <div className="loading-container">
          <h2>Cargando...</h2>
        </div>
      }
    >
      <VotarTesisContent />
    </Suspense>
  );
}
