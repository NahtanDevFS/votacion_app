"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function VerifyPage() {
  const [msg, setMsg] = useState("Verificando tu cuenta...");
  const router = useRouter();

  useEffect(() => {
    //Parsear el fragmento de la URL
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");

    if (access_token && refresh_token) {
      //Crear la sesión
      supabase.auth
        .setSession({ access_token, refresh_token })
        .then(({ error }) => {
          if (error) {
            setMsg("Error al verificar: " + error.message);
          } else {
            setMsg("¡Cuenta verificada correctamente!");
            //Redirigir tras 2s
            setTimeout(() => router.push("/dashboard"), 2000);
          }
        });
    } else {
      setMsg("No se encontraron tokens de sesión en la URL.");
    }
  }, [router]);

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>{msg}</h2>
      </div>
    </div>
  );
}
