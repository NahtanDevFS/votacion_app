// components/VotacionParticipanteCard.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { VotacionParaParticipante } from "@/app/tesis-votaciones/page";
import "@/app/dashboard-votacion-tesis/dashboard_tesis.css";

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
    // --- MODIFICACIÓN 1: El participante no puede votar en votaciones cerradas/finalizadas ---
    // (Esta lógica ya estaba correcta, pero la revisamos)
    if (votacion.estado === "activa" && !votacion.ha_votado) {
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
  const duracionMinutos = Math.floor(votacion.duracion_segundos / 60);
  const duracionSegundos = votacion.duracion_segundos % 60;

  const isClickable = votacion.estado === "activa" && !votacion.ha_votado;

  // --- MODIFICACIÓN 2: Lógica para texto de estado ---
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
      className={`votacion-list-item estado-${votacion.estado} ${
        isClickable ? "clickable" : ""
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
            {displayEstado}
          </span>
        </div>
        <p className="list-item-tesista">
          {votacion.nombre_tesista || "Tesista no asignado"}
        </p>

        <div className="list-item-voto-status">
          {votacion.ha_votado ? (
            <span className="voto-emitido">✓ Voto emitido</span>
          ) : //Mostrar estado si no ha votado
          votacion.estado === "activa" ? (
            <span className="no-votado">Pendiente de voto</span>
          ) : (
            <span className="no-votado">-</span> // No mostrar "pendiente" si no está activa
          )}
        </div>

        <div className="list-item-footer">
          {votacion.estado === "activa" ? (
            <div className="info-chip cronometro">
              <strong>Tiempo restante:</strong>{" "}
              {String(minutos).padStart(2, "0")}:
              {String(segundos).padStart(2, "0")}
            </div>
          ) : (
            // --- MODIFICACIÓN 5: No mostrar duración si está cerrada/finalizada ---
            votacion.estado === "inactiva" && (
              <div className="info-chip">
                <strong>Duración:</strong> {duracionMinutos}:
                {String(duracionSegundos).padStart(2, "0")} min
              </div>
            )
          )}
          {/*
        
        {votacion.estado === "finalizada" && (
          <>
            <div className="info-chip nota-final">
              <strong>Calificación Final:</strong>{" "}
              {votacion.nota_final?.toFixed(2) || "N/A"} / 40
            </div>
            {votacion.mi_nota !== undefined && (
              <div className="info-chip mi-nota">
                <strong>Mi Calificación:</strong>{" "}
                {votacion.mi_nota.toFixed(2)}
              </div>
            )}
          </>
        )}*/}
        </div>
      </div>
      {isClickable && <div className="click-indicator">→</div>}
    </div>
  );
}
