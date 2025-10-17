"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Swal from "sweetalert2";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { v4 as uuidv4 } from "uuid";
import "./Autenticacion.css";

function AutenticacionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Estados para el formulario de público
  const [carnetAnio, setCarnetAnio] = useState("");
  const [carnetCorrelativo, setCarnetCorrelativo] = useState("");
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [isPublicForm, setIsPublicForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fingerprint, setFingerprint] = useState<string | null>(null);

  // Estado general
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("Verificando acceso...");

  // Obtener fingerprint al cargar el componente
  useEffect(() => {
    const getFingerprint = async () => {
      try {
        const fp = await FingerprintJS.load();
        const { visitorId } = await fp.get();
        setFingerprint(visitorId);
      } catch (e) {
        console.error("Fingerprint error:", e);
        Swal.fire(
          "Error de Dispositivo",
          "No se pudo identificar tu dispositivo. La votación no será posible.",
          "error"
        );
      }
    };
    getFingerprint();
  }, []);

  useEffect(() => {
    const accessCode = searchParams.get("access_code");

    // Flujo para Jurado (con access_code en la URL)
    if (accessCode) {
      setIsPublicForm(false);
      const handleJuradoAuth = async () => {
        try {
          const { data, error } = await supabase
            .from("participantes")
            .select("codigo_acceso")
            .eq("codigo_acceso", accessCode)
            .eq("rol_general", "jurado")
            .single();

          if (error || !data) {
            throw new Error(
              "El código de acceso del jurado no es válido o ha expirado."
            );
          }

          localStorage.setItem(
            "token_participante_tesis_vote_up",
            data.codigo_acceso
          );
          await Swal.fire({
            title: "¡Autenticación Exitosa!",
            text: "Serás redirigido como Jurado.",
            icon: "success",
            timer: 1500,
            showConfirmButton: false,
          });
          router.push("/tesis-votaciones");
        } catch (error: any) {
          setMessage(error.message);
          Swal.fire("Error de Autenticación", error.message, "error");
          setIsLoading(false);
        }
      };
      handleJuradoAuth();
    }
    // Flujo para Público (sin access_code)
    else {
      const publicUserToken = localStorage.getItem(
        "token_participante_tesis_vote_up"
      );
      if (publicUserToken) {
        // Si ya hay un token, va directo a las votaciones
        router.push("/tesis-votaciones");
      } else {
        // Si no, muestra el formulario
        setIsLoading(false);
        setIsPublicForm(true);
        setMessage("Ingresa tus datos para participar como público.");
      }
    }
  }, [router, searchParams]);

  // Manejador para el formulario de público
  const handlePublicLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !carnetAnio.trim() ||
      !carnetCorrelativo.trim() ||
      !nombreCompleto.trim() ||
      !fingerprint
    ) {
      Swal.fire(
        "Datos Incompletos",
        "Por favor, llena todos los campos.",
        "warning"
      );
      return;
    }
    setIsSubmitting(true);

    const carnetCompleto = `1190-${carnetAnio}-${carnetCorrelativo}`;
    const codigoAccesoUnico = uuidv4(); // Generamos un código de acceso único

    try {
      // Usamos upsert para crear o actualizar al participante basado en el carnet
      const { data: participant, error } = await supabase
        .from("participantes")
        .upsert(
          {
            carnet: carnetCompleto,
            nombre_completo: nombreCompleto,
            rol_general: "publico",
            codigo_acceso: codigoAccesoUnico, // Siempre se genera uno nuevo para la sesión
          },
          { onConflict: "carnet" }
        )
        .select()
        .single();

      if (error || !participant) {
        throw new Error(
          error?.message || "No se pudo registrar o encontrar al participante."
        );
      }

      // Guardamos el código de acceso en localStorage para la sesión
      localStorage.setItem(
        "token_participante_tesis_vote_up",
        participant.codigo_acceso
      );
      localStorage.setItem("tesis_vote_up_fingerprint", fingerprint);

      await Swal.fire({
        title: "¡Bienvenido!",
        text: `Has ingresado como ${nombreCompleto}.`,
        icon: "success",
        timer: 1500,
        showConfirmButton: false,
      });

      router.push("/tesis-votaciones");
    } catch (error: any) {
      Swal.fire("Error", error.message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="auth-card">
        <h1 className="auth-title">Acceso a Votaciones</h1>
        <p className="auth-subtitle">{message}</p>
        <div className="loader"></div>
      </div>
    );
  }

  if (isPublicForm) {
    return (
      <div className="auth-card">
        <h1 className="auth-title">Acceso Público</h1>
        <p className="auth-subtitle">{message}</p>
        <form onSubmit={handlePublicLogin} className="auth-form">
          <div className="carnet-group">
            <span className="carnet-prefix">1190 -</span>
            <input
              type="text"
              placeholder="Año"
              value={carnetAnio}
              onChange={(e) =>
                setCarnetAnio(e.target.value.replace(/[^0-9]/g, ""))
              }
              maxLength={2}
              required
              className="carnet-input anio"
            />
            <span className="carnet-separator">-</span>
            <input
              type="text"
              placeholder="Carnet"
              value={carnetCorrelativo}
              onChange={(e) =>
                setCarnetCorrelativo(e.target.value.replace(/[^0-9]/g, ""))
              }
              maxLength={6}
              required
              className="carnet-input correlativo"
            />
          </div>
          <input
            type="text"
            placeholder="Pon un nombre y un apellido"
            value={nombreCompleto}
            onChange={(e) => setNombreCompleto(e.target.value)}
            required
            className="auth-input"
          />
          <button
            type="submit"
            className="auth-button"
            disabled={isSubmitting || !fingerprint}
          >
            {isSubmitting ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    );
  }

  return null; // No muestra nada si está en proceso de autenticación de jurado
}

export default function AutenticacionTesisPage() {
  return (
    <div className="auth-container">
      <Suspense fallback={<div className="loader"></div>}>
        <AutenticacionContent />
      </Suspense>
    </div>
  );
}
