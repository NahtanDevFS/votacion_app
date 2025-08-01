"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import "./VotacionPage.css";

export default function VotacionPage() {
  const { token } = useParams() as { token: string };
  const [votacion, setVotacion] = useState<any>(null);
  const [selectedOpcion, setSelectedOpcion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fingerprint, setFingerprint] = useState("");

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });
  };

  // 1) fingerprint
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

  // 2) fetch votación + check voto previo
  useEffect(() => {
    if (!fingerprint) return;

    (async () => {
      setLoading(true);
      setError("");
      setSuccess("");

      const { data, error: errV } = await supabase
        .from("votacion")
        .select("*, opcion_votacion(*)")
        .eq("token_link", token)
        .single();

      if (errV || !data) {
        setError("Votación no encontrada");
        setLoading(false);
        return;
      }
      setVotacion(data);

      const { data: prev, error: errPrev } = await supabase
        .from("voto_participante")
        .select("id")
        .eq("votacion_id", data.id)
        .eq("fingerprint_device_hash", fingerprint)
        .limit(1);

      if (!errPrev && prev?.length) {
        setError("Ya has participado en esta votación");
      }

      setLoading(false);
    })();
  }, [fingerprint, token]);

  const handleVotar = async () => {
    if (!selectedOpcion) {
      setError("Selecciona una opción para votar");
      return;
    }
    if (!fingerprint) {
      setError("No se pudo identificar tu dispositivo");
      return;
    }

    const { error: err } = await supabase.from("voto_participante").insert([
      {
        votacion_id: votacion.id,
        opcion_votacion_id: selectedOpcion,
        fingerprint_device_hash: fingerprint,
        user_agent: navigator.userAgent,
      },
    ]);
    if (err) {
      console.error(err);
      setError("Error al registrar tu voto");
    } else {
      setSuccess("¡Tu voto ha sido registrado correctamente!");
      setError("");
    }
  };

  // 3) expired by estado
  const expired = votacion?.estado === "expirada";

  if (loading) return <div className="loading">Cargando...</div>;
  if (error && !success) return <div className="error-message">{error}</div>;

  return (
    <div className="votacion-container">
      <div className="votacion-header">
        <h1>{votacion.titulo}</h1>
        <p className="descripcion">{votacion.descripcion}</p>
        <div className="fechas">
          <span>
            Válida hasta que cambie su estado a <b>expirada</b>:
          </span>
          <div className={`state-label ${votacion.estado}`}>
            {votacion.estado === "en_progreso" ? "En progreso" : "Expirada"}
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
          <div className="opciones-container">
            <h2>Opciones:</h2>
            <div className="opciones-grid">
              {votacion.opcion_votacion.map((op: any) => (
                <div
                  key={op.id}
                  className={`opcion-card ${
                    selectedOpcion === op.id ? "selected" : ""
                  }`}
                  onClick={() => setSelectedOpcion(op.id)}
                >
                  {op.nombre}
                </div>
              ))}
            </div>
          </div>

          <button
            className="votar-button"
            onClick={handleVotar}
            disabled={!!success || expired || !!error}
          >
            Votar
          </button>
        </>
      )}
    </div>
  );
}
