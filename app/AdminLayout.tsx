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
  // Responsividad
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

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

  // Lee siempre el admin actual (puede cambiar en logout sin reload)
  const adminUser =
    typeof window !== "undefined" ? localStorage.getItem("admin") : null;

  if (!adminUser) {
    // Si no hay admin en localStorage, NO mostramos el sidebar
    return (
      <div className="admin-container">
        <main className="admin-content-no-sidebar">{children}</main>
      </div>
    );
  }

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
