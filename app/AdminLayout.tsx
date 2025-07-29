"use client";

import Sidebar from "@/components/sidebar/Sidebar";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import "./AdminLayout.css";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
      } else setSidebarOpen(true);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const user = localStorage.getItem("admin");

  // Guardar estado del sidebar
  useEffect(() => {
    if (user) {
      localStorage.setItem("sidebarState", JSON.stringify(sidebarOpen));
    }
  }, [user]);

  if (!user) {
    return (
      <div className="admin-container">
        <main className={`admin-content-no-sidebar`}>{children}</main>
      </div>
    );
  } else {
    return (
      <div className="admin-container">
        <Sidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
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
}
