"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import "./Sidebar.css";

type SidebarProps = {
  isOpen: boolean;
  onToggle: () => void;
  isMobile: boolean;
};

export default function Sidebar({ isOpen, onToggle, isMobile }: SidebarProps) {
  const router = useRouter();
  const [activeItem, setActiveItem] = useState("");

  //sincronizar ítem activo con la ruta
  useEffect(() => {
    const path = window.location.pathname.split("/").pop() || "dashboard";
    setActiveItem(path);
  }, []);

  const handleNavigation = (path: string) => {
    setActiveItem(path);
    router.push(`/${path}`);
    if (isMobile) onToggle(); // Cierra el sidebar al navegar en móvil
  };

  const handleLogout = () => {
    localStorage.removeItem("admin");
    localStorage.removeItem("sidebarState");
    // Eliminar cookie
    document.cookie = "admin=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    router.push("/");
    router.refresh();
  };

  return (
    <>
      {/* Botón para móviles - solo se muestra en mobile */}
      {isMobile && (
        <button className="sidebar-toggle" onClick={onToggle}>
          {isOpen ? "✕" : "☰"}
        </button>
      )}

      {/* Overlay para móviles, solo cuando el sidebar está abierto en mobile */}
      {isMobile && isOpen && (
        <div className="sidebar-overlay" onClick={onToggle} />
      )}

      {/* Sidebar */}
      <aside
        className={`sidebar ${isOpen ? "open" : "closed"} ${
          isMobile ? "mobile" : "desktop"
        }`}
      >
        <div className="sidebar-header">
          <div className="user-avatar">
            <span>👤</span>
          </div>
          {(!isMobile || isOpen) && ( //Solo muestra texto si no es mobile o está abierto
            <>
              <h3>Panel</h3>
              <p>Bienvenido</p>
            </>
          )}
        </div>

        <nav className="sidebar-nav">
          <ul>
            <li
              className={
                activeItem === "dashboard-votacion-tesis" ? "active" : ""
              }
              onClick={() => handleNavigation("dashboard-votacion-tesis")}
            >
              {/*<span className="nav-icon"></span>*/}
              {(!isMobile || isOpen) && (
                <>
                  <span className="nav-text">Votaciones de tesis</span>
                  <span className="nav-arrow">→</span>
                </>
              )}
            </li>
            <li
              className={activeItem === "dashboard" ? "active" : ""}
              onClick={() => handleNavigation("dashboard")}
            >
              {/*<span className="nav-icon"></span>*/}
              {(!isMobile || isOpen) && (
                <>
                  <span className="nav-text">Dashboard votaciones</span>
                  <span className="nav-arrow">→</span>
                </>
              )}
            </li>
            <li
              className={activeItem === "dashboard-encuesta" ? "active" : ""}
              onClick={() => handleNavigation("dashboard-encuesta")}
            >
              {/*<span className="nav-icon"></span>*/}
              {(!isMobile || isOpen) && (
                <>
                  <span className="nav-text">Dashboard encuestas</span>
                  <span className="nav-arrow">→</span>
                </>
              )}
            </li>

            <li
              className={activeItem === "profile" ? "active" : ""}
              onClick={() => handleNavigation("profile")}
            >
              {/*<span className="nav-icon"></span>*/}
              {(!isMobile || isOpen) && (
                <>
                  <span className="nav-text">Mi Perfil</span>
                  <span className="nav-arrow">→</span>
                </>
              )}
            </li>
            <li
              className={activeItem === "home" ? "active" : ""}
              onClick={() => handleNavigation("")}
            >
              {/*<span className="nav-icon"></span>*/}
              {(!isMobile || isOpen) && (
                <>
                  <span className="nav-text">Inicio</span>
                  <span className="nav-arrow">→</span>
                </>
              )}
            </li>

            {/*<li
              className={activeItem === "settings" ? "active" : ""}
              onClick={() => handleNavigation("settings")}
            >
              <span className="nav-icon"></span>
              {(!isMobile || isOpen) && (
                <>
                  <span className="nav-text">Configuración</span>
                  <span className="nav-arrow">→</span>
                </>
              )}
            </li>*/}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <button className="logout-button" onClick={handleLogout}>
            {/*<span className="logout-icon"></span>*/}
            {(!isMobile || isOpen) && <span>Cerrar Sesión</span>}
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
