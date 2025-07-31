// AdminLayout.tsx
"use client";

import Sidebar from "@/components/sidebar/Sidebar";
import { useState, useEffect } from "react";
import "./AdminLayout.css";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Estado para saber si hay un admin logueado
  // Inicialmente null para que cliente y servidor coincidan (no mostrar sidebar)
  const [adminUser, setAdminUser] = useState<string | null>(null);

  // Responsividad
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // 1️⃣ Leer localStorage solo en efecto
  useEffect(() => {
    const stored = localStorage.getItem("admin");
    setAdminUser(stored);
  }, []);

  // 2️⃣ Calcular mobile / sidebarOpen
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Mientras adminUser sea null (todavía cargando), renderizamos igual que sin admin
  if (adminUser === null) {
    return (
      <div className="admin-container">
        <main className="admin-content-no-sidebar">{children}</main>
      </div>
    );
  }

  // Si adminUser es falsy (no hay admin en localStorage), no mostramos sidebar
  if (!adminUser) {
    return (
      <div className="admin-container">
        <main className="admin-content-no-sidebar">{children}</main>
      </div>
    );
  }

  // Finalmente, si adminUser existe, mostramos sidebar
  return (
    <div className="admin-container">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((o) => !o)}
        isMobile={isMobile}
      />
      <main
        className={`admin-content ${
          sidebarOpen && !isMobile ? "sidebar-open" : ""
        }`}
      >
        {children}
      </main>
    </div>
  );
}
