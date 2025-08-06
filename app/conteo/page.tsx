// app/conteo/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Customized,
} from "recharts";
import "./Disenoestadi.css";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import { showLoadingAlert } from "@/lib/loadingAlerts";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ResultadoVoto = { nombre: string; votos: number };
type Opcion = {
  nombre: string;
  imagen?: File | null;
  imagen_url?: string | null;
  preview?: string;
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
          0.6 // 60% quality
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

export default function ConteoPage() {
  const [data, setData] = useState<ResultadoVoto[]>([]);
  const [votacionId, setVotacionId] = useState<string | null>(null);
  const [infoVotacion, setInfoVotacion] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [newVotacion, setNewVotacion] = useState({
    titulo: "",
    descripcion: "",
    estado: "en_progreso",
    tipo_votacion: "opcion_unica",
    opciones: [""],
    opcionesConImagen: [] as Opcion[],
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setVotacionId(params.get("votacion"));
  }, []);

  useEffect(() => {
    if (!votacionId) return;
    const fetchVotes = async () => {
      const { data: votacionData } = await supabase
        .from("votacion")
        .select("*, opcion_votacion(*)")
        .eq("id", parseInt(votacionId, 10))
        .single();

      if (votacionData) setInfoVotacion(votacionData);

      const { data: opciones } = await supabase
        .from("opcion_votacion")
        .select("id, nombre")
        .eq("votacion_id", parseInt(votacionId, 10));
      const { data: votos } = await supabase
        .from("voto_participante")
        .select("opcion_votacion_id");

      if (!opciones || !votos) return;

      const conteo = opciones.map((op) => ({
        nombre: op.nombre,
        votos: votos.filter((v) => v.opcion_votacion_id === op.id).length,
      }));

      setData(conteo);
    };

    fetchVotes();
    const intervalo = setInterval(fetchVotes, 500);
    return () => clearInterval(intervalo);
  }, [votacionId]);

  const handleEditClick = async (v: any) => {
    const confirm = await Swal.fire({
      title: "¿Quieres editar esta encuesta?",
      text: "Cuando guardes los cambios, los votos actuales se borraran ¿Deseas continuar?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, editar",
      cancelButtonText: "Cancelar",
    });

    if (confirm.isConfirmed) {
      setNewVotacion({
        titulo: v.titulo,
        descripcion: v.descripcion,
        estado: v.estado,
        tipo_votacion: v.tipo_votacion,
        opciones: v.opcion_votacion.map((op: any) => op.nombre),
        opcionesConImagen: v.opcion_votacion.map((op: any) => ({
          nombre: op.nombre,
          imagen_url: op.imagen_url,
          preview: op.imagen_url,
        })),
      });
      setShowEditModal(true);
    }
  };

  const handleToggleState = async (v: any) => {
    const nuevoEstado = v.estado === "en_progreso" ? "expirada" : "en_progreso";

    const confirm = await Swal.fire({
      title: `¿Marcar como ${nuevoEstado}?`,
      text: "Podrás cambiarlo luego si es necesario.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: `Sí, cambiar`,
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#00c3ff",
      cancelButtonColor: "#888",
    });

    if (!confirm.isConfirmed) return;

    const { error } = await supabase
      .from("votacion")
      .update({ estado: nuevoEstado })
      .eq("id", v.id);

    if (error) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo cambiar el estado.",
      });
    } else {
      Swal.fire({
        icon: "success",
        title: "Estado actualizado",
        text: `La votación ahora está "${nuevoEstado}".`,
        confirmButtonColor: "#6200ff",
        timer: 1500,
        showConfirmButton: false,
      });
      setTimeout(() => window.location.reload(), 1600);
    }
  };

  const handleDeleteVotacion = async (id: number) => {
    if (deletingId !== null) return;

    const confirm = await Swal.fire({
      title: "¿Estás seguro?",
      text: "Esta acción no se puede deshacer.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#d63031",
      cancelButtonColor: "#3085d6",
    });

    if (!confirm.isConfirmed) return;

    setDeletingId(id);
    try {
      await supabase.from("opcion_votacion").delete().eq("votacion_id", id);
      await supabase.from("voto_participante").delete().eq("votacion_id", id);
      await supabase.from("votacion").delete().eq("id", id);

      Swal.fire({
        icon: "success",
        title: "Eliminado",
        text: "La votación ha sido eliminada.",
        confirmButtonColor: "#6200ff",
        timer: 1500,
        showConfirmButton: false,
      });

      setTimeout(() => (window.location.href = "/dashboard"), 1600);
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo eliminar la votación.",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpcionChange = (index: number, value: string) => {
    const nuevas = [...newVotacion.opciones];
    nuevas[index] = value;
    const conImg = [...newVotacion.opcionesConImagen];
    if (!conImg[index]) conImg[index] = { nombre: value };
    else conImg[index].nombre = value;
    setNewVotacion({
      ...newVotacion,
      opciones: nuevas,
      opcionesConImagen: conImg,
    });
  };

  const handleImageChange = (index: number, file: File | null) => {
    const nuevas = [...newVotacion.opcionesConImagen];
    if (!nuevas[index])
      nuevas[index] = { nombre: newVotacion.opciones[index] || "" };
    nuevas[index] = {
      ...nuevas[index],
      imagen: file,
      preview: file ? URL.createObjectURL(file) : undefined,
    };
    setNewVotacion({ ...newVotacion, opcionesConImagen: nuevas });
  };

  const handleRemoveImage = (index: number) => {
    const nuevas = [...newVotacion.opcionesConImagen];
    if (nuevas[index]) {
      nuevas[index] = {
        ...nuevas[index],
        imagen: null,
        imagen_url: null,
        preview: undefined,
      };
    }
    setNewVotacion({ ...newVotacion, opcionesConImagen: nuevas });
  };

  const handleAddOpcion = () => {
    setNewVotacion({
      ...newVotacion,
      opciones: [...newVotacion.opciones, ""],
      opcionesConImagen: [...newVotacion.opcionesConImagen, { nombre: "" }],
    });
  };

  const handleRemoveOpcion = (index: number) => {
    const opciones = [...newVotacion.opciones];
    const conImagen = [...newVotacion.opcionesConImagen];
    opciones.splice(index, 1);
    conImagen.splice(index, 1);
    setNewVotacion({
      ...newVotacion,
      opciones,
      opcionesConImagen: conImagen,
    });
  };

  const handleUpdateVotacion = async () => {
    const loadingAlert = showLoadingAlert("Actualizando votación");
    setIsSubmitting(true);
    try {
      await supabase
        .from("votacion")
        .update({
          titulo: newVotacion.titulo,
          descripcion: newVotacion.descripcion,
          estado: newVotacion.estado,
          tipo_votacion: newVotacion.tipo_votacion,
        })
        .eq("id", infoVotacion.id);

      await supabase
        .from("opcion_votacion")
        .delete()
        .eq("votacion_id", infoVotacion.id);

      const opcionesFinal = await Promise.all(
        newVotacion.opcionesConImagen.map(async (op: any) => {
          let imagen_url = op.imagen_url || null;

          if (op.imagen) {
            // comprimimos la imagen antes
            const compressed = await compressImage(op.imagen);
            const fileName = `${infoVotacion.id}_${Math.random()
              .toString(36)
              .substring(2)}.jpg`;
            const { data, error } = await supabase.storage
              .from("imgs")
              .upload(fileName, compressed);
            if (!error) {
              imagen_url = supabase.storage.from("imgs").getPublicUrl(fileName)
                .data.publicUrl;
            }
          }

          return {
            votacion_id: infoVotacion.id,
            nombre: op.nombre,
            imagen_url,
          };
        })
      );

      await supabase.from("opcion_votacion").insert(opcionesFinal);
      Swal.close();
      Swal.fire({
        icon: "success",
        title: "Votación actualizada",
        text: "Los cambios se han guardado correctamente.",
        confirmButtonColor: "#6200ff",
        timer: 1500,
        showConfirmButton: false,
      });

      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error(error);
      Swal.close();
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Ocurrió un error al actualizar la votación.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Memoizado con nombre para el pie chart
  const GraficaPastel = React.memo(
    function GraficaPastel({ data }: GraficaProps) {
      const total = data.reduce((s, o) => s + o.votos, 0);
      const pct = (v: number) =>
        total > 0 ? `${Math.round((v / total) * 100)}%` : "0%";

      return (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              dataKey="votos"
              nameKey="nombre"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              labelLine={false}
              label={({ name, votos }) => `${name} (${pct(votos)})`}
              isAnimationActive={false}
            >
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={
                    ["#00c3ff", "#00ffb3", "#ffc658", "#ff8042", "#b366ff"][
                      i % 5
                    ]
                  }
                  stroke="#1e2a38"
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip
              isAnimationActive={false}
              contentStyle={{
                backgroundColor: "#1e2a38",
                border: "none",
                borderRadius: 8,
                color: "#fff",
                fontSize: "0.9rem",
                boxShadow: "0 0 10px rgba(0,0,0,0.4)",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      );
    },
    (a, b) => JSON.stringify(a.data) === JSON.stringify(b.data)
  );
  type GraficaProps = {
    data: ResultadoVoto[];
  };

  const maxVotos = Math.max(...data.map((d) => d.votos), 0);
  const hayEmpate = data.filter((d) => d.votos === maxVotos).length > 1;

  const CoronaGanador = ({ bars }: any) => {
    if (!bars?.length) return null;
    const idx = data.findIndex((d) => d.votos === maxVotos && maxVotos > 0);
    const bar = bars[idx];
    if (!bar) return null;
    const cx = bar.x + bar.width / 2 - 12;
    const cy = bar.y - 30;
    return (
      <svg>
        <image x={cx} y={cy} href="/img/corona.png" width={24} height={24} />
      </svg>
    );
  };

  if (!infoVotacion)
    return <div className="contenedor-estadisticas">Cargando...</div>;
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${baseUrl}/votacion/${infoVotacion.token_link}`;

  return (
    <div className="contenedor-estadisticas">
      {infoVotacion && (
        <div className="info-votacion-extra">
          <div className="qr-contenedor">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=${window.location.origin}/votacion/${infoVotacion.token_link}`}
              alt="QR"
            />
          </div>
          <div className="info-textos">
            <a
              href={`${window.location.origin}/votacion/${infoVotacion.token_link}`}
              target="_blank"
              rel="noopener noreferrer"
              className="votacion-link-estilo"
            >
              {`${window.location.origin}/votacion/${infoVotacion.token_link}`}
            </a>
            <p>
              <strong>Código:</strong> {infoVotacion.token_link}
            </p>
            <p>
              <strong>Estado:</strong>{" "}
              {infoVotacion.estado === "en_progreso"
                ? "En progreso"
                : "Expirada"}
            </p>
            <div className="botones-accion">
              <button
                className="btn-accion"
                onClick={() => handleEditClick(infoVotacion)}
              >
                ✏️ Editar
              </button>
              <button
                className="btn-accion"
                onClick={() => handleToggleState(infoVotacion)}
              >
                ❌ Cambiar estado
              </button>
              <button
                className="btn-accion"
                onClick={() => handleDeleteVotacion(infoVotacion.id)}
                disabled={deletingId === infoVotacion.id}
              >
                {deletingId === infoVotacion.id
                  ? "Eliminando..."
                  : "🗑️ Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <h1>Resultados de la Votación</h1>
      {infoVotacion?.titulo && (
        <h2 className="titulo-votacion">{infoVotacion.titulo}</h2>
      )}
      <div className="voto-total">
        Votos Totales: {data.reduce((s, c) => s + c.votos, 0)}
      </div>

      <h2 className="titulo-seccion">Desglose de Votos</h2>
      <div className="contenedor-conteo-horizontal">
        {data.map((op) => (
          <div className="tarjeta-voto" key={op.nombre}>
            <strong>{op.nombre.toUpperCase()}</strong>: {op.votos} voto
            {op.votos !== 1 && "s"}
          </div>
        ))}
      </div>

      <h2 className="titulo-seccion">Porcentaje por voto</h2>
      <div className="barra-votos">
        {data.map((op) => {
          const tot = data.reduce((s, c) => s + c.votos, 0);
          const porcentaje = tot > 0 ? Math.round((op.votos / tot) * 100) : 0;
          return (
            <div className="barra-item" key={op.nombre}>
              <span className="barra-label">{op.nombre}</span>
              <div className="barra-porcentaje">
                <div
                  className="barra-interna"
                  style={{ width: `${porcentaje}%` }}
                >
                  {porcentaje}%
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="titulo-seccion">Grafica de barras</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 40 }}
        >
          <XAxis
            dataKey="nombre"
            stroke="#ccc"
            tick={{ fill: "#aaa", fontSize: 12 }}
            interval={0}
            angle={-10}
            height={60}
          />
          <YAxis
            stroke="#ccc"
            tick={{ fill: "#aaa", fontSize: 12 }}
            domain={[0, (dMax: number) => Math.ceil(dMax < 3 ? 3 : dMax + 1)]}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.05)" }}
            wrapperStyle={{
              backgroundColor: "#1e2a38",
              borderRadius: 8,
              border: "none",
              color: "#fff",
              fontSize: "0.9rem",
              boxShadow: "0 0 10px rgba(0,0,0,0.4)",
            }}
            contentStyle={{ backgroundColor: "#1e2a38", border: "none" }}
            labelStyle={{ color: "#00ffa5", fontWeight: "bold" }}
            itemStyle={{ color: "#fff" }}
          />
          <Bar
            dataKey="votos"
            isAnimationActive
            animationDuration={800}
            radius={[10, 10, 0, 0]}
          >
            {data.map((e, i) => {
              const color = hayEmpate
                ? "#00CFFF"
                : e.votos === maxVotos
                ? "#FFD700"
                : "#00CFFF";
              return <Cell key={i} fill={color} />;
            })}
          </Bar>
          <Customized component={CoronaGanador} />
        </BarChart>
      </ResponsiveContainer>
      <h2 className="titulo-seccion">Grafica de pastel</h2>
      <GraficaPastel data={data} />

      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Editar Votación</h2>

            <div className="form-group">
              <label>Título *</label>
              <input
                type="text"
                value={newVotacion.titulo}
                onChange={(e) =>
                  setNewVotacion({ ...newVotacion, titulo: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label>Descripción *</label>
              <textarea
                value={newVotacion.descripcion}
                onChange={(e) =>
                  setNewVotacion({
                    ...newVotacion,
                    descripcion: e.target.value,
                  })
                }
              />
            </div>

            <div className="form-group">
              <label>Estado *</label>
              <select
                value={newVotacion.estado}
                onChange={(e) =>
                  setNewVotacion({ ...newVotacion, estado: e.target.value })
                }
              >
                <option value="en_progreso">En progreso</option>
                <option value="expirada">Expirada</option>
              </select>
            </div>

            <div className="form-group">
              <label>Tipo de Votación *</label>
              <select
                value={newVotacion.tipo_votacion}
                onChange={(e) =>
                  setNewVotacion({
                    ...newVotacion,
                    tipo_votacion: e.target.value,
                  })
                }
              >
                <option value="opcion_unica">Opción única</option>
                <option value="opcion_multiple">Opción múltiple</option>
              </select>
            </div>

            <div className="form-group">
              <label>Opciones *</label>
              {newVotacion.opciones.map((op, index) => (
                <div key={index} className="opcion-input-container">
                  <div className="opcion-input">
                    <input
                      type="text"
                      value={op}
                      onChange={(e) =>
                        handleOpcionChange(index, e.target.value)
                      }
                    />
                    {index > 0 && (
                      <button onClick={() => handleRemoveOpcion(index)}>
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
                            index,
                            e.target.files ? e.target.files[0] : null
                          )
                        }
                        style={{ display: "none" }}
                      />
                      <span className="upload-button">
                        {newVotacion.opcionesConImagen[index]?.preview
                          ? "Cambiar imagen"
                          : "Agregar imagen"}
                      </span>
                    </label>

                    {newVotacion.opcionesConImagen[index]?.preview && (
                      <>
                        <div className="image-preview-container">
                          <img
                            src={newVotacion.opcionesConImagen[index]?.preview}
                            alt="preview"
                            className="image-preview"
                          />
                        </div>
                        <button
                          type="button"
                          className="remove-image-button"
                          onClick={() => handleRemoveImage(index)}
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="add-opcion"
                onClick={handleAddOpcion}
              >
                + Añadir Opción
              </button>
            </div>

            <div className="modal-actions">
              <button onClick={() => setShowEditModal(false)}>Cancelar</button>
              <button onClick={handleUpdateVotacion} disabled={isSubmitting}>
                {isSubmitting ? "Guardando..." : "Guardar Cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
