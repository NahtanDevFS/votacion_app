"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import "./Login.css";

type AuthMode = "login" | "register" | "forgot";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mode, setMode] = useState<AuthMode>("login");
  const router = useRouter();

  // Animación de cambio de formulario
  const [transition, setTransition] = useState(false);

  const changeMode = (newMode: AuthMode) => {
    setTransition(true);
    setTimeout(() => {
      setMode(newMode);
      setError("");
      setSuccess("");
      setTransition(false);
    }, 300);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const { data, error: supabaseError } = await supabase
      .from("admin_votacion")
      .select("*")
      .eq("correo", email)
      .eq("contrasena", password)
      .single();

    if (supabaseError || !data) {
      setError("Credenciales incorrectas");
      return;
    }

    document.cookie = `admin=${JSON.stringify(data)}; path=/; max-age=${
      60 * 60 * 365
    }`; // 1 año
    localStorage.setItem("admin", JSON.stringify(data));
    router.push("/dashboard");
    router.refresh();
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Verificar si el correo ya existe
    const { data: existingUser } = await supabase
      .from("admin_votacion")
      .select("*")
      .eq("correo", email)
      .single();

    if (existingUser) {
      setError("Este correo ya está registrado");
      return;
    }

    const { error } = await supabase.from("admin_votacion").insert([
      {
        nombre: name,
        apellido: lastName,
        correo: email,
        contrasena: password,
      },
    ]);

    if (error) {
      setError("Error al registrar el usuario");
      return;
    }

    setSuccess("¡Registro exitoso! Ahora puedes iniciar sesión");
    changeMode("login");
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    const { error } = await supabase
      .from("admin_votacion")
      .update({ contrasena: newPassword })
      .eq("correo", email);

    if (error) {
      setError("No existe un usuario con este correo");
      return;
    }

    setSuccess("Contraseña actualizada correctamente");
    changeMode("login");
  };

  return (
    <div className={`auth-container ${mode}`}>
      <div className="auth-decoration">
        <div className="shape1"></div>
        <div className="shape2"></div>
        <div className="shape3"></div>
      </div>

      <div className={`auth-card ${transition ? "fade-out" : "fade-in"}`}>
        {!transition && (
          <>
            <div className="auth-header">
              <h2>
                {mode === "login" && "Bienvenido"}
                {mode === "register" && "Crea tu cuenta"}
                {mode === "forgot" && "Recuperar acceso"}
              </h2>
              <p>
                {mode === "login" && "Ingresa tus credenciales"}
                {mode === "register" && "Completa tus datos"}
                {mode === "forgot" && "Restablece tu contraseña"}
              </p>
            </div>

            {error && <div className="auth-error">{error}</div>}
            {success && <div className="auth-success">{success}</div>}

            <form
              onSubmit={
                mode === "login"
                  ? handleLogin
                  : mode === "register"
                  ? handleRegister
                  : handlePasswordReset
              }
            >
              {mode === "register" && (
                <div className="input-group">
                  <input
                    type="text"
                    placeholder="Nombre"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                  <span className="input-icon">👤</span>
                </div>
              )}

              {mode === "register" && (
                <div className="input-group">
                  <input
                    type="text"
                    placeholder="Apellido"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                  <span className="input-icon">👥</span>
                </div>
              )}

              {(mode === "login" ||
                mode === "register" ||
                mode === "forgot") && (
                <div className="input-group">
                  <input
                    type="email"
                    placeholder="Correo electrónico"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <span className="input-icon">✉️</span>
                </div>
              )}

              {(mode === "login" || mode === "register") && (
                <div className="input-group">
                  <input
                    type="password"
                    placeholder={
                      mode === "login" ? "Contraseña" : "Crea tu contraseña"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={4}
                  />
                  <span className="input-icon">🔒</span>
                </div>
              )}

              {mode === "forgot" && (
                <>
                  <div className="input-group">
                    <input
                      type="password"
                      placeholder="Nueva contraseña"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={4}
                    />
                    <span className="input-icon">🔄</span>
                  </div>
                  <div className="input-group">
                    <input
                      type="password"
                      placeholder="Confirmar contraseña"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={4}
                    />
                    <span className="input-icon">✅</span>
                  </div>
                </>
              )}

              <button type="submit" className="auth-button">
                {mode === "login" && "Iniciar sesión"}
                {mode === "register" && "Registrarse"}
                {mode === "forgot" && "Actualizar contraseña"}
              </button>
            </form>

            <div className="auth-footer">
              {mode === "login" ? (
                <>
                  <p>
                    ¿No tienes cuenta?{" "}
                    <button onClick={() => changeMode("register")}>
                      Regístrate
                    </button>
                  </p>
                  <p>
                    ¿Olvidaste tu contraseña?{" "}
                    <button onClick={() => changeMode("forgot")}>
                      Recupérala
                    </button>
                  </p>
                </>
              ) : mode === "register" ? (
                <p>
                  ¿Ya tienes cuenta?{" "}
                  <button onClick={() => changeMode("login")}>
                    Inicia sesión
                  </button>
                </p>
              ) : (
                <p>
                  ¿Recordaste tu contraseña?{" "}
                  <button onClick={() => changeMode("login")}>
                    Inicia sesión
                  </button>
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
