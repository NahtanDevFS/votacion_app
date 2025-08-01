"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import "./Login.css";

type AuthMode = "login" | "register" | "forgot";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mode, setMode] = useState<AuthMode>("login");
  const [transition, setTransition] = useState(false);
  const router = useRouter();

  /**
   * Cambia de modo de formulario.
   * @param newMode Modo al que cambiar ("login"|"register"|"forgot")
   * @param clearSuccess Si true limpia también success; si false, preserva el mensaje
   */
  const changeMode = (newMode: AuthMode, clearSuccess = true) => {
    setTransition(true);
    setTimeout(() => {
      setMode(newMode);
      setError("");
      if (clearSuccess) setSuccess("");
      setTransition(false);
    }, 300);
  };

  // ─── LOGIN ────────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // 1) Autenticar con Supabase Auth
    const { data: loginData, error: loginError } =
      await supabase.auth.signInWithPassword({ email, password });
    if (loginError || !loginData.session) {
      setError("Credenciales incorrectas");
      return;
    }

    // 2) Traer perfil desde tu tabla por id_auth
    const { data: profile, error: profileError } = await supabase
      .from("admin_votacion")
      .select("*")
      .eq("id_auth", loginData.user.id)
      .single();
    if (profileError || !profile) {
      setError("Error al obtener perfil");
      return;
    }

    // 3) Guardar sesión y redirigir
    document.cookie = `admin=${JSON.stringify(profile)}; path=/; max-age=${
      60 * 60 * 24 * 365
    }`;
    localStorage.setItem("admin", JSON.stringify(profile));
    router.push("/dashboard");
    router.refresh();
  };

  // ─── REGISTRO ─────────────────────────────────────────────────────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // 1) Crear usuario en Supabase Auth (envía correo de verificación)
    // 1) Crear usuario en Supabase Auth (envía correo de verificación)
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp(
      {
        email,
        password,
        options: {
          emailRedirectTo: "https://votacion-app.vercel.app/verify",
        },
      }
    );
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    // 2) Intentar insertar el perfil (no cancelamos el flujo si esto falla)
    const { error: profileError } = await supabase
      .from("admin_votacion")
      .insert([
        {
          id_auth: signUpData.user?.id,
          nombre: name,
          apellido: lastName,
          correo: email,
        },
      ]);
    if (profileError) {
      console.error("Error al crear perfil:", profileError.message);
    }

    // 3) Mostrar mensaje y cambiar a login, preservando success
    setSuccess(
      "¡Registro exitoso! Revisa tu correo para verificar tu cuenta (puede estar en spam)."
    );
    changeMode("login", /* clearSuccess= */ false);
  };

  // ─── RECUPERAR CONTRASEÑA ─────────────────────────────────────────────────
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // 1) Enviar correo de reset de contraseña
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: "https://votacion-app.vercel.app/reset-password",
      }
    );
    if (resetError) {
      setError(resetError.message);
      return;
    }

    // 2) Mostrar mensaje y cambiar a login, preservando success
    setSuccess(
      "Revisa tu correo para restablecer la contraseña (puede estar en spam)."
    );
    changeMode("login", /* clearSuccess= */ false);
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
                {mode === "forgot" && "Recibe un correo para restablecer"}
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
                  : handleForgotPassword
              }
            >
              {mode === "register" && (
                <>
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
                  <div className="input-group">
                    <input
                      type="text"
                      placeholder="Apellido"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                    <span className="input-icon">👥</span>
                  </div>
                </>
              )}

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
                    minLength={6}
                  />
                  <span className="input-icon">🔒</span>
                </div>
              )}

              <button type="submit" className="auth-button">
                {mode === "login" && "Iniciar sesión"}
                {mode === "register" && "Registrarse"}
                {mode === "forgot" && "Enviar correo"}
              </button>
            </form>

            <div className="auth-footer">
              {mode === "login" && (
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
              )}
              {mode === "register" && (
                <p>
                  ¿Ya tienes cuenta?{" "}
                  <button onClick={() => changeMode("login")}>
                    Inicia sesión
                  </button>
                </p>
              )}
              {mode === "forgot" && (
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
