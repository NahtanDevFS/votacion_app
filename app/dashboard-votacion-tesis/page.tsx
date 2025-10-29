// pages/dashboard-votacion-tesis/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import "./dashboard_tesis.css";
import VotacionTesisCard from "@/components/VotacionTesisCard";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import Swal from "sweetalert2";
import type { RealtimeChannel } from "@supabase/supabase-js";

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
  finalizada_definitivamente: number;
}

export default function TesisDashboardPage() {
  const router = useRouter();
  const [votaciones, setVotaciones] = useState<VotacionTesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Ref para almacenar el canal de suscripción
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Ref para el ID del usuario (evita dependencias innecesarias)
  const userIdRef = useRef<number | null>(null);

  // ✅ Función para cargar votaciones (sin dependencias que causen loops)
  const fetchAndProcessVotaciones = useCallback(async () => {
    try {
      const user = JSON.parse(localStorage.getItem("admin") || "{}");
      if (!user.id) {
        throw new Error("No se pudo identificar al administrador.");
      }
      
      // Guardar userId en ref
      userIdRef.current = user.id;
      
      // Finalizar votaciones expiradas antes de cargar
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
      console.error("Error al cargar las votaciones:", err);
      setError("No se pudieron cargar las votaciones.");
    } finally {
      setLoading(false);
    }
  }, []); // ✅ Sin dependencias - se ejecuta solo cuando se llama

  // ✅ Efecto para carga inicial (solo una vez)
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("admin") || "{}");
    if (!user.id) {
      setError("No se pudo identificar al administrador.");
      setLoading(false);
      return;
    }

    // Carga inicial
    fetchAndProcessVotaciones();
  }, [fetchAndProcessVotaciones]);

  // ✅ Efecto separado para configurar suscripciones Realtime
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("admin") || "{}");
    if (!user.id) return;

    // Limpiar suscripción anterior si existe
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    console.log("🔄 Configurando suscripciones Realtime...");

    // Crear canal de suscripción
    const channel = supabase
      .channel("votaciones-dashboard")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "votacion_tesis",
          filter: `creado_por=eq.${user.id}`,
        },
        async (payload) => {
          console.log("📊 Cambio en votacion_tesis:", payload.eventType, payload);
          
          if (payload.eventType === "INSERT") {
            // Nueva votación creada
            const newVotacion = payload.new as VotacionTesis;
            
            // Cargar imágenes asociadas
            const { data: imagenes } = await supabase
              .from("imagen_votacion_tesis")
              .select("id, url_imagen")
              .eq("votacion_tesis_id", newVotacion.id);
            
            newVotacion.imagen_votacion_tesis = imagenes || [];
            
            setVotaciones((prev) => {
              // Evitar duplicados
              if (prev.some(v => v.id === newVotacion.id)) {
                return prev;
              }
              return [newVotacion, ...prev];
            });
            
          } else if (payload.eventType === "UPDATE") {
            // Votación actualizada
            const updatedVotacion = payload.new as VotacionTesis;
            
            setVotaciones((prev) =>
              prev.map((v) => {
                if (v.id === updatedVotacion.id) {
                  // Mantener imágenes existentes si no cambiaron
                  return {
                    ...v,
                    ...updatedVotacion,
                    imagen_votacion_tesis: v.imagen_votacion_tesis
                  };
                }
                return v;
              })
            );
            
            // Si cambió a finalizada, calcular nota final
            if (updatedVotacion.estado === "finalizada") {
              const { data: nota_final } = await supabase.rpc(
                "calcular_nota_final",
                { id_votacion: updatedVotacion.id }
              );
              
              setVotaciones((prev) =>
                prev.map((v) =>
                  v.id === updatedVotacion.id 
                    ? { ...v, nota_final: nota_final || 0 } 
                    : v
                )
              );
            }
            
          } else if (payload.eventType === "DELETE") {
            // Votación eliminada
            console.log("🗑️ Eliminando votación:", payload.old.id);
            setVotaciones((prev) =>
              prev.filter((v) => v.id !== payload.old.id)
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "voto_tesis",
        },
        async (payload) => {
          console.log("🗳️ Cambio en voto_tesis:", payload.eventType);
          
          // Identificar qué votación fue afectada
          const votacionId = (payload.new as any)?.votacion_tesis_id || 
                            (payload.old as any)?.votacion_tesis_id;
          
          if (!votacionId) return;
          
          setVotaciones((prev) => {
            // Verificar si la votación afectada está en nuestro estado
            const votacionAfectada = prev.find(v => v.id === votacionId);
            
            if (!votacionAfectada) return prev;
            
            // Si está finalizada, recalcular su nota final
            if (votacionAfectada.estado === "finalizada") {
              // Ejecutar recálculo de forma asíncrona
              (async () => {
                const { data: nota_final } = await supabase.rpc(
                  "calcular_nota_final",
                  { id_votacion: votacionId }
                );
                
                setVotaciones((current) =>
                  current.map((v) =>
                    v.id === votacionId 
                      ? { ...v, nota_final: nota_final || 0 } 
                      : v
                  )
                );
              })();
            }
            
            return prev;
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "imagen_votacion_tesis",
        },
        async (payload) => {
          console.log("🖼️ Cambio en imagen_votacion_tesis:", payload.eventType);
          
          const votacionId = (payload.new as any)?.votacion_tesis_id || 
                            (payload.old as any)?.votacion_tesis_id;
          
          if (!votacionId) return;
          
          // Recargar imágenes para esa votación específica
          const { data: imagenes } = await supabase
            .from("imagen_votacion_tesis")
            .select("id, url_imagen")
            .eq("votacion_tesis_id", votacionId);
          
          setVotaciones((prev) =>
            prev.map((v) =>
              v.id === votacionId
                ? { ...v, imagen_votacion_tesis: imagenes || [] }
                : v
            )
          );
        }
      )
      .subscribe((status) => {
        console.log("📡 Estado de suscripción:", status);
      });

    channelRef.current = channel;

    // Cleanup al desmontar
    return () => {
      console.log("🔌 Desconectando suscripciones Realtime...");
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []); // ✅ Solo se ejecuta una vez al montar

  // ✅ Verificación periódica de votaciones expiradas (cada 10 segundos)
  useEffect(() => {
    const checkExpiredVotaciones = async () => {
      try {
        await supabase.rpc("finalizar_votaciones_expiradas");
        
        // Recargar votaciones finalizadas para actualizar notas
        const finalizadas = votaciones.filter(v => v.estado === "finalizada");
        
        for (const votacion of finalizadas) {
          const { data: nota_final } = await supabase.rpc(
            "calcular_nota_final",
            { id_votacion: votacion.id }
          );
          
          setVotaciones((prev) =>
            prev.map((v) =>
              v.id === votacion.id 
                ? { ...v, nota_final: nota_final || 0 } 
                : v
            )
          );
        }
      } catch (error) {
        console.error("Error verificando votaciones expiradas:", error);
      }
    };

    // Ejecutar cada 10 segundos
    const interval = setInterval(checkExpiredVotaciones, 10000);

    return () => clearInterval(interval);
  }, [votaciones]);

  const handleExportPDF = async () => {
    const finalizadas = votaciones.filter((v) => v.estado === "finalizada");
    if (finalizadas.length === 0) {
      Swal.fire(
        "Sin datos",
        "No hay votaciones cerradas o finalizadas para exportar.",
        "info"
      );
      return;
    }

    Swal.fire({
      title: "Generando PDF...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    const reportData = await Promise.all(
      finalizadas.map(async (v) => {
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
      ],
    ];
    const body = reportData.map((d) => [
      d.titulo_tesis,
      d.nombre_tesista || "N/A",
      d.carnet || "N/A",
      ...allJuradoNames.map((name) => d.notasJurados[name] || "N/A"),
      d.promedioPublico,
      d.totalVotos,
      d.nota_final?.toFixed(1) || "N/A",
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
        "No hay votaciones cerradas o finalizadas para exportar.",
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

        const row: any = {
          Tesis: v.titulo_tesis,
          Tesista: v.nombre_tesista || "N/A",
          Carnet: v.carnet || "N/A",
        };

        Object.keys(juradosData).forEach((key) => {
          row[key] = juradosData[key];
        });

        row["Promedio Público"] = promedioPublico;
        row["Total Votos"] = count ?? 0;
        row["Nota Final"] = v.nota_final
          ? parseFloat(v.nota_final.toFixed(1))
          : null;

        return row;
      })
    );

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
          key !== "Estado"
        ) {
          allJuradoNames.add(key);
        }
      });
    });

    const columnOrder = [
      "Tesis",
      "Tesista",
      "Carnet",
      ...Array.from(allJuradoNames),
      "Promedio Público",
      "Total Votos",
      "Nota Final",
    ];

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
        "No hay votaciones cerradas o finalizadas para exportar.",
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

    let currentY = 25;

    for (const v of finalizadas) {
      const { data: votos, count } = await supabase
        .from("voto_tesis")
        .select("nota, rol_al_votar, participantes(nombre_completo, carnet)", {
          count: "exact",
        })
        .eq("votacion_tesis_id", v.id);

      const { data: juradosAsignados } = await supabase
        .from("jurado_por_votacion")
        .select("*, participantes(nombre_completo, carnet)")
        .eq("votacion_tesis_id", v.id)
        .order("id", { ascending: true });

      const votosPublico =
        votos?.filter((voto) => voto.rol_al_votar === "publico") || [];

      const votosJurados =
        votos?.filter((voto) => voto.rol_al_votar === "jurado") || [];

      if (currentY > 180) {
        doc.addPage();
        currentY = 20;
      }

      autoTable(doc, {
        head: [["Tesis", "Tesista", "Carnet", "Total Votos", "Nota Final"]],
        body: [
          [
            v.titulo_tesis,
            v.nombre_tesista || "N/A",
            v.carnet || "N/A",
            count ?? 0,
            v.nota_final?.toFixed(1) || "N/A",
          ],
        ],
        startY: currentY,
        theme: "striped",
      });

      currentY = (doc as any).lastAutoTable.finalY + 5;

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

      if (votosPublico.length > 0) {
        if (currentY > 180) {
          doc.addPage();
          currentY = 20;
        }

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

        bodyPublico.push(["PROMEDIO PÚBLICO", "", promedioPublico.toFixed(1)]);

        autoTable(doc, {
          head: [["Público", "Carnet", "Nota"]],
          body: bodyPublico,
          startY: currentY,
          theme: "grid",
          didParseCell: function (data) {
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
        "No hay votaciones cerradas o finalizadas para exportar.",
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

      allData.push({
        Tipo: "TESIS",
        Nombre: v.titulo_tesis,
        Carnet: v.carnet || "N/A",
        Nota: "",
        "Total Votos": count ?? 0,
        "Nota Final": v.nota_final?.toFixed(1) || "N/A",
      });

      allData.push({
        Tipo: "Tesista",
        Nombre: v.nombre_tesista || "N/A",
        Carnet: "",
        Nota: "",
        "Total Votos": "",
        "Nota Final": "",
      });

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
          });
        });
      }

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
          });
        });

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
        });
      }

      allData.push({
        Tipo: "",
        Nombre: "",
        Carnet: "",
        Nota: "",
        "Total Votos": "",
        "Nota Final": "",
      });
    }

    const header = [
      "Tipo",
      "Nombre",
      "Carnet",
      "Nota",
      "Total Votos",
      "Nota Final",
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