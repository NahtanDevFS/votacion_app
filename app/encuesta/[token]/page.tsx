"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import "./EncuestaPage.css";

type TipoOption = "opcion_unica" | "opcion_multiple";
type Estado = "en_progreso" | "expirada";

interface Opcion {
  id: number;
  texto: string;
  imagen_url: string | null;
}

interface Inciso {
  id: number;
  texto: string;
  tipo_inciso: TipoOption;
  opcion_encuesta: Opcion[];
}

interface Encuesta {
  id: number;
  titulo: string;
  descripcion: string;
  fecha_inicio: string;
  estado: Estado;
  tipo_encuesta: TipoOption;
  token_link: string;
  inciso_encuesta: Inciso[];
}

export default function EncuestaVotarPage() {
  const { token } = useParams() as { token: string };
  const [encuesta, setEncuesta] = useState<Encuesta | null>(null);
  const [selectedMap, setSelectedMap] = useState<Record<number, number[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1) Obtener fingerprint
  useEffect(() => {
    (async () => {
      try {
        const fp = await FingerprintJS.load();
        const { visitorId } = await fp.get();
        setFingerprint(visitorId);
      } catch {
        setError("No se pudo identificar tu dispositivo");
      }
    })();
  }, []);

  // 2) Cargar encuesta + validar voto previo
  useEffect(() => {
    if (!fingerprint) return;
    (async () => {
      setLoading(true);
      setError("");
      setSuccess("");

      const { data, error: err } = await supabase
        .from("encuesta")
        .select(`*, inciso_encuesta (*, opcion_encuesta (*))`)
        .eq("token_link", token)
        .single();

      if (err || !data) {
        setError("Encuesta no encontrada");
        setLoading(false);
        return;
      }
      setEncuesta(data as Encuesta);

      const { data: prev, error: errPrev } = await supabase
        .from("voto_participante_encuesta")
        .select("id")
        .eq("encuesta_id", data.id)
        .eq("fingerprint_device_hash", fingerprint)
        .limit(1);

      if (!errPrev && prev?.length) {
        setError("Ya has participado en esta encuesta");
      }

      setLoading(false);
    })();
  }, [fingerprint, token]);

  // Maneja selección por inciso
  const handleSelect = (
    incisoId: number,
    opcionId: number,
    tipo: TipoOption
  ) => {
    setError("");
    setSelectedMap((prev) => {
      const current = prev[incisoId] || [];
      let updated: number[];
      if (tipo === "opcion_multiple") {
        updated = current.includes(opcionId)
          ? current.filter((x) => x !== opcionId)
          : [...current, opcionId];
      } else {
        updated = [opcionId];
      }
      return { ...prev, [incisoId]: updated };
    });
  };

  // 3) Enviar voto(s)
  // 3) Enviar voto(s) con verificación en tiempo real
  const handleVotar = async () => {
    if (!encuesta || !fingerprint) return;

    // Validar selecciones en cada inciso
    for (const inc of encuesta.inciso_encuesta) {
      const sel = selectedMap[inc.id] || [];
      if (sel.length === 0) {
        await Swal.fire({
          icon: "warning",
          title: "¡Falta seleccionar!",
          text: `Por favor selecciona al menos una opción en el inciso:\n"${inc.texto}"`,
          confirmButtonColor: "#6200ff",
        });
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // VERIFICACIÓN EN TIEMPO REAL DE VOTO EXISTENTE
      const { data: existingVote, error: checkError } = await supabase
        .from("voto_participante_encuesta")
        .select("id")
        .eq("encuesta_id", encuesta.id)
        .eq("fingerprint_device_hash", fingerprint)
        .limit(1);

      if (checkError) throw checkError;

      if (existingVote && existingVote.length > 0) {
        setError("Ya has participado en esta encuesta");
        setSuccess("");
        return;
      }

      // Si no existe voto previo, proceder con el registro
      const inserts: any[] = [];
      encuesta.inciso_encuesta.forEach((inc) => {
        (selectedMap[inc.id] || []).forEach((opId) => {
          inserts.push({
            encuesta_id: encuesta.id,
            inciso_id: inc.id,
            opcion_id: opId,
            fingerprint_device_hash: fingerprint,
            user_agent: navigator.userAgent,
          });
        });
      });

      const { error: insertError } = await supabase
        .from("voto_participante_encuesta")
        .insert(inserts);

      if (insertError) throw insertError;

      setSuccess("¡Tu voto ha sido registrado correctamente!");
      setError("");
    } catch (error) {
      console.error("Error al votar:", error);
      setError("Error al registrar tu voto. Por favor intenta nuevamente.");
      setSuccess("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const expired = encuesta?.estado === "expirada";

  if (loading) return <div className="loading">Cargando...</div>;
  if (error && !success) return <div className="error-message">{error}</div>;

  return (
    <div className="votacion-container">
      <div className="votacion-header">
        <h1>{encuesta?.titulo}</h1>
        <p className="descripcion">{encuesta?.descripcion}</p>
        <div className="fechas">
          <span>Estado de la encuesta:</span>
          <div className={`state-label ${encuesta?.estado}`}>
            {encuesta?.estado === "en_progreso" ? "En progreso" : "Expirada"}
          </div>
        </div>
      </div>

      {success ? (
        <div className="success-message">{success}</div>
      ) : expired ? (
        <div className="error-message">
          Lo sentimos, el período de votación ha finalizado
        </div>
      ) : (
        <>
          {encuesta?.inciso_encuesta.map((inc) => (
            <div key={inc.id} className="inciso-section">
              <h2>{inc.texto}</h2>
              <div className="info-selection">
                {inc.tipo_inciso === "opcion_multiple"
                  ? "Selecciona una o más opciones"
                  : "Selecciona una sola opción"}
              </div>
              <div className="opciones-grid">
                {inc.opcion_encuesta.map((op) => (
                  <div
                    key={op.id}
                    className={`opcion-card ${
                      (selectedMap[inc.id] || []).includes(op.id)
                        ? "selected"
                        : ""
                    }`}
                    onClick={() => handleSelect(inc.id, op.id, inc.tipo_inciso)}
                  >
                    {op.imagen_url && (
                      <div className="opcion-image-container">
                        <img
                          src={op.imagen_url}
                          alt={op.texto}
                          className="opcion-image"
                        />
                      </div>
                    )}
                    <div className="opcion-text">{op.texto}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <button
            className="votar-button"
            onClick={handleVotar}
            disabled={!!success || expired || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className="loading-spinner"></span>
                Verificando...
              </>
            ) : (
              "Votar"
            )}
          </button>
        </>
      )}
    </div>
  );
}
