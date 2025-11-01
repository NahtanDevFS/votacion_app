"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import VotacionParticipanteCard from "@/components/VotacionParticipanteCard";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { RealtimeChannel } from "@supabase/supabase-js";
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
  finalizada_definitivamente: number;
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

  // Referencias para las suscripciones
  const votacionChannelRef = useRef<RealtimeChannel | null>(null);
  const votoChannelRef = useRef<RealtimeChannel | null>(null);

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
          router.push("/tesis-votaciones-autenticacion");
        } else {
          setParticipante(data);
        }
      } else {
        router.push("/tesis-votaciones-autenticacion");
      }
    };

    loadFingerprint();
    fetchParticipantData();
  }, [router]);

  // Función para enriquecer una votación con datos de voto y nota final
  const enrichVotacion = useCallback(
    async (votacion: any): Promise<VotacionParaParticipante> => {
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
    },
    [participante, fingerprint]
  );

  // Carga inicial de votaciones
  const fetchVotaciones = useCallback(async () => {
    if (!participante && !fingerprint) return;
    setLoading(true);

    try {
      const { data: votacionesData, error: fetchError } = await supabase
        .from("votacion_tesis")
        .select(
          `
          *,
          imagen_votacion_tesis(
            id,
            url_imagen
          )
        `
        )
        .in("estado", ["activa", "inactiva", "finalizada"])
        .order("fecha_creacion", { ascending: false });

      if (fetchError) throw fetchError;

      const votacionesEnriquecidas = await Promise.all(
        (votacionesData || []).map(enrichVotacion)
      );

      setVotaciones(votacionesEnriquecidas);
      setError(null);
    } catch (err: any) {
      console.error("Error al cargar votaciones:", err);
      setError("No se pudieron cargar las votaciones.");
    } finally {
      setLoading(false);
    }
  }, [participante, fingerprint, enrichVotacion]);

  //SOLUCIÓN Hook para recargar datos al volver a enfocar la pestaña
  useEffect(() => {
    const handleVisibilityChange = () => {
      // Si la pestaña vuelve a estar visible
      if (document.visibilityState === "visible") {
        console.log("Pestaña visible, recargando votaciones...");
        // Vuelve a llamar a tu función de carga de datos
        fetchVotaciones();
      }
    };

    // Añade el listener
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Limpia el listener al desmontar el componente
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchVotaciones]); // Asegúrate de incluir fetchVotaciones en las dependencias

  // Configurar suscripciones Realtime
  useEffect(() => {
    if (!participante && !fingerprint) return;

    // Limpiar suscripciones anteriores
    if (votacionChannelRef.current) {
      supabase.removeChannel(votacionChannelRef.current);
    }
    if (votoChannelRef.current) {
      supabase.removeChannel(votoChannelRef.current);
    }

    // Suscripción a cambios en votacion_tesis
    const votacionChannel = supabase
      .channel("votaciones_list_changes")
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT, UPDATE, DELETE
          schema: "public",
          table: "votacion_tesis",
        },
        async (payload) => {
          console.log("Cambio en votacion_tesis:", payload);

          if (payload.eventType === "INSERT") {
            // Nueva votación creada - cargar con imágenes
            const { data: votacionCompleta } = await supabase
              .from("votacion_tesis")
              .select(
                `
                *,
                imagen_votacion_tesis(
                  id,
                  url_imagen
                )
              `
              )
              .eq("id", payload.new.id)
              .single();

            if (votacionCompleta) {
              const nuevaVotacion = await enrichVotacion(votacionCompleta);
              setVotaciones((prev) => [nuevaVotacion, ...prev]);
            }
          } else if (payload.eventType === "UPDATE") {
            // Votación actualizada - mantener imágenes existentes
            setVotaciones((prev) =>
              prev.map((v) => {
                if (v.id === payload.new.id) {
                  return {
                    ...v,
                    ...payload.new,
                    imagen_votacion_tesis: v.imagen_votacion_tesis, // Mantener imágenes
                  };
                }
                return v;
              })
            );

            // Si cambió a finalizada, recalcular nota final
            if (payload.new.estado === "finalizada") {
              const { data: notaFinal } = await supabase.rpc(
                "calcular_nota_final",
                {
                  id_votacion: payload.new.id,
                }
              );
              setVotaciones((prev) =>
                prev.map((v) =>
                  v.id === payload.new.id ? { ...v, nota_final: notaFinal } : v
                )
              );
            }
          } else if (payload.eventType === "DELETE") {
            // Votación eliminada
            setVotaciones((prev) =>
              prev.filter((v) => v.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    votacionChannelRef.current = votacionChannel;

    // Suscripción a cambios en voto_tesis (para actualizar estado de "ha_votado")
    let votoFilter = "";
    if (participante) {
      votoFilter = `participante_id=eq.${participante.id}`;
    } else if (fingerprint) {
      votoFilter = `fingerprint=eq.${fingerprint}`;
    }

    const votoChannel = supabase
      .channel("votos_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "voto_tesis",
          filter: votoFilter,
        },
        async (payload) => {
          console.log("Nuevo voto registrado:", payload);
          const votacionId = payload.new.votacion_tesis_id;

          // Actualizar la votación correspondiente
          setVotaciones((prev) =>
            prev.map((v) =>
              v.id === votacionId
                ? { ...v, ha_votado: true, mi_nota: payload.new.nota }
                : v
            )
          );
        }
      )
      .subscribe();

    votoChannelRef.current = votoChannel;

    // Cleanup
    return () => {
      supabase.removeChannel(votacionChannel);
      supabase.removeChannel(votoChannel);
      votacionChannelRef.current = null;
      votoChannelRef.current = null;
    };
  }, [participante, fingerprint, enrichVotacion]);

  // Cargar votaciones inicialmente
  useEffect(() => {
    if (participante || fingerprint) {
      fetchVotaciones();
    }
  }, [participante, fingerprint, fetchVotaciones]);

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
        <h2 className="section-title finalizadas">Cerradas y Finalizadas</h2>
        {votacionesFinalizadas.length > 0 ? (
          <div className="votaciones-list">
            {votacionesFinalizadas.map((votacion) => (
              <VotacionParticipanteCard key={votacion.id} votacion={votacion} />
            ))}
          </div>
        ) : (
          <p className="no-votaciones">
            No hay votaciones cerradas o finalizadas.
          </p>
        )}
      </section>
    </div>
  );
}
