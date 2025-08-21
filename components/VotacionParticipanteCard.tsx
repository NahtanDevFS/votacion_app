// components/VotacionParticipanteCard.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { VotacionParaParticipante } from "@/app/tesis-votaciones/page"; // Ajusta la ruta si es necesario
import "@/app/dashboard-votacion-tesis/dashboard_tesis.css"; // Usaremos el mismo CSS de la página principal

interface CardProps {
  votacion: VotacionParaParticipante;
}

export default function VotacionParticipanteCard({ votacion }: CardProps) {
  const router = useRouter();
  const [tiempoRestante, setTiempoRestante] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const images = votacion.imagen_votacion_tesis || [];

  useEffect(() => {
    if (votacion.estado === "activa" && votacion.fecha_activacion) {
      const fechaFin =
        new Date(votacion.fecha_activacion).getTime() +
        votacion.duracion_segundos * 1000;
      const intervalId = setInterval(() => {
        const ahora = Date.now();
        setTiempoRestante(Math.max(0, Math.floor((fechaFin - ahora) / 1000)));
      }, 1000);
      return () => clearInterval(intervalId);
    }
  }, [votacion.estado, votacion.fecha_activacion, votacion.duracion_segundos]);

  const handleCardClick = () => {
    // Solo permite hacer clic si la votación está activa
    if (votacion.estado === "activa") {
      // La ruta a la que se redirige para votar
      router.push(`/tesis-votaciones/${votacion.token_qr}`);
    }
  };

  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((p) => (p + 1) % images.length);
  };
  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((p) => (p - 1 + images.length) % images.length);
  };

  const minutos = Math.floor(tiempoRestante / 60);
  const segundos = tiempoRestante % 60;

  return (
    <div
      className={`votacion-list-item estado-${votacion.estado} ${
        votacion.estado === "activa" ? "clickable" : ""
      }`}
      onClick={handleCardClick}
    >
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
              </>
            )}
          </>
        ) : (
          <div className="image-placeholder">Sin Imagen</div>
        )}
      </div>

      <div className="list-item-content">
        <div className="list-item-header">
          <h3 className="list-item-title">{votacion.titulo}</h3>
          <span className={`estado-tag estado-${votacion.estado}`}>
            {votacion.estado}
          </span>
        </div>
        <p className="list-item-tesista">
          {votacion.nombre_tesista || "Tesista no asignado"}
        </p>

        <div className="list-item-footer">
          {votacion.estado === "activa" ? (
            <div className="info-chip cronometro">
              <strong>Tiempo restante:</strong>{" "}
              {String(minutos).padStart(2, "0")}:
              {String(segundos).padStart(2, "0")}
            </div>
          ) : (
            <div className="info-chip">
              <strong>Duración:</strong> {votacion.duracion_segundos / 60} min
            </div>
          )}
        </div>
      </div>
      {votacion.estado === "activa" && <div className="click-indicator">→</div>}
    </div>
  );
}
