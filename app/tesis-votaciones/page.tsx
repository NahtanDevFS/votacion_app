// app/tesis-votaciones/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import VotacionParticipanteCard from "@/components/VotacionParticipanteCard";
import "./VotacionesTesis.css";

// Interfaces para tipado
export interface ImagenTesis {
  id: number;
  url_imagen: string;
}

export interface VotacionParaParticipante {
  id: number;
  titulo: string;
  nombre_tesista: string | null;
  estado: "inactiva" | "activa" | "finalizada";
  duracion_segundos: number;
  fecha_activacion: string | null;
  token_qr: string;
  imagen_votacion_tesis: ImagenTesis[];
}

export default function VotacionesTesisPage() {
  const router = useRouter();
  const [votaciones, setVotaciones] = useState<VotacionParaParticipante[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [participanteCodigo, setParticipanteCodigo] = useState<string | null>(
    null
  );

  // 1. Guardia de Autenticación (sin cambios)
  useEffect(() => {
    const token = localStorage.getItem("token_participante_tesis_vote_up");
    if (!token) {
      router.replace("/tesis-votaciones-autenticacion");
    } else {
      setParticipanteCodigo(token);
    }
  }, [router]);

  // 2. Función unificada para obtener los datos
  const fetchVotaciones = useCallback(async (isInitialLoad = false) => {
    if (isInitialLoad) setLoading(true);

    try {
      // No es necesario llamar a finalizar_votaciones_expiradas aquí,
      // ya que el dashboard del admin se encarga de esa tarea.
      // Simplemente obtenemos el estado actual.
      const { data, error: fetchError } = await supabase
        .from("votacion_tesis")
        .select(`*, imagen_votacion_tesis(*)`)
        .in("estado", ["activa", "inactiva"]) // Solo nos interesan estas
        .order("fecha_creacion", { ascending: false });

      if (fetchError) throw fetchError;

      setVotaciones(data || []);
      setError(null);
    } catch (err: any) {
      console.error("Error al refrescar votaciones:", err);
      setError("No se pudieron cargar las votaciones.");
    } finally {
      if (isInitialLoad) setLoading(false);
    }
  }, []);

  // 3. Hook principal para carga inicial y polling
  useEffect(() => {
    if (participanteCodigo) {
      fetchVotaciones(true); // Carga inicial

      const intervalId = setInterval(() => {
        console.log(
          "Polling: Refrescando lista de votaciones para participante..."
        );
        fetchVotaciones(false); // Refresco silencioso
      }, 1000); // Cada 1 segundos

      return () => clearInterval(intervalId);
    }
  }, [participanteCodigo, fetchVotaciones]);

  if (!participanteCodigo || loading) {
    return <div className="loading">Cargando votaciones...</div>;
  }

  if (error) return <div className="error-message">{error}</div>;

  const votacionesActivas = votaciones.filter((v) => v.estado === "activa");
  const votacionesInactivas = votaciones.filter((v) => v.estado === "inactiva");

  return (
    <div className="votaciones-participante-container">
      <div className="votaciones-header">
        <h1>Votaciones Disponibles</h1>
        <p>Selecciona una votación activa para participar.</p>
      </div>

      <section className="votaciones-section">
        <h2 className="section-title activas">Activas</h2>
        {votacionesActivas.length > 0 ? (
          <div className="votaciones-list">
            {votacionesActivas.map((votacion) => (
              <VotacionParticipanteCard key={votacion.id} votacion={votacion} />
            ))}
          </div>
        ) : (
          <p className="no-votaciones">
            No hay votaciones activas en este momento.
          </p>
        )}
      </section>

      <section className="votaciones-section">
        <h2 className="section-title inactivas">Próximamente</h2>
        {votacionesInactivas.length > 0 ? (
          <div className="votaciones-list">
            {votacionesInactivas.map((votacion) => (
              <VotacionParticipanteCard key={votacion.id} votacion={votacion} />
            ))}
          </div>
        ) : (
          <p className="no-votaciones">No hay votaciones programadas.</p>
        )}
      </section>
    </div>
  );
}
