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
  const [participanteNombre, setParticipanteNombre] = useState<string | null>(
    null
  );

  // 1. Guardia de Autenticación y obtención de nombre
  useEffect(() => {
    const fetchParticipantData = async () => {
      const token = localStorage.getItem("token_participante_tesis_vote_up");
      if (!token) {
        router.replace("/tesis-votaciones-autenticacion");
        return;
      }

      // Obtener el nombre del participante
      const { data, error } = await supabase
        .from("participantes")
        .select("nombre_completo")
        .eq("codigo_acceso", token)
        .single();

      if (error || !data) {
        console.error("Error fetching participant name:", error);
        // Si no se encuentra, borrar el token inválido y redirigir
        localStorage.removeItem("token_participante_tesis_vote_up");
        router.replace("/tesis-votaciones-autenticacion");
      } else {
        setParticipanteNombre(data.nombre_completo);
      }
    };

    fetchParticipantData();
  }, [router]);

  // 2. Función unificada para obtener los datos
  const fetchVotaciones = useCallback(async (isInitialLoad = false) => {
    if (isInitialLoad) setLoading(true);

    try {
      // Modificamos la consulta para incluir el estado 'finalizada'
      const { data, error: fetchError } = await supabase
        .from("votacion_tesis")
        .select(`*, imagen_votacion_tesis(*)`)
        .in("estado", ["activa", "inactiva", "finalizada"])
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
    if (participanteNombre) {
      // Se ejecuta cuando ya tenemos el nombre
      fetchVotaciones(true);

      const intervalId = setInterval(() => {
        console.log(
          "Polling: Refrescando lista de votaciones para participante..."
        );
        fetchVotaciones(false);
      }, 1000); // 1 segundo es un intervalo razonable

      return () => clearInterval(intervalId);
    }
  }, [participanteNombre, fetchVotaciones]);

  // 4. Función para cerrar sesión
  const handleLogout = () => {
    localStorage.removeItem("token_participante_tesis_vote_up");
    router.push("/");
  };

  if (!participanteNombre || loading) {
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
        {participanteNombre && (
          <h2 className="welcome-message">
            Ingresaste como: {participanteNombre}
          </h2>
        )}
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
