// pages/dashboard-votacion-tesis/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import "./dashboard_tesis.css";
import VotacionTesisCard from "@/components/VotacionTesisCard";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

// Definimos los tipos de datos para mayor seguridad y claridad
export interface ImagenTesis {
  id: number;
  url_imagen: string;
  descripcion?: string;
}

export interface VotacionTesis {
  id: number;
  titulo: string;
  nombre_tesista: string | null;
  carnet: string | null; // Campo añadido
  descripcion: string | null;
  estado: "inactiva" | "activa" | "finalizada";
  duracion_segundos: number;
  fecha_activacion: string | null;
  imagen_votacion_tesis: ImagenTesis[];
  nota_final?: number;
}

export default function TesisDashboardPage() {
  const router = useRouter();
  const [votaciones, setVotaciones] = useState<VotacionTesis[]>([]);
  const [loading, setLoading] = useState(true); // Solo para la carga inicial
  const [error, setError] = useState<string | null>(null);

  // Función unificada para obtener y procesar los datos
  const fetchAndProcessVotaciones = useCallback(
    async (isInitialLoad = false) => {
      // El loader solo se muestra en la carga inicial
      if (isInitialLoad) {
        setLoading(true);
      }

      try {
        const user = JSON.parse(localStorage.getItem("admin") || "{}");
        if (!user.id) {
          throw new Error("No se pudo identificar al administrador.");
        }

        // 1. Llama a la función de la DB para actualizar votaciones expiradas
        const { error: rpcError } = await supabase.rpc(
          "finalizar_votaciones_expiradas"
        );
        if (rpcError) {
          console.error("Error al finalizar votaciones expiradas:", rpcError);
          // No detenemos el proceso, solo lo registramos
        }

        // 2. Obtiene la lista actualizada de votaciones
        const { data: votacionesData, error: fetchError } = await supabase
          .from("votacion_tesis")
          .select(`*, imagen_votacion_tesis(id, url_imagen)`)
          .eq("creado_por", user.id)
          .order("id", { ascending: false });

        if (fetchError) throw fetchError;

        // 3. Calcula las notas finales para las votaciones finalizadas
        const votacionesConNotas = await Promise.all(
          votacionesData.map(async (votacion) => {
            if (votacion.estado === "finalizada") {
              const { data: nota_final } = await supabase.rpc(
                "calcular_nota_final",
                {
                  id_votacion: votacion.id,
                }
              );
              return { ...votacion, nota_final: nota_final || 0 };
            }
            return votacion;
          })
        );

        setVotaciones(votacionesConNotas as VotacionTesis[]);
        setError(null);
      } catch (err: any) {
        console.error("Error al refrescar las votaciones:", err);
        setError("No se pudieron cargar las votaciones.");
      } finally {
        if (isInitialLoad) {
          setLoading(false);
        }
      }
    },
    []
  );

  // Hook principal para manejar la carga inicial y el polling
  useEffect(() => {
    // Carga inicial
    fetchAndProcessVotaciones(true);

    // Configura el polling para que se ejecute cada 1 segundos
    const intervalId = setInterval(() => {
      console.log("Polling: Refrescando votaciones silenciosamente...");
      fetchAndProcessVotaciones(false); // 'false' para que no muestre el loader
    }, 1000); // 1 segundos

    // Limpieza: detiene el polling cuando el componente se desmonta
    return () => clearInterval(intervalId);
  }, [fetchAndProcessVotaciones]);

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const finalizadas = votaciones.filter((v) => v.estado === "finalizada");
    if (finalizadas.length === 0) return;

    doc.text("Votaciones de Tesis Finalizadas", 14, 16);
    autoTable(doc, {
      head: [["Tesis", "Tesista", "Carnet", "Descripción", "Nota Final"]],
      body: finalizadas.map((v) => [
        v.titulo,
        v.nombre_tesista || "N/A",
        v.carnet || "N/A",
        v.descripcion || "N/A",
        v.nota_final?.toFixed(2) || "N/A",
      ]),
      startY: 20,
    });
    doc.save("votaciones_finalizadas.pdf");
  };

  const handleExportExcel = () => {
    const finalizadas = votaciones.filter((v) => v.estado === "finalizada");
    if (finalizadas.length === 0) return;

    const data = finalizadas.map((v) => ({
      Tesis: v.titulo,
      Tesista: v.nombre_tesista || "N/A",
      Carnet: v.carnet || "N/A",
      Descripción: v.descripcion || "N/A",
      "Nota Final": v.nota_final?.toFixed(2) || "N/A",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Votaciones Finalizadas");
    XLSX.writeFile(wb, "votaciones_finalizadas.xlsx");
  };

  if (loading) {
    return <div className="loading">Cargando votaciones de tesis...</div>;
  }
  if (error) {
    return <div className="error-message">{error}</div>;
  }

  const votacionesInactivas = votaciones.filter((v) => v.estado === "inactiva");
  const votacionesActivas = votaciones.filter((v) => v.estado === "activa");
  const votacionesFinalizadas = votaciones.filter(
    (v) => v.estado === "finalizada"
  );

  return (
    <div className="tesis-dashboard-container">
      <div className="tesis-dashboard-header">
        <h1 className="tesis-dashboard-title">Votaciones de Tesis</h1>
        <div>
          <button
            className="create-button-tesis"
            onClick={handleExportPDF}
            disabled={votacionesFinalizadas.length === 0}
          >
            Exportar a PDF
          </button>
          <button
            className="create-button-tesis"
            onClick={handleExportExcel}
            disabled={votacionesFinalizadas.length === 0}
            style={{ marginLeft: "10px" }}
          >
            Exportar a Excel
          </button>
          <button
            className="create-button-tesis"
            onClick={() => router.push("/crear-votacion-tesis")}
            style={{ marginLeft: "10px" }}
          >
            + Crear Votación de Tesis
          </button>
        </div>
      </div>

      <section className="votaciones-section">
        <h2 className="section-title activas">Activas</h2>
        {votacionesActivas.length > 0 ? (
          <div className="votaciones-list-tesis">
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

      <section className="votaciones-section">
        <h2 className="section-title inactivas">Inactivas</h2>
        {votacionesInactivas.length > 0 ? (
          <div className="votaciones-list-tesis">
            {votacionesInactivas.map((votacion) => (
              <VotacionTesisCard key={votacion.id} votacion={votacion} />
            ))}
          </div>
        ) : (
          <p className="no-votaciones-tesis">No hay votaciones inactivas.</p>
        )}
      </section>

      <section className="votaciones-section">
        <h2 className="section-title finalizadas">Finalizadas</h2>
        {votacionesFinalizadas.length > 0 ? (
          <div className="votaciones-list-tesis">
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
