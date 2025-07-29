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
    const getFingerprint = async () => {
      const fp = await FingerprintJS.load();
      const { visitorId } = await fp.get();
      setFingerprint(visitorId);
    };
    getFingerprint();
  }, []);

  // Obtener datos de la votación
  useEffect(() => {
    const fetchVotacion = async () => {
      const { data, error } = await supabase
        .from("votacion")
        .select(`*, opcion_votacion(*)`)
        .eq("token_link", token)
        .single();

      if (error || !data) {
        setError("Votación no encontrada");
        setLoading(false);
        return;
      }

      // Verificar si ya votó
      if (fingerprint) {
        const { data: voto } = await supabase
          .from("voto_participante")
          .select("*")
          .eq("votacion_id", data.id)
          .eq("fingerprint_device_hash", fingerprint)
          .single();

        if (voto) {
          setError("Ya has participado en esta votación");
        }
      }

      //   console.log("Fecha fin original:", data.fecha_fin);
      //   console.log("Fecha fin convertida:", votacionWithDates.fecha_fin);
      //   console.log("Fecha fin UTC:", votacionWithDates.fecha_fin?.toUTCString());
      //   console.log("Fecha fin local:", votacionWithDates.fecha_fin?.toString());

      setVotacion(data);
      setLoading(false);

      // Convertir fechas a zona horaria local
      // Convertir fechas y asegurar que sean tratadas como UTC
      //   const votacionWithDates = {
      //     ...data,
      //     fecha_inicio: data.fecha_inicio
      //       ? new Date(data.fecha_inicio + "Z")
      //       : null,
      //     fecha_fin: data.fecha_fin ? new Date(data.fecha_fin + "Z") : null,
      //   };

      // Debug: Mostrar fechas en consola para verificar
    };

    fetchVotacion();
  }, [token, fingerprint]);

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

  if (loading) return <div className="loading">Cargando...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="votacion-container">
      <div className="votacion-header">
        <h1>{votacion?.titulo}</h1>
        <p className="descripcion">{votacion?.descripcion}</p>
        <div className="fechas">
          <span>Votación abierta hasta: {formatDate(votacion?.fecha_fin)}</span>
        </div>
      </div>

      {success ? (
        <div className="success-message">{success}</div>
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
            disabled={!!success}
          >
            Votar
          </button>
        </>
      )}
    </div>
  );
}
