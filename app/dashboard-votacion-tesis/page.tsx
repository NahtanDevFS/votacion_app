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
    const intervalId = setInterval(
      () => fetchAndProcessVotaciones(false),
      2000
    );
    return () => clearInterval(intervalId);
  }, [fetchAndProcessVotaciones]);

  const handleExportPDF = async () => {
    const finalizadas = votaciones.filter((v) => v.estado === "finalizada");
    if (finalizadas.length === 0) {
      Swal.fire(
        "Sin datos",
        "No hay votaciones finalizadas para exportar.",
        "info"
      );
      return;
    }

    Swal.fire({
      title: "Generando PDF...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    // Preparar datos y encabezados dinámicos
    const reportData = await Promise.all(
      finalizadas.map(async (v) => {
        // CORRECCIÓN 1: Filtrar votos por votacion_tesis_id específica
        const { data: votos, count } = await supabase
          .from("voto_tesis")
          .select("nota, rol_al_votar,*, participantes(nombre_completo)", {
            count: "exact",
          })
          .eq("votacion_tesis_id", v.id);

        const { data: juradosAsignados } = await supabase
          .from("jurado_por_votacion")
          .select("*,participantes(nombre_completo)")
          .eq("votacion_tesis_id", v.id)
          .order("id", { ascending: true })
          .limit(3);

        const votosPublico =
          votos?.filter((v) => v.rol_al_votar === "publico") || [];
        const promedioPublico =
          votosPublico.length > 0
            ? votosPublico.reduce((acc, voto) => acc + voto.nota, 0) /
              votosPublico.length
            : 0;

        const notasJurados: { [key: string]: string | number } = {};
        const juradoNames = (juradosAsignados || []).map(
          (j) => j.participantes?.nombre_completo || "Jurado desconocido"
        );

        juradoNames.forEach((nombre) => {
          const voto = votos?.find(
            (v) => v.participantes?.nombre_completo === nombre
          );
          notasJurados[nombre] =
            voto && typeof voto.nota === "number"
              ? voto.nota.toFixed(2)
              : "N/V";
        });

        return {
          ...v,
          totalVotos: count ?? 0,
          promedioPublico: promedioPublico.toFixed(2),
          notasJurados,
          juradoNames,
        };
      })
    );

    const allJuradoNames = [
      ...new Set(reportData.flatMap((d) => d.juradoNames)),
    ];
    while (allJuradoNames.length < 3)
      allJuradoNames.push(`Jurado ${allJuradoNames.length + 1}`);

    const head = [
      [
        "Tesis",
        "Tesista",
        "Carnet",
        ...allJuradoNames,
        "Promedio Público",
        "Total Votos",
        "Nota Final",
      ],
    ];
    const body = reportData.map((d) => [
      d.titulo,
      d.nombre_tesista || "N/A",
      d.carnet || "N/A",
      ...allJuradoNames.map((name) => d.notasJurados[name] || "N/A"),
      d.promedioPublico,
      d.totalVotos,
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
      Swal.fire(
        "Sin datos",
        "No hay votaciones finalizadas para exportar.",
        "info"
      );
      return;
    }

    Swal.fire({
      title: "Generando Excel...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    const data = await Promise.all(
      finalizadas.map(async (v) => {
        // CORRECCIÓN 1: Filtrar votos por votacion_tesis_id específica
        const { data: votos, count } = await supabase
          .from("voto_tesis")
          .select("nota, rol_al_votar,*, participantes(nombre_completo)", {
            count: "exact",
          })
          .eq("votacion_tesis_id", v.id);

        const { data: juradosAsignados } = await supabase
          .from("jurado_por_votacion")
          .select("*, participantes(nombre_completo)")
          .eq("votacion_tesis_id", v.id)
          .order("id", { ascending: true })
          .limit(3);

        const votosPublico =
          votos?.filter((v) => v.rol_al_votar === "publico") || [];
        const promedioPublico =
          votosPublico.length > 0
            ? votosPublico.reduce((acc, voto) => acc + voto.nota, 0) /
              votosPublico.length
            : null;

        const juradosData: { [key: string]: number | string } = {};
        (juradosAsignados || []).forEach((jurado) => {
          if (jurado.participantes?.nombre_completo) {
            const voto = votos?.find(
              (v) =>
                v.participantes?.nombre_completo ===
                jurado.participantes!.nombre_completo
            );
            juradosData[jurado.participantes.nombre_completo] =
              voto && typeof voto.nota === "number" ? voto.nota : "N/V";
          }
        });

        // CORRECCIÓN 2: Mantener orden correcto con Nota Final al final
        return {
          Tesis: v.titulo,
          Tesista: v.nombre_tesista || "N/A",
          Carnet: v.carnet || "N/A",
          ...juradosData,
          "Promedio Público": promedioPublico,
          "Total Votos": count ?? 0,
          "Nota Final": v.nota_final || null,
        };
      })
    );

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Votaciones Finalizadas");

    Swal.close();
    XLSX.writeFile(wb, "reporte_votaciones_tesis.xlsx");
  };

  const handleExportPDFDetallado = async () => {
    const finalizadas = votaciones.filter((v) => v.estado === "finalizada");
    if (finalizadas.length === 0) {
      Swal.fire(
        "Sin datos",
        "No hay votaciones finalizadas para exportar.",
        "info"
      );
      return;
    }

    Swal.fire({
      title: "Generando PDF Detallado...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    const doc = new jsPDF({ orientation: "landscape" });
    doc.text("Reporte Detallado de Votaciones de Tesis Finalizadas", 14, 16);

    // CORRECCIÓN 3: Iniciar la primera tabla después del título
    let currentY = 25;

    for (const v of finalizadas) {
      const { data: votos, count } = await supabase
        .from("voto_tesis")
        .select("nota, rol_al_votar, participantes(nombre_completo, carnet)", {
          count: "exact",
        })
        .eq("votacion_tesis_id", v.id);

      // CORRECCIÓN 4: Obtener información de jurados para el detallado
      const { data: juradosAsignados } = await supabase
        .from("jurado_por_votacion")
        .select("*, participantes(nombre_completo, carnet)")
        .eq("votacion_tesis_id", v.id)
        .order("id", { ascending: true });

      const votosPublico =
        votos?.filter((voto) => voto.rol_al_votar === "publico") || [];

      const votosJurados =
        votos?.filter((voto) => voto.rol_al_votar === "jurado") || [];

      // Verificar si hay espacio, si no, agregar nueva página
      if (currentY > 180) {
        doc.addPage();
        currentY = 20;
      }

      autoTable(doc, {
        head: [["Tesis", "Tesista", "Carnet", "Total Votos", "Nota Final"]],
        body: [
          [
            v.titulo,
            v.nombre_tesista || "N/A",
            v.carnet || "N/A",
            count ?? 0,
            v.nota_final?.toFixed(2) || "N/A",
          ],
        ],
        startY: currentY,
        theme: "striped",
      });

      currentY = (doc as any).lastAutoTable.finalY + 5;

      // Tabla de jurados
      if (votosJurados.length > 0) {
        if (currentY > 180) {
          doc.addPage();
          currentY = 20;
        }

        autoTable(doc, {
          head: [["Jurado", "Carnet", "Nota"]],
          body: votosJurados.map((voto) => {
            const participante = Array.isArray(voto.participantes)
              ? voto.participantes[0]
              : voto.participantes;
            return [
              participante?.nombre_completo || "N/A",
              participante?.carnet || "N/A",
              voto.nota.toFixed(2),
            ];
          }),
          startY: currentY,
          theme: "grid",
        });

        currentY = (doc as any).lastAutoTable.finalY + 5;
      }

      // Tabla de público
      if (votosPublico.length > 0) {
        if (currentY > 180) {
          doc.addPage();
          currentY = 20;
        }

        autoTable(doc, {
          head: [["Público", "Carnet", "Nota"]],
          body: votosPublico.map((voto) => {
            const participante = Array.isArray(voto.participantes)
              ? voto.participantes[0]
              : voto.participantes;
            return [
              participante?.nombre_completo || "N/A",
              participante?.carnet || "N/A",
              voto.nota.toFixed(2),
            ];
          }),
          startY: currentY,
          theme: "grid",
        });

        currentY = (doc as any).lastAutoTable.finalY + 10;
      } else {
        currentY += 10;
      }
    }

    Swal.close();
    doc.save("reporte_detallado_votaciones_tesis.pdf");
  };

  const handleExportExcelDetallado = async () => {
    const finalizadas = votaciones.filter((v) => v.estado === "finalizada");
    if (finalizadas.length === 0) {
      Swal.fire(
        "Sin datos",
        "No hay votaciones finalizadas para exportar.",
        "info"
      );
      return;
    }

    Swal.fire({
      title: "Generando Excel Detallado...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    const wb = XLSX.utils.book_new();

    const resumenData = await Promise.all(
      finalizadas.map(async (v) => {
        const { count } = await supabase
          .from("voto_tesis")
          .select("id", { count: "exact" })
          .eq("votacion_tesis_id", v.id);

        return {
          Tesis: v.titulo,
          Tesista: v.nombre_tesista,
          Carnet: v.carnet,
          "Total Votos": count,
          "Nota Final": v.nota_final,
        };
      })
    );

    const wsResumen = XLSX.utils.json_to_sheet(resumenData);
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen Votaciones");

    // CORRECCIÓN 4: Agregar hojas para jurados y público por separado
    for (const v of finalizadas) {
      const { data: votosJurados } = await supabase
        .from("voto_tesis")
        .select("nota, participantes(nombre_completo, carnet)")
        .eq("votacion_tesis_id", v.id)
        .eq("rol_al_votar", "jurado");

      const { data: votosPublico } = await supabase
        .from("voto_tesis")
        .select("nota, participantes(nombre_completo, carnet)")
        .eq("votacion_tesis_id", v.id)
        .eq("rol_al_votar", "publico");

      const sheetBaseName = v.titulo.substring(0, 25);

      // Hoja de jurados
      if (votosJurados && votosJurados.length > 0) {
        const juradosData = votosJurados.map((voto) => {
          const participante = Array.isArray(voto.participantes)
            ? voto.participantes[0]
            : voto.participantes;
          return {
            Jurado: participante?.nombre_completo || "N/A",
            Carnet: participante?.carnet || "N/A",
            Nota: voto.nota,
          };
        });
        const wsJurados = XLSX.utils.json_to_sheet(juradosData);
        XLSX.utils.book_append_sheet(wb, wsJurados, `${sheetBaseName}-Jurados`);
      }

      // Hoja de público
      if (votosPublico && votosPublico.length > 0) {
        const publicoData = votosPublico.map((voto) => {
          const participante = Array.isArray(voto.participantes)
            ? voto.participantes[0]
            : voto.participantes;
          return {
            Público: participante?.nombre_completo || "N/A",
            Carnet: participante?.carnet || "N/A",
            Nota: voto.nota,
          };
        });
        const wsPublico = XLSX.utils.json_to_sheet(publicoData);
        XLSX.utils.book_append_sheet(wb, wsPublico, `${sheetBaseName}-Público`);
      }
    }

    Swal.close();
    XLSX.writeFile(wb, "reporte_detallado_votaciones_tesis.xlsx");
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
            onClick={handleExportPDFDetallado}
            disabled={votacionesFinalizadas.length === 0}
            style={{ marginLeft: "10px" }}
          >
            Exportar a PDF (Detallado)
          </button>
          <button
            className="create-button-tesis"
            onClick={handleExportExcelDetallado}
            disabled={votacionesFinalizadas.length === 0}
            style={{ marginLeft: "10px" }}
          >
            Exportar a Excel (Detallado)
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
