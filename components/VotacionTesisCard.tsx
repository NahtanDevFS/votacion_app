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

  // --- NUEVO: Lógica para el carrusel de imágenes ---
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const images = votacion.imagen_votacion_tesis || [];

  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation(); // Evita que el click en el botón active el de "Ver Detalles"
    setCurrentImageIndex((prevIndex) => (prevIndex + 1) % images.length);
  };

  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex(
      (prevIndex) => (prevIndex - 1 + images.length) % images.length
    );
  };
  // --- FIN de la lógica del carrusel ---

  useEffect(() => {
    if (votacion.estado === "activa" && votacion.fecha_activacion) {
      const fechaFin =
        new Date(votacion.fecha_activacion).getTime() +
        votacion.duracion_segundos * 1000;
      const intervalId = setInterval(() => {
        const ahora = new Date().getTime();
        setTiempoRestante(Math.max(0, Math.floor((fechaFin - ahora) / 1000)));
      }, 1000);
      return () => clearInterval(intervalId);
    }
  }, [votacion]);

  const minutos = Math.floor(tiempoRestante / 60);
  const segundos = tiempoRestante % 60;

  // --- NUEVO: Formateo de la duración total ---
  const duracionMinutos = Math.floor(votacion.duracion_segundos / 60);
  const duracionSegundos = votacion.duracion_segundos % 60;

  const handleVerDetalles = () => {
    router.push(`/conteo-votacion-tesis/${votacion.id}`);
  };

  // --- MODIFICACIÓN 1: Lógica para texto de estado ---
  const getDisplayEstadoTexto = () => {
    if (votacion.estado === "finalizada") {
      return votacion.finalizada_definitivamente === 1
        ? "Finalizada"
        : "Cerrada";
    }
    return votacion.estado; // 'inactiva' o 'activa'
  };
  const displayEstado = getDisplayEstadoTexto();
  // --- FIN MODIFICACIÓN ---

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
          {/* --- MODIFICACIÓN 2: Usar `displayEstado` para el texto --- */}
          <span className={`estado-tag estado-${votacion.estado}`}>
            {displayEstado}
          </span>
        </div>
        <p className="list-item-tesista">
          {votacion.nombre_tesista || "Tesista no asignado"}
        </p>

        <div className="list-item-footer">
          {/* --- MODIFICADO: Muestra la duración formateada --- */}
          <div className="info-chip">
            <strong>Duración:</strong> {duracionMinutos}:
            {String(duracionSegundos).padStart(2, "0")} min
          </div>
          {votacion.estado === "activa" && (
            <div className="info-chip cronometro">
              <strong>Tiempo:</strong> {String(minutos).padStart(2, "0")}:
              {String(segundos).padStart(2, "0")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VotacionTesisCard;
