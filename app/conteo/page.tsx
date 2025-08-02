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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ResultadoVoto = { nombre: string; votos: number };
type GraficaProps = { data: ResultadoVoto[] };

export default function ConteoPage() {
  const [data, setData] = useState<ResultadoVoto[]>([]);
  const [votacionId, setVotacionId] = useState<string | null>(null);
  const [tituloVotacion, setTituloVotacion] = useState<string>("");

  // 1) Leemos el query param desde window.location.search
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setVotacionId(params.get("votacion"));
  }, []);

  // 2) Cuando ya tengamos votacionId, lanzamos la carga de datos
  useEffect(() => {
    if (!votacionId) return;

    const fetchVotes = async () => {
      // Primero obtenemos el título de la votación
      const { data: votacionData } = await supabase
        .from("votacion")
        .select("titulo")
        .eq("id", parseInt(votacionId, 10))
        .single();

      if (votacionData) {
        setTituloVotacion(votacionData.titulo);
      }
      // Luego obtenemos los datos de votación
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

  const maxVotos = Math.max(...data.map((d) => d.votos), 0);
  const hayEmpate = data.filter((d) => d.votos === maxVotos).length > 1;

  interface CoronaProps {
    bars?: { x: number; y: number; width: number; height: number }[];
  }
  const CoronaGanador = ({ bars }: CoronaProps) => {
    if (!bars?.length) return null;
    const idx = data.findIndex((d) => d.votos === maxVotos && maxVotos > 0);
    const bar = bars[idx];
    if (!bar) return null;
    const cx = bar.x + bar.width / 2 - 12;
    const cy = bar.y - 30;
    return (
      <svg>
        <image
          x={cx}
          y={cy}
          href="/img/corona.png"
          width={24}
          height={24}
          style={{ pointerEvents: "none" }}
        />
      </svg>
    );
  };

  return (
    <div className="contenedor-estadisticas">
      <h1>📊 Resultados de la Votación</h1>
      {tituloVotacion && <h2 className="titulo-votacion">{tituloVotacion}</h2>}
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

      <h2 className="titulo-seccion">📊 Porcentaje por voto</h2>
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

      <h2 className="titulo-seccion">📉 Representación Gráfica</h2>
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

      <GraficaPastel data={data} />
    </div>
  );
}
