"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import VotacionParticipanteCard from "../../components/VotacionParticipanteCard";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import "./VotacionesTesis.css";

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
  ha_votado: boolean;
  nota_final?: number;
  mi_nota?: number;
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
  const [fingerprint, setFingerprint] = useState<string | null>(null);

  useEffect(() => {
    const loadFingerprint = async () => {
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      setFingerprint(result.visitorId);
    };

    const fetchParticipantData = async () => {
      const token = localStorage.getItem("token_participante_tesis_vote_up");
      if (token) {
        const { data, error } = await supabase
          .from("participantes")
          .select("id, nombre_completo")
          .eq("codigo_acceso", token)
          .single();
        if (error || !data) {
          console.error("Error fetching participant data:", error);
          localStorage.removeItem("token_participante_tesis_vote_up");
          loadFingerprint(); // Fallback to fingerprint if token is invalid
        } else {
          setParticipante(data);
        }
      } else {
        loadFingerprint(); // Load fingerprint for public users
      }
    };

    fetchParticipantData();
  }, [router]);

  useEffect(() => {
    if (!participante && !fingerprint) return;

    let timeoutId: NodeJS.Timeout;
    let isInitial = true;

    const smartFetchVotaciones = async () => {
      if (isInitial) {
        setLoading(true);
      }
      try {
        const { data: votacionesData, error: fetchError } = await supabase
          .from("votacion_tesis")
          .select(`*, imagen_votacion_tesis(*)`)
          .in("estado", ["activa", "inactiva", "finalizada"])
          .order("fecha_creacion", { ascending: false });

        if (fetchError) throw fetchError;

        let proximaActualizacionEn = 5000; // Default polling interval: 5 seconds
        const ahora = Date.now();

        const votacionesConEstadoDeVoto = await Promise.all(
          (votacionesData || []).map(async (votacion) => {
            // Adaptive polling logic
            if (votacion.estado === "activa" && votacion.fecha_activacion) {
              const fechaFin =
                new Date(votacion.fecha_activacion).getTime() +
                votacion.duracion_segundos * 1000;
              const restanteMs = fechaFin - ahora;

              // If a votation is in its last minute, poll faster.
              if (restanteMs > 0 && restanteMs < 60000) {
                proximaActualizacionEn = 1000; // 1 second
              }
            }

            let query = supabase
              .from("voto_tesis")
              .select("id, nota")
              .eq("votacion_tesis_id", votacion.id);

            if (participante) {
              query = query.eq("participante_id", participante.id);
            } else if (fingerprint) {
              query = query.eq("fingerprint", fingerprint);
            }

            const { data: voto, error: votoError } = await query.maybeSingle();

            if (votoError) {
              console.error(
                `Error al verificar el voto para la votación ${votacion.id}:`,
                votoError
              );
            }

            let nota_final;
            if (votacion.estado === "finalizada") {
              const { data } = await supabase.rpc("calcular_nota_final", {
                id_votacion: votacion.id,
              });
              nota_final = data;
            }

            return {
              ...votacion,
              ha_votado: !!voto,
              mi_nota: voto?.nota,
              nota_final,
            };
          })
        );
        setVotaciones(votacionesConEstadoDeVoto as VotacionParaParticipante[]);
        setError(null);

        timeoutId = setTimeout(smartFetchVotaciones, proximaActualizacionEn);
      } catch (err: any) {
        console.error("Error al refrescar votaciones:", err);
        setError("No se pudieron cargar las votaciones.");
        timeoutId = setTimeout(smartFetchVotaciones, 5000); // Retry on error
      } finally {
        if (isInitial) {
          setLoading(false);
          isInitial = false;
        }
      }
    };

    smartFetchVotaciones(); // Start the polling loop

    return () => clearTimeout(timeoutId); // Cleanup on component unmount
  }, [participante, fingerprint]);

  const handleLogout = () => {
    localStorage.removeItem("token_participante_tesis_vote_up");
    router.push("/");
  };

  if ((!participante && !fingerprint) || loading) {
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
      {participante && (
        <button onClick={handleLogout} className="logout-button-participante">
          Borrar token y salir
        </button>
      )}

      <div className="votaciones-header">
        {participante ? (
          <h2 className="welcome-message">
            Ingresaste como: {participante.nombre_completo}
          </h2>
        ) : (
          <h2 className="welcome-message">Ingresaste como Público</h2>
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
