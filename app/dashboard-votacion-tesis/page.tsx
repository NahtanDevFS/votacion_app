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
import Swal from "sweetalert2";

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
  carnet: string | null;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAndProcessVotaciones = useCallback(
    async (isInitialLoad = false) => {
      if (isInitialLoad) {
        setLoading(true);
      }
      try {
        const user = JSON.parse(localStorage.getItem("admin") || "{}");
        if (!user.id) {
          throw new Error("No se pudo identificar al administrador.");
        }
        await supabase.rpc("finalizar_votaciones_expiradas");
        const { data: votacionesData, error: fetchError } = await supabase
          .from("votacion_tesis")
          .select(`*, imagen_votacion_tesis(id, url_imagen)`)
          .eq("creado_por", user.id)
          .order("id", { ascending: false });
        if (fetchError) throw fetchError;
        const votacionesConNotas = await Promise.all(
          votacionesData.map(async (votacion) => {
            if (votacion.estado === "finalizada") {
              const { data: nota_final } = await supabase.rpc(
                "calcular_nota_final",
                { id_votacion: votacion.id }
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

  useEffect(() => {
    fetchAndProcessVotaciones(true);
    const intervalId = setInterval(() => fetchAndProcessVotaciones(false), 2000);
    return () => clearInterval(intervalId);
  }, [fetchAndProcessVotaciones]);

  const handleExportPDF = async () => {
    const finalizadas = votaciones.filter((v) => v.estado === "finalizada");
    if (finalizadas.length === 0) {
      Swal.fire("Sin datos", "No hay votaciones finalizadas para exportar.", "info");
      return;
    }

    Swal.fire({ title: "Generando PDF...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    // Preparar datos y encabezados dinámicos
    const reportData = await Promise.all(
      finalizadas.map(async (v) => {
        const { data: votos } = await supabase
          .from("voto_tesis")
          .select("nota, rol_al_votar,*, participantes(nombre_completo)")
          .eq("votacion_tesis_id", v.id);

        const { data: juradosAsignados } = await supabase
          .from("jurado_por_votacion")
          .select("*,participantes(nombre_completo)")
          .eq("votacion_tesis_id", v.id)
          .order("id", { ascending: true })
          .limit(3);

        const votosPublico = votos?.filter(v => v.rol_al_votar === 'publico') || [];
        const promedioPublico = votosPublico.length > 0
          ? (votosPublico.reduce((acc, voto) => acc + voto.nota, 0) / votosPublico.length)
          : 0;

        const notasJurados: { [key: string]: string | number } = {};
        const juradoNames = (juradosAsignados || []).map(j => j.participantes?.nombre_completo || 'Jurado desconocido');

        juradoNames.forEach(nombre => {
          const voto = votos?.find(v => v.participantes?.nombre_completo === nombre);
          // FIX: Se comprueba que el voto exista y la nota sea un número (incluyendo 0)
          notasJurados[nombre] = (voto && typeof voto.nota === 'number') ? voto.nota.toFixed(2) : "N/V";
        });
        
        return {
          ...v,
          promedioPublico: promedioPublico.toFixed(2),
          notasJurados,
          juradoNames,
        };
      })
    );

    // Crear un conjunto de todos los nombres de jurados para las columnas
    const allJuradoNames = [...new Set(reportData.flatMap(d => d.juradoNames))];
    while(allJuradoNames.length < 3) allJuradoNames.push(`Jurado ${allJuradoNames.length + 1}`);


    const head = [["Tesis", "Tesista", "Carnet", ...allJuradoNames, "Promedio Público", "Nota Final"]];
    const body = reportData.map(d => [
      d.titulo,
      d.nombre_tesista || "N/A",
      d.carnet || "N/A",
      ...allJuradoNames.map(name => d.notasJurados[name] || "N/A"),
      d.promedioPublico,
      d.nota_final?.toFixed(2) || "N/A",
    ]);

    const doc = new jsPDF({ orientation: "landscape" });
    doc.text("Reporte de Votaciones de Tesis Finalizadas", 14, 16);
    autoTable(doc, { head, body, startY: 20 });
    
    Swal.close();
    doc.save("reporte_votaciones_tesis.pdf");
  };

  const handleExportExcel = async () => {
    const finalizadas = votaciones.filter((v) => v.estado === "finalizada");
    if (finalizadas.length === 0) {
      Swal.fire("Sin datos", "No hay votaciones finalizadas para exportar.", "info");
      return;
    }

    Swal.fire({ title: "Generando Excel...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const data = await Promise.all(
      finalizadas.map(async (v) => {
        const { data: votos } = await supabase
          .from("voto_tesis")
          .select("nota, rol_al_votar,*, participantes(nombre_completo)")
          .eq("votacion_tesis_id", v.id);
        
        const { data: juradosAsignados } = await supabase
          .from("jurado_por_votacion")
          .select("*, participantes(nombre_completo)")
          .eq("votacion_tesis_id", v.id)
          .order("id", { ascending: true })
          .limit(3);

        const votosPublico = votos?.filter(v => v.rol_al_votar === 'publico') || [];
        const promedioPublico = votosPublico.length > 0
          ? (votosPublico.reduce((acc, voto) => acc + voto.nota, 0) / votosPublico.length)
          : null;

        const juradosData: { [key: string]: number | string } = {};
        (juradosAsignados || []).forEach(jurado => {
          if (jurado.participantes?.nombre_completo) {
            const voto = votos?.find(v => v.participantes?.nombre_completo === jurado.participantes!.nombre_completo);
             // FIX: Se comprueba que el voto exista y la nota sea un número (incluyendo 0)
            juradosData[jurado.participantes.nombre_completo] = (voto && typeof voto.nota === 'number') ? voto.nota : "N/V";
          }
        });

        return {
          "Tesis": v.titulo,
          "Tesista": v.nombre_tesista || "N/A",
          "Carnet": v.carnet || "N/A",
          ...juradosData,
          "Promedio Público": promedioPublico,
          "Nota Final": v.nota_final || null,
        };
      })
    );
    
    // Reordenar columnas para que la nota final vaya al final
    const finalData = data.map(row => {
        const { "Nota Final": notaFinal, ...rest } = row;
        return { ...rest, "Nota Final": notaFinal };
    });

    const ws = XLSX.utils.json_to_sheet(finalData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Votaciones Finalizadas");
    
    Swal.close();
    XLSX.writeFile(wb, "reporte_votaciones_tesis.xlsx");
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