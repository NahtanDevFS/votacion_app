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
  const [fingerprint, setFingerprint] = useState<string | null>(null);

  // 1) Obtener fingerprint
  useEffect(() => {
    (async () => {
      try {
        const fp = await FingerprintJS.load();
        const { visitorId } = await fp.get();
        setFingerprint(visitorId);
      } catch {
        setError("No se pudo identificar tu dispositivo");
        setLoading(false);
      }
    })();
  }, []);

  // 2) Una vez tengamos fingerprint, traemos la votación y comprobamos si ya votó
  useEffect(() => {
    if (fingerprint === null) return; // esperamos fingerprint

    (async () => {
      setLoading(true);
      try {
        // Fetch de la votación + opciones
        const { data, error: errV } = await supabase
          .from("votacion")
          .select(`*, opcion_votacion(*)`)
          .eq("token_link", token)
          .single();

        if (errV || !data) {
          setError("Votación no encontrada");
          return;
        }
        setVotacion(data);

        // Comprobar si ya votó
        const { data: voto } = await supabase
          .from("voto_participante")
          .select("id")
          .eq("votacion_id", data.id)
          .eq("fingerprint_device_hash", fingerprint)
          .single();

        if (voto) {
          setError("Ya has participado en esta votación");
        }
      } catch (e) {
        console.error(e);
        setError("Error cargando la votación");
      } finally {
        setLoading(false);
      }
    })();
  }, [fingerprint, token]);

  // handler de votar…
  const handleVotar = async () => {
    if (!selectedOpcion) {
      setError("Selecciona una opción para votar");
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.from("voto_participante").insert([
      {
        votacion_id: votacion.id,
        opcion_votacion_id: selectedOpcion,
        fingerprint_device_hash: fingerprint,
        user_agent: navigator.userAgent,
      },
    ]);
    setLoading(false);

    if (err) {
      console.error(err);
      setError("Error al registrar tu voto");
    } else {
      setSuccess("¡Tu voto ha sido registrado correctamente!");
    }
  };

  // Renderizado
  if (loading) {
    return <div className="loading">Cargando...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  // aquí ya sabemos que no hay error (ni voto previo)
  return (
    <div className="votacion-container">
      {/* … resto de tu UI con votación.opciones y botón de votar */}
    </div>
  );
}
