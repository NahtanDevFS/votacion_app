// app/tesis-votaciones/[token]/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Swal from "sweetalert2";
import "./VotarTesis.css";

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
}

// --- Componente Principal ---
export default function VotarTesisPage() {
  const params = useParams();
  const router = useRouter();
  const token_qr = params.token as string;

  const [votacion, setVotacion] = useState<VotacionActiva | null>(null);
  const [participante, setParticipante] = useState<Participante | null>(null);
  const [rolParaVotar, setRolParaVotar] = useState<"jurado" | "publico" | null>(
    null
  );
  const [nota, setNota] = useState<number>(5.0);
  const [tiempoRestante, setTiempoRestante] = useState<number | null>(null);
  const [haVotado, setHaVotado] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getSliderColor = (value: number) => {
    if (value >= 7.5) return "verde";
    if (value >= 5.0) return "amarillo";
    return "rojo";
  };

  // Función unificada que valida el acceso y refresca el estado
  const fetchVotacionState = useCallback(
    async (isInitialLoad = false) => {
      if (isInitialLoad) setIsLoading(true);

      const codigoAcceso = localStorage.getItem(
        "token_participante_tesis_vote_up"
      );
      if (!codigoAcceso) {
        router.replace("/tesis-votaciones-autenticacion");
        return;
      }

      try {
        // Obtener info de la votación PRIMERO
        const { data: vData, error: vError } = await supabase
          .from("votacion_tesis")
          .select("*, imagen_votacion_tesis(url_imagen)")
          .eq("token_qr", token_qr)
          .single();

        if (vError)
          throw new Error("La votación no existe o ya no está disponible.");
        if (vData.estado !== "activa") {
          // Si el polling detecta que la votación ya no está activa, muestra el error
          throw new Error("Esta votación ha finalizado.");
        }
        setVotacion(vData);

        // Si es la carga inicial, también validamos al participante
        if (isInitialLoad) {
          const { data: pData, error: pError } = await supabase
            .from("participantes")
            .select("id, rol_general")
            .eq("codigo_acceso", codigoAcceso)
            .single();
          if (pError || !pData)
            throw new Error("Tu código de acceso no es válido.");
          setParticipante(pData);

          const { data: votoExistente } = await supabase
            .from("voto_tesis")
            .select("id")
            .eq("votacion_tesis_id", vData.id)
            .eq("participante_id", pData.id)
            .maybeSingle();
          if (votoExistente) {
            setHaVotado(true);
            throw new Error("Ya has emitido tu voto para esta tesis.");
          }

          if (pData.rol_general === "jurado") {
            const { data: esJuradoAsignado } = await supabase
              .from("jurado_por_votacion")
              .select("id")
              .eq("votacion_tesis_id", vData.id)
              .eq("participante_id", pData.id)
              .maybeSingle();
            setRolParaVotar(esJuradoAsignado ? "jurado" : "publico");
          } else {
            setRolParaVotar("publico");
          }
        }
        setError(null); // Limpia errores si la votación vuelve a estar activa (caso improbable)
      } catch (err: any) {
        setError(err.message);
      } finally {
        if (isInitialLoad) setIsLoading(false);
      }
    },
    [token_qr, router]
  );

  // Hook para la carga inicial y el polling
  useEffect(() => {
    fetchVotacionState(true); // Carga inicial
    const intervalId = setInterval(() => {
      console.log("Polling: Verificando estado de la votación...");
      fetchVotacionState(false); // Refresco silencioso
    }, 15000); // Cada 15 segundos
    return () => clearInterval(intervalId);
  }, [fetchVotacionState]);

  // Hook para el temporizador visual
  useEffect(() => {
    if (votacion && votacion.estado === "activa") {
      const fechaFin =
        new Date(votacion.fecha_activacion).getTime() +
        votacion.duracion_segundos * 1000;
      const interval = setInterval(() => {
        const restante = Math.max(
          0,
          Math.floor((fechaFin - Date.now()) / 1000)
        );
        setTiempoRestante(restante);
        if (restante === 0 && !haVotado) {
          setError("El tiempo para votar ha finalizado.");
          clearInterval(interval);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [votacion, haVotado]);

  const handleSubmit = async () => {
    if (isSubmitting || haVotado || tiempoRestante === 0) return;

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

    if (result.isConfirmed) {
      setIsSubmitting(true);

      try {
        if (!participante || !votacion || !rolParaVotar)
          throw new Error("Faltan datos para registrar el voto.");

        const { error: insertError } = await supabase

          .from("voto_tesis")

          .insert({
            votacion_tesis_id: votacion.id,

            participante_id: participante.id,

            nota: nota,

            rol_al_votar: rolParaVotar,
          });

        if (insertError) throw insertError;

        setHaVotado(true);

        Swal.fire(
          "¡Voto Registrado!",

          "Gracias por tu participación.",

          "success"
        );
      } catch (err: any) {
        Swal.fire(
          "Error",

          "No se pudo registrar tu voto. Es posible que ya hayas votado o el tiempo haya terminado.",

          "error"
        );

        console.error(err);
      } finally {
        setIsSubmitting(false);
      }
    }
  };
  if (isLoading)
    return (
      <div className="loading-container">
        <h2>Verificando...</h2>
      </div>
    );

  const minutos = tiempoRestante !== null ? Math.floor(tiempoRestante / 60) : 0;
  const segundos = tiempoRestante !== null ? tiempoRestante % 60 : 0;

  return (
    <div className="votar-container">
      {error && (
        <div className="votar-card error-card">
          <h2>Acceso Denegado</h2>
          <p>{error}</p>
          <button
            onClick={() => router.push("/tesis-votaciones")}
            className="back-button"
          >
            Volver al listado
          </button>
        </div>
      )}

      {!error && votacion && (
        <div className="votar-card">
          <div className="timer">
            Tiempo Restante: {String(minutos).padStart(2, "0")}:
            {String(segundos).padStart(2, "0")}
          </div>
          <div className="votar-header">
            <h1>{votacion.titulo}</h1>
            <p>{votacion.nombre_tesista}</p>
          </div>
          <div className="votar-body">
            <div className="votar-slider-container">
              <label htmlFor="nota-slider">Tu Calificación</label>
              <div className={`nota-display ${getSliderColor(nota)}`}>
                {nota.toFixed(1)}
              </div>
              <input
                type="range"
                id="nota-slider"
                min="0"
                max="10"
                step="0.1"
                value={nota}
                onChange={(e) => setNota(parseFloat(e.target.value))}
                disabled={
                  haVotado ||
                  isSubmitting ||
                  tiempoRestante === 0 ||
                  error !== null
                }
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
              disabled={
                haVotado ||
                isSubmitting ||
                tiempoRestante === 0 ||
                error !== null
              }
              className="submit-voto-button"
            >
              {haVotado
                ? "Voto Emitido"
                : isSubmitting
                ? "Enviando..."
                : "Emitir Voto"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
