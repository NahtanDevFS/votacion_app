// pages/dashboard/tesis/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import "./dashboard_tesis.css"; // Crearemos este nuevo archivo CSS
import VotacionTesisCard from "@/components/VotacionTesisCard"; // Creamos este nuevo componente

// Definimos los tipos de datos para mayor seguridad y claridad
export interface ImagenTesis {
  id: number;
  url_imagen: string;
  descripcion?: string;
}

export interface VotacionTesis {
  id: number;
  titulo: string;
  nombre_tesista: string;
  estado: "inactiva" | "activa" | "finalizada";
  duracion_segundos: number;
  fecha_activacion: string | null;
  imagen_votacion_tesis: ImagenTesis[];
  // Añadiremos la nota final cuando la calculemos
  nota_final?: number;
}

export default function TesisDashboardPage() {
  const router = useRouter();
  const [votaciones, setVotaciones] = useState<VotacionTesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVotacionesTesis = useCallback(async () => {
    setLoading(true);
    const user = JSON.parse(localStorage.getItem("admin") || "{}");

    // Hacemos el fetch a la nueva tabla 'votacion_tesis' y traemos las imágenes relacionadas
    const { data: votacionesData, error } = await supabase
      .from("votacion_tesis")
      .select(
        `
        id,
        titulo,
        nombre_tesista,
        estado,
        duracion_segundos,
        fecha_activacion,
        imagen_votacion_tesis (id, url_imagen)
      `
      )
      .eq("creado_por", user.id)
      .order("id", { ascending: false });

    if (error) {
      console.error("Error fetching votaciones:", error);
      setError("No se pudieron cargar las votaciones.");
      setVotaciones([]);
      setLoading(false);
      return;
    }
    if (votacionesData) {
      const votacionesConNotasPromises = votacionesData.map(
        async (votacion): Promise<VotacionTesis> => {
          // 1. Indicamos explícitamente el tipo de retorno
          let nota_final: number | undefined = undefined;

          if (votacion.estado === "finalizada") {
            const { data, error: rpcError } = await supabase.rpc(
              "calcular_nota_final",
              {
                id_votacion: votacion.id,
              }
            );

            if (rpcError) {
              console.error(
                `Error calculating score for votacion ${votacion.id}:`,
                rpcError
              );
              nota_final = 0; // Asignamos un valor por defecto en caso de error
            } else {
              nota_final = data || 0;
            }
          }

          // 2. Devolvemos un objeto que siempre coincide con la interfaz VotacionTesis
          return {
            ...votacion,
            nota_final, // Puede ser un número o undefined, lo cual es correcto
          };
        }
      );

      const votacionesFinales = await Promise.all(votacionesConNotasPromises);
      setVotaciones(votacionesFinales); // 3. El error desaparece
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchVotacionesTesis();
  }, [fetchVotacionesTesis]);

  // Filtramos las votaciones por estado
  const votacionesInactivas = votaciones.filter((v) => v.estado === "inactiva");
  const votacionesActivas = votaciones.filter((v) => v.estado === "activa");
  const votacionesFinalizadas = votaciones.filter(
    (v) => v.estado === "finalizada"
  );

  if (loading)
    return <div className="loading">Cargando votaciones de tesis...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="tesis-dashboard-container">
      <div className="tesis-dashboard-header">
        <h1 className="tesis-dashboard-title">Votaciones de Tesis</h1>
        <button
          className="create-button-tesis"
          onClick={() => router.push("/crear-votacion-tesis")}
        >
          + Crear Votación de Tesis
        </button>
      </div>

      {/* Sección de Votaciones Activas */}
      <section className="votaciones-section">
        <h2 className="section-title activas">Activas</h2>
        {votacionesActivas.length > 0 ? (
          <div className="votaciones-grid-tesis">
            {votacionesActivas.map((votacion) => (
              <VotacionTesisCard key={votacion.id} votacion={votacion} />
            ))}
          </div>
        ) : (
          <p className="no-votaciones-tesis">
            No hay votaciones activas en este momento.
          </p>
        )}
      </section>

      {/* Sección de Votaciones Inactivas */}
      <section className="votaciones-section">
        <h2 className="section-title inactivas">Inactivas</h2>
        {votacionesInactivas.length > 0 ? (
          <div className="votaciones-grid-tesis">
            {votacionesInactivas.map((votacion) => (
              <VotacionTesisCard key={votacion.id} votacion={votacion} />
            ))}
          </div>
        ) : (
          <p className="no-votaciones-tesis">No hay votaciones inactivas.</p>
        )}
      </section>

      {/* Sección de Votaciones Finalizadas */}
      <section className="votaciones-section">
        <h2 className="section-title finalizadas">Finalizadas</h2>
        {votacionesFinalizadas.length > 0 ? (
          <div className="votaciones-grid-tesis">
            {votacionesFinalizadas.map((votacion) => (
              <VotacionTesisCard key={votacion.id} votacion={votacion} />
            ))}
          </div>
        ) : (
          <p className="no-votaciones-tesis">
            Aún no hay votaciones finalizadas.
          </p>
        )}
      </section>
    </div>
  );
}
