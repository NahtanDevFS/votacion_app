// app/conteo-encuesta/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Resultado = { nombre: string; votos: number };

export default function ConteoEncuestaPage() {
  const [incisos, setIncisos] = useState<{ id: number; texto: string }[]>([]);
  const [dataMap, setDataMap] = useState<Record<number, Resultado[]>>({});
  const [encuestaId, setEncuestaId] = useState<string | null>(null);
  const [tituloEncuesta, setTituloEncuesta] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEncuestaId(params.get("encuesta"));
  }, []);

  useEffect(() => {
    if (!encuestaId) return;

    const fetchConteo = async () => {
      // 1) Traer título de la encuesta
      const { data: encuestaData } = await supabase
        .from("encuesta")
        .select("titulo")
        .eq("id", parseInt(encuestaId, 10))
        .single();

      if (encuestaData) {
        setTituloEncuesta(encuestaData.titulo);
      }
      // 2) Traer incisos
      const { data: incs } = await supabase
        .from("inciso_encuesta")
        .select("id, texto")
        .eq("encuesta_id", parseInt(encuestaId, 10));
      if (!incs) return;
      setIncisos(incs);

      // 3) Para cada inciso, contar votos
      const nuevoMap: Record<number, Resultado[]> = {};
      for (const inc of incs) {
        // traer opciones
        const { data: ops } = await supabase
          .from("opcion_encuesta")
          .select("id, texto")
          .eq("inciso_id", inc.id);
        if (!ops) continue;
        // traer votos de este inciso
        const { data: votos } = await supabase
          .from("voto_participante_encuesta")
          .select("opcion_id")
          .eq("inciso_id", inc.id);
        const resultados: Resultado[] = ops.map((o) => ({
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

  // Pie chart component
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

  return (
    <div className="contenedor-estadisticas">
      <h1>📊 Resultados de la Encuesta</h1>
      {tituloEncuesta && <h2 className="titulo-encuesta">{tituloEncuesta}</h2>}
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
                return (
                  <div className="barra-item" key={d.nombre}>
                    <span className="barra-label">{d.nombre}</span>
                    <div className="barra-porcentaje">
                      <div
                        className="barra-interna"
                        style={{ width: `${pct}%` }}
                      >
                        {pct}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <h3>📉 Gráfico de barras</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={datos} margin={{ bottom: 20 }}>
                <XAxis dataKey="nombre" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
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

            <h3>📊 Gráfico de pastel</h3>
            <GraficaPastel data={datos} />
          </section>
        );
      })}
    </div>
  );
}
