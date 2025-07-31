"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import "./VotacionPage.css";

export default function VotacionPage() {
  const params = useParams();
  const token = params.token as string;
  const [votacion, setVotacion] = useState<any>(null);
  const [selectedOpcion, setSelectedOpcion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fingerprint, setFingerprint] = useState("");

  // Función para formatear fechas consistentemente
  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC", // o la zona horaria que prefieras
    };
    return new Date(dateString).toLocaleString("es-ES", options);
  };

  // Obtener fingerprint del dispositivo
  useEffect(() => {
    (async () => {
      try {
        const fpLoader = await FingerprintJS.load();
        const { visitorId } = await fpLoader.get();
        setFingerprint(visitorId);
      } catch {
        setError("No se pudo identificar tu dispositivo");
        setLoading(false);
      }
    })();
  }, []);

  // Obtener datos de la votación
  useEffect(() => {
    if (!fingerprint) {
      // Aún no sabemos el fingerprint: mantenemos loading
      return;
    }

    (async () => {
      setLoading(true);
      setError("");
      setSuccess("");

      // 2a) Fetch de la votación + opciones
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

      // 2b) Comprobar si ya votó (limit(1) para evitar 406)
      const { data: votosArr, error: errVotes } = await supabase
        .from("voto_participante")
        .select("id")
        .eq("votacion_id", data.id)
        .eq("fingerprint_device_hash", fingerprint)
        .limit(1);

      if (errVotes) {
        console.error("Error comprobando voto previo:", errVotes);
      } else if (votosArr && votosArr.length > 0) {
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

    const { error } = await supabase.from("voto_participante").insert([
      {
        votacion_id: votacion.id,
        opcion_votacion_id: selectedOpcion,
        fingerprint_device_hash: fingerprint,
        user_agent: navigator.userAgent,
      },
    ]);

    if (error) {
      setError("Error al registrar tu voto");
      console.error(error);
    } else {
      setSuccess("¡Tu voto ha sido registrado correctamente!");
      setError("");
    }
  };

  const isExpired = (dbDate: string) => {
    // Eliminar el offset y parsear como UTC
    const dateStr = dbDate.replace(" ", "T").replace(/\+.*$/, "Z");
    console.log("Date:", new Date(dateStr).getTime() + " UTC: " + dateStr);
    const endDate = new Date(dateStr).getTime();

    // Obtener timestamp actual en UTC (evita problemas de zona horaria local)
    const now = new Date();
    const nowUTC = new Date(
      now.getTime() - now.getTimezoneOffset() * 60000
    ).getTime();
    return nowUTC >= endDate;
  };

  if (loading) return <div className="loading">Cargando...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="votacion-container">
      <div className="votacion-header">
        <h1>{votacion?.titulo}</h1>
        <p className="descripcion">{votacion?.descripcion}</p>
        <div className="fechas">
          <span>Votación abierta hasta: {formatDate(votacion?.fecha_fin)}</span>
          {isExpired(votacion?.fecha_fin) && (
            <div className="expired-message">
              ⚠️ Esta votación ya ha expirado
            </div>
          )}
        </div>
      </div>

      {success ? (
        <div className="success-message">{success}</div>
      ) : isExpired(votacion?.fecha_fin) ? (
        <div className="error-message">
          Lo sentimos, el período de votación ha finalizado
        </div>
      ) : error ? (
        <div className="error-message">{error}</div>
      ) : (
        <>
          <div className="opciones-container">
            <h2>Opciones:</h2>
            <div className="opciones-grid">
              {votacion?.opcion_votacion?.map((opcion: any) => (
                <div
                  key={opcion.id}
                  className={`opcion-card ${
                    selectedOpcion === opcion.id ? "selected" : ""
                  }`}
                  onClick={() => setSelectedOpcion(opcion.id)}
                >
                  {opcion.nombre}
                </div>
              ))}
            </div>
          </div>

          <button
            className="votar-button"
            onClick={handleVotar}
            disabled={!!success || isExpired(votacion?.fecha_fin) || !!error}
          >
            Votar
          </button>
        </>
      )}
    </div>
  );
}
