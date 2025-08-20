"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import QRCode from "react-qr-code";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import "./ConteoEncuesta.css";
import { showLoadingAlert } from "@/lib/loadingAlerts";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Resultado = { nombre: string; votos: number };

type Encuesta = {
  id: number;
  titulo: string;
  descripcion: string;
  estado: "en_progreso" | "expirada";
  token_link: string;
};

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (!reader.result) return reject(new Error("Error reading file"));
      const img = new Image();
      img.src = reader.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        const width = img.width > MAX_WIDTH ? MAX_WIDTH : img.width;
        const scaleSize = width / img.width;
        const height = img.height * scaleSize;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("Canvas is empty"));
            const compressedFile = new File(
              [blob],
              file.name.replace(/\.[^.]+$/, ".jpg"),
              {
                type: "image/jpeg",
                lastModified: Date.now(),
              }
            );
            resolve(compressedFile);
          },
          "image/jpeg",
          0.6 //60% de calidad
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

export default function ConteoEncuestaPage() {
  const [encuestaId, setEncuestaId] = useState<string | null>(null);
  const [infoEncuesta, setInfoEncuesta] = useState<Encuesta | null>(null);
  const [incisos, setIncisos] = useState<{ id: number; texto: string }[]>([]);
  const [dataMap, setDataMap] = useState<Record<number, Resultado[]>>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [showEditModal, setShowEditModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newEncuesta, setNewEncuesta] = useState({
    titulo: "",
    descripcion: "",
    estado: "en_progreso",
    incisos: [] as {
      id?: number;
      texto: string;
      tipo_inciso: "opcion_unica" | "opcion_multiple";
      opciones: {
        id?: number;
        texto: string;
        imagen?: File | null;
        imagen_url?: string | null;
        preview?: string;
      }[];
    }[],
  });
  const [deleteVotes, setDeleteVotes] = useState(true); //estado del checkbox

  useEffect(() => {
    if (infoEncuesta) {
      fetchIncisosForEdit(infoEncuesta.id);
    }
  }, [infoEncuesta]);

  const fetchIncisosForEdit = async (id: number) => {
    const { data: incs, error } = await supabase
      .from("inciso_encuesta")
      .select(
        `
      id,
      texto,
      tipo_inciso,
      opcion_encuesta (
        id,
        texto,
        imagen_url
      )
    `
      )
      .eq("encuesta_id", id);

    if (error || !incs) {
      console.error("Error al leer incisos:", error);
      return;
    }
    const incisosFormateados = incs.map((inc: any) => ({
      id: inc.id, //guarda id del inciso
      texto: inc.texto,
      tipo_inciso: inc.tipo_inciso,
      opciones: inc.opcion_encuesta.map((op: any) => ({
        id: op.id, //guarda id de la opción
        texto: op.texto,
        imagen_url: op.imagen_url,
        preview: op.imagen_url,
      })),
    }));

    setNewEncuesta({
      titulo: infoEncuesta?.titulo || "",
      descripcion: infoEncuesta?.descripcion || "",
      estado: infoEncuesta?.estado || "en_progreso",
      incisos: incisosFormateados,
    });
  };

  const handleEditClick = async () => {
    setShowEditModal(true);
  };

  const handleImageChange = (i: number, j: number, file: File | null) => {
    const copy = [...newEncuesta.incisos];
    copy[i].opciones[j].imagen = file;
    copy[i].opciones[j].preview = file ? URL.createObjectURL(file) : undefined;
    setNewEncuesta({ ...newEncuesta, incisos: copy });
  };

  const handleRemoveImage = (i: number, j: number) => {
    const copy = [...newEncuesta.incisos];
    copy[i].opciones[j] = {
      ...copy[i].opciones[j],
      imagen: null,
      imagen_url: null,
      preview: undefined,
    };
    setNewEncuesta({ ...newEncuesta, incisos: copy });
  };

  const handleUpdateEncuesta = async () => {
    if (!infoEncuesta) return;

    //validaciones
    if (!newEncuesta.titulo.trim() || !newEncuesta.descripcion.trim()) {
      Swal.fire({
        icon: "warning",
        title: "Campos incompletos",
        text: "Completa título y descripción",
        confirmButtonColor: "#6200ff",
      });
      return;
    }
    for (const inc of newEncuesta.incisos) {
      if (!inc.texto.trim()) {
        Swal.fire({
          icon: "warning",
          title: "Inciso vacío",
          text: "Cada inciso debe tener texto",
          confirmButtonColor: "#6200ff",
        });
        return;
      }
      if (!inc.opciones.some((o) => o.texto.trim())) {
        Swal.fire({
          icon: "warning",
          title: "Opciones faltantes",
          text: "Cada inciso necesita al menos una opción",
          confirmButtonColor: "#6200ff",
        });
        return;
      }
      if (inc.opciones.some((o) => !o.texto.trim())) {
        Swal.fire({
          icon: "warning",
          title: "Opción vacía",
          text: "Ninguna opción puede quedar sin texto",
          confirmButtonColor: "#6200ff",
        });
        return;
      }
    }

    //confirmar borrado de votos si el checkbox está marcado
    if (deleteVotes) {
      const confirm = await Swal.fire({
        title: "¿Quieres reiniciar los votos de esta encuesta?",
        text: "Cuando guardes los cambios, la encuesta se reiniciará y se perderán todos los votos actuales ¿Deseas continuar?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Sí, editar",
        cancelButtonText: "Cancelar",
      });
      if (!confirm.isConfirmed) return; //cancelar operación completa
    }

    const loadingAlert = showLoadingAlert("Actualizando encuesta...");
    setIsSubmitting(true);

    try {
      //Actualizar datos básicos de la encuesta
      await supabase
        .from("encuesta")
        .update({
          titulo: newEncuesta.titulo,
          descripcion: newEncuesta.descripcion,
          estado: newEncuesta.estado,
        })
        .eq("id", infoEncuesta.id);

      //Traer estado actual (incisos + opciones) para calcular el diff
      const { data: oldIncs, error: oldErr } = await supabase
        .from("inciso_encuesta")
        .select(
          `
        id,
        texto,
        tipo_inciso,
        opcion_encuesta (
          id,
          texto,
          imagen_url
        )
      `
        )
        .eq("encuesta_id", infoEncuesta.id);

      if (oldErr) throw oldErr;

      const oldIncisoIds = (oldIncs || []).map((i: any) => i.id);
      const newIncisoIds = newEncuesta.incisos
        .map((i) => i.id)
        .filter((id): id is number => typeof id === "number");

      const removedIncisoIds = oldIncisoIds.filter(
        (id: number) => !newIncisoIds.includes(id)
      );

      //Manejo de votos
      if (deleteVotes) {
        // borra todos los votos de esta encuesta (vinculados a sus incisos)
        if (oldIncisoIds.length) {
          await supabase
            .from("voto_participante_encuesta")
            .delete()
            .in("inciso_id", oldIncisoIds);
        }
      } else {
        //borra sólo los votos ligados a incisos u opciones eliminados
        if (removedIncisoIds.length) {
          await supabase
            .from("voto_participante_encuesta")
            .delete()
            .in("inciso_id", removedIncisoIds);
        }

        //por cada inciso que se mantiene, detectar opciones eliminadas
        const oldIncMap = new Map<number, any>(
          (oldIncs || []).map((inc: any) => [inc.id, inc])
        );

        for (const inc of newEncuesta.incisos) {
          if (!inc.id) continue; // inciso nuevo, no hay votos que limpiar aún
          const oldOpts = (oldIncMap.get(inc.id)?.opcion_encuesta ||
            []) as any[];
          const oldOptIds = oldOpts.map((o) => o.id);
          const newOptIds = inc.opciones
            .map((o) => o.id)
            .filter((id): id is number => typeof id === "number");
          const removedOptIds = oldOptIds.filter(
            (id: number) => !newOptIds.includes(id)
          );

          if (removedOptIds.length) {
            await supabase
              .from("voto_participante_encuesta")
              .delete()
              .in("opcion_id", removedOptIds);
          }
        }
      }

      //Borrar únicamente los incisos eliminados (sus votos ya se limpiaron o se eliminarán por cascade)
      if (removedIncisoIds.length) {
        await supabase
          .from("inciso_encuesta")
          .delete()
          .in("id", removedIncisoIds);
      }

      //Upsert por inciso y sus opciones
      const oldIncMap = new Map<number, any>(
        (oldIncs || []).map((inc: any) => [inc.id, inc])
      );

      for (const inc of newEncuesta.incisos) {
        let incisoId = inc.id;

        if (incisoId) {
          //update inciso existente
          await supabase
            .from("inciso_encuesta")
            .update({
              texto: inc.texto,
              tipo_inciso: inc.tipo_inciso,
            })
            .eq("id", incisoId);

          //opciones: diff contra las antiguas
          const oldOpts = (oldIncMap.get(incisoId)?.opcion_encuesta ||
            []) as any[];
          const oldOptIds = oldOpts.map((o) => o.id);
          const newOptIds = inc.opciones
            .map((o) => o.id)
            .filter((id): id is number => typeof id === "number");
          const removedOptIds = oldOptIds.filter(
            (id: number) => !newOptIds.includes(id)
          );

          //borrar solo opciones removidas
          if (removedOptIds.length) {
            await supabase
              .from("opcion_encuesta")
              .delete()
              .in("id", removedOptIds);
          }

          //upsert de opciones restantes/nuevas
          for (const op of inc.opciones) {
            let imagen_url = op.imagen_url || null;

            if (op.imagen) {
              const compressed = await compressImage(op.imagen);
              const fileName = `${infoEncuesta.id}_${Math.random()
                .toString(36)
                .substring(2)}.jpg`;
              const { error: uploadErr } = await supabase.storage
                .from("imgs")
                .upload(fileName, compressed);
              if (!uploadErr) {
                imagen_url = supabase.storage
                  .from("imgs")
                  .getPublicUrl(fileName).data.publicUrl;
              }
            }

            if (op.id) {
              await supabase
                .from("opcion_encuesta")
                .update({ texto: op.texto, imagen_url })
                .eq("id", op.id);
            } else {
              await supabase
                .from("opcion_encuesta")
                .insert({ inciso_id: incisoId, texto: op.texto, imagen_url });
            }
          }
        } else {
          //insert inciso nuevo
          const { data: incInserted, error: incErr } = await supabase
            .from("inciso_encuesta")
            .insert({
              encuesta_id: infoEncuesta.id,
              texto: inc.texto,
              tipo_inciso: inc.tipo_inciso,
            })
            .select()
            .single();
          if (incErr || !incInserted)
            throw incErr || new Error("No se pudo crear el inciso");
          incisoId = incInserted.id;

          //insertar todas las opciones del inciso nuevo
          const opcionesFinal = await Promise.all(
            inc.opciones.map(async (op) => {
              let imagen_url = op.imagen_url || null;
              if (op.imagen) {
                const compressed = await compressImage(op.imagen);
                const fileName = `${infoEncuesta.id}_${Math.random()
                  .toString(36)
                  .substring(2)}.jpg`;
                const { error: uploadErr } = await supabase.storage
                  .from("imgs")
                  .upload(fileName, compressed);
                if (!uploadErr) {
                  imagen_url = supabase.storage
                    .from("imgs")
                    .getPublicUrl(fileName).data.publicUrl;
                }
              }
              return { inciso_id: incisoId!, texto: op.texto, imagen_url };
            })
          );
          if (opcionesFinal.length) {
            await supabase.from("opcion_encuesta").insert(opcionesFinal);
          }
        }
      }

      loadingAlert.close();

      Swal.fire("Actualizado", "Encuesta actualizada correctamente", "success");
      setShowEditModal(false);
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "No se pudo actualizar", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEncuestaId(params.get("encuesta"));
  }, []);

  useEffect(() => {
    if (!encuestaId) return;

    const fetchEncuesta = async () => {
      const { data } = await supabase
        .from("encuesta")
        .select("id, titulo, descripcion, estado, token_link")
        .eq("id", parseInt(encuestaId))
        .single();
      if (data) setInfoEncuesta(data);
    };

    fetchEncuesta();
  }, [encuestaId]);

  useEffect(() => {
    if (!encuestaId) return;
    const fetchConteo = async () => {
      const { data: incs } = await supabase
        .from("inciso_encuesta")
        .select("id, texto")
        .eq("encuesta_id", parseInt(encuestaId));
      if (!incs) return;
      setIncisos(incs);
      const nuevoMap: Record<number, Resultado[]> = {};
      for (const inc of incs) {
        const { data: ops } = await supabase
          .from("opcion_encuesta")
          .select("id, texto")
          .eq("inciso_id", inc.id);
        const { data: votos } = await supabase
          .from("voto_participante_encuesta")
          .select("opcion_id")
          .eq("inciso_id", inc.id);
        const resultados: Resultado[] = ops!.map((o) => ({
          nombre: o.texto,
          votos: votos?.filter((v) => v.opcion_id === o.id).length || 0,
        }));
        nuevoMap[inc.id] = resultados;
      }
      setDataMap(nuevoMap);
    };

    fetchConteo();
    const timer = setInterval(fetchConteo, 1000);
    return () => clearInterval(timer);
  }, [encuestaId]);

  const handleCopyCode = async () => {
    if (!infoEncuesta) return;
    try {
      await navigator.clipboard.writeText(infoEncuesta.token_link);
      Swal.fire({
        icon: "success",
        title: "Copiado",
        text: `Código "${infoEncuesta.token_link}" copiado`,
        timer: 750,
        showConfirmButton: false,
      });
    } catch {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo copiar el código",
      });
    }
  };
  const handleCopyUrl = async () => {
    if (!infoEncuesta) return;
    const fullUrl = `${window.location.origin}/encuesta/${infoEncuesta.token_link}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      Swal.fire({
        icon: "success",
        title: "URL copiada",
        text: fullUrl,
        timer: 750,
        showConfirmButton: false,
      });
    } catch {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo copiar la URL",
      });
    }
  };

  const handleToggleState = async () => {
    if (!infoEncuesta) return;
    const nuevoEstado =
      infoEncuesta.estado === "en_progreso" ? "expirada" : "en_progreso";
    const confirm = await Swal.fire({
      title: `¿Marcar como ${nuevoEstado}?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: `Sí, cambiar`,
      cancelButtonText: "Cancelar",
    });
    if (!confirm.isConfirmed) return;
    await supabase
      .from("encuesta")
      .update({ estado: nuevoEstado })
      .eq("id", infoEncuesta.id);
    setInfoEncuesta({ ...infoEncuesta, estado: nuevoEstado });
  };

  const handleDeleteEncuesta = async () => {
    if (!infoEncuesta) return;
    const confirm = await Swal.fire({
      title: "¿Eliminar encuesta?",
      text: "Esta acción no se puede deshacer.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
    });
    if (!confirm.isConfirmed) return;
    setDeletingId(infoEncuesta.id);
    await supabase.from("encuesta").delete().eq("id", infoEncuesta.id);
    Swal.fire("Eliminada", "La encuesta ha sido eliminada.", "success");
    setInfoEncuesta(null);
    setTimeout(() => (window.location.href = "/dashboard-encuesta"), 1600);
  };

  const GraficaPastel = ({ data }: { data: Resultado[] }) => {
    const total = data.reduce((s, o) => s + o.votos, 0);
    return (
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            dataKey="votos"
            nameKey="nombre"
            cx="50%"
            cy="50%"
            outerRadius={80}
            label={({ name, votos }) =>
              `${name} (${total > 0 ? Math.round((votos / total) * 100) : 0}%)`
            }
            isAnimationActive={false}
          >
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={
                  ["#00c3ff", "#00ffb3", "#ffc658", "#ff8042", "#b366ff"][i % 5]
                }
              />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    );
  };

  if (!infoEncuesta)
    return <div className="contenedor-estadisticas">Cargando...</div>;
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${baseUrl}/encuesta/${infoEncuesta.token_link}`;

  const handleQRCodeClick = () => {
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${window.location.origin}/encuesta/${infoEncuesta.token_link}`;
    Swal.fire({
      title: "Código QR",
      imageUrl: url,
      imageWidth: 300,
      imageHeight: 300,
      imageAlt: "QR code",
      showCloseButton: true,
      showConfirmButton: false,
      background: "#fff",
    });
  };

  return (
    <div className="contenedor-estadisticas">
      <button className="btn-volver" onClick={() => window.history.back()}>
        Volver
      </button>
      <div className="info-votacion-extra">
        <div className="qr-contenedor">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=${window.location.origin}/votacion/${infoEncuesta.token_link}`}
            alt="QR"
            onClick={handleQRCodeClick}
            style={{ cursor: "pointer" }}
          />
        </div>
        <div className="info-textos">
          <div className="url-encuesta-container">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="votacion-link-estilo"
            >
              ir_a_url_encuesta
            </a>
            <button
              className="btn-copiar-url-encuesta"
              onClick={handleCopyUrl}
              type="button"
            >
              Copiar URL
            </button>
          </div>
          <p>
            <strong>Código:</strong> {infoEncuesta.token_link}
            <button
              onClick={handleCopyCode}
              className="btn-copiar-code-encuesta"
            >
              Copiar
            </button>
          </p>
          <p>
            <strong>Estado:</strong>{" "}
            {infoEncuesta.estado === "en_progreso" ? "En progreso" : "Expirada"}
          </p>
          <div className="botones-accion">
            <button className="btn-accion" onClick={handleEditClick}>
              Editar
            </button>
            <button
              className={`btn-accion ${
                infoEncuesta.estado === "en_progreso"
                  ? "btn-finalizar"
                  : "btn-activar"
              }`}
              onClick={handleToggleState}
            >
              {infoEncuesta.estado === "en_progreso" ? "Finalizar" : "Activar"}
            </button>
            <button
              className="btn-accion btn-eliminar"
              onClick={handleDeleteEncuesta}
              disabled={deletingId === infoEncuesta.id}
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>

      <h1>Resultados de la Encuesta</h1>
      {infoEncuesta?.titulo && (
        <h2 className="titulo-encuesta">{infoEncuesta.titulo}</h2>
      )}

      {incisos.map((inc) => {
        const datos = dataMap[inc.id] || [];
        const total = datos.reduce((s, d) => s + d.votos, 0);
        const maxVotos = Math.max(...datos.map((d) => d.votos), 0);
        const hayEmpate = datos.filter((d) => d.votos === maxVotos).length > 1;
        return (
          <section key={inc.id} className="seccion-inciso">
            <h2>{inc.texto}</h2>
            <div className="voto-total">Votos Totales: {total}</div>
            <div className="contenedor-conteo-horizontal">
              {datos.map((d) => (
                <div className="tarjeta-voto" key={d.nombre}>
                  <strong>{d.nombre}</strong>: {d.votos}
                </div>
              ))}
            </div>
            <div className="barra-votos">
              {datos.map((d) => {
                const pct = total > 0 ? Math.round((d.votos / total) * 100) : 0;
                const isWinner = !hayEmpate && d.votos === maxVotos;
                return (
                  <div className="barra-item" key={d.nombre}>
                    <span className="barra-label">{d.nombre}</span>
                    <div className="barra-porcentaje">
                      <div
                        className="barra-interna"
                        style={{
                          width: `${pct}%`,
                          background: isWinner
                            ? "linear-gradient(to right, #ffb728ff, #ffe74fff)"
                            : "linear-gradient(to right, #00c3ff, #00ffa5)",
                        }}
                      >
                        {pct}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <h3 className="titulo-seccion-grafica">Gráfica de barras</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={datos} margin={{ bottom: 20 }}>
                <XAxis dataKey="nombre" tick={{ fill: "#aaa", fontSize: 20 }} />
                <YAxis allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                  wrapperStyle={{
                    backgroundColor: "#1e2a38",
                    borderRadius: 8,
                    border: "none",
                    color: "#fff",
                    fontSize: "1rem",
                    boxShadow: "0 0 10px rgba(0,0,0,0.4)",
                  }}
                  contentStyle={{ backgroundColor: "#1e2a38", border: "none" }}
                  labelStyle={{ color: "#00ffa5", fontWeight: "bold" }}
                  itemStyle={{ color: "#fff" }}
                />
                <Bar dataKey="votos">
                  {datos.map((d, i) => {
                    const color = hayEmpate
                      ? "#00CFFF"
                      : d.votos === maxVotos
                      ? "#FFD700"
                      : "#00CFFF";
                    return <Cell key={i} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <h3 className="titulo-seccion-grafica">Grafica de pastel</h3>
            <GraficaPastel data={datos} />
          </section>
        );
      })}
      {showEditModal && infoEncuesta && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Editar Encuesta</h2>

            <div className="form-group">
              <label>Título *</label>
              <input
                type="text"
                value={newEncuesta.titulo}
                onChange={(e) =>
                  setNewEncuesta({ ...newEncuesta, titulo: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label>Descripción *</label>
              <textarea
                value={newEncuesta.descripcion}
                onChange={(e) =>
                  setNewEncuesta({
                    ...newEncuesta,
                    descripcion: e.target.value,
                  })
                }
              />
            </div>

            <div className="form-group">
              <label>Estado *</label>
              <select
                value={newEncuesta.estado}
                onChange={(e) =>
                  setNewEncuesta({ ...newEncuesta, estado: e.target.value })
                }
              >
                <option value="en_progreso">En progreso</option>
                <option value="expirada">Expirada</option>
              </select>
            </div>

            {newEncuesta.incisos.map((inc, i) => (
              <div key={i} className="inciso-block">
                <div className="inciso-header">
                  <h3>Inciso #{i + 1}</h3>
                  {newEncuesta.incisos.length > 1 && (
                    <button
                      onClick={() => {
                        const copy = [...newEncuesta.incisos];
                        copy.splice(i, 1);
                        setNewEncuesta({ ...newEncuesta, incisos: copy });
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                <label>Texto del inciso *</label>
                <input
                  type="text"
                  value={inc.texto}
                  onChange={(e) => {
                    const copy = [...newEncuesta.incisos];
                    copy[i].texto = e.target.value;
                    setNewEncuesta({ ...newEncuesta, incisos: copy });
                  }}
                />

                <label>Tipo de inciso *</label>
                <select
                  value={(inc as any).tipo_inciso || "opcion_unica"}
                  onChange={(e) => {
                    const copy = [...newEncuesta.incisos];
                    (copy[i] as any).tipo_inciso = e.target.value;
                    setNewEncuesta({ ...newEncuesta, incisos: copy });
                  }}
                >
                  <option value="opcion_unica">Opción única</option>
                  <option value="opcion_multiple">Opción múltiple</option>
                </select>

                <div>
                  <strong>Opciones:</strong>
                  {inc.opciones.map((op, j) => (
                    <div key={j} className="opcion-input-container">
                      <div className="opcion-input">
                        <input
                          type="text"
                          value={op.texto}
                          onChange={(e) => {
                            const copy = [...newEncuesta.incisos];
                            copy[i].opciones[j].texto = e.target.value;
                            setNewEncuesta({ ...newEncuesta, incisos: copy });
                          }}
                          placeholder={`Opción ${j + 1}`}
                        />
                        {j > 0 && (
                          <button
                            onClick={() => {
                              const copy = [...newEncuesta.incisos];
                              copy[i].opciones.splice(j, 1);
                              setNewEncuesta({ ...newEncuesta, incisos: copy });
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <div className="image-upload-container">
                        <label className="image-upload-label">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) =>
                              handleImageChange(
                                i,
                                j,
                                e.target.files?.[0] || null
                              )
                            }
                            style={{ display: "none" }}
                          />
                          <span className="upload-button">
                            {op.preview ? "Cambiar imagen" : "Agregar imagen"}
                          </span>
                        </label>
                        {op.preview && (
                          <>
                            <div className="image-preview-container">
                              <img
                                src={op.preview}
                                alt="Preview"
                                className="image-preview"
                                style={{ width: "30px", height: "30px" }}
                              />
                            </div>
                            <button
                              type="button"
                              className="remove-image-button"
                              onClick={() => handleRemoveImage(i, j)}
                            >
                              ✕
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  <button
                    className="add-opcion"
                    onClick={() => {
                      const copy = [...newEncuesta.incisos];
                      copy[i].opciones.push({ texto: "" });
                      setNewEncuesta({ ...newEncuesta, incisos: copy });
                    }}
                  >
                    + Añadir Opción
                  </button>
                </div>
              </div>
            ))}

            <button
              className="add-inciso"
              onClick={() =>
                setNewEncuesta({
                  ...newEncuesta,
                  incisos: [
                    ...newEncuesta.incisos,
                    {
                      texto: "",
                      tipo_inciso: "opcion_unica",
                      opciones: [{ texto: "" }],
                    },
                  ],
                })
              }
            >
              + Añadir Inciso
            </button>
            <label className="checkbox-label-borrar-votos">
              <input
                className="checkbox-borrar-votos"
                type="checkbox"
                checked={deleteVotes}
                onChange={(e) => setDeleteVotes(e.target.checked)}
              />{" "}
              Reiniciar encuesta al guardar cambios
            </label>

            <div className="modal-actions">
              <button
                onClick={() => setShowEditModal(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button onClick={handleUpdateEncuesta} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <span className="spinner"></span> Guardando...
                  </>
                ) : (
                  "Guardar Cambios"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
