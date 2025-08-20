"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import "./reset_password.css";

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();

  useEffect(() => {
    //guardar sesión
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");

    if (access_token && refresh_token) {
      supabase.auth
        .setSession({ access_token, refresh_token })
        .then(({ error }) => {
          if (error) setStatus("error");
          else setStatus("ready");
        });
    } else {
      setStatus("error");
    }
  }, []);

  if (status === "loading") return <p>Verificando enlace…</p>;
  if (status === "error")
    return <p>Enlace inválido o expirado. Solicita otro restablecimiento.</p>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    if (password !== confirm) {
      setErrorMsg("Las contraseñas no coinciden");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setErrorMsg(error.message);
    else router.push("/login");
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Define tu nueva contraseña</h2>
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <input
              type="password"
              placeholder="Nueva contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <div className="input-group">
            <input
              type="password"
              placeholder="Confirmar contraseña"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
            />
          </div>
          {errorMsg && <div className="auth-error">{errorMsg}</div>}
          <button type="submit" className="auth-button">
            Actualizar contraseña
          </button>
        </form>
      </div>
    </div>
  );
}
