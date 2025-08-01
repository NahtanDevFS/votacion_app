"use client";

import Sidebar from "@/components/sidebar/Sidebar";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import "./AdminLayout.css";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Estado para sidebar y móvil
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

  // Ruta actual de Next.js
  const pathname = usePathname() ?? "";

  // Usuario admin en localStorage
  const adminUser =
    typeof window !== "undefined" ? localStorage.getItem("admin") : null;

  // Rutas protegidas donde queremos mostrar el sidebar
  const protectedRoutes = ["/dashboard", "/profile", "/conteo"];

  // Mostrar sidebar si hay admin y la ruta actual arranca con alguna de protectedRoutes
  const showSidebar =
    Boolean(adminUser) &&
    protectedRoutes.some((route) => pathname.startsWith(route));

  // Layout sin sidebar
  if (!showSidebar) {
    return (
      <div className="admin-container">
        <main className="admin-content-no-sidebar">{children}</main>
      </div>
    );
  }

  // Layout con sidebar
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
