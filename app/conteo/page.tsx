"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import {BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell} from "recharts";
import "./Disenoestadi.css";
import { RealtimeChannel } from "@supabase/supabase-js";
import React from "react";
import { Customized } from "recharts";

//import { Props as CustomizedBarProps } from "recharts/types/chart/BarChart";


const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ResultadoVoto = {
  nombre: string;
  votos: number;
};

export default function Estadistica() {
  const [data, setData] = useState<ResultadoVoto[]>([]);
  const searchParams = useSearchParams();
  const votacionId = searchParams.get("votacion");

 useEffect(() => {
  if (!votacionId) return;

  const fetchVotes = async () => {
    const { data: opciones } = await supabase
      .from("opcion_votacion")
      .select("id, nombre")
      .eq("votacion_id", parseInt(votacionId));

    const { data: votos } = await supabase
      .from("voto_participante")
      .select("opcion_votacion_id");

    if (!opciones || !votos) return;

    const conteo = opciones.map((op) => {
      const cantidad = votos.filter((v) => v.opcion_votacion_id === op.id).length;
      return { nombre: op.nombre, votos: cantidad };
    });

    setData(conteo);
  };

  // Primera carga
  fetchVotes();

  // 🚀 Refresco automático cada 0.5 segundos
  const intervalo = setInterval(() => {
    fetchVotes();
  }, 500);

  // Limpieza
  return () => clearInterval(intervalo);
}, [votacionId]);

const GraficaPastel = React.memo(
  ({ data }: GraficaProps) => {
    const total = data.reduce((sum, op) => sum + op.votos, 0);

    const formatPercent = (v: number) =>
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
            innerRadius={60}  // 🎯 hace que sea tipo DONUT
            outerRadius={90}
            label={({ name, votos }) => `${name} (${formatPercent(votos)})`}
            labelLine={false}
            isAnimationActive={false}
          >
            {data.map((_, index) => (
              <Cell
                key={index}
                fill={["#00c3ff", "#00ffb3", "#ffc658", "#ff8042", "#b366ff"][index % 5]}
                stroke="#1e2a38" // 🎨 borde suave con fondo
                strokeWidth={2}
              />
            ))}
          </Pie>
          <Tooltip
            isAnimationActive={false}
            contentStyle={{
              backgroundColor: "#1e2a38",
              border: "none",
              borderRadius: "8px",
              color: "#fff",
              fontSize: "0.9rem",
              boxShadow: "0 0 10px rgba(0,0,0,0.4)",
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    );
  },
  (prevProps, nextProps) =>
    JSON.stringify(prevProps.data) === JSON.stringify(nextProps.data)
);

  type GraficaProps = {
    data: ResultadoVoto[];
  };

const maxVotos = Math.max(...data.map((d) => d.votos));
const ganadores = data.filter((d) => d.votos === maxVotos);
const hayEmpate = ganadores.length > 1;

 interface CoronaProps {
  width?: number;
  height?: number;
  bars?: {
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
}

const CoronaGanador = ({ width, height, bars }: CoronaProps) => {
  if (!bars || bars.length === 0) return null;

  const indexGanador = data.findIndex((d) => d.votos === maxVotos && maxVotos > 0);
  if (indexGanador === -1 || indexGanador >= bars.length) return null;

  const bar = bars[indexGanador];
  if (!bar) return null;

  const cx = bar.x + bar.width / 2 - 12; // centrado
  const cy = bar.y - 30; // encima de la barra

  return (
    <svg>
      <image
        x={cx}
        y={cy}
        href="/img/corona.png"
        width="24"
        height="24"
        style={{ pointerEvents: 'none' }}
      />
    </svg>
  );
};

  return (
    <div className="contenedor-estadisticas">
      <h1>📊 Resultados de la Votación</h1>

    <div className="voto-total">
   Votos Totales: {data.reduce((sum, curr) => sum + curr.votos, 0)}
    </div>

    <h2 className="titulo-seccion">Desglose de Votos</h2>
    <div className="contenedor-conteo-horizontal">
  {/* conteo por opción */}
    </div>

    <div className="contenedor-conteo-horizontal">
  {data.map((op) => (
    <div className="tarjeta-voto" key={op.nombre}>
      <strong>{op.nombre.toUpperCase()}</strong>: {op.votos} voto{op.votos !== 1 ? "s" : ""}
    </div>
  ))}
</div>

<h2 className="titulo-seccion">📊 Porcentaje por voto</h2>
<div className="barra-votos">
  {/* barras personalizadas */}
</div>

    <div className="barra-votos">
  {data.map((op) => {
    const totalVotos = data.reduce((sum, curr) => sum + curr.votos, 0);
    const porcentaje = totalVotos > 0 ? Math.round((op.votos / totalVotos) * 100) : 0;
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

<div className="espacio-entre-graficos"></div> {/* ← nuevo */}

<h2 className="titulo-seccion">📉 Representación Gráfica</h2>
<div className="barra-votos">
  {/* gráficos */}
</div>

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
  domain={[0, (dataMax: number) => Math.ceil(dataMax < 3 ? 3 : dataMax + 1)]}
/>
    <Tooltip
  cursor={{ fill: "rgba(255,255,255,0.05)" }}
  wrapperStyle={{
    backgroundColor: "#1e2a38",
    borderRadius: "8px",
    border: "none",
    color: "#fff",
    fontSize: "0.9rem",
    boxShadow: "0 0 10px rgba(0,0,0,0.4)",
  }}
  contentStyle={{
    backgroundColor: "#1e2a38",
    border: "none",
  }}
  labelStyle={{
    color: "#00ffa5",
    fontWeight: "bold",
  }}
  itemStyle={{
    color: "#fff",
  }}
/>
   <Bar
  dataKey="votos"
  isAnimationActive={true}
  animationDuration={800}
  radius={[10, 10, 0, 0]}
>
  {data.map((entry, index) => {
    const color = hayEmpate
      ? "#00CFFF" // azul si empate
      : entry.votos === maxVotos
      ? "#FFD700" // amarillo si único ganador
      : "#00CFFF"; // azul para los demás

    return <Cell key={`cell-${index}`} fill={color} />;
  })}
</Bar>

<Customized component={CoronaGanador} />

  </BarChart>
  
</ResponsiveContainer>

      <GraficaPastel data={data} />

    </div>
  );
}