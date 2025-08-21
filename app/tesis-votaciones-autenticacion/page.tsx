// app/tesis-votaciones-autenticacion/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Swal from "sweetalert2";
import "./Autenticacion.css";

export default function AutenticacionTesisPage() {
  const router = useRouter();
  const [codigoAcceso, setCodigoAcceso] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Efecto para verificar si el usuario ya ha iniciado sesión
  useEffect(() => {
    const token = localStorage.getItem("token_participante_tesis_vote_up");
    if (token) {
      // Si ya existe un token, redirige directamente al listado de votaciones
      // Asegúrate de que la ruta '/tesis-votaciones' sea la correcta
      router.push("/tesis-votaciones");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigoAcceso.trim()) {
      Swal.fire("Error", "Por favor, ingresa tu código de acceso.", "error");
      return;
    }
    setIsLoading(true);

    try {
      // Busca en la tabla 'participantes' si el código de acceso existe
      const { data, error } = await supabase
        .from("participantes")
        .select("codigo_acceso")
        .eq("codigo_acceso", codigoAcceso.trim())
        .single(); // .single() espera un solo resultado o ninguno

      if (error || !data) {
        // Si hay un error (ej. PGRST116, no rows found) o no hay datos, el código es inválido
        throw new Error("Código de acceso no válido.");
      }

      // Si el código es válido, lo guardamos en localStorage
      localStorage.setItem(
        "token_participante_tesis_vote_up",
        data.codigo_acceso
      );

      // Muestra un mensaje de éxito y redirige
      await Swal.fire({
        title: "¡Bienvenido!",
        text: "Serás redirigido al listado de votaciones.",
        icon: "success",
        timer: 1500,
        showConfirmButton: false,
      });

      // Redirige al listado de votaciones
      router.push("/tesis-votaciones");
    } catch (error: any) {
      Swal.fire("Acceso Denegado", error.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">Acceso a Votaciones de Tesis</h1>
        <p className="auth-subtitle">
          Ingresa tu código de acceso personal para participar.
        </p>
        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="text"
            placeholder="Escribe tu código aquí..."
            value={codigoAcceso}
            onChange={(e) => setCodigoAcceso(e.target.value)}
            className="auth-input"
            disabled={isLoading}
          />
          <button type="submit" className="auth-button" disabled={isLoading}>
            {isLoading ? "Verificando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
