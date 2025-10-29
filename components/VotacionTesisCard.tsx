// components/VotacionTesisCard.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { VotacionTesis } from "@/app/dashboard-votacion-tesis/page";
import "@/app/dashboard-votacion-tesis/dashboard_tesis.css";
import { useVotacionTimer, formatTiempoRestante } from "@/hooks/useVotacionTimer";

interface VotacionTesisCardProps {
  votacion: VotacionTesis;
}

const VotacionTesisCard: React.FC<VotacionTesisCardProps> = ({ votacion }) => {
  const router = useRouter();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const images = votacion.imagen_votacion_tesis || [];

  // ✅ Usar el hook de timer mejorado y consistente
  const tiempoRestante = useVotacionTimer({
    fechaActivacion: votacion.fecha_activacion,
    duracionSegundos: votacion.duracion_segundos,
    estado: votacion.estado
  });

  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prevIndex) => (prevIndex + 1) % images.length);
  };

  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex(
      (prevIndex) => (prevIndex - 1 + images.length) % images.length
    );
  };

  // Formatear tiempo restante
  const minutos = tiempoRestante !== null ? Math.floor(tiempoRestante / 60) : 0;
  const segundos = tiempoRestante !== null ? tiempoRestante % 60 : 0;

  // Formateo de la duración total
  const duracionMinutos = Math.floor(votacion.duracion_segundos / 60);
  const duracionSegundos = votacion.duracion_segundos % 60;

  const handleVerDetalles = () => {
    router.push(`/conteo-votacion-tesis/${votacion.id}`);
  };

  // Lógica para texto de estado
  const getDisplayEstadoTexto = () => {
    if (votacion.estado === "finalizada") {
      return votacion.finalizada_definitivamente === 1
        ? "Finalizada"
        : "Cerrada";
    }
    return votacion.estado; // 'inactiva' o 'activa'
  };
  const displayEstado = getDisplayEstadoTexto();

  return (
    <div
      className={`votacion-tesis-list-item estado-${votacion.estado}`}
      onClick={handleVerDetalles}
    >
      {/* Carrusel de Imágenes a la Izquierda */}
      <div className="list-item-image-carousel">
        {images.length > 0 ? (
          <>
            <img
              src={images[currentImageIndex].url_imagen}
              alt={votacion.titulo}
              className="list-item-image"
            />
            {images.length > 1 && (
              <>
                <button onClick={prevImage} className="carousel-arrow prev">
                  ‹
                </button>
                <button onClick={nextImage} className="carousel-arrow next">
                  ›
                </button>
                <div className="carousel-counter">
                  {currentImageIndex + 1} / {images.length}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="image-placeholder">Sin Imagen</div>
        )}
      </div>

      {/* Contenido a la Derecha */}
      <div className="list-item-main-content">
        <div className="list-item-header">
          <h3 className="list-item-title">{votacion.titulo}</h3>
          <span className={`estado-tag estado-${votacion.estado}`}>
            {displayEstado}
          </span>
        </div>
        <p className="list-item-tesista">
          {votacion.nombre_tesista || "Tesista no asignado"}
        </p>

        <div className="list-item-footer">
          <div className="info-chip">
            <strong>Duración:</strong> {duracionMinutos}:
            {String(duracionSegundos).padStart(2, "0")} min
          </div>
          {votacion.estado === "activa" && tiempoRestante !== null && (
            <div className="info-chip cronometro">
              <strong>Tiempo:</strong> {formatTiempoRestante(tiempoRestante)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VotacionTesisCard;