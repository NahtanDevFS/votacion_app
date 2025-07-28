"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import "./Sidebar.css";

export default function Sidebar() {
  const router = useRouter();
  const [activeItem, setActiveItem] = useState("dashboard");
  const [isOpen, setIsOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Verificar el tamaño de pantalla
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setIsOpen(false);
      } else {
        setIsOpen(true);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleNavigation = (path: string) => {
    setActiveItem(path);
    router.push(`/${path}`);
    if (isMobile) setIsOpen(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("admin");
    router.push("/login");
  };

  return (
    <>
      {/* Botón para móviles */}
      {isMobile && (
        <button className="sidebar-toggle" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? (
            <span className="close-icon">✕</span>
          ) : (
            <span className="menu-icon">☰</span>
          )}
        </button>
      )}

      {/* Overlay para móviles */}
      {isMobile && isOpen && (
        <div className="sidebar-overlay" onClick={() => setIsOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${isOpen ? "open" : "closed"}`}>
        <div className="sidebar-header">
          <div className="user-avatar">
            <span>👤</span>
          </div>
          <h3>Panel Admin</h3>
          <p>Bienvenido/a</p>
        </div>

        <nav className="sidebar-nav">
          <ul>
            <li
              className={activeItem === "dashboard" ? "active" : ""}
              onClick={() => handleNavigation("dashboard")}
            >
              <span className="nav-icon">📊</span>
              <span className="nav-text">Dashboard</span>
              <span className="nav-arrow">→</span>
            </li>

            <li
              className={activeItem === "profile" ? "active" : ""}
              onClick={() => handleNavigation("profile")}
            >
              <span className="nav-icon">👤</span>
              <span className="nav-text">Mi Perfil</span>
              <span className="nav-arrow">→</span>
            </li>

            <li
              className={activeItem === "settings" ? "active" : ""}
              onClick={() => handleNavigation("settings")}
            >
              <span className="nav-icon">⚙️</span>
              <span className="nav-text">Configuración</span>
              <span className="nav-arrow">→</span>
            </li>
          </ul>
        </nav>

        <div className="sidebar-footer">
          <button className="logout-button" onClick={handleLogout}>
            <span className="logout-icon">🚪</span>
            <span>Cerrar Sesión</span>
          </button>
        </div>

        {/* Decoración */}
        <div className="sidebar-decoration">
          <div className="deco-circle"></div>
          <div className="deco-wave"></div>
        </div>
      </aside>
    </>
  );
}
