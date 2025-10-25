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
  titulo_tesis: string;
  nombre_tesista: string | null;
  carnet: string | null;
  descripcion: string | null;
  estado: "inactiva" | "activa" | "finalizada";
  duracion_segundos: number;
  fecha_activacion: string | null;
  imagen_votacion_tesis: ImagenTesis[];
  nota_final?: number;
  // --- MODIFICACIÓN 1: Añadir campo ---
  finalizada_definitivamente: number;
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
          // --- MODIFICACIÓN 2: `select` ya incluye el campo por el `*` ---
          .select(`*, imagen_votacion_tesis(id, url_imagen)`)
          .eq("creado_por", user.id)
          .order("id", { ascending: false });
        if (fetchError) throw fetchError;
        const votacionesConNotas = await Promise.all(
          votacionesData.map(async (votacion) => {
            // --- MODIFICACIÓN 3: Asegurar que el estado `finalizada_definitivamente` se propague ---
            // (Ya está incluido por el `...votacion` y el `select *`)
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
    // Filtrar votaciones "Cerradas" o "Finalizadas"
    const finalizadas = votaciones.filter((v) => v.estado === "finalizada");
    if (finalizadas.length === 0) {
      Swal.fire(
        "Sin datos",
        "No hay votaciones cerradas o finalizadas para exportar.", // Texto actualizado
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
              ? voto.nota.toFixed(1)
              : "N/V";
        });

        return {
          ...v,
          totalVotos: count ?? 0,
          promedioPublico: promedioPublico.toFixed(1),
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
        // --- MODIFICACIÓN 4: Añadir estado al reporte ---
        //"Estado",
      ],
    ];
    const body = reportData.map((d) => [
      d.titulo_tesis, //titulo o titulo_tesis
      d.nombre_tesista || "N/A",
      d.carnet || "N/A",
      ...allJuradoNames.map((name) => d.notasJurados[name] || "N/A"),
      d.promedioPublico,
      d.totalVotos,
      d.nota_final?.toFixed(1) || "N/A",
      // --- MODIFICACIÓN 5: Mostrar texto de estado ---
      //d.finalizada_definitivamente === 1 ? "Finalizada" : "Cerrada",
    ]);

    const doc = new jsPDF({ orientation: "landscape" });
    doc.text("Reporte de Votaciones de Tesis Finalizadas o Cerradas", 14, 16);
    autoTable(doc, { head, body, startY: 20 });

    Swal.close();
    doc.save("reporte_votaciones_tesis.pdf");
  };

  const handleExportExcel = async () => {
    const finalizadas = votaciones.filter((v) => v.estado === "finalizada");
    if (finalizadas.length === 0) {
      Swal.fire(
        "Sin datos",
        "No hay votaciones cerradas o finalizadas para exportar.", // Texto actualizado
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
            ? parseFloat(
                (
                  votosPublico.reduce((acc, voto) => acc + voto.nota, 0) /
                  votosPublico.length
                ).toFixed(1)
              )
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
              voto && typeof voto.nota === "number"
                ? parseFloat(voto.nota.toFixed(1))
                : "N/V";
          }
        });

        // CORRECCIÓN 2: Construir objeto en orden específico para mantener columnas
        const row: any = {
          Tesis: v.titulo_tesis, //titulo o titulo_tesis
          Tesista: v.nombre_tesista || "N/A",
          Carnet: v.carnet || "N/A",
        };

        // Agregar jurados en orden
        Object.keys(juradosData).forEach((key) => {
          row[key] = juradosData[key];
        });

        // Agregar campos finales en orden
        row["Promedio Público"] = promedioPublico;
        row["Total Votos"] = count ?? 0;
        row["Nota Final"] = v.nota_final
          ? parseFloat(v.nota_final.toFixed(1))
          : null;
        // --- MODIFICACIÓN 6: Añadir estado al reporte ---
        //row["Estado"] = v.finalizada_definitivamente === 1 ? "Finalizada" : "Cerrada";

        return row;
      })
    );

    // Obtener todos los nombres de jurados únicos para definir el orden de columnas
    const allJuradoNames = new Set<string>();
    data.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (
          key !== "Tesis" &&
          key !== "Tesista" &&
          key !== "Carnet" &&
          key !== "Promedio Público" &&
          key !== "Total Votos" &&
          key !== "Nota Final" &&
          // --- MODIFICACIÓN 7: Ignorar estado para orden ---
          key !== "Estado"
        ) {
          allJuradoNames.add(key);
        }
      });
    });

    // Definir el orden exacto de las columnas
    const columnOrder = [
      "Tesis",
      "Tesista",
      "Carnet",
      ...Array.from(allJuradoNames),
      "Promedio Público",
      "Total Votos",
      "Nota Final",
      // --- MODIFICACIÓN 8: Añadir estado al orden ---
      //"Estado",
    ];

    // Crear hoja con orden específico de columnas
    const ws = XLSX.utils.json_to_sheet(data, { header: columnOrder });
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
        "No hay votaciones cerradas o finalizadas para exportar.", // Texto actualizado
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
    doc.text(
      "Reporte Detallado de Votaciones de Tesis Finalizadas o Cerradas",
      14,
      16
    );

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

      // --- MODIFICACIÓN 9: Añadir estado al reporte ---
      autoTable(doc, {
        head: [
          ["Tesis", "Tesista", "Carnet", "Total Votos", "Nota Final"],
          //["Tesis", "Tesista", "Carnet", "Total Votos", "Nota Final", "Estado"],
        ],
        body: [
          [
            v.titulo_tesis, //titulo o titulo_tesis
            v.nombre_tesista || "N/A",
            v.carnet || "N/A",
            count ?? 0,
            v.nota_final?.toFixed(1) || "N/A",
            // --- MODIFICACIÓN 10: Mostrar texto de estado ---
            //v.finalizada_definitivamente === 1 ? "Finalizada" : "Cerrada",
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
              voto.nota.toFixed(1),
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

        // Calcular promedio del público
        const promedioPublico =
          votosPublico.reduce((acc, voto) => acc + voto.nota, 0) /
          votosPublico.length;

        const bodyPublico = votosPublico.map((voto) => {
          const participante = Array.isArray(voto.participantes)
            ? voto.participantes[0]
            : voto.participantes;
          return [
            participante?.nombre_completo || "N/A",
            participante?.carnet || "N/A",
            voto.nota.toFixed(1),
          ];
        });

        // Agregar fila de promedio
        bodyPublico.push(["PROMEDIO PÚBLICO", "", promedioPublico.toFixed(1)]);

        autoTable(doc, {
          head: [["Público", "Carnet", "Nota"]],
          body: bodyPublico,
          startY: currentY,
          theme: "grid",
          didParseCell: function (data) {
            // Hacer bold la fila del promedio
            if (data.row.index === bodyPublico.length - 1) {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = [240, 240, 240];
            }
          },
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
        "No hay votaciones cerradas o finalizadas para exportar.", // Texto actualizado
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
    const allData: any[] = [];

    // CORRECCIÓN 4: Todo en una sola hoja, igual que el PDF
    for (const v of finalizadas) {
      const { data: votos, count } = await supabase
        .from("voto_tesis")
        .select("nota, rol_al_votar, participantes(nombre_completo, carnet)", {
          count: "exact",
        })
        .eq("votacion_tesis_id", v.id);

      const votosJurados =
        votos?.filter((voto) => voto.rol_al_votar === "jurado") || [];

      const votosPublico =
        votos?.filter((voto) => voto.rol_al_votar === "publico") || [];

      // Encabezado de la tesis
      // --- MODIFICACIÓN 11: Añadir estado al reporte ---
      allData.push({
        Tipo: "TESIS",
        Nombre: v.titulo_tesis, //titulo o titulo_tesis
        Carnet: v.carnet || "N/A",
        Nota: "",
        "Total Votos": count ?? 0,
        "Nota Final": v.nota_final?.toFixed(1) || "N/A",
        // --- MODIFICACIÓN 12: Mostrar texto de estado ---
        //Estado: v.finalizada_definitivamente === 1 ? "Finalizada" : "Cerrada",
      });

      allData.push({
        Tipo: "Tesista",
        Nombre: v.nombre_tesista || "N/A",
        Carnet: "",
        Nota: "",
        "Total Votos": "",
        "Nota Final": "",
        //Estado: "", // Columna vacía
      });

      // Votos de jurados
      if (votosJurados.length > 0) {
        votosJurados.forEach((voto) => {
          const participante = Array.isArray(voto.participantes)
            ? voto.participantes[0]
            : voto.participantes;
          allData.push({
            Tipo: "Jurado",
            Nombre: participante?.nombre_completo || "N/A",
            Carnet: participante?.carnet || "N/A",
            Nota: voto.nota.toFixed(1),
            "Total Votos": "",
            "Nota Final": "",
            //Estado: "", // Columna vacía
          });
        });
      }

      // Votos del público
      if (votosPublico.length > 0) {
        votosPublico.forEach((voto) => {
          const participante = Array.isArray(voto.participantes)
            ? voto.participantes[0]
            : voto.participantes;
          allData.push({
            Tipo: "Público",
            Nombre: participante?.nombre_completo || "N/A",
            Carnet: participante?.carnet || "N/A",
            Nota: voto.nota.toFixed(1),
            "Total Votos": "",
            "Nota Final": "",
            //Estado: "", // Columna vacía
          });
        });

        // Agregar fila de promedio del público
        const promedioPublico =
          votosPublico.reduce((acc, voto) => acc + voto.nota, 0) /
          votosPublico.length;
        allData.push({
          Tipo: "PROMEDIO PÚBLICO",
          Nombre: "",
          Carnet: "",
          Nota: promedioPublico.toFixed(1),
          "Total Votos": "",
          "Nota Final": "",
          //Estado: "", // Columna vacía
        });
      }

      // Fila vacía como separador
      allData.push({
        Tipo: "",
        Nombre: "",
        Carnet: "",
        Nota: "",
        "Total Votos": "",
        "Nota Final": "",
        //Estado: "", // Columna vacía
      });
    }

    // --- MODIFICACIÓN 13: Añadir Estado a las cabeceras ---
    const header = [
      "Tipo",
      "Nombre",
      "Carnet",
      "Nota",
      "Total Votos",
      "Nota Final",
      //"Estado",
    ];
    const ws = XLSX.utils.json_to_sheet(allData, { header: header });
    XLSX.utils.book_append_sheet(wb, ws, "Reporte Detallado");

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
        <h2 className="section-title finalizadas">Cerradas y Finalizadas</h2>
        {votacionesFinalizadas.length > 0 ? (
          <div className="votaciones-list-tesis">
            {votacionesFinalizadas.map((votacion) => (
              <VotacionTesisCard key={votacion.id} votacion={votacion} />
            ))}
          </div>
        ) : (
          <p className="no-votaciones-tesis">
            Aún no hay votaciones cerradas o finalizadas.
          </p>
        )}
      </section>
    </div>
  );
}
