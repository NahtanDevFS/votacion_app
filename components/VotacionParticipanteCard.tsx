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
  const [tiempoRestante, setTiempoRestante] = useState<number | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const images = votacion.imagen_votacion_tesis || [];

  // ✅ TIMER CORREGIDO - Sincronizado correctamente
  useEffect(() => {
    if (votacion.estado === "activa" && votacion.fecha_activacion) {
      const fechaActivacion = new Date(votacion.fecha_activacion).getTime();
      const duracionMs = votacion.duracion_segundos * 1000;
      const fechaFin = fechaActivacion + duracionMs;

      let animationFrameId: number;
      let lastUpdateTime = Date.now();

      const updateTimer = () => {
        const now = Date.now();
        
        // Solo actualizar si ha pasado al menos 1 segundo desde la última actualización
        if (now - lastUpdateTime >= 1000) {
          const restante = Math.max(0, Math.floor((fechaFin - now) / 1000));
          setTiempoRestante(restante);
          lastUpdateTime = now;
        }

        if (fechaFin > now) {
          animationFrameId = requestAnimationFrame(updateTimer);
        } else {
          setTiempoRestante(0);
        }
      };

      // Iniciar inmediatamente con el tiempo correcto
      const restanteInicial = Math.max(0, Math.floor((fechaFin - Date.now()) / 1000));
      setTiempoRestante(restanteInicial);
      
      // Sincronizar con el próximo segundo exacto
      const msHastaProximoSegundo = 1000 - (Date.now() % 1000);
      const timeoutId = setTimeout(() => {
        lastUpdateTime = Date.now();
        animationFrameId = requestAnimationFrame(updateTimer);
      }, msHastaProximoSegundo);

      return () => {
        clearTimeout(timeoutId);
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }
      };
    } else {
      setTiempoRestante(null);
    }
  }, [votacion.estado, votacion.fecha_activacion, votacion.duracion_segundos]);

  const handleCardClick = () => {
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

  // Formatear tiempo restante
  const minutos = tiempoRestante !== null ? Math.floor(tiempoRestante / 60) : 0;
  const segundos = tiempoRestante !== null ? tiempoRestante % 60 : 0;

  // Formatear duración total
  const duracionMinutos = Math.floor(votacion.duracion_segundos / 60);
  const duracionSegundos = votacion.duracion_segundos % 60;

  const isClickable = votacion.estado === "activa" && !votacion.ha_votado;

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
          ) : votacion.estado === "activa" ? (
            <span className="no-votado">Pendiente de voto</span>
          ) : (
            <span className="no-votado">-</span>
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
            votacion.estado === "inactiva" && (
              <div className="info-chip">
                <strong>Duración:</strong> {duracionMinutos}:
                {String(duracionSegundos).padStart(2, "0")} min
              </div>
            )
          )}
        </div>
      </div>
      {isClickable && <div className="click-indicator">→</div>}
    </div>
  );
}