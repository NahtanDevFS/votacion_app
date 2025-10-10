"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Swal from "sweetalert2";
import "./Autenticacion.css";

function AutenticacionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("Verificando...");

  useEffect(() => {
    const accessCode = searchParams.get("access_code");

    const handleAuthentication = async () => {
      // Si no hay código de acceso, es un usuario público.
      if (!accessCode) {
        localStorage.removeItem("token_participante_tesis_vote_up");
        // Redirigir al público a la página de votaciones directamente.
        router.push("/tesis-votaciones");
        return;
      }

      // Si hay un código de acceso, es un jurado.
      try {
        const { data, error } = await supabase
          .from("participantes")
          .select("codigo_acceso")
          .eq("codigo_acceso", accessCode)
          .eq("rol_general", "jurado")
          .single();

        if (error || !data) {
          throw new Error(
            "El código de acceso del jurado no es válido o no fue encontrado."
          );
        }

        // Guardar el token en localStorage.
        localStorage.setItem(
          "token_participante_tesis_vote_up",
          data.codigo_acceso
        );

        await Swal.fire({
          title: "¡Autenticación Exitosa!",
          text: "Serás redirigido al listado de votaciones como jurado.",
          icon: "success",
          timer: 2000,
          showConfirmButton: false,
        });

        router.push("/tesis-votaciones");
      } catch (error: any) {
        setMessage(error.message);
        Swal.fire("Error de Autenticación", error.message, "error");
        setIsLoading(false);
      }
    };

    handleAuthentication();
  }, [router, searchParams]);

  return (
    <div className="auth-card">
      <h1 className="auth-title">Acceso a Votaciones de Tesis</h1>
      {isLoading ? (
        <>
          <p className="auth-subtitle">{message}</p>
          <div className="loader"></div>
        </>
      ) : (
        <p className="auth-subtitle">{message}</p>
      )}
    </div>
  );
}

export default function AutenticacionTesisPage() {
  return (
    <div className="auth-container">
      <Suspense
        fallback={
          <div className="auth-card">
            <h1 className="auth-title">Cargando...</h1>
          </div>
        }
      >
        <AutenticacionContent />
      </Suspense>
    </div>
  );
}
