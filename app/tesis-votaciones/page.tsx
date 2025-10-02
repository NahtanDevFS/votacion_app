// app/tesis-votaciones/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import VotacionParticipanteCard from "@/components/VotacionParticipanteCard";
import "./VotacionesTesis.css";

// --- MODIFICADO: Añadimos 'ha_votado' a la interfaz ---
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
  ha_votado: boolean; // <-- NUEVO CAMPO
}

export default function VotacionesTesisPage() {
  const router = useRouter();
  const [votaciones, setVotaciones] = useState<VotacionParaParticipante[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [participante, setParticipante] = useState<{
    id: number;
    nombre_completo: string;
  } | null>(null);

  // 1. Guardia de Autenticación y obtención de datos del participante
  useEffect(() => {
    const fetchParticipantData = async () => {
      const token = localStorage.getItem("token_participante_tesis_vote_up");
      if (!token) {
        router.replace("/tesis-votaciones-autenticacion");
        return;
      }

      // --- MODIFICADO: Obtenemos ID y nombre ---
      const { data, error } = await supabase
        .from("participantes")
        .select("id, nombre_completo")
        .eq("codigo_acceso", token)
        .single();

      if (error || !data) {
        console.error("Error fetching participant data:", error);
        localStorage.removeItem("token_participante_tesis_vote_up");
        router.replace("/tesis-votaciones-autenticacion");
      } else {
        setParticipante(data);
      }
    };

    fetchParticipantData();
  }, [router]);

  // 2. Función unificada para obtener los datos
  const fetchVotaciones = useCallback(
    async (isInitialLoad = false) => {
      // --- MODIFICADO: Asegurarse de tener el participante antes de buscar ---
      if (!participante) return;

      if (isInitialLoad) setLoading(true);

      try {
        const { data: votacionesData, error: fetchError } = await supabase
          .from("votacion_tesis")
          .select(`*, imagen_votacion_tesis(*)`)
          .in("estado", ["activa", "inactiva", "finalizada"])
          .order("fecha_creacion", { ascending: false });

        if (fetchError) throw fetchError;

        // --- NUEVO: Verificar el estado del voto para cada votación ---
        const votacionesConEstadoDeVoto = await Promise.all(
          (votacionesData || []).map(async (votacion) => {
            const { data: voto, error: votoError } = await supabase
              .from("voto_tesis")
              .select("id")
              .eq("votacion_tesis_id", votacion.id)
              .eq("participante_id", participante.id)
              .maybeSingle();

            if (votoError) {
              console.error(
                `Error al verificar el voto para la votación ${votacion.id}:`,
                votoError
              );
            }

            return {
              ...votacion,
              ha_votado: !!voto, // true si 'voto' no es null
            };
          })
        );
        // --- FIN DEL NUEVO BLOQUE ---

        setVotaciones(votacionesConEstadoDeVoto);
        setError(null);
      } catch (err: any) {
        console.error("Error al refrescar votaciones:", err);
        setError("No se pudieron cargar las votaciones.");
      } finally {
        if (isInitialLoad) setLoading(false);
      }
    },
    [participante]
  ); // <-- Añadimos participante como dependencia

  // 3. Hook principal para carga inicial y polling
  useEffect(() => {
    // --- MODIFICADO: Se ejecuta cuando ya tenemos los datos del participante ---
    if (participante) {
      fetchVotaciones(true);

      const intervalId = setInterval(() => {
        console.log(
          "Polling: Refrescando lista de votaciones para participante..."
        );
        fetchVotaciones(false);
      }, 1000); // Se puede ajustar el intervalo a 1 segundos para no ser tan agresivo

      return () => clearInterval(intervalId);
    }
  }, [participante, fetchVotaciones]);

  // 4. Función para cerrar sesión
  const handleLogout = () => {
    localStorage.removeItem("token_participante_tesis_vote_up");
    router.push("/");
  };

  if (!participante || loading) {
    return <div className="loading">Cargando votaciones...</div>;
  }

  if (error) return <div className="error-message">{error}</div>;

  const votacionesActivas = votaciones.filter((v) => v.estado === "activa");
  const votacionesInactivas = votaciones.filter((v) => v.estado === "inactiva");
  const votacionesFinalizadas = votaciones.filter(
    (v) => v.estado === "finalizada"
  );

  return (
    <div className="votaciones-participante-container">
      <button onClick={handleLogout} className="logout-button-participante">
        Borrar token y salir
      </button>

      <div className="votaciones-header">
        {participante && (
          <h2 className="welcome-message">
            Ingresaste como: {participante.nombre_completo}
          </h2>
        )}
        <h1>Votaciones Disponibles</h1>
        <p>Selecciona una votación activa para participar.</p>
      </div>

      {/* SECCIONES DE VOTACIONES (sin cambios en la estructura) */}
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

      <section className="votaciones-section">
        <h2 className="section-title finalizadas">Finalizadas</h2>
        {votacionesFinalizadas.length > 0 ? (
          <div className="votaciones-list">
            {votacionesFinalizadas.map((votacion) => (
              <VotacionParticipanteCard key={votacion.id} votacion={votacion} />
            ))}
          </div>
        ) : (
          <p className="no-votaciones">No hay votaciones finalizadas.</p>
        )}
      </section>
    </div>
  );
}
