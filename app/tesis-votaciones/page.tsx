// app/tesis-votaciones/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import VotacionParticipanteCard from "@/components/VotacionParticipanteCard"; // Crearemos este nuevo componente
import "./VotacionesTesis.css"; // Crearemos este nuevo CSS

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

  // 1. Guardia de Autenticación
  useEffect(() => {
    const token = localStorage.getItem("token_participante_tesis_vote_up");
    if (!token) {
      // Si no hay token, redirige a la página de autenticación
      router.replace("/tesis-votaciones-autenticacion");
    } else {
      setParticipanteCodigo(token);
    }
  }, [router]);

  // 2. Función para obtener los datos iniciales
  const fetchVotaciones = useCallback(async () => {
    setLoading(true);
    // Traemos solo las votaciones que el participante puede ver (activas e inactivas)
    const { data, error } = await supabase
      .from("votacion_tesis")
      .select(`*, imagen_votacion_tesis(*)`)
      .in("estado", ["activa", "inactiva"])
      .order("fecha_creacion", { ascending: false });

    if (error) {
      console.error("Error fetching votaciones:", error);
      setError("No se pudieron cargar las votaciones.");
    } else {
      setVotaciones(data || []);
    }
    setLoading(false);
  }, []);

  // Carga inicial de datos cuando el componente se monta y el participante está verificado
  useEffect(() => {
    if (participanteCodigo) {
      fetchVotaciones();
    }
  }, [participanteCodigo, fetchVotaciones]);

  // 3. Suscripción a cambios en tiempo real
  useEffect(() => {
    // Asegurarse de no ejecutar la suscripción hasta que tengamos el código del participante
    if (!participanteCodigo) return;

    const channel = supabase
      .channel("votacion_tesis_changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "votacion_tesis" },
        (payload) => {
          console.log("Cambio recibido:", payload.new);
          // Actualizamos el estado local con la nueva información de la votación
          setVotaciones((currentVotaciones) =>
            currentVotaciones.map((votacion) =>
              votacion.id === payload.new.id
                ? ({ ...votacion, ...payload.new } as VotacionParaParticipante)
                : votacion
            )
          );
        }
      )
      .subscribe();

    // Limpieza: Desuscribirse del canal cuando el componente se desmonte
    return () => {
      supabase.removeChannel(channel);
    };
  }, [participanteCodigo]);

  if (!participanteCodigo) {
    // Muestra un estado de carga o nulo mientras se verifica el token
    return <div className="loading">Verificando acceso...</div>;
  }

  if (loading) return <div className="loading">Cargando votaciones...</div>;
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
