// app/encuesta/page.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import "./Encuesta.css";

export default function EncuestaEntryPage() {
  const [code, setCode] = useState("");
  const router = useRouter();

  const handleGo = () => {
    if (code.trim()) {
      router.push(`/encuesta/${code.trim()}`);
    }
  };

  return (
    <div className="entry-viewport">
      <div className="entry-card">
        <h1 className="entry-title">Ingresar a Encuesta</h1>
        <div className="entry-input-group">
          <input
            type="text"
            placeholder="Código de encuesta"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="entry-input"
          />
          <button
            className="entry-button"
            onClick={handleGo}
            disabled={!code.trim()}
          >
            Ir
          </button>
        </div>
      </div>
    </div>
  );
}
