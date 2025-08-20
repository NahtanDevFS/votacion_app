// components/VotacionTesisCard.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { VotacionTesis } from "@/app/dashboard-votacion-tesis/page"; // Importamos el tipo
import "@/app/dashboard-votacion-tesis/dashboard_tesis.css"; // Usamos el mismo CSS

interface VotacionTesisCardProps {
  votacion: VotacionTesis;
}

const VotacionTesisCard: React.FC<VotacionTesisCardProps> = ({ votacion }) => {
  const router = useRouter();
  const [tiempoRestante, setTiempoRestante] = useState<number>(0);

  useEffect(() => {
    if (votacion.estado === "activa" && votacion.fecha_activacion) {
      const fechaFin =
        new Date(votacion.fecha_activacion).getTime() +
        votacion.duracion_segundos * 1000;

      const actualizarCronometro = () => {
        const ahora = new Date().getTime();
        const diferencia = fechaFin - ahora;
        setTiempoRestante(Math.max(0, Math.floor(diferencia / 1000)));
      };

      actualizarCronometro();
      const intervalId = setInterval(actualizarCronometro, 1000);

      return () => clearInterval(intervalId);
    }
  }, [votacion]);

  const minutos = Math.floor(tiempoRestante / 60);
  const segundos = tiempoRestante % 60;

  const handleVerDetalles = () => {
    router.push(`/conteo-votacion-tesis/${votacion.id}`);
  };

  return (
    <div className={`votacion-tesis-card estado-${votacion.estado}`}>
      {/* Carrusel de Imágenes */}
      {votacion.imagen_votacion_tesis &&
        votacion.imagen_votacion_tesis.length > 0 && (
          <div className="card-image-container">
            <img
              src={votacion.imagen_votacion_tesis[0].url_imagen}
              alt={votacion.titulo}
              className="card-image"
            />
          </div>
        )}

      <div className="card-content">
        <span className={`estado-tag estado-${votacion.estado}`}>
          {votacion.estado}
        </span>
        <h3 className="card-title">{votacion.titulo}</h3>
        <p className="card-tesista">
          {votacion.nombre_tesista || "Tesista no asignado"}
        </p>

        <div className="card-info">
          <div>
            <strong>Duración:</strong> {votacion.duracion_segundos / 60} min
          </div>
          {votacion.estado === "activa" && (
            <div className="cronometro">
              <strong>Tiempo:</strong> {String(minutos).padStart(2, "0")}:
              {String(segundos).padStart(2, "0")}
            </div>
          )}
          {votacion.estado === "finalizada" && (
            <div className="nota-final">
              <strong>Nota:</strong> {votacion.nota_final?.toFixed(2) || "N/A"}{" "}
              / 40
            </div>
          )}
        </div>

        <button className="details-button-tesis" onClick={handleVerDetalles}>
          Ver Detalles
        </button>
      </div>
    </div>
  );
};

export default VotacionTesisCard;
