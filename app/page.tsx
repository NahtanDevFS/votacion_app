"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import "./Home.css";

export default function Home() {
  const router = useRouter();

  return (
    <div className="home-viewport">
      <div className="home-card">
        <div className="home-header">
          <h1 className="home-title">VoteUp</h1>
          <Image
            src="/voteup.jpeg"
            alt="VoteUp Logo"
            width={100}
            height={120}
            className="home-logo"
          />
        </div>

        <p className="home-description">
          ¡Crea y participa en votaciones y encuestas de forma fácil y rápida
          con VoteUp!
        </p>

        <p className="home-description-button">
          Participa en votaciones y encuestas
        </p>
        <div className="home-buttons">
          <button onClick={() => router.push("/votacion")}>
            Ingresar a votación
          </button>
          <button onClick={() => router.push("/encuesta")}>
            Ingresar a encuesta
          </button>
        </div>
        <p className="home-description-button">
          O crea tus propias votaciones y encuestas
        </p>
        <div className="home-buttons">
          <button onClick={() => router.push("/login")}>Iniciar sesión</button>
        </div>
      </div>
    </div>
  );
}
